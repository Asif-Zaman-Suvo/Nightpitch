import { describe, expect, it } from "vitest"
import { planKnockoutResult } from "./bracket"
import {
  applyFinalCompletion,
  COMPLETED_TOURNAMENT_ERROR,
  FINAL_RESULT_LOCKED_ERROR,
  isTournamentFinal,
  planTournamentCompletion,
  resolveChampion,
  type ChampionSide,
  type CompletionState,
} from "./champion"
import { canDiscover, canOpenWithoutLogin } from "./search"

const north: ChampionSide = {
  entryId: "north-entry",
  teamId: "north-team",
  name: "North",
  shortName: "NOR",
  logoUrl: null,
  score: 2,
}
const west: ChampionSide = {
  entryId: "west-entry",
  teamId: "west-team",
  name: "West",
  shortName: "WES",
  logoUrl: "https://cdn.example/west.png",
  score: 0,
}

const finalShape = {
  stageType: "knockout" as const,
  stagePosition: 2,
  latestKnockoutStagePosition: 2,
  round: 2,
  highestRound: 2,
  matchesInRound: 1,
  hasDownstream: false,
}

function openState(): CompletionState {
  return { tournamentStatus: "published", matchStatus: "scheduled", scores: null, audits: [] }
}

describe("isTournamentFinal", () => {
  it("recognizes the last knockout match with no downstream slot", () => {
    expect(isTournamentFinal(finalShape)).toBe(true)
  })

  it("does not treat an earlier knockout match or a group match as the final", () => {
    expect(isTournamentFinal({ ...finalShape, round: 1, highestRound: 2, hasDownstream: true })).toBe(false)
    expect(isTournamentFinal({ ...finalShape, stageType: "group", latestKnockoutStagePosition: null })).toBe(false)
    expect(isTournamentFinal({ ...finalShape, stageType: "league" })).toBe(false)
    expect(isTournamentFinal({ ...finalShape, stagePosition: 1, latestKnockoutStagePosition: 2 })).toBe(false)
    expect(isTournamentFinal({ ...finalShape, matchesInRound: 2 })).toBe(false)
  })
})

describe("tournament champion", () => {
  const final = {
    matchId: "final",
    stageId: "knockout",
    status: "completed" as const,
    sides: [north, west] as const,
  }

  it("names North when North wins the completed final", () => {
    expect(resolveChampion({ tournamentStatus: "completed", final })).toMatchObject({
      name: "North",
      teamId: "north-team",
      stageEntryId: "north-entry",
      finalMatchId: "final",
    })
  })

  it("names West when West wins the completed final", () => {
    const awayWins = {
      ...final,
      sides: [{ ...north, score: 0 }, { ...west, score: 1 }] as const,
    }
    expect(resolveChampion({ tournamentStatus: "completed", final: awayWins })?.name).toBe("West")
  })

  it("returns null until the tournament is completed and the final has a winner", () => {
    expect(resolveChampion({ tournamentStatus: "published", final })).toBeNull()
    expect(resolveChampion({ tournamentStatus: "draft", final })).toBeNull()
    expect(resolveChampion({ tournamentStatus: "completed", final: null })).toBeNull()
    expect(resolveChampion({ tournamentStatus: "completed", final: { ...final, status: "scheduled" } })).toBeNull()
    expect(
      resolveChampion({
        tournamentStatus: "completed",
        final: { ...final, sides: [{ ...north, score: 2 }, { ...west, score: 2 }] },
      }),
    ).toBeNull()
  })
})

describe("planTournamentCompletion", () => {
  const winner = { teamId: "north-team", entryId: "north-entry" }

  it("completes the tournament only for a decisive final", () => {
    expect(planTournamentCompletion({ tournamentStatus: "published", isFinal: true, winner })).toEqual({
      ok: true,
      complete: true,
      championTeamId: "north-team",
      championStageEntryId: "north-entry",
    })
    expect(planTournamentCompletion({ tournamentStatus: "draft", isFinal: true, winner }).ok).toBe(true)
  })

  it("does not complete the tournament for a non-final or a group result", () => {
    expect(planTournamentCompletion({ tournamentStatus: "published", isFinal: false, winner })).toEqual({
      ok: true,
      complete: false,
    })
    expect(planTournamentCompletion({ tournamentStatus: "published", isFinal: true, winner: null })).toEqual({
      ok: true,
      complete: false,
    })
  })

  it("rejects a final edit after the tournament is completed and leaves a draw rejected first", () => {
    expect(planTournamentCompletion({ tournamentStatus: "completed", isFinal: true, winner })).toEqual({
      ok: false,
      error: FINAL_RESULT_LOCKED_ERROR,
    })
    expect(planTournamentCompletion({ tournamentStatus: "completed", isFinal: false, winner })).toEqual({
      ok: false,
      error: COMPLETED_TOURNAMENT_ERROR,
    })
    const draw = planKnockoutResult({
      stageType: "knockout",
      scores: [2, 2],
      sides: [{ entryId: "north-entry" }, { entryId: "west-entry" }],
      downstream: null,
    })
    expect(draw.ok).toBe(false)
  })
})

describe("applyFinalCompletion", () => {
  it("completes the final, marks the tournament, and audits once", () => {
    const first = applyFinalCompletion(openState(), {
      isFinal: true,
      scores: [2, 0],
      winner: { teamId: "north-team", entryId: "north-entry" },
    })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.state.tournamentStatus).toBe("completed")
    expect(first.state.matchStatus).toBe("completed")
    expect(first.state.scores).toEqual([2, 0])
    expect(first.state.audits).toEqual(["match.completed", "tournament.completed"])
    const again = applyFinalCompletion(first.state, {
      isFinal: true,
      scores: [0, 1],
      winner: { teamId: "west-team", entryId: "west-entry" },
    })
    expect(again).toMatchObject({ ok: false, error: FINAL_RESULT_LOCKED_ERROR, state: first.state })
  })

  it("does not complete the tournament when a semi-final finishes", () => {
    const next = applyFinalCompletion(openState(), {
      isFinal: false,
      scores: [2, 1],
      winner: { teamId: "north-team", entryId: "north-entry" },
    })
    expect(next.ok).toBe(true)
    if (!next.ok) return
    expect(next.state.tournamentStatus).toBe("published")
    expect(next.state.audits).toEqual(["match.completed"])
  })

  it("rolls back the final result when tournament completion fails", () => {
    const start = openState()
    const failed = applyFinalCompletion(start, {
      isFinal: true,
      scores: [2, 0],
      winner: { teamId: "north-team", entryId: "north-entry" },
      failAt: "tournament",
    })
    expect(failed.ok).toBe(false)
    expect(failed.state).toEqual(start)
    expect(failed.state.audits).toEqual([])
  })
})

describe("completed tournament discovery", () => {
  it("keeps a completed public tournament searchable and open", () => {
    const tournament = { status: "completed" as const, visibility: "public" as const, deleted: false }
    expect(canDiscover(tournament)).toBe(true)
    expect(canOpenWithoutLogin(tournament)).toBe(true)
  })

  it("keeps a completed unlisted tournament open by id and out of name search", () => {
    const tournament = { status: "completed" as const, visibility: "unlisted" as const, deleted: false }
    expect(canDiscover(tournament)).toBe(false)
    expect(canOpenWithoutLogin(tournament)).toBe(true)
  })
})
