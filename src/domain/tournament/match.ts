import type { TournamentRole, TournamentStatus } from "./access"
import { acceptsGroups, canManageStages, type StageType } from "./stage"

export const MATCH_STATUSES = ["scheduled", "cancelled", "completed"] as const
export type MatchStatus = (typeof MATCH_STATUSES)[number]

export function canManageMatches(input: {
  role: TournamentRole | null
  status: TournamentStatus
  deleted: boolean
}): boolean {
  return canManageStages(input)
}

export interface MatchSide {
  entryId: string
  stageId: string
  tournamentId: string
  stageGroupId: string | null
}

export function planMatch(input: {
  stageFound: boolean
  stageId: string
  stageType: StageType | null
  stageTournamentId: string
  stageGroupId: string | null
  first: MatchSide | null
  second: MatchSide | null
}): { ok: true; stageGroupId: string | null } | { ok: false; error: string } {
  if (!input.stageFound || !input.stageType) return { ok: false, error: "Stage not found." }
  if (!input.first || !input.second) return { ok: false, error: "Choose two participants." }
  if (
    input.first.tournamentId !== input.stageTournamentId ||
    input.second.tournamentId !== input.stageTournamentId
  ) {
    return { ok: false, error: "Participants must belong to this tournament." }
  }
  if (input.first.stageId !== input.stageId || input.second.stageId !== input.stageId) {
    return { ok: false, error: "Participants must belong to the same stage." }
  }
  if (input.first.entryId === input.second.entryId) {
    return { ok: false, error: "Choose two different participants." }
  }
  if (acceptsGroups(input.stageType)) {
    if (!input.stageGroupId) return { ok: false, error: "Choose the group for this match." }
    if (input.first.stageGroupId !== input.stageGroupId || input.second.stageGroupId !== input.stageGroupId) {
      return { ok: false, error: "Both participants must be in the selected group." }
    }
    return { ok: true, stageGroupId: input.stageGroupId }
  }
  if (input.stageGroupId) return { ok: false, error: "A knockout match does not belong to a group." }
  return { ok: true, stageGroupId: null }
}

export function isRematchDuplicate(
  existing: { stageId: string; round: number; entryIds: [string, string] }[],
  candidate: { stageId: string; round: number; entryIds: [string, string] },
): boolean {
  const key = pairKey(candidate.entryIds)
  return existing.some(
    (match) => match.stageId === candidate.stageId && match.round === candidate.round && pairKey(match.entryIds) === key,
  )
}

function pairKey(entryIds: [string, string]): string {
  return [...entryIds].sort().join(":")
}

export function parseSchedule(input: { date: unknown; time: unknown }): { ok: true; value: string | null } | { ok: false; error: string } {
  const date = typeof input.date === "string" ? input.date.trim() : ""
  const time = typeof input.time === "string" ? input.time.trim() : ""
  if (!date && !time) return { ok: true, value: null }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return { ok: false, error: "Enter a valid date and time, or leave both empty." }
  }
  const [year, month, day] = date.split("-").map(Number)
  const [hours, minutes] = time.split(":").map(Number)
  if (hours > 23 || minutes > 59) return { ok: false, error: "Enter a valid date and time, or leave both empty." }
  const parsed = new Date(year, month - 1, day, hours, minutes, 0, 0)
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day ||
    year < 1900
  ) {
    return { ok: false, error: "Enter a valid date and time, or leave both empty." }
  }
  return { ok: true, value: parsed.toISOString() }
}

export function sameTeamScheduleConflict(
  existing: { id: string; startsAt: string | null; status: MatchStatus; entryIds: readonly string[] }[],
  candidate: { id: string; startsAt: string; entryIds: readonly string[] },
): boolean {
  const when = new Date(candidate.startsAt).getTime()
  if (Number.isNaN(when)) return false
  const ids = new Set(candidate.entryIds)
  return existing.some((match) => {
    if (match.id === candidate.id || match.status === "cancelled" || !match.startsAt) return false
    if (new Date(match.startsAt).getTime() !== when) return false
    return match.entryIds.some((entryId) => ids.has(entryId))
  })
}

export function parseScore(value: unknown): { ok: true; value: number } | { ok: false; error: string } {
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 0) return { ok: false, error: "Scores must be whole numbers of zero or more." }
    return { ok: true, value }
  }
  if (typeof value !== "string" || value.trim() === "") {
    return { ok: false, error: "Enter both scores." }
  }
  if (!/^\d+$/.test(value.trim())) return { ok: false, error: "Scores must be whole numbers of zero or more." }
  return { ok: true, value: Number(value.trim()) }
}

export function planStatusChange(input: {
  from: MatchStatus
  to: MatchStatus
  scores: [number | null, number | null]
}): { ok: true } | { ok: false; error: string } {
  const scoresReady = input.scores.every((score) => score !== null && Number.isInteger(score) && score >= 0)
  if (input.from === "completed" && input.to === "completed") {
    if (!scoresReady) return { ok: false, error: "Enter both scores." }
    return { ok: true }
  }
  if (input.from === "scheduled" && input.to === "completed") {
    if (!scoresReady) return { ok: false, error: "A match needs both scores before it can be completed." }
    return { ok: true }
  }
  if (input.from === "scheduled" && input.to === "cancelled") return { ok: true }
  if (input.from === "cancelled" && input.to === "scheduled") return { ok: true }
  if (input.from === "cancelled" && input.to === "completed") {
    return { ok: false, error: "Restore this match before completing it." }
  }
  if (input.from === "completed" && input.to !== "completed") {
    return { ok: false, error: "Clearing a completed result is not allowed." }
  }
  return { ok: false, error: "That status change is not allowed." }
}

export function matchDeleteError(status: MatchStatus, referenced: boolean): string | null {
  if (referenced) return "This match is already used and cannot be removed."
  if (status === "completed") return "Reset is not available. A completed result cannot be deleted."
  return null
}
