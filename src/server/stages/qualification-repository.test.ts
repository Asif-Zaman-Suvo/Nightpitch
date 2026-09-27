import { describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
import type { Sql } from "@/src/server/db"
import { updateQualificationRules } from "./repository"

const group = "10000000-0000-4000-8000-000000000004"
const configuration = { schemaVersion: "1" as const, rules: [{ type: "group_top_n" as const, sourceGroupId: group, count: 2 }] }
const legacy = { schemaVersion: "1", standings: { winPoints: 3, drawPoints: 1, lossPoints: 0,
  tieBreakers: ["points", "goalDifference", "goalsScored", "teamName"] } }
function db(options: { status?: string; owner?: string; stageType?: string; rules?: unknown; source?: boolean; tournament?: string; position?: number; groupCount?: number } = {}) {
  const queries: { sql: string; values: unknown[] }[] = []
  const tx = Object.assign(async (parts: TemplateStringsArray, ...values: unknown[]) => {
    const query = parts.join("?").replace(/\s+/g, " ").trim()
    queries.push({ sql: query, values })
    if (query.startsWith("select status")) return [{ status: options.status ?? "draft", owner_id: options.owner ?? "owner", deleted_at: null }]
    if (query.startsWith("select rules")) return [{ rules: options.rules ?? legacy, stage_type: options.stageType ?? "knockout", position: 2 }]
    if (query.startsWith("select sg.tournament_id")) return options.source === false ? [] : [{ tournament_id: options.tournament ?? "tournament", stage_id: "source", position: options.position ?? 1, stage_type: "group", group_count: options.groupCount ?? 2 }]
    return []
  }, { json: (value: unknown) => value })
  return { sql: { begin: async (fn: (transaction: typeof tx) => Promise<void>) => fn(tx) } as unknown as Sql,
    queries, writes: () => queries.filter((item) => /^(update|insert)/.test(item.sql)) }
}
const save = (sql: Sql, qualification = configuration) => updateQualificationRules({
  tournamentId: "tournament", stageId: "stage", actorId: "owner", qualification,
}, sql)

describe("qualification persistence", () => {
  it("saves on destination rules, preserves standings, and audits once", async () => {
    const database = db()
    await save(database.sql)
    expect(database.writes()).toHaveLength(2)
    expect(database.writes()[0].values[0]).toEqual({ ...legacy, qualification: configuration })
    expect(database.writes()[1].values).toContain("stage.configuration_changed")
    expect(database.writes()[1].values).toContainEqual({ stageId: "stage", previousRules: legacy,
      newRules: { ...legacy, qualification: configuration } })
  })
  it("skips equivalent update and audit", async () => {
    const database = db({ rules: { ...legacy, qualification: configuration } })
    await save(database.sql)
    expect(database.writes()).toEqual([])
  })
  it.each([{ source: false }, { tournament: "foreign" }, { position: 3 }, { stageType: "group" },
    { status: "completed" }, { owner: "other" }])("rejects invalid source or permission %j", async (options) => {
    const database = db(options)
    await expect(save(database.sql)).rejects.toThrow()
    expect(database.writes()).toEqual([])
  })
  it("rejects invalid counts and duplicates before database access", async () => {
    const database = db()
    await expect(save(database.sql, { schemaVersion: "1", rules: [{ ...configuration.rules[0], count: 0 }] })).rejects.toThrow("positive")
    await expect(save(database.sql, { schemaVersion: "1", rules: [configuration.rules[0], configuration.rules[0]] })).rejects.toThrow("only once")
    expect(database.queries).toEqual([])
  })
})

