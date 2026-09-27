"use server"

import { refresh } from "next/cache"
import { redirect } from "next/navigation"
import { planKnockoutBracket } from "@/src/domain/tournament/bracket"
import { COMPLETED_TOURNAMENT_ERROR, completedMutationError } from "@/src/domain/tournament/champion"
import { planRoundRobinFixtures } from "@/src/domain/tournament/fixtures"
import {
  canManageMatches,
  isRematchDuplicate,
  matchDeleteError,
  parseSchedule,
  sameTeamScheduleConflict,
  parseScore,
  planMatch,
  planStatusChange,
} from "@/src/domain/tournament/match"
import { normalizePublicId } from "@/src/domain/tournament/public-id"
import { requireUser, requireUserId } from "@/src/server/auth/session"
import {
  completeMatch,
  countStageMatches,
  deleteMatch,
  findMatch,
  insertGeneratedMatches,
  insertKnockoutBracket,
  insertMatch,
  listMatches,
  matchIsReferenced,
  MatchConstraintError,
  setMatchStatus,
  updateMatchSchedule,
} from "@/src/server/matches/repository"
import { findStageEntry, listStageEntries } from "@/src/server/stage-entries/repository"
import { findStage } from "@/src/server/stages/repository"
import { findTournament, findTournamentGate } from "@/src/server/tournaments/repository"

function matchesPath(publicId: string, error?: string): string {
  return error ? `/t/${publicId}/manage/matches?error=${error}` : `/t/${publicId}/manage/matches`
}

function stagesPath(publicId: string, error?: string): string {
  return error ? `/t/${publicId}/manage/stages?error=${error}` : `/t/${publicId}/manage/stages`
}

function go(path: string): never {
  refresh()
  redirect(path)
}

function bracketErrorCode(error: string): string {
  if (error.includes("twice")) return "bracket-duplicate"
  if (error.includes("knockout stage")) return "bracket-type"
  return "bracket-count"
}

function resultErrorCode(message: string): string {
  if (message.includes("draw")) return "knockout-draw"
  if (message.includes("later match")) return "downstream"
  if (message.includes("waiting")) return "waiting"
  if (message.includes("final result")) return "final"
  if (message === COMPLETED_TOURNAMENT_ERROR) return "completed"
  return "result"
}

async function authorize(publicId: string, userId: string, purpose: "setup" | "result" = "setup") {
  const tournament = await findTournament(publicId)
  if (!tournament || tournament.deletedAt) return { error: "Tournament not found." as const }
  const role = tournament.ownerId === userId ? "owner" as const : null
  if (!canManageMatches({ role, status: tournament.status, deleted: tournament.deletedAt !== null })) {
    return { error: "You cannot change matches in this tournament." as const }
  }
  if (purpose === "setup") {
    const locked = completedMutationError(tournament.status)
    if (locked) return { error: locked }
  }
  return { tournament }
}

function parseRound(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "1").trim()
  if (!/^\d+$/.test(raw)) return null
  const round = Number(raw)
  return round >= 1 && round <= 32767 ? round : null
}

function parseStartsAt(value: FormDataEntryValue | null): string | null {
  const raw = String(value ?? "").trim()
  if (!raw) return null
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

function sideFrom(entry: { id: string; stageId: string; tournamentId: string; stageGroupId: string | null } | null) {
  if (!entry) return null
  return {
    entryId: entry.id,
    stageId: entry.stageId,
    tournamentId: entry.tournamentId,
    stageGroupId: entry.stageGroupId,
  }
}

export async function generateFixturesAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const publicId = normalizePublicId(String(formData.get("publicId") ?? ""))
  const stageId = String(formData.get("stageId") ?? "")
  if (!publicId) redirect("/dashboard")
  const allowed = await authorize(publicId, user.id)
  if ("error" in allowed || !stageId) {
    redirect(publicId ? matchesPath(publicId, "error" in allowed && allowed.error === COMPLETED_TOURNAMENT_ERROR ? "completed" : undefined) : "/dashboard")
  }
  const stage = await findStage(allowed.tournament.id, stageId)
  if (!stage || stage.tournamentId !== allowed.tournament.id) redirect(matchesPath(publicId, "fixtures"))
  const [entries, matches] = await Promise.all([
    listStageEntries(allowed.tournament.id),
    listMatches(allowed.tournament.id),
  ])
  const plan = planRoundRobinFixtures({
    stageType: stage.stageType,
    groups: stage.groups.map((group) => ({ id: group.id, name: group.name })),
    entries: entries
      .filter((entry) => entry.stageId === stage.id)
      .map((entry) => ({ id: entry.id, stageGroupId: entry.stageGroupId })),
    existing: matches
      .filter((match) => match.stageId === stage.id)
      .map((match) => ({
        stageGroupId: match.stageGroupId,
        entryIds: [match.participants[0]?.entryId ?? "", match.participants[1]?.entryId ?? ""] as [string, string],
      }))
      .filter((match) => match.entryIds[0] && match.entryIds[1]),
  })
  if (!plan.ok) redirect(matchesPath(publicId, plan.error.includes("knockout") ? "knockout" : "fixtures"))
  if (plan.fixtures.length === 0) redirect(matchesPath(publicId, "complete"))
  await insertGeneratedMatches({
    tournamentId: allowed.tournament.id,
    stageId: stage.id,
    stageType: stage.stageType,
    actorId: user.id,
    fixtures: plan.fixtures,
  })
  redirect(`${matchesPath(publicId)}?created=${plan.fixtures.length}`)
}

export async function generateKnockoutBracketAction(formData: FormData): Promise<void> {
  const publicId = normalizePublicId(String(formData.get("publicId") ?? ""))
  const stageId = String(formData.get("stageId") ?? "")
  if (!publicId) redirect("/dashboard")
  const [userId, tournament] = await Promise.all([requireUserId(), findTournamentGate(publicId)])
  if (!tournament || tournament.deletedAt) go(stagesPath(publicId))
  const role = tournament.ownerId === userId ? ("owner" as const) : null
  if (!canManageMatches({ role, status: tournament.status, deleted: tournament.deletedAt !== null }) || !stageId) {
    go(stagesPath(publicId))
  }
  if (completedMutationError(tournament.status)) go(stagesPath(publicId, "completed"))
  const stage = await findStage(tournament.id, stageId)
  if (!stage || stage.tournamentId !== tournament.id) go(stagesPath(publicId, "bracket-type"))
  const [entries, existingMatchCount] = await Promise.all([
    listStageEntries(tournament.id),
    countStageMatches(tournament.id, stage.id),
  ])
  const participants = entries
    .filter((entry) => entry.stageId === stage.id)
    .sort((left, right) => left.slot - right.slot || left.id.localeCompare(right.id))
    .map((entry) => ({ id: entry.id }))
  const plan = planKnockoutBracket({
    stageType: stage.stageType,
    participants,
    existingMatchCount,
  })
  if (!plan.ok) go(stagesPath(publicId, bracketErrorCode(plan.error)))
  if (plan.status === "exists") go(stagesPath(publicId, "bracket-exists"))
  try {
    const result = await insertKnockoutBracket({
      tournamentId: tournament.id,
      stageId: stage.id,
      actorId: userId,
      participantCount: plan.bracket.participantCount,
      roundCount: plan.bracket.roundCount,
      matches: plan.bracket.matches,
    })
    if (result.status === "exists") go(stagesPath(publicId, "bracket-exists"))
    go(`${stagesPath(publicId)}?rounds=${result.roundCount}&matches=${result.created}`)
  } catch (error) {
    if (error instanceof MatchConstraintError) go(stagesPath(publicId, "bracket-count"))
    throw error
  }
}

export async function createMatchAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const publicId = normalizePublicId(String(formData.get("publicId") ?? ""))
  if (!publicId) redirect("/dashboard")
  const allowed = await authorize(publicId, user.id)
  const stageId = String(formData.get("stageId") ?? "")
  const stageGroupId = String(formData.get("stageGroupId") ?? "") || null
  const round = parseRound(formData.get("round"))
  if ("error" in allowed || !stageId || round === null) {
    redirect(publicId ? matchesPath(publicId, "error" in allowed && allowed.error === COMPLETED_TOURNAMENT_ERROR ? "completed" : "create") : "/dashboard")
  }
  const stage = await findStage(allowed.tournament.id, stageId)
  const first = await findStageEntry(allowed.tournament.id, String(formData.get("entry1") ?? ""))
  const second = await findStageEntry(allowed.tournament.id, String(formData.get("entry2") ?? ""))
  const plan = planMatch({
    stageFound: stage !== null,
    stageId,
    stageType: stage?.stageType ?? null,
    stageTournamentId: allowed.tournament.id,
    stageGroupId,
    first: sideFrom(first),
    second: sideFrom(second),
  })
  if (!plan.ok || !first || !second) redirect(matchesPath(publicId, "create"))
  const existing = (await listMatches(allowed.tournament.id)).map((match) => ({
    stageId: match.stageId,
    round: match.round,
    entryIds: match.participants.map((participant) => participant.entryId) as [string, string],
  }))
  if (isRematchDuplicate(existing, { stageId, round, entryIds: [first.id, second.id] })) {
    redirect(matchesPath(publicId, "duplicate"))
  }
  try {
    await insertMatch({
      tournamentId: allowed.tournament.id,
      stageId,
      stageGroupId: plan.stageGroupId,
      round,
      startsAt: parseStartsAt(formData.get("startsAt")),
      entryIds: [first.id, second.id],
      actorId: user.id,
    })
  } catch (error) {
    if (error instanceof MatchConstraintError) redirect(matchesPath(publicId, "create"))
    throw error
  }
  redirect(matchesPath(publicId))
}

export async function saveResultAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const publicId = normalizePublicId(String(formData.get("publicId") ?? ""))
  const matchId = String(formData.get("matchId") ?? "")
  if (!publicId) redirect("/dashboard")
  const allowed = await authorize(publicId, user.id, "result")
  if ("error" in allowed || !matchId) {
    redirect(publicId ? matchesPath(publicId, "error" in allowed && allowed.error === COMPLETED_TOURNAMENT_ERROR ? "completed" : undefined) : "/dashboard")
  }
  const match = await findMatch(allowed.tournament.id, matchId)
  const home = parseScore(formData.get("score1"))
  const away = parseScore(formData.get("score2"))
  if (match && match.participants.length !== 2) redirect(matchesPath(publicId, "waiting"))
  if (!match || !home.ok || !away.ok) redirect(matchesPath(publicId, "result"))
  const change = planStatusChange({
    from: match.status,
    to: "completed",
    scores: [home.value, away.value],
  })
  if (!change.ok) redirect(matchesPath(publicId, "result"))
  try {
    await completeMatch({
      tournamentId: allowed.tournament.id,
      matchId,
      actorId: user.id,
      stageId: match.stageId,
      entryIds: [match.participants[0].entryId, match.participants[1].entryId],
      scores: [home.value, away.value],
      previousStatus: match.status,
    })
  } catch (error) {
    if (error instanceof MatchConstraintError) redirect(matchesPath(publicId, resultErrorCode(error.message)))
    throw error
  }
  redirect(matchesPath(publicId))
}

export async function cancelMatchAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const publicId = normalizePublicId(String(formData.get("publicId") ?? ""))
  const matchId = String(formData.get("matchId") ?? "")
  if (!publicId) redirect("/dashboard")
  const allowed = await authorize(publicId, user.id)
  if ("error" in allowed || !matchId) {
    redirect(publicId ? matchesPath(publicId, "error" in allowed && allowed.error === COMPLETED_TOURNAMENT_ERROR ? "completed" : undefined) : "/dashboard")
  }
  const match = await findMatch(allowed.tournament.id, matchId)
  if (!match) redirect(matchesPath(publicId))
  if (match.participants.length !== 2) redirect(matchesPath(publicId, "waiting"))
  const change = planStatusChange({ from: match.status, to: "cancelled", scores: [null, null] })
  if (!change.ok) redirect(matchesPath(publicId, "status"))
  await setMatchStatus({
    tournamentId: allowed.tournament.id,
    matchId,
    actorId: user.id,
    stageId: match.stageId,
    entryIds: [match.participants[0].entryId, match.participants[1].entryId],
    status: "cancelled",
    action: "match.cancelled",
  })
  redirect(matchesPath(publicId))
}

export async function restoreMatchAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const publicId = normalizePublicId(String(formData.get("publicId") ?? ""))
  const matchId = String(formData.get("matchId") ?? "")
  if (!publicId) redirect("/dashboard")
  const allowed = await authorize(publicId, user.id)
  if ("error" in allowed || !matchId) {
    redirect(publicId ? matchesPath(publicId, "error" in allowed && allowed.error === COMPLETED_TOURNAMENT_ERROR ? "completed" : undefined) : "/dashboard")
  }
  const match = await findMatch(allowed.tournament.id, matchId)
  if (!match) redirect(matchesPath(publicId))
  if (match.participants.length !== 2) redirect(matchesPath(publicId, "waiting"))
  const change = planStatusChange({ from: match.status, to: "scheduled", scores: [null, null] })
  if (!change.ok) redirect(matchesPath(publicId, "status"))
  await setMatchStatus({
    tournamentId: allowed.tournament.id,
    matchId,
    actorId: user.id,
    stageId: match.stageId,
    entryIds: [match.participants[0].entryId, match.participants[1].entryId],
    status: "scheduled",
    action: "match.restored",
  })
  redirect(matchesPath(publicId))
}

export async function deleteMatchAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const publicId = normalizePublicId(String(formData.get("publicId") ?? ""))
  const matchId = String(formData.get("matchId") ?? "")
  if (!publicId) redirect("/dashboard")
  const allowed = await authorize(publicId, user.id)
  if ("error" in allowed || !matchId) {
    redirect(publicId ? matchesPath(publicId, "error" in allowed && allowed.error === COMPLETED_TOURNAMENT_ERROR ? "completed" : undefined) : "/dashboard")
  }
  const match = await findMatch(allowed.tournament.id, matchId)
  if (!match) redirect(matchesPath(publicId))
  if (match.participants.length !== 2) redirect(matchesPath(publicId, "waiting"))
  const referenced = await matchIsReferenced(allowed.tournament.id, matchId)
  if (matchDeleteError(match.status, referenced)) redirect(matchesPath(publicId, "delete"))
  await deleteMatch({
    tournamentId: allowed.tournament.id,
    matchId,
    actorId: user.id,
    stageId: match.stageId,
    entryIds: [match.participants[0]?.entryId ?? "", match.participants[1]?.entryId ?? ""],
  })
  redirect(matchesPath(publicId))
}

export async function updateMatchAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const publicId = normalizePublicId(String(formData.get("publicId") ?? ""))
  const matchId = String(formData.get("matchId") ?? "")
  const round = parseRound(formData.get("round"))
  if (!publicId) redirect("/dashboard")
  const allowed = await authorize(publicId, user.id)
  if ("error" in allowed || !matchId || round === null) {
    redirect(publicId ? matchesPath(publicId, "error" in allowed && allowed.error === COMPLETED_TOURNAMENT_ERROR ? "completed" : "schedule") : "/dashboard")
  }
  const schedule = formData.has("date") || formData.has("time")
    ? parseSchedule({ date: formData.get("date"), time: formData.get("time") })
    : { ok: true as const, value: parseStartsAt(formData.get("startsAt")) }
  if (!schedule.ok) redirect(matchesPath(publicId, "schedule"))
  const match = await findMatch(allowed.tournament.id, matchId)
  if (match && match.participants.length !== 2) redirect(matchesPath(publicId, "waiting"))
  if (!match || match.status !== "scheduled") redirect(matchesPath(publicId, "schedule"))
  const entryIds: [string, string] = [match.participants[0].entryId, match.participants[1].entryId]
  const existing = await listMatches(allowed.tournament.id)
  if (
    isRematchDuplicate(
      existing
        .filter((item) => item.id !== matchId)
        .map((item) => ({
          stageId: item.stageId,
          round: item.round,
          entryIds: item.participants.map((participant) => participant.entryId) as [string, string],
        })),
      { stageId: match.stageId, round, entryIds },
    )
  ) {
    redirect(matchesPath(publicId, "duplicate"))
  }
  if (
    schedule.value &&
    sameTeamScheduleConflict(
      existing.map((item) => ({
        id: item.id,
        startsAt: item.startsAt,
        status: item.status,
        entryIds: item.participants.map((participant) => participant.entryId),
      })),
      { id: matchId, startsAt: schedule.value, entryIds },
    )
  ) {
    redirect(matchesPath(publicId, "conflict"))
  }
  await updateMatchSchedule({
    tournamentId: allowed.tournament.id,
    matchId,
    actorId: user.id,
    stageId: match.stageId,
    round,
    startsAt: schedule.value,
    entryIds,
  })
  redirect(matchesPath(publicId))
}
