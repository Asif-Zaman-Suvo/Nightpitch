import { describe, expect, it } from "vitest"
import { planKnockoutBracket, projectBracket, roundLabel } from "./bracket"

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
})
