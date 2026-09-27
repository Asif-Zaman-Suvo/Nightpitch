import type { TournamentStatus } from "./access"
import type { MatchStatus } from "./match"
import type { StageType } from "./stage"

export const FINAL_RESULT_LOCKED_ERROR = "A completed tournament cannot have its final result changed."
export const COMPLETED_TOURNAMENT_ERROR = "A completed tournament cannot be changed."

export function completedMutationError(status: TournamentStatus): string | null {
  return status === "completed" ? COMPLETED_TOURNAMENT_ERROR : null
}

export function isTournamentFinal(input: {
  stageType: StageType
  stagePosition: number
  latestKnockoutStagePosition: number | null
  round: number
  highestRound: number
  matchesInRound: number
  hasDownstream: boolean
}): boolean {
  return (
    input.stageType === "knockout" &&
    input.latestKnockoutStagePosition !== null &&
    input.stagePosition === input.latestKnockoutStagePosition &&
    input.round === input.highestRound &&
    input.matchesInRound === 1 &&
    !input.hasDownstream
  )
}

export function planTournamentCompletion(input: {
  tournamentStatus: TournamentStatus
  isFinal: boolean
  winner: { teamId: string; entryId: string } | null
}):
  | { ok: true; complete: false }
  | { ok: true; complete: true; championTeamId: string; championStageEntryId: string }
  | { ok: false; error: string } {
  if (input.tournamentStatus === "completed") {
    return { ok: false, error: input.isFinal ? FINAL_RESULT_LOCKED_ERROR : COMPLETED_TOURNAMENT_ERROR }
  }
  if (input.tournamentStatus === "archived") return { ok: false, error: "That status change is not allowed." }
  if (!input.isFinal || !input.winner) return { ok: true, complete: false }
  return {
    ok: true,
    complete: true,
    championTeamId: input.winner.teamId,
    championStageEntryId: input.winner.entryId,
  }
}

export interface ChampionSide {
  entryId: string
  teamId: string
  name: string
  shortName: string | null
  logoUrl: string | null
  score: number
}

export interface TournamentChampion {
  teamId: string
  stageEntryId: string
  name: string
  shortName: string | null
  logoUrl: string | null
  finalMatchId: string
  finalStageId: string
}

export function resolveChampion(input: {
  tournamentStatus: TournamentStatus
  final: {
    matchId: string
    stageId: string
    status: MatchStatus
    sides: readonly [ChampionSide, ChampionSide]
  } | null
}): TournamentChampion | null {
  if (input.tournamentStatus !== "completed" || !input.final || input.final.status !== "completed") return null
  const [home, away] = input.final.sides
  if (home.score === away.score) return null
  const winner = home.score > away.score ? home : away
  return {
    teamId: winner.teamId,
    stageEntryId: winner.entryId,
    name: winner.name,
    shortName: winner.shortName,
    logoUrl: winner.logoUrl,
    finalMatchId: input.final.matchId,
    finalStageId: input.final.stageId,
  }
}

export interface CompletionState {
  tournamentStatus: TournamentStatus
  matchStatus: MatchStatus
  scores: [number, number] | null
  audits: string[]
}

export function applyFinalCompletion(
  state: CompletionState,
  input: {
    isFinal: boolean
    scores: [number, number]
    winner: { teamId: string; entryId: string } | null
    failAt?: "tournament"
  },
): { ok: true; state: CompletionState } | { ok: false; error: string; state: CompletionState } {
  const plan = planTournamentCompletion({
    tournamentStatus: state.tournamentStatus,
    isFinal: input.isFinal,
    winner: input.winner,
  })
  if (!plan.ok) return { ok: false, error: plan.error, state }
  if (plan.complete && input.failAt === "tournament") {
    return { ok: false, error: "The tournament could not be completed.", state }
  }
  const audits = [
    ...state.audits,
    state.matchStatus === "completed" ? "match.result_updated" : "match.completed",
  ]
  if (plan.complete) audits.push("tournament.completed")
  return {
    ok: true,
    state: {
      tournamentStatus: plan.complete ? "completed" : state.tournamentStatus,
      matchStatus: "completed",
      scores: input.scores,
      audits,
    },
  }
}
