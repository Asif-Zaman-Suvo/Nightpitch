import { describe, expect, it } from "vitest"
import { defaultStageRules, calculateStandings, parseScoringRules, resolveStandingsRules, type StandingsInput } from "./standings"

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
      enabled: true,
      scoring: { win: 3, draw: 1, loss: 0 },
    })
    expect(defaultStageRules("league").standings.enabled).toBe(true)
    expect(defaultStageRules("knockout").standings.enabled).toBe(false)
  })

  it("rejects a scoring value that is blank or negative", () => {
    expect(parseScoringRules({ win: "3", draw: "1", loss: "0" }).ok).toBe(true)
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
    base.stage.standings = { enabled: true, scoring: { win: 2, draw: 1, loss: 0 } }
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
    base.stage = { id: stage, stageType: "knockout", standings: { enabled: true, scoring: { win: 3, draw: 1, loss: 0 } } }
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
