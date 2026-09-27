import { describe, expect, it } from "vitest"
import { calculateStandings, resolveStandingsRules, type StandingsInput } from "./standings"
import { calculateQualifiedEntries, parseQualificationConfiguration, type QualificationSource } from "./qualification"

const ids = {
  tournament: "10000000-0000-4000-8000-000000000001",
  stage: "10000000-0000-4000-8000-000000000002",
  destination: "10000000-0000-4000-8000-000000000003",
  a: "10000000-0000-4000-8000-000000000004",
  b: "10000000-0000-4000-8000-000000000005",
}
const rule = (sourceGroupId: string, count: number) => ({ type: "group_top_n" as const, sourceGroupId, count })
const row = (teamId: string, name: string) => ({ teamId, name, played: 1, won: 0, drawn: 0, lost: 0,
  scored: 0, conceded: 0, difference: 0, points: 0 })
const source = (id: string, names: string[]): QualificationSource => ({
  id, tournamentId: ids.tournament, stageId: ids.stage, stagePosition: 1, stageType: "group", stageGroupCount: 2,
  name: id === ids.a ? "Group A" : "Group B", completedMatches: 1,
  rows: names.map((name) => row(`${id}-${name}`, name)),
  entries: names.map((name) => ({ id: `${id}-entry-${name}`, teamId: `${id}-${name}` })),
})
const preview = (rules: ReturnType<typeof rule>[], sources: QualificationSource[]) => calculateQualifiedEntries({
  tournamentId: ids.tournament, destinationStageId: ids.destination, destinationPosition: 2,
  configuration: { schemaVersion: "1", rules }, sources,
})

describe("qualification configuration", () => {
  it("accepts ordered group rules and an empty configuration", () => {
    expect(parseQualificationConfiguration({ schemaVersion: "1", rules: [] }).ok).toBe(true)
    expect(parseQualificationConfiguration({ schemaVersion: "1", rules: [rule(ids.b, 1), rule(ids.a, 2)] })).toEqual({
      ok: true, value: { schemaVersion: "1", rules: [rule(ids.b, 1), rule(ids.a, 2)] },
    })
  })
  it.each([0, -1, 1.5, "2", null, Number.MAX_SAFE_INTEGER + 1])("rejects invalid count %s", (count) => {
    expect(parseQualificationConfiguration({ schemaVersion: "1", rules: [{ type: "group_top_n", sourceGroupId: ids.a, count }] }).ok).toBe(false)
  })
  it("rejects unsupported types, invalid IDs, and duplicate groups", () => {
    for (const rules of [
      [{ type: "best_third", sourceGroupId: ids.a, count: 2 }],
      [rule("foreign", 2)],
      [rule(ids.a, 1), rule(ids.a, 2)],
    ]) expect(parseQualificationConfiguration({ schemaVersion: "1", rules }).ok).toBe(false)
  })
})

describe("calculateQualifiedEntries", () => {
  const a = source(ids.a, ["Alpha", "Bravo", "Charlie", "Delta"])
  const b = source(ids.b, ["Echo", "Foxtrot", "Golf", "Hotel"])
  it("selects top N in rule order with stage-entry identity", () => {
    const result = preview([rule(ids.a, 2), rule(ids.b, 2)], [a, b])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.qualified.map((item) => [item.name, item.rank, item.stageEntryId])).toEqual([
      ["Alpha", 1, `${ids.a}-entry-Alpha`], ["Bravo", 2, `${ids.a}-entry-Bravo`],
      ["Echo", 1, `${ids.b}-entry-Echo`], ["Foxtrot", 2, `${ids.b}-entry-Foxtrot`],
    ])
    expect(preview([rule(ids.b, 1), rule(ids.a, 1)], [a, b]).ok).toBe(true)
    expect(preview([rule(ids.a, 2), rule(ids.b, 2)], [a, b])).toEqual(result)
    expect(a.entries).toHaveLength(4)
  })
  it("rejects too few participants and empty groups without partial qualifications", () => {
    expect(preview([rule(ids.a, 5)], [a])).toMatchObject({ ok: false, qualified: [],
      error: "Group A currently has only 4 eligible teams; 5 are required." })
    expect(preview([rule(ids.a, 1)], [source(ids.a, [])])).toMatchObject({ ok: false, qualified: [] })
  })
  it("does not announce qualification before a completed match", () => {
    expect(preview([rule(ids.a, 1)], [{ ...a, completedMatches: 0 }])).toMatchObject({
      ok: false, qualified: [], groups: [{ state: "unavailable" }],
    })
  })
  it("rejects duplicate team identity and missing or foreign sources", () => {
    const duplicate = { ...b, rows: [row(a.rows[0].teamId, "Alpha"), ...b.rows.slice(1)],
      entries: [{ id: "other-entry", teamId: a.rows[0].teamId }, ...b.entries.slice(1)] }
    expect(preview([rule(ids.a, 1), rule(ids.b, 1)], [a, duplicate])).toMatchObject({ ok: false, qualified: [], error: "Alpha qualifies more than once." })
    expect(preview([rule(ids.a, 1)], [])).toMatchObject({ ok: false, qualified: [] })
    expect(preview([rule(ids.a, 1)], [{ ...a, tournamentId: ids.b }])).toMatchObject({ ok: false, qualified: [] })
    expect(preview([rule(ids.a, 1)], [{ ...a, stagePosition: 3 }])).toMatchObject({ ok: false, qualified: [] })
  })
  it("uses configured standings tie-break and scoring results unchanged", () => {
    const teams = ["Alpha", "Bravo", "Charlie", "Delta"]
    const entries = teams.map((name, index) => ({ id: `entry-${index}`, stageId: ids.stage,
      stageGroupId: ids.a, teamId: `team-${index}`, name }))
    const matches: [number, number, number, number][] = [[0, 2, 4, 2], [0, 3, 4, 2], [1, 2, 3, 0], [1, 3, 3, 1]]
    const data: StandingsInput = {
      stage: { id: ids.stage, stageType: "group", standings: resolveStandingsRules("group", null) },
      stageGroups: [{ id: ids.a, stageId: ids.stage, name: "Group A" }], stageEntries: entries,
      matches: matches.map((_, index) => ({ id: `match-${index}`, stageId: ids.stage, stageGroupId: ids.a, status: "completed" })),
      matchParticipants: matches.flatMap(([left, right, ls, rs], index) => [
        { matchId: `match-${index}`, entryId: entries[left].id, score: ls },
        { matchId: `match-${index}`, entryId: entries[right].id, score: rs },
      ]),
    }
    const fromStandings = () => {
      const table = calculateStandings(data)
      if (table.kind !== "groups") throw new Error("Expected groups")
      return { ...a, rows: table.groups[0].rows, entries: entries.map((entry) => ({ id: entry.id, teamId: entry.teamId })) }
    }
    const winner = () => {
      const result = preview([rule(ids.a, 1)], [fromStandings()])
      if (!result.ok) throw new Error(result.error)
      return result.qualified[0].name
    }
    expect(winner()).toBe("Bravo")
    data.stage.standings = resolveStandingsRules("group", { standings: { winPoints: 3, drawPoints: 1, lossPoints: 0,
      tieBreakers: ["points", "goalsScored", "goalDifference", "teamName"] } })
    expect(winner()).toBe("Alpha")
    expect(fromStandings().rows.find((item) => item.name === "Alpha")?.points).toBe(6)
    data.stage.standings = resolveStandingsRules("group", { standings: { winPoints: 5, drawPoints: 2, lossPoints: 0,
      tieBreakers: ["points", "goalsScored", "goalDifference", "teamName"] } })
    expect(winner()).toBe("Alpha")
    expect(fromStandings().rows.find((item) => item.name === "Alpha")?.points).toBe(10)
  })
  it("changes the selected team when custom draw points change the standings leader", () => {
    const entries = ["Alpha", "Bravo", "Charlie"].map((name, index) => ({
      id: `entry-${index}`, stageId: ids.stage, stageGroupId: ids.a, teamId: `team-${index}`, name,
    }))
    const games: [number, number, number, number][] = [[0, 2, 1, 0], [0, 1, 0, 0], [1, 2, 0, 0]]
    const data: StandingsInput = {
      stage: { id: ids.stage, stageType: "group", standings: resolveStandingsRules("group", null) },
      stageGroups: [{ id: ids.a, stageId: ids.stage, name: "Group A" }], stageEntries: entries,
      matches: games.map((_, index) => ({ id: `match-${index}`, stageId: ids.stage, stageGroupId: ids.a, status: "completed" })),
      matchParticipants: games.flatMap(([left, right, ls, rs], index) => [
        { matchId: `match-${index}`, entryId: entries[left].id, score: ls },
        { matchId: `match-${index}`, entryId: entries[right].id, score: rs },
      ]),
    }
    const top = () => {
      const table = calculateStandings(data)
      if (table.kind !== "groups") throw new Error("Expected group standings")
      const result = preview([rule(ids.a, 1)], [{ ...source(ids.a, []), rows: table.groups[0].rows,
        entries: entries.map((entry) => ({ id: entry.id, teamId: entry.teamId })) }])
      if (!result.ok) throw new Error(result.error)
      return result.qualified[0].name
    }
    expect(top()).toBe("Alpha")
    data.stage.standings = resolveStandingsRules("group", { standings: { winPoints: 2, drawPoints: 3, lossPoints: 0,
      tieBreakers: ["points", "goalDifference", "goalsScored", "teamName"] } })
    expect(top()).toBe("Bravo")
  })
})
