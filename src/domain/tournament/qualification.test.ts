import { describe, expect, it } from "vitest"
import { calculateStandings, resolveStandingsRules, type StandingsInput } from "./standings"
import { calculateQualifiedEntries, parseQualificationConfiguration, planQualificationApply, type AppliedEntrySnapshot, type QualificationPreview, type QualificationSource, type QualifiedEntry } from "./qualification"

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
    const duplicatePreview = preview([rule(ids.a, 1), rule(ids.b, 1)], [a, duplicate])
    expect(duplicatePreview).toMatchObject({ ok: false, qualified: [], error: "Alpha qualifies more than once." })
    expect(duplicatePreview.groups.flatMap((group) => group.rows.filter((row) => row.qualified))).toEqual([])
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
  it("qualifies the head-to-head order without a separate tie-break implementation", () => {
    const names = ["Alpha", "Bravo", "Charlie", "Delta"]
    const entries = names.map((name) => ({ id: `e-${name}`, stageId: ids.stage, stageGroupId: ids.a, teamId: name, name }))
    const games: [string, string, number, number][] = [
      ["Alpha", "Bravo", 1, 0], ["Bravo", "Charlie", 1, 0], ["Charlie", "Alpha", 2, 0],
      ["Alpha", "Delta", 6, 0], ["Bravo", "Delta", 1, 0], ["Charlie", "Delta", 1, 0],
    ]
    const data: StandingsInput = {
      stage: { id: ids.stage, stageType: "group", standings: resolveStandingsRules("group", { standings: {
        winPoints: 3, drawPoints: 1, lossPoints: 0, tieBreakers: ["points", "headToHead", "goalDifference", "goalsScored", "teamName"],
      } }) },
      stageGroups: [{ id: ids.a, stageId: ids.stage, name: "Group A" }],
      stageEntries: entries,
      matches: games.map((_, index) => ({ id: `m-${index}`, stageId: ids.stage, stageGroupId: ids.a, status: "completed" as const })),
      matchParticipants: games.flatMap(([left, right, leftScore, rightScore], index) => [
        { matchId: `m-${index}`, entryId: `e-${left}`, score: leftScore },
        { matchId: `m-${index}`, entryId: `e-${right}`, score: rightScore },
      ]),
    }
    const qualifiedNames = () => {
      const table = calculateStandings(data)
      if (table.kind !== "groups") throw new Error("expected groups")
      const result = preview([rule(ids.a, 2)], [{
        ...source(ids.a, []), rows: table.groups[0].rows, completedMatches: games.length,
        entries: entries.map((entry) => ({ id: entry.id, teamId: entry.teamId })),
      }])
      if (!result.ok) throw new Error(result.error)
      return result.qualified.map((item) => item.name)
    }
    expect(qualifiedNames()).toEqual(["Charlie", "Bravo"])
    data.stage.standings.tieBreakers = ["points", "goalDifference", "goalsScored", "teamName"]
    expect(qualifiedNames()).toEqual(["Alpha", "Charlie"])
  })
})

const qualified = (sourceGroupId: string, rank: number, name: string): QualifiedEntry => ({
  sourceGroupId, rank, stageEntryId: `${sourceGroupId}-entry`, teamId: name.toLowerCase(), name,
})
const ready = (entries: QualifiedEntry[]): QualificationPreview => ({ ok: true, groups: [], qualified: entries })
const placed = (id: string, name: string, slot: number, sourceGroupId: string, sourceRank: number, referenced = false): AppliedEntrySnapshot => ({
  id, slot, teamId: name.toLowerCase(), name, sourceKind: "group_rank", sourceGroupId, sourceRank, referenced,
})
const applyPlan = (entries: QualifiedEntry[], existing: AppliedEntrySnapshot[] = [], destinationHasMatches = false) =>
  planQualificationApply({ preview: ready(entries), hasRules: true, entries: existing, destinationHasMatches })

describe("planQualificationApply", () => {
  const alpha = qualified(ids.a, 1, "Alpha")
  const bravo = qualified(ids.a, 2, "Bravo")
  const echo = qualified(ids.b, 1, "Echo")
  const foxtrot = qualified(ids.b, 2, "Foxtrot")

  it("creates one group and several groups in qualification order", () => {
    expect(applyPlan([alpha, bravo])).toMatchObject({ ok: true, status: "apply", create: [
      { slot: 1, teamId: "alpha", sourceGroupId: ids.a, rank: 1 },
      { slot: 2, teamId: "bravo", sourceGroupId: ids.a, rank: 2 },
    ] })
    expect(applyPlan([alpha, bravo, echo, foxtrot])).toMatchObject({ ok: true, status: "apply", create: [
      { slot: 1, name: "Alpha" }, { slot: 2, name: "Bravo" }, { slot: 3, name: "Echo" }, { slot: 4, name: "Foxtrot" },
    ] })
  })

  it("does not create entries when the same qualification result is already stored", () => {
    const existing = [placed("e1", "Alpha", 1, ids.a, 1), placed("e2", "Bravo", 2, ids.a, 2)]
    expect(applyPlan([alpha, bravo], existing)).toEqual({ ok: true, status: "unchanged" })
    expect(applyPlan([alpha, bravo], existing, true)).toEqual({ ok: true, status: "unchanged" })
  })

  it("replaces an unreferenced qualified team and removes a dropped rank", () => {
    const existing = [placed("e1", "Alpha", 1, ids.a, 1), placed("e2", "Bravo", 2, ids.a, 2)]
    const charlie = qualified(ids.a, 2, "Charlie")
    expect(applyPlan([alpha, charlie], existing)).toMatchObject({
      ok: true, status: "apply", update: [{ id: "e2", slot: 2, teamId: "charlie", rank: 2 }], remove: [],
    })
    expect(applyPlan([alpha], existing)).toMatchObject({ ok: true, status: "apply", remove: [{ id: "e2" }] })
  })

  it("rejects replacement or removal of a team already used in a match", () => {
    const existing = [placed("e1", "Alpha", 1, ids.a, 1), placed("e2", "Bravo", 2, ids.a, 2, true)]
    expect(applyPlan([alpha, qualified(ids.a, 2, "Charlie")], existing)).toMatchObject({
      ok: false, error: "Bravo is already used in a match and cannot be replaced.",
    })
    expect(applyPlan([alpha], existing)).toMatchObject({
      ok: false, error: "Bravo is already used in a match and cannot be removed.",
    })
  })

  it("rejects a bracket when qualification would change its participants", () => {
    const existing = [placed("e1", "Alpha", 1, ids.a, 1), placed("e2", "Bravo", 2, ids.a, 2)]
    expect(applyPlan([alpha, qualified(ids.a, 2, "Charlie")], existing, true)).toMatchObject({
      ok: false, error: "A bracket already uses these participants. Qualification cannot change them.",
    })
  })

  it("rejects manual participants without changing them", () => {
    const manual: AppliedEntrySnapshot = { ...placed("m", "Alpha", 1, ids.a, 1), sourceKind: "team", sourceGroupId: null, sourceRank: null }
    expect(applyPlan([alpha], [manual])).toMatchObject({
      ok: false, error: "This stage already has manually added participants. Remove them before applying qualification.",
    })
  })

  it("rejects unresolved qualification and a stage with no rules", () => {
    expect(planQualificationApply({ preview: ready([]), hasRules: false, entries: [], destinationHasMatches: false })).toMatchObject({
      ok: false, error: "This stage has no qualification rules.",
    })
    const unavailable: QualificationPreview = { ok: false, error: "Standings are not available yet.", groups: [], qualified: [] }
    expect(planQualificationApply({ preview: unavailable, hasRules: true, entries: [], destinationHasMatches: false })).toMatchObject({
      ok: false, error: "Standings are not available yet.",
    })
    expect(planQualificationApply({
      preview: { ok: false, error: "Alpha qualifies more than once.", groups: [], qualified: [] },
      hasRules: true, entries: [], destinationHasMatches: false,
    })).toMatchObject({ ok: false, error: "Alpha qualifies more than once." })
    expect(planQualificationApply({
      preview: { ok: false, error: "Group A currently has only 1 eligible teams; 2 are required.", groups: [], qualified: [] },
      hasRules: true, entries: [], destinationHasMatches: false,
    }).ok).toBe(false)
  })
})
