import { describe, expect, it } from "vitest"
import { defaultStageRules, calculateStandings, parseScoringRules, resolveStandingsRules, parseTieBreakers, parseStandingsConfiguration, DEFAULT_TIE_BREAKERS, TIE_BREAKERS, type StandingsInput, type TieBreaker } from "./standings"

const stage = "stage-a"
const otherStage = "stage-b"
const groupA = "group-a"
const groupB = "group-b"

function entry(id: string, teamId: string, name: string, stageGroupId: string | null, stageId = stage) {
  return { id, stageId, stageGroupId, teamId, name }
}

function match(
  id: string,
  status: "scheduled" | "cancelled" | "completed",
  stageGroupId: string | null,
  sides: [string, number | null, string, number | null],
  stageId = stage,
) {
  return {
    match: { id, stageId, stageGroupId, status },
    participants: [
      { matchId: id, entryId: sides[0], score: sides[1] },
      { matchId: id, entryId: sides[2], score: sides[3] },
    ],
  }
}

function input(overrides: Partial<StandingsInput> = {}): StandingsInput {
  return {
    stage: { id: stage, stageType: "group", standings: resolveStandingsRules("group", defaultStageRules("group")) },
    stageGroups: [
      { id: groupA, stageId: stage, name: "Group A" },
      { id: groupB, stageId: stage, name: "Group B" },
    ],
    stageEntries: [
      entry("ea", "a", "Team A", groupA),
      entry("eb", "b", "Team B", groupA),
      entry("ec", "c", "Team C", groupA),
      entry("ed", "d", "Team D", groupB),
      entry("ee", "e", "Team E", groupB),
    ],
    matches: [],
    matchParticipants: [],
    ...overrides,
  }
}

function withMatches(played: ReturnType<typeof match>[], base: StandingsInput = input()): StandingsInput {
  return {
    ...base,
    matches: played.map((item) => item.match),
    matchParticipants: played.flatMap((item) => item.participants),
  }
}

function groupRows(result: ReturnType<typeof calculateStandings>, groupId: string) {
  if (result.kind !== "groups") throw new Error("expected group standings")
  return result.groups.find((group) => group.groupId === groupId)?.rows ?? []
}

describe("standings rules", () => {
  it("defaults group and league scoring to 3, 1, and 0", () => {
    expect(defaultStageRules("group").standings).toEqual({
      winPoints: 3, drawPoints: 1, lossPoints: 0, tieBreakers: [...DEFAULT_TIE_BREAKERS],
    })
    expect(resolveStandingsRules("league", defaultStageRules("league")).enabled).toBe(true)
    expect(defaultStageRules("knockout").standings.enabled).toBe(false)
  })

  it("rejects a scoring value that is blank or negative", () => {
    expect(parseScoringRules({ win: 3, draw: 1, loss: 0 }).ok).toBe(true)
    expect(parseScoringRules({ win: "", draw: "1", loss: "0" }).ok).toBe(false)
    expect(parseScoringRules({ win: "-1", draw: "1", loss: "0" }).ok).toBe(false)
  })

  it("keeps a stored scoring override", () => {
    expect(
      resolveStandingsRules("group", {
        schemaVersion: "1",
        standings: { enabled: true, scoring: { win: 2, draw: 1, loss: 0 } },
      }).scoring.win,
    ).toBe(2)
  })
})

describe("calculateStandings", () => {
  it("records a win, a draw, and a loss from one result", () => {
    const rows = groupRows(calculateStandings(withMatches([match("m1", "completed", groupA, ["ea", 2, "eb", 0])])), groupA)
    const teamA = rows.find((row) => row.teamId === "a")
    const teamB = rows.find((row) => row.teamId === "b")
    expect(teamA).toMatchObject({ played: 1, won: 1, drawn: 0, lost: 0, scored: 2, conceded: 0, difference: 2, points: 3 })
    expect(teamB).toMatchObject({ played: 1, won: 0, drawn: 0, lost: 1, scored: 0, conceded: 2, difference: -2, points: 0 })
  })

  it("gives both teams one point for a 0-0 draw", () => {
    const rows = groupRows(calculateStandings(withMatches([match("m1", "completed", groupA, ["ea", 0, "eb", 0])])), groupA)
    expect(rows.find((row) => row.teamId === "a")).toMatchObject({ played: 1, drawn: 1, points: 1, scored: 0 })
    expect(rows.find((row) => row.teamId === "b")?.points).toBe(1)
  })

  it("gives both teams one point for a draw", () => {
    const rows = groupRows(calculateStandings(withMatches([match("m1", "completed", groupA, ["ea", 1, "eb", 1])])), groupA)
    expect(rows.find((row) => row.teamId === "a")).toMatchObject({ drawn: 1, points: 1, difference: 0 })
    expect(rows.find((row) => row.teamId === "b")).toMatchObject({ drawn: 1, points: 1 })
  })

  it("uses the stage scoring rules instead of a fixed 3-1-0 table", () => {
    const base = input()
    base.stage.standings = { tieBreakers: [...TIE_BREAKERS], enabled: true, scoring: { win: 2, draw: 1, loss: 0 } }
    const rows = groupRows(calculateStandings(withMatches([match("m1", "completed", groupA, ["ea", 1, "eb", 0])], base)), groupA)
    expect(rows.find((row) => row.teamId === "a")?.points).toBe(2)
  })

  it("totals several completed matches", () => {
    const rows = groupRows(
      calculateStandings(
        withMatches([
          match("m1", "completed", groupA, ["ea", 2, "eb", 0]),
          match("m2", "completed", groupA, ["ea", 1, "ec", 1]),
          match("m3", "completed", groupA, ["eb", 3, "ec", 1]),
        ]),
      ),
      groupA,
    )
    expect(rows.map((row) => row.teamId)).toEqual(["a", "b", "c"])
    expect(rows.find((row) => row.teamId === "a")).toMatchObject({ played: 2, won: 1, drawn: 1, lost: 0, scored: 3, conceded: 1, difference: 2, points: 4 })
    expect(rows.find((row) => row.teamId === "b")).toMatchObject({ played: 2, won: 1, drawn: 0, lost: 1, scored: 3, conceded: 3, difference: 0, points: 3 })
    expect(rows.find((row) => row.teamId === "c")).toMatchObject({ played: 2, won: 0, drawn: 1, lost: 1, scored: 2, conceded: 4, difference: -2, points: 1 })
  })

  it("keeps another group's matches out of this group", () => {
    const rows = groupRows(
      calculateStandings(withMatches([match("m1", "completed", groupB, ["ed", 5, "ee", 0])])),
      groupA,
    )
    expect(rows.every((row) => row.played === 0 && row.points === 0)).toBe(true)
    expect(groupRows(calculateStandings(withMatches([match("m1", "completed", groupB, ["ed", 5, "ee", 0])])), groupB).find((row) => row.teamId === "d")?.points).toBe(3)
  })

  it("ignores matches from another stage", () => {
    const rows = groupRows(
      calculateStandings(withMatches([match("m1", "completed", groupA, ["ea", 4, "eb", 0], otherStage)])),
      groupA,
    )
    expect(rows.find((row) => row.teamId === "a")?.played).toBe(0)
  })

  it("ignores scheduled and cancelled matches, including ones that still have scores", () => {
    const rows = groupRows(
      calculateStandings(
        withMatches([
          match("m1", "scheduled", groupA, ["ea", null, "eb", null]),
          match("m2", "cancelled", groupA, ["ea", 3, "eb", 0]),
        ]),
      ),
      groupA,
    )
    expect(rows.every((row) => row.played === 0)).toBe(true)
  })

  it("ignores a completed match that does not have two scores", () => {
    const rows = groupRows(calculateStandings(withMatches([match("m1", "completed", groupA, ["ea", 2, "eb", null])])), groupA)
    expect(rows.find((row) => row.teamId === "a")?.played).toBe(0)
  })

  it("changes the table when a completed score changes", () => {
    const first = groupRows(calculateStandings(withMatches([match("m1", "completed", groupA, ["ea", 1, "eb", 0])])), groupA)
    const second = groupRows(calculateStandings(withMatches([match("m1", "completed", groupA, ["ea", 0, "eb", 2])])), groupA)
    expect(first.find((row) => row.teamId === "a")?.points).toBe(3)
    expect(second.find((row) => row.teamId === "a")?.points).toBe(0)
    expect(second.find((row) => row.teamId === "b")?.points).toBe(3)
  })

  it("orders by points, then difference, then scored, then team name", () => {
    const tied = input({
      stageEntries: [
        entry("plus", "plus", "Plus", groupA),
        entry("many", "many", "Many", groupA),
        entry("few", "few", "Few", groupA),
        entry("bravo", "bravo", "Bravo", groupA),
        entry("zulu", "zulu", "Zulu", groupA),
        entry("alpha", "alpha", "Alpha", groupA),
        entry("bottom", "bottom", "Bottom", groupA),
      ],
    })
    const rows = groupRows(
      calculateStandings(
        withMatches(
          [
            match("m1", "completed", groupA, ["plus", 3, "bottom", 0]),
            match("m2", "completed", groupA, ["many", 2, "bottom", 1]),
            match("m3", "completed", groupA, ["few", 1, "alpha", 0]),
          ],
          tied,
        ),
      ),
      groupA,
    )
    expect(rows.map((row) => row.name)).toEqual(["Plus", "Many", "Few", "Bravo", "Zulu", "Alpha", "Bottom"])
  })

  it("returns no table for a knockout stage", () => {
    const base = input()
    base.stage = { id: stage, stageType: "knockout", standings: { tieBreakers: [...TIE_BREAKERS], enabled: true, scoring: { win: 3, draw: 1, loss: 0 } } }
    expect(calculateStandings(withMatches([match("m1", "completed", null, ["ea", 1, "eb", 0])], base))).toEqual({ kind: "none" })
  })

  it("returns zero rows when a group has participants but no completed matches", () => {
    const rows = groupRows(calculateStandings(input()), groupA)
    expect(rows).toHaveLength(3)
    expect(rows.every((row) => row.played === 0 && row.points === 0 && row.difference === 0)).toBe(true)
  })

  it("builds one league table and does not split it by group", () => {
    const base = input()
    base.stage = { id: stage, stageType: "league", standings: resolveStandingsRules("league", null) }
    const result = calculateStandings(withMatches([match("m1", "completed", groupA, ["ea", 2, "ed", 1])], base))
    expect(result.kind).toBe("league")
    if (result.kind !== "league") return
    expect(result.rows.map((row) => row.teamId).sort()).toEqual(["a", "b", "c", "d", "e"])
    expect(result.rows.find((row) => row.teamId === "a")?.points).toBe(3)
    expect(result.rows.find((row) => row.teamId === "d")?.points).toBe(0)
  })
})

describe("configurable standings foundation", () => {
  it.each([-1, 1.5, "3", null, undefined, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("rejects invalid points %s", (value) => {
    for (const key of ["win", "draw", "loss"]) {
      expect(parseScoringRules({ win: 3, draw: 1, loss: 0, [key]: value }).ok).toBe(false)
    }
  })

  it.each([[4, 2, 0], [3, 1, 0], [2, 1, 0], [0, 0, 0]])("accepts scoring %s/%s/%s", (win, draw, loss) => {
    expect(parseScoringRules({ win, draw, loss })).toEqual({ ok: true, value: { win, draw, loss } })
  })

  it.each([[], ["goalDifference"], ["points", "points"], ["unknownRule"], ["points", "wins"], ["points", null]])(
    "rejects invalid tie-break list %j", (...rules) => {
      expect(parseTieBreakers(rules).ok).toBe(false)
    },
  )

  it("requires scoring and tie-breaks in submitted configuration", () => {
    expect(parseStandingsConfiguration(null).ok).toBe(false)
    expect(parseStandingsConfiguration({ winPoints: 3, drawPoints: 1, lossPoints: 0 }).ok).toBe(false)
    expect(parseStandingsConfiguration({ winPoints: "3", drawPoints: 1, lossPoints: 0, tieBreakers: ["points"] }).ok).toBe(false)
    expect(parseTieBreakers(["goalsScored", "points"])).toEqual({ ok: true, value: ["goalsScored", "points"] })
    expect(parseTieBreakers(["points"]).ok).toBe(true)
  })

  it.each([null, { schemaVersion: "1" }, { schemaVersion: "1", standings: { winPoints: 3, drawPoints: 1, lossPoints: 0 } },
    { schemaVersion: "1", standings: { scoring: { win: 3, draw: 1, loss: 0 } } }])("defaults legacy rules %j", (rules) => {
    expect(resolveStandingsRules("group", rules)).toEqual({ enabled: true, scoring: { win: 3, draw: 1, loss: 0 }, tieBreakers: [...DEFAULT_TIE_BREAKERS] })
  })

  it("keeps legacy custom scoring and defaults missing tie-breaks", () => {
    expect(resolveStandingsRules("league", { standings: { scoring: { win: 4, draw: 2, loss: 1 } } }))
      .toEqual({ enabled: true, scoring: { win: 4, draw: 2, loss: 1 }, tieBreakers: [...DEFAULT_TIE_BREAKERS] })
    expect(resolveStandingsRules("group", { standings: { scoring: { win: -1, draw: 1.5, loss: 0 } } }).scoring)
      .toEqual({ win: 3, draw: 1, loss: 0 })
  })

  it.each(["group", "league"] as const)("uses custom scoring and exact ordered tie-breaks in %s", (stageType) => {
    const base = input({ stageEntries: [entry("ea", "a", "Alpha", groupA), entry("eb", "b", "Bravo", groupA),
      entry("ec", "c", "Charlie", groupA), entry("ed", "d", "Delta", groupA)] })
    base.stage.stageType = stageType
    const data = withMatches([
      match("ac", "completed", groupA, ["ea", 4, "ec", 2]),
      match("ad", "completed", groupA, ["ea", 4, "ed", 2]),
      match("bc", "completed", groupA, ["eb", 3, "ec", 0]),
      match("bd", "completed", groupA, ["eb", 3, "ed", 1]),
      match("cd", "completed", groupA, ["ec", 0, "ed", 0]),
    ], base)
    const rows = () => {
      const result = calculateStandings(data)
      return result.kind === "league" ? result.rows : groupRows(result, groupA)
    }
    expect(rows().slice(0, 2).map((row) => row.teamId)).toEqual(["b", "a"])
    expect(rows().slice(0, 2).map((row) => row.points)).toEqual([6, 6])
    data.stage.standings = resolveStandingsRules(stageType, { standings: {
      winPoints: 5, drawPoints: 2, lossPoints: 1, tieBreakers: ["points", "goalsScored", "goalDifference", "teamName"],
    } })
    expect(rows().map((row) => row.teamId)).toEqual(["a", "b", "d", "c"])
    expect(rows().map((row) => row.points)).toEqual([10, 10, 4, 4])
    data.stage.standings.tieBreakers = ["teamName", "points"]
    expect(rows().map((row) => row.teamId)).toEqual(["a", "b", "c", "d"])
    data.stage.standings.tieBreakers = [...TIE_BREAKERS]
    expect(rows().slice(0, 2).map((row) => row.teamId)).toEqual(["b", "a"])
  })

  it("uses case-insensitive name fallback and stable IDs regardless of input order", () => {
    const base = input({ stageEntries: [entry("ez", "z", "alpha", groupA), entry("eb", "b", "Beta", groupA), entry("ea", "a", "Alpha", groupA)] })
    base.stage.standings.tieBreakers = ["points"]
    expect(groupRows(calculateStandings(base), groupA).map((row) => row.teamId)).toEqual(["a", "z", "b"])
    base.stageEntries.reverse()
    base.stage.standings.tieBreakers = ["points", "teamName"]
    expect(groupRows(calculateStandings(base), groupA).map((row) => row.teamId)).toEqual(["a", "z", "b"])
  })

  it.each([-1, 1.5, NaN, Infinity])("ignores invalid completed scores %s", (score) => {
    expect(groupRows(calculateStandings(withMatches([match("bad", "completed", groupA, ["ea", score, "eb", 0])])), groupA)
      .every((row) => row.played === 0)).toBe(true)
  })

  it("forces knockout standings off even with stored enabled rules", () => {
    expect(resolveStandingsRules("knockout", { standings: { enabled: true } }).enabled).toBe(false)
  })
})

const H2H: TieBreaker[] = ["points", "headToHead", "goalDifference", "goalsScored", "teamName"]
const GD_FIRST: TieBreaker[] = ["points", "goalDifference", "headToHead", "goalsScored", "teamName"]

function withRules(tieBreakers: TieBreaker[], scoring = { win: 3, draw: 1, loss: 0 }, stageType: "group" | "league" = "group") {
  const base = input()
  base.stage.stageType = stageType
  base.stage.standings = { enabled: true, scoring, tieBreakers }
  return base
}

function named(names: string[], groupId: string | null = groupA) {
  return names.map((name) => entry(`e-${name}`, name, name, groupId))
}

describe("head-to-head tie-breaker", () => {
  it("accepts head-to-head once and still rejects duplicates", () => {
    expect(parseTieBreakers(H2H)).toEqual({ ok: true, value: H2H })
    expect(parseTieBreakers(["points", "headToHead", "headToHead"]).ok).toBe(false)
    expect(defaultStageRules("group").standings.tieBreakers).toEqual(DEFAULT_TIE_BREAKERS)
  })

  it("ranks the winner of the direct match above a team with the same points", () => {
    const base = withRules(H2H)
    base.stageEntries = named(["Alpha", "Bravo", "Charlie", "Delta"])
    const rows = groupRows(calculateStandings(withMatches([
      match("ab", "completed", groupA, ["e-Alpha", 2, "e-Bravo", 1]),
      match("ca", "completed", groupA, ["e-Charlie", 5, "e-Alpha", 0]),
      match("bd", "completed", groupA, ["e-Bravo", 1, "e-Delta", 0]),
      match("cd", "completed", groupA, ["e-Charlie", 0, "e-Delta", 0]),
    ], base)), groupA)
    const tied = rows.filter((row) => row.name === "Alpha" || row.name === "Bravo")
    expect(tied.map((row) => row.points)).toEqual([3, 3])
    expect(tied.map((row) => row.difference)[0]).toBeLessThan(0)
    expect(rows.map((row) => row.name)).toEqual(["Charlie", "Alpha", "Bravo", "Delta"])
  })

  it("does not reorder teams that already differ on points", () => {
    const base = withRules(H2H)
    base.stageEntries = named(["Alpha", "Bravo"])
    const rows = groupRows(calculateStandings(withMatches([
      match("ab", "completed", groupA, ["e-Alpha", 1, "e-Bravo", 0]),
    ], base)), groupA)
    expect(rows.map((row) => row.name)).toEqual(["Alpha", "Bravo"])
  })

  it("aggregates every completed meeting between the same teams", () => {
    const base = withRules(H2H)
    base.stageEntries = named(["Alpha", "Bravo", "Charlie"])
    const rows = groupRows(calculateStandings(withMatches([
      match("ab1", "completed", groupA, ["e-Alpha", 2, "e-Bravo", 0]),
      match("ab2", "completed", groupA, ["e-Bravo", 1, "e-Alpha", 1]),
      match("ca", "completed", groupA, ["e-Charlie", 4, "e-Alpha", 0]),
      match("bc", "completed", groupA, ["e-Bravo", 1, "e-Charlie", 0]),
    ], base)), groupA)
    const tied = rows.filter((row) => row.name === "Alpha" || row.name === "Bravo")
    expect(tied.map((row) => row.points)).toEqual([4, 4])
    expect(tied.map((row) => row.difference)[0]).toBeLessThan(tied.map((row) => row.difference)[1])
    expect(rows.map((row) => row.name).slice(0, 2)).toEqual(["Alpha", "Bravo"])
  })

  it("scores the reduced table with the stage win, draw, and loss points", () => {
    const base = withRules(["headToHead", "points"], { win: 0, draw: 0, loss: 3 })
    base.stageEntries = named(["Alpha", "Bravo", "Charlie"])
    const rows = groupRows(calculateStandings(withMatches([
      match("ab", "completed", groupA, ["e-Alpha", 1, "e-Bravo", 0]),
      match("ac", "completed", groupA, ["e-Alpha", 1, "e-Charlie", 0]),
      match("bc", "completed", groupA, ["e-Bravo", 1, "e-Charlie", 0]),
    ], base)), groupA)
    expect(rows.map((row) => row.name)).toEqual(["Charlie", "Bravo", "Alpha"])
  })

  it("ranks three tied teams by head-to-head points, ignoring matches outside the tie", () => {
    const base = withRules(H2H)
    base.stageEntries = named(["Alpha", "Bravo", "Charlie", "Delta"])
    const rows = groupRows(calculateStandings(withMatches([
      match("ab", "completed", groupA, ["e-Alpha", 1, "e-Bravo", 0]),
      match("ac", "completed", groupA, ["e-Alpha", 1, "e-Charlie", 0]),
      match("bc", "completed", groupA, ["e-Bravo", 1, "e-Charlie", 0]),
      match("bd", "completed", groupA, ["e-Bravo", 1, "e-Delta", 0]),
      match("cd", "completed", groupA, ["e-Charlie", 1, "e-Delta", 0]),
      match("cd2", "completed", groupA, ["e-Charlie", 1, "e-Delta", 0]),
    ], base)), groupA)
    expect(rows.filter((row) => row.name !== "Delta").map((row) => row.points)).toEqual([6, 6, 6])
    expect(rows.map((row) => row.name).slice(0, 3)).toEqual(["Alpha", "Bravo", "Charlie"])
  })

  it("uses head-to-head goal difference when head-to-head points are equal", () => {
    const base = withRules(H2H)
    base.stageEntries = named(["Alpha", "Bravo", "Charlie", "Delta"])
    const rows = groupRows(calculateStandings(withMatches([
      match("ab", "completed", groupA, ["e-Alpha", 1, "e-Bravo", 0]),
      match("bc", "completed", groupA, ["e-Bravo", 1, "e-Charlie", 0]),
      match("ca", "completed", groupA, ["e-Charlie", 2, "e-Alpha", 0]),
      match("ad", "completed", groupA, ["e-Alpha", 6, "e-Delta", 0]),
      match("bd", "completed", groupA, ["e-Bravo", 1, "e-Delta", 0]),
      match("cd", "completed", groupA, ["e-Charlie", 1, "e-Delta", 0]),
    ], base)), groupA)
    expect(rows.slice(0, 3).map((row) => row.points)).toEqual([6, 6, 6])
    expect(rows.slice(0, 3).map((row) => row.name)).toEqual(["Charlie", "Bravo", "Alpha"])
    expect(rows.slice(0, 3).map((row) => row.difference)).toEqual([2, 1, 5])
  })

  it("uses head-to-head goals scored when head-to-head points and difference are equal", () => {
    const base = withRules(H2H)
    base.stageEntries = named(["Alpha", "Bravo", "Charlie"])
    const rows = groupRows(calculateStandings(withMatches([
      match("ab", "completed", groupA, ["e-Alpha", 2, "e-Bravo", 2]),
      match("bc", "completed", groupA, ["e-Bravo", 1, "e-Charlie", 1]),
      match("ca", "completed", groupA, ["e-Charlie", 0, "e-Alpha", 0]),
    ], base)), groupA)
    expect(rows.map((row) => row.points)).toEqual([2, 2, 2])
    expect(rows.map((row) => row.difference)).toEqual([0, 0, 0])
    expect(rows.map((row) => row.name)).toEqual(["Bravo", "Alpha", "Charlie"])
  })

  it("recalculates the remaining pair after one team separates on head-to-head points", () => {
    const base = withRules(H2H)
    base.stageEntries = named(["Alpha", "Bravo", "Charlie", "Delta"])
    const rows = groupRows(calculateStandings(withMatches([
      match("ab1", "completed", groupA, ["e-Alpha", 1, "e-Bravo", 0]),
      match("ab2", "completed", groupA, ["e-Alpha", 1, "e-Bravo", 0]),
      match("ca", "completed", groupA, ["e-Charlie", 1, "e-Alpha", 0]),
      match("bc", "completed", groupA, ["e-Bravo", 1, "e-Charlie", 0]),
      match("bd", "completed", groupA, ["e-Bravo", 1, "e-Delta", 0]),
      match("cd", "completed", groupA, ["e-Charlie", 1, "e-Delta", 0]),
    ], base)), groupA)
    expect(rows.slice(0, 3).map((row) => row.points)).toEqual([6, 6, 6])
    expect(rows.slice(0, 3).map((row) => row.name)).toEqual(["Alpha", "Bravo", "Charlie"])
  })

  it("falls through to overall goal difference when head-to-head cannot separate anyone", () => {
    const base = withRules(H2H)
    base.stageEntries = named(["Alpha", "Bravo", "Charlie", "Delta"])
    const rows = groupRows(calculateStandings(withMatches([
      match("ab", "completed", groupA, ["e-Alpha", 1, "e-Bravo", 0]),
      match("bc", "completed", groupA, ["e-Bravo", 1, "e-Charlie", 0]),
      match("ca", "completed", groupA, ["e-Charlie", 1, "e-Alpha", 0]),
      match("ad", "completed", groupA, ["e-Alpha", 5, "e-Delta", 0]),
      match("bd", "completed", groupA, ["e-Bravo", 1, "e-Delta", 0]),
      match("cd", "completed", groupA, ["e-Charlie", 2, "e-Delta", 0]),
    ], base)), groupA)
    expect(rows.slice(0, 3).map((row) => row.name)).toEqual(["Alpha", "Charlie", "Bravo"])
  })

  it("falls through to goals scored when head-to-head and overall goal difference are equal", () => {
    const base = withRules(H2H)
    base.stageEntries = named(["Alpha", "Bravo", "Charlie"])
    const rows = groupRows(calculateStandings(withMatches([
      match("ab", "completed", groupA, ["e-Alpha", 0, "e-Bravo", 0]),
      match("ac", "completed", groupA, ["e-Alpha", 3, "e-Charlie", 1]),
      match("bc", "completed", groupA, ["e-Bravo", 2, "e-Charlie", 0]),
    ], base)), groupA)
    const tied = rows.filter((row) => row.name !== "Charlie")
    expect(tied.map((row) => row.points)).toEqual([4, 4])
    expect(tied.map((row) => row.difference)).toEqual([2, 2])
    expect(tied.map((row) => row.name)).toEqual(["Alpha", "Bravo"])
  })

  it("uses team name when every numeric criterion is equal", () => {
    const base = withRules(H2H)
    base.stageEntries = named(["Bravo", "Alpha"])
    const rows = groupRows(calculateStandings(withMatches([
      match("ab", "completed", groupA, ["e-Alpha", 1, "e-Bravo", 1]),
    ], base)), groupA)
    expect(rows.map((row) => row.name)).toEqual(["Alpha", "Bravo"])
  })

  it("uses team id when the remaining teams have the same name", () => {
    const base = withRules(H2H)
    base.stageEntries = [entry("e-b", "b", "Alpha", groupA), entry("e-a", "a", "Alpha", groupA)]
    const rows = groupRows(calculateStandings(withMatches([
      match("ab", "completed", groupA, ["e-a", 0, "e-b", 0]),
    ], base)), groupA)
    expect(rows.map((row) => row.teamId)).toEqual(["a", "b"])
  })

  it("applies head-to-head before overall goal difference when that is the configured order", () => {
    const base = withRules(H2H)
    base.stageEntries = named(["Alpha", "Bravo", "Charlie", "Delta"])
    const played = [
      match("ab", "completed", groupA, ["e-Alpha", 1, "e-Bravo", 0]),
      match("bc", "completed", groupA, ["e-Bravo", 1, "e-Charlie", 0]),
      match("ca", "completed", groupA, ["e-Charlie", 2, "e-Alpha", 0]),
      match("ad", "completed", groupA, ["e-Alpha", 6, "e-Delta", 0]),
      match("bd", "completed", groupA, ["e-Bravo", 1, "e-Delta", 0]),
      match("cd", "completed", groupA, ["e-Charlie", 1, "e-Delta", 0]),
    ]
    expect(groupRows(calculateStandings(withMatches(played, base)), groupA).slice(0, 3).map((row) => row.name))
      .toEqual(["Charlie", "Bravo", "Alpha"])
  })

  it("applies overall goal difference before head-to-head when that is the configured order", () => {
    const base = withRules(GD_FIRST)
    base.stageEntries = named(["Alpha", "Bravo", "Charlie", "Delta"])
    const rows = groupRows(calculateStandings(withMatches([
      match("ab", "completed", groupA, ["e-Alpha", 1, "e-Bravo", 0]),
      match("bc", "completed", groupA, ["e-Bravo", 1, "e-Charlie", 0]),
      match("ca", "completed", groupA, ["e-Charlie", 2, "e-Alpha", 0]),
      match("ad", "completed", groupA, ["e-Alpha", 6, "e-Delta", 0]),
      match("bd", "completed", groupA, ["e-Bravo", 1, "e-Delta", 0]),
      match("cd", "completed", groupA, ["e-Charlie", 1, "e-Delta", 0]),
    ], base)), groupA)
    expect(rows.slice(0, 3).map((row) => row.name)).toEqual(["Alpha", "Charlie", "Bravo"])
  })

  it("ignores scheduled and cancelled matches", () => {
    const base = withRules(H2H)
    base.stageEntries = named(["Alpha", "Bravo", "Charlie"])
    const rows = groupRows(calculateStandings(withMatches([
      match("done", "completed", groupA, ["e-Alpha", 1, "e-Bravo", 0]),
      match("later", "scheduled", groupA, ["e-Bravo", 5, "e-Alpha", 0]),
      match("void", "cancelled", groupA, ["e-Bravo", 5, "e-Alpha", 0]),
      match("ac", "completed", groupA, ["e-Charlie", 1, "e-Alpha", 0]),
      match("bc", "completed", groupA, ["e-Charlie", 1, "e-Bravo", 0]),
    ], base)), groupA)
    expect(rows.map((row) => row.name)).toEqual(["Charlie", "Alpha", "Bravo"])
  })

  it("does not use another stage or the other group", () => {
    const base = withRules(H2H)
    base.stageEntries = [...named(["Alpha", "Bravo", "Charlie"]), ...named(["Echo", "Foxtrot"], groupB)]
    const rows = groupRows(calculateStandings(withMatches([
      match("ab", "completed", groupA, ["e-Alpha", 1, "e-Bravo", 0]),
      match("bc", "completed", groupA, ["e-Bravo", 1, "e-Charlie", 0]),
      match("ca", "completed", groupA, ["e-Charlie", 1, "e-Alpha", 0]),
      match("other", "completed", groupA, ["e-Alpha", 0, "e-Bravo", 5], otherStage),
      match("b", "completed", groupB, ["e-Echo", 1, "e-Foxtrot", 0]),
    ], base)), groupA)
    expect(rows.map((row) => row.name)).toEqual(["Alpha", "Bravo", "Charlie"])
    expect(groupRows(calculateStandings(withMatches([
      match("ab", "completed", groupA, ["e-Alpha", 1, "e-Bravo", 0]),
      match("bc", "completed", groupA, ["e-Bravo", 1, "e-Charlie", 0]),
      match("ca", "completed", groupA, ["e-Charlie", 1, "e-Alpha", 0]),
      match("b", "completed", groupB, ["e-Echo", 1, "e-Foxtrot", 0]),
    ], base)), groupB).map((row) => row.name)).toEqual(["Echo", "Foxtrot"])
  })

  it("counts a league match whose stage group is null", () => {
    const base = withRules(H2H, { win: 3, draw: 1, loss: 0 }, "league")
    base.stageEntries = named(["Alpha", "Bravo", "Charlie"], null)
    const result = calculateStandings(withMatches([
      match("ab", "completed", null, ["e-Alpha", 1, "e-Bravo", 0]),
      match("bc", "completed", null, ["e-Bravo", 1, "e-Charlie", 0]),
      match("ca", "completed", null, ["e-Charlie", 2, "e-Alpha", 0]),
    ], base))
    if (result.kind !== "league") throw new Error("expected league")
    expect(result.rows.map((row) => row.name)).toEqual(["Charlie", "Bravo", "Alpha"])
  })
})
