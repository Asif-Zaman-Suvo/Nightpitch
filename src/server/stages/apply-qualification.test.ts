import { beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
vi.mock("@/src/server/stages/repository", async (original) => ({
  ...await original<typeof import("./repository")>(),
  listStages: vi.fn(),
}))
vi.mock("@/src/server/stage-entries/repository", () => ({ listStageEntries: vi.fn() }))
vi.mock("@/src/server/matches/repository", () => ({ listMatches: vi.fn() }))
import type { Sql } from "@/src/server/db"
import { listMatches } from "@/src/server/matches/repository"
import { listStageEntries } from "@/src/server/stage-entries/repository"
import { listStages } from "@/src/server/stages/repository"
import { applyQualification } from "./apply-qualification"

const groupId = "10000000-0000-4000-8000-000000000004"
const sourceStage = "10000000-0000-4000-8000-000000000002"
const rules = { schemaVersion: "1", qualification: { schemaVersion: "1", rules: [{ type: "group_top_n", sourceGroupId: groupId, count: 1 }] } }

function database(options: { status?: string; owner?: string; stageType?: string; stageRules?: unknown; entries?: unknown[]; matches?: number } = {}) {
  const queries: { sql: string; values: unknown[] }[] = []
  const tx = Object.assign(async (parts: TemplateStringsArray, ...values: unknown[]) => {
    const query = parts.join("?").replace(/\s+/g, " ").trim()
    queries.push({ sql: query, values })
    if (query.startsWith("select status")) return [{ status: options.status ?? "draft", owner_id: options.owner ?? "owner", deleted_at: null }]
    if (query.startsWith("select rules")) return [{ rules: options.stageRules ?? rules, stage_type: options.stageType ?? "knockout" }]
    if (query.includes("from app.stage_entries e")) return options.entries ?? []
    if (query.startsWith("select count")) return [{ n: options.matches ?? 0 }]
    if (query.startsWith("insert into app.stage_entries")) return [{ id: "created-entry" }]
    return []
  }, { json: (value: unknown) => value })
  return {
    sql: { begin: async <T>(fn: (transaction: typeof tx) => Promise<T>) => fn(tx) } as unknown as Sql,
    writes: () => queries.filter((item) => /^(update|insert|delete)/.test(item.sql)),
  }
}

beforeEach(() => {
  vi.mocked(listStages).mockResolvedValue([
    { id: sourceStage, tournamentId: "tournament", position: 1, name: "Groups", stageType: "group", rules: { schemaVersion: "1" },
      groups: [{ id: groupId, sourceGroupId: "setup", name: "Group A" }] },
    { id: "stage", tournamentId: "tournament", position: 2, name: "Knockout", stageType: "knockout", rules, groups: [] },
  ])
  vi.mocked(listStageEntries).mockResolvedValue([
    { id: "a", tournamentId: "tournament", stageId: sourceStage, stageGroupId: groupId, slot: 1, teamId: "alpha", number: 1, name: "Alpha", shortName: "ALP", sourceKind: "team" },
    { id: "b", tournamentId: "tournament", stageId: sourceStage, stageGroupId: groupId, slot: 2, teamId: "bravo", number: 2, name: "Bravo", shortName: "BRA", sourceKind: "team" },
  ])
  vi.mocked(listMatches).mockResolvedValue([{
    id: "m", tournamentId: "tournament", stageId: sourceStage, stageName: "Groups", stageGroupId: groupId, groupName: "Group A",
    round: 1, matchNumber: 1, startsAt: null, status: "completed",
    participants: [
      { entryId: "a", position: 1, name: "Alpha", shortName: "ALP", logoUrl: null, score: 1 },
      { entryId: "b", position: 2, name: "Bravo", shortName: "BRA", logoUrl: null, score: 0 },
    ],
  }])
})

describe("applyQualification", () => {
  it("inserts a group-rank entry and audits the qualified team", async () => {
    const db = database()
    const result = await applyQualification({ tournamentId: "tournament", stageId: "stage", actorId: "owner" }, db.sql)
    expect(result).toEqual({ status: "applied", created: ["created-entry"], updated: [], removed: [] })
    const insert = db.writes().find((query) => query.sql.startsWith("insert into app.stage_entries"))
    expect(insert?.sql).toContain("'group_rank'")
    expect(insert?.sql).toContain("'resolution'")
    expect(insert?.values).toEqual(["tournament", "stage", 1, groupId, 1, "alpha"])
    const audit = db.writes().find((query) => query.sql.includes("qualification.applied"))
    expect(audit?.values).toContain("owner")
    expect(audit?.values.at(-1)).toMatchObject({
      destinationStageId: "stage", qualifiedTeamIds: ["alpha"], createdEntryIds: ["created-entry"],
    })
  })

  it("does not write when the qualified entry is already present", async () => {
    const db = database({ entries: [{
      id: "e1", slot: 1, source_kind: "group_rank", source_group_id: groupId, source_rank: 1,
      team_id: "alpha", name: "Alpha", referenced: false,
    }] })
    await expect(applyQualification({ tournamentId: "tournament", stageId: "stage", actorId: "owner" }, db.sql))
      .resolves.toEqual({ status: "unchanged", created: [], updated: [], removed: [] })
    expect(db.writes()).toEqual([])
  })

  it("rejects manual participants, missing rules, other owners, and completed tournaments without writing", async () => {
    const manual = database({ entries: [{
      id: "m", slot: 1, source_kind: "team", source_group_id: null, source_rank: null, team_id: "alpha", name: "Alpha", referenced: false,
    }] })
    await expect(applyQualification({ tournamentId: "tournament", stageId: "stage", actorId: "owner" }, manual.sql))
      .rejects.toThrow("manually added participants")
    expect(manual.writes()).toEqual([])
    for (const options of [{ stageRules: { schemaVersion: "1" } }, { owner: "other" }, { status: "completed" }, { stageType: "group" }]) {
      const db = database(options)
      await expect(applyQualification({ tournamentId: "tournament", stageId: "stage", actorId: "owner" }, db.sql)).rejects.toThrow()
      expect(db.writes()).toEqual([])
    }
  })

  it("rejects unavailable standings without writing", async () => {
    vi.mocked(listMatches).mockResolvedValue([])
    const db = database()
    await expect(applyQualification({ tournamentId: "tournament", stageId: "stage", actorId: "owner" }, db.sql))
      .rejects.toThrow("Standings are not available yet.")
    expect(db.writes()).toEqual([])
  })
})
