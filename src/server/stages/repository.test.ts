import { describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
import type { Sql } from "@/src/server/db"
import { updateStageRules } from "./repository"
import { TIE_BREAKERS, type StageRules } from "@/src/domain/tournament/standings"

const defaults: StageRules = { schemaVersion: "1", standings: {
  winPoints: 3, drawPoints: 1, lossPoints: 0, tieBreakers: [...TIE_BREAKERS],
} }
const custom: StageRules = { schemaVersion: "1", standings: { ...defaults.standings, tieBreakers: ["points", "goalsScored", "goalDifference", "teamName"] } }

function database(options: { rules?: unknown; status?: string; stageType?: string; owner?: string } = {}) {
  const queries: { sql: string; values: unknown[] }[] = []
  const tx = Object.assign(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = strings.join("?").replace(/\s+/g, " ").trim()
    queries.push({ sql, values })
    if (sql.startsWith("select status")) return [{ status: options.status ?? "draft", owner_id: options.owner ?? "owner", deleted_at: null }]
    if (sql.startsWith("select rules")) return [{ rules: options.rules ?? defaults, stage_type: options.stageType ?? "group" }]
    return []
  }, { json: (value: unknown) => value })
  const sql = { begin: async (fn: (transaction: typeof tx) => Promise<void>) => fn(tx) } as unknown as Sql
  return { sql, queries, writes: () => queries.filter((query) => /^(update|insert)/.test(query.sql)) }
}
function save(sql: Sql, rules = custom) {
  return updateStageRules({ tournamentId: "tournament", stageId: "stage", actorId: "owner", rules }, sql)
}

describe("stage rules persistence", () => {
  it.each([defaults, { schemaVersion: "1" }, { schemaVersion: "1", standings: { enabled: true, scoring: { win: 3, draw: 1, loss: 0 } } }])(
    "does not update or audit equivalent rules %j", async (rules) => {
      const db = database({ rules })
      await save(db.sql, defaults)
      expect(db.writes()).toEqual([])
    },
  )

  it("writes rules and one before/after audit in the same transaction", async () => {
    const db = database()
    await save(db.sql)
    expect(db.writes()).toHaveLength(2)
    expect(db.writes()[0].sql).toContain("update app.stages set rules")
    expect(db.writes()[0].values[0]).toEqual(custom)
    expect(db.writes()[1].values).toContain("stage.configuration_changed")
    expect(db.writes()[1].values).toContainEqual({ stageId: "stage", previousRules: defaults, newRules: custom })
    expect(db.queries.filter((query) => query.sql.includes("for update"))).toHaveLength(2)
  })

  it("preserves unrelated JSON fields and legacy enabled behavior", async () => {
    const previous = { schemaVersion: "1", unrelated: { keep: true }, standings: { enabled: false, scoring: { win: 3, draw: 1, loss: 0 } } }
    const db = database({ rules: previous })
    await save(db.sql)
    expect(db.writes()[0].values[0]).toEqual({ ...custom, unrelated: { keep: true }, standings: { ...custom.standings, enabled: false } })
  })

  it.each(["completed", "archived"])("rejects %s tournaments at transaction time", async (status) => {
    const db = database({ status })
    await expect(save(db.sql)).rejects.toThrow()
    expect(db.writes()).toEqual([])
  })

  it("rejects a different owner", async () => {
    const db = database({ owner: "another" })
    await expect(save(db.sql)).rejects.toThrow("cannot change")
    expect(db.writes()).toEqual([])
  })

  it("rejects knockout configuration", async () => {
    const db = database({ stageType: "knockout" })
    await expect(save(db.sql)).rejects.toThrow("knockout")
    expect(db.writes()).toEqual([])
  })

  it("validates rules even if the action is bypassed", async () => {
    const db = database()
    await expect(save(db.sql, { ...custom, standings: { ...custom.standings, winPoints: -1 } })).rejects.toThrow("whole numbers")
    expect(db.queries).toEqual([])
  })
})
