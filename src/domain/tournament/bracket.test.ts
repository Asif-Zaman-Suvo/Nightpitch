import { describe, expect, it } from "vitest"
import {
  createLiveBracket,
  KNOCKOUT_DOWNSTREAM_LOCKED_ERROR,
  KNOCKOUT_DRAW_ERROR,
  planKnockoutBracket,
  planKnockoutResult,
  projectBracket,
  recordKnockoutResult,
  roundLabel,
} from "./bracket"

function participants(count: number) {
  return Array.from({ length: count }, (_, index) => ({ id: `p${index + 1}` }))
}

describe("planKnockoutBracket", () => {
  it("rejects group and league stages and accepts knockout", () => {
    expect(planKnockoutBracket({ stageType: "group", participants: participants(4), existingMatchCount: 0 })).toMatchObject({
      ok: false,
    })
    expect(planKnockoutBracket({ stageType: "league", participants: participants(4), existingMatchCount: 0 })).toMatchObject({
      ok: false,
    })
    expect(planKnockoutBracket({ stageType: "knockout", participants: participants(4), existingMatchCount: 0 }).ok).toBe(true)
  })

  it("rejects 0, 1, and non-power-of-two counts without creating byes", () => {
    for (const count of [0, 1, 3, 6, 12, 24]) {
      const plan = planKnockoutBracket({
        stageType: "knockout",
        participants: participants(count),
        existingMatchCount: 0,
      })
      expect(plan).toEqual({
        ok: false,
        error: "Knockout bracket generation currently requires 2, 4, 8, 16... participants.",
      })
    }
  })

  it("builds a 2-participant bracket as one final", () => {
    const plan = planKnockoutBracket({
      stageType: "knockout",
      participants: participants(2),
      existingMatchCount: 0,
    })
    expect(plan).toMatchObject({
      ok: true,
      status: "ready",
      bracket: { participantCount: 2, roundCount: 1, matchCount: 1 },
    })
    if (!plan.ok || plan.status !== "ready") return
    expect(plan.bracket.matches).toEqual([
      {
        index: 0,
        round: 1,
        position: 1,
        slots: [
          { kind: "participant", participantId: "p1" },
          { kind: "participant", participantId: "p2" },
        ],
      },
    ])
    expect(roundLabel(1, 1)).toBe("Final")
  })

  it("builds 4 and 8 participant brackets with N - 1 matches", () => {
    const four = planKnockoutBracket({
      stageType: "knockout",
      participants: participants(4),
      existingMatchCount: 0,
    })
    const eight = planKnockoutBracket({
      stageType: "knockout",
      participants: participants(8),
      existingMatchCount: 0,
    })
    expect(four).toMatchObject({ ok: true, status: "ready", bracket: { roundCount: 2, matchCount: 3 } })
    expect(eight).toMatchObject({ ok: true, status: "ready", bracket: { roundCount: 3, matchCount: 7 } })
    if (!eight.ok || eight.status !== "ready") return
    expect(eight.bracket.matches.map((match) => [match.round, match.slots])).toEqual([
      [
        1,
        [
          { kind: "participant", participantId: "p1" },
          { kind: "participant", participantId: "p2" },
        ],
      ],
      [
        1,
        [
          { kind: "participant", participantId: "p3" },
          { kind: "participant", participantId: "p4" },
        ],
      ],
      [
        1,
        [
          { kind: "participant", participantId: "p5" },
          { kind: "participant", participantId: "p6" },
        ],
      ],
      [
        1,
        [
          { kind: "participant", participantId: "p7" },
          { kind: "participant", participantId: "p8" },
        ],
      ],
      [
        2,
        [
          { kind: "winner", matchIndex: 0 },
          { kind: "winner", matchIndex: 1 },
        ],
      ],
      [
        2,
        [
          { kind: "winner", matchIndex: 2 },
          { kind: "winner", matchIndex: 3 },
        ],
      ],
      [
        3,
        [
          { kind: "winner", matchIndex: 4 },
          { kind: "winner", matchIndex: 5 },
        ],
      ],
    ])
    expect(roundLabel(1, 3)).toBe("Round 1")
    expect(roundLabel(2, 3)).toBe("Round 2")
    expect(roundLabel(3, 3)).toBe("Final")
  })

  it("is deterministic and does not mutate the participant list", () => {
    const ordered = participants(8)
    const snapshot = ordered.map((participant) => ({ ...participant }))
    const first = planKnockoutBracket({ stageType: "knockout", participants: ordered, existingMatchCount: 0 })
    const second = planKnockoutBracket({ stageType: "knockout", participants: ordered, existingMatchCount: 0 })
    expect(second).toEqual(first)
    expect(ordered).toEqual(snapshot)
    expect(ordered[0]).toBe(snapshot[0] === ordered[0] ? ordered[0] : ordered[0])
    expect(ordered.map((participant) => participant.id)).toEqual(snapshot.map((participant) => participant.id))
  })

  it("rejects a repeated participant", () => {
    const plan = planKnockoutBracket({
      stageType: "knockout",
      participants: [{ id: "p1" }, { id: "p1" }],
      existingMatchCount: 0,
    })
    expect(plan).toEqual({ ok: false, error: "A participant cannot appear twice in the same bracket." })
  })

  it("does not plan another bracket when matches already exist", () => {
    const plan = planKnockoutBracket({
      stageType: "knockout",
      participants: participants(4),
      existingMatchCount: 3,
    })
    expect(plan).toEqual({ ok: true, status: "exists" })
    const partial = planKnockoutBracket({
      stageType: "knockout",
      participants: participants(8),
      existingMatchCount: 1,
    })
    expect(partial).toEqual({ ok: true, status: "exists" })
  })
})

describe("projectBracket", () => {
  it("labels an unresolved slot as the winner of an earlier match", () => {
    const view = projectBracket([
      {
        id: "m1",
        round: 1,
        matchNumber: 10,
        status: "scheduled",
        slots: [
          { kind: "participant", name: "Alpha", shortName: "ALP", logoUrl: null, score: null },
          { kind: "participant", name: "Beta", shortName: "BET", logoUrl: null, score: 1 },
        ],
      },
      {
        id: "m2",
        round: 1,
        matchNumber: 11,
        status: "completed",
        slots: [
          { kind: "participant", name: "Gamma", shortName: "GAM", logoUrl: null, score: 2 },
          { kind: "participant", name: "Delta", shortName: "DEL", logoUrl: null, score: 0 },
        ],
      },
      {
        id: "m3",
        round: 2,
        matchNumber: 12,
        status: "scheduled",
        slots: [
          { kind: "winner", sourceMatchId: "m1" },
          { kind: "winner", sourceMatchId: "m2" },
        ],
      },
    ])
    expect(view.matchCount).toBe(3)
    expect(view.roundCount).toBe(2)
    expect(view.rounds.map((round) => round.label)).toEqual(["Round 1", "Final"])
    expect(view.rounds[1]?.matches[0]?.slots.map((slot) => slot.label)).toEqual([
      "Winner of Match 1",
      "Winner of Match 2",
    ])
    expect(view.rounds[1]?.matches[0]?.slots.every((slot) => slot.resolved === false)).toBe(true)
    expect(view.rounds[0]?.matches[0]?.number).toBe(1)
    expect(view.rounds[0]?.matches[0]?.slots[0]).toMatchObject({ label: "Alpha", resolved: true, score: null })
  })

  it("shows a resolved winner in place of the unresolved slot", () => {
    const view = projectBracket([
      {
        id: "m1",
        round: 1,
        matchNumber: 1,
        status: "completed",
        slots: [
          { kind: "participant", name: "North", shortName: "NOR", logoUrl: null, score: 2 },
          { kind: "participant", name: "South", shortName: "SOU", logoUrl: null, score: 1 },
        ],
      },
      {
        id: "m2",
        round: 1,
        matchNumber: 2,
        status: "scheduled",
        slots: [
          { kind: "participant", name: "East", shortName: "EAS", logoUrl: null, score: null },
          { kind: "participant", name: "West", shortName: "WES", logoUrl: null, score: null },
        ],
      },
      {
        id: "final",
        round: 2,
        matchNumber: 3,
        status: "scheduled",
        slots: [
          { kind: "winner", sourceMatchId: "m1", name: "North", shortName: "NOR", logoUrl: null, score: null },
          { kind: "winner", sourceMatchId: "m2" },
        ],
      },
    ])
    expect(view.rounds[1]?.matches[0]?.slots.map((slot) => slot.label)).toEqual(["North", "Winner of Match 2"])
    expect(view.rounds[1]?.matches[0]?.slots[0]?.resolved).toBe(true)
    expect(view.rounds[1]?.matches[0]?.slots[1]?.resolved).toBe(false)
  })
})

describe("knockout winner progression", () => {
  const teams = ["north", "south", "east", "west"]

  it("places the match 1 winner on final side 1", () => {
    const start = createLiveBracket(teams)
    const next = recordKnockoutResult(start, 0, [2, 1])
    expect(next.ok).toBe(true)
    if (!next.ok) return
    expect(next.matches[2]?.slots[0].entryId).toBe("north")
    expect(next.matches[2]?.slots[1].entryId).toBeNull()
    expect(start[2]?.slots[0].entryId).toBeNull()
  })

  it("places the match 2 winner on final side 2", () => {
    const next = recordKnockoutResult(createLiveBracket(teams), 1, [0, 1])
    expect(next.ok).toBe(true)
    if (!next.ok) return
    expect(next.matches[2]?.slots[1].entryId).toBe("west")
    expect(next.matches[2]?.slots[0].entryId).toBeNull()
  })

  it("fills the final once both semifinals have winners", () => {
    let matches = createLiveBracket(teams)
    const first = recordKnockoutResult(matches, 0, [2, 1])
    if (!first.ok) throw new Error(first.error)
    const second = recordKnockoutResult(first.matches, 1, [0, 1])
    if (!second.ok) throw new Error(second.error)
    matches = second.matches
    expect(matches[2]?.slots.map((slot) => slot.entryId)).toEqual(["north", "west"])
    const final = recordKnockoutResult(matches, 2, [2, 0])
    expect(final.ok).toBe(true)
    if (!final.ok) return
    expect(final.matches).toHaveLength(3)
    expect(final.matches[2]?.status).toBe("completed")
    expect(final.matches[2]?.scores).toEqual([2, 0])
  })

  it("rejects a knockout draw and still allows a group draw", () => {
    const knocked = recordKnockoutResult(createLiveBracket(teams), 0, [1, 1])
    expect(knocked).toEqual({ ok: false, error: KNOCKOUT_DRAW_ERROR })
    expect(
      planKnockoutResult({
        stageType: "group",
        scores: [1, 1],
        sides: [{ entryId: "a" }, { entryId: "b" }],
        downstream: null,
      }),
    ).toEqual({ ok: true, winnerEntryId: null, slotEntryId: null })
    expect(
      planKnockoutResult({
        stageType: "league",
        scores: [1, 1],
        sides: [{ entryId: "a" }, { entryId: "b" }],
        downstream: null,
      }).ok,
    ).toBe(true)
  })

  it("replaces the downstream winner when the upstream result changes", () => {
    const first = recordKnockoutResult(createLiveBracket(teams), 0, [2, 1])
    if (!first.ok) throw new Error(first.error)
    const other = recordKnockoutResult(createLiveBracket(teams), 1, [1, 0])
    if (!other.ok) throw new Error(other.error)
    const withEast = recordKnockoutResult(first.matches, 1, [1, 0])
    if (!withEast.ok) throw new Error(withEast.error)
    expect(withEast.matches[2]?.slots.map((slot) => slot.entryId)).toEqual(["north", "east"])
    const revised = recordKnockoutResult(withEast.matches, 0, [0, 2])
    expect(revised.ok).toBe(true)
    if (!revised.ok) return
    expect(revised.matches[2]?.slots.map((slot) => slot.entryId)).toEqual(["south", "east"])
    expect(other.matches[2]?.slots[0].entryId).toBeNull()
  })

  it("rejects an upstream winner change after the next match is completed", () => {
    let matches = createLiveBracket(teams)
    for (const [index, scores] of [
      [0, [2, 1]],
      [1, [0, 1]],
      [2, [2, 0]],
    ] as const) {
      const next = recordKnockoutResult(matches, index, scores)
      if (!next.ok) throw new Error(next.error)
      matches = next.matches
    }
    expect(recordKnockoutResult(matches, 0, [0, 2])).toEqual({ ok: false, error: KNOCKOUT_DOWNSTREAM_LOCKED_ERROR })
    expect(matches[2]?.slots[0].entryId).toBe("north")
  })

  it("does not propagate a winner from a cancelled match until it is restored", () => {
    const matches = createLiveBracket(teams)
    matches[0].status = "cancelled"
    expect(recordKnockoutResult(matches, 0, [2, 1]).ok).toBe(false)
    expect(matches[2]?.slots[0].entryId).toBeNull()
    matches[0].status = "scheduled"
    const next = recordKnockoutResult(matches, 0, [2, 1])
    expect(next.ok).toBe(true)
    if (!next.ok) return
    expect(next.matches[2]?.slots[0].entryId).toBe("north")
  })

  it("blocks the final until both earlier matches have winners", () => {
    const first = recordKnockoutResult(createLiveBracket(teams), 0, [2, 1])
    if (!first.ok) throw new Error(first.error)
    expect(recordKnockoutResult(first.matches, 2, [1, 0])).toEqual({
      ok: false,
      error: "This match is waiting for earlier results and cannot be changed yet.",
    })
  })

  it("is idempotent when the same result is recorded again", () => {
    const first = recordKnockoutResult(createLiveBracket(teams), 0, [2, 1])
    if (!first.ok) throw new Error(first.error)
    const second = recordKnockoutResult(first.matches, 0, [3, 1])
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.matches).toHaveLength(first.matches.length)
    expect(second.matches[2]?.slots[0].entryId).toBe("north")
    expect(second.matches[2]?.slots[0]).toBe(second.matches[2]?.slots[0])
    expect(second.matches.map((match) => match.slots.map((slot) => slot.entryId))).toEqual(
      first.matches.map((match) => match.slots.map((slot) => slot.entryId)),
    )
  })

  it("carries a quarterfinal winner into the correct semifinal and final slots", () => {
    const ids = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"]
    let matches = createLiveBracket(ids)
    expect(matches).toHaveLength(7)
    const quarters: [number, [number, number], string][] = [
      [0, [1, 0], "p1"],
      [1, [0, 1], "p4"],
      [2, [2, 0], "p5"],
      [3, [0, 3], "p8"],
    ]
    for (const [index, scores, winner] of quarters) {
      const next = recordKnockoutResult(matches, index, scores)
      if (!next.ok) throw new Error(next.error)
      matches = next.matches
      const semi = index < 2 ? 4 : 5
      const side = index % 2
      expect(matches[semi]?.slots[side].entryId).toBe(winner)
    }
    const semiOne = recordKnockoutResult(matches, 4, [2, 1])
    if (!semiOne.ok) throw new Error(semiOne.error)
    const semiTwo = recordKnockoutResult(semiOne.matches, 5, [1, 2])
    if (!semiTwo.ok) throw new Error(semiTwo.error)
    expect(semiTwo.matches[6]?.slots.map((slot) => slot.entryId)).toEqual(["p1", "p8"])
  })
})
