"use server"

import { refresh } from "next/cache"
import { redirect } from "next/navigation"
import { completedMutationError } from "@/src/domain/tournament/champion"
import { canManageTeams, parseTeamInput } from "@/src/domain/tournament/team"
import { normalizePublicId } from "@/src/domain/tournament/public-id"
import { requireUserId } from "@/src/server/auth/session"
import { TeamConstraintError, deleteTeam, insertTeam, updateTeam } from "@/src/server/teams/repository"
import { findTournamentGate, type TournamentGate } from "@/src/server/tournaments/repository"

export interface TeamFormState {
  error?: string
}

function managePath(publicId: string): string {
  return `/t/${publicId}/manage/teams`
}

function go(path: string): never {
  refresh()
  redirect(path)
}

function authorize(tournament: TournamentGate | null, userId: string) {
  if (!tournament || tournament.deletedAt) return { error: "Tournament not found." as const }
  const role = tournament.ownerId === userId ? "owner" as const : null
  if (
    !canManageTeams({
      role,
      status: tournament.status,
      deleted: tournament.deletedAt !== null,
    })
  ) {
    return { error: "You cannot change teams in this tournament." as const }
  }
  const locked = completedMutationError(tournament.status)
  if (locked) return { error: locked }
  return { tournament, userId }
}

async function loadGate(publicId: string) {
  const [userId, tournament] = await Promise.all([
    requireUserId(),
    findTournamentGate(publicId),
  ])
  return authorize(tournament, userId)
}

export async function createTeamAction(
  _state: TeamFormState,
  formData: FormData,
): Promise<TeamFormState> {
  const publicId = normalizePublicId(String(formData.get("publicId") ?? ""))
  if (!publicId) return { error: "Unknown tournament." }
  const parsed = parseTeamInput({
    name: formData.get("name"),
    shortName: formData.get("shortName"),
    logoUrl: formData.get("logoUrl"),
  })
  if (!parsed.ok) return { error: parsed.error }

  const allowed = await loadGate(publicId)
  if ("error" in allowed) return { error: allowed.error }

  try {
    await insertTeam({
      tournamentId: allowed.tournament.id,
      actorId: allowed.userId,
      team: parsed.value,
    })
  } catch (error) {
    if (error instanceof TeamConstraintError) return { error: error.message }
    throw error
  }
  go(managePath(publicId))
}

export async function updateTeamAction(
  _state: TeamFormState,
  formData: FormData,
): Promise<TeamFormState> {
  const publicId = normalizePublicId(String(formData.get("publicId") ?? ""))
  const number = Number(formData.get("number"))
  if (!publicId || !Number.isInteger(number)) return { error: "Unknown team." }
  const parsed = parseTeamInput({
    name: formData.get("name"),
    shortName: formData.get("shortName"),
    logoUrl: formData.get("logoUrl"),
  })
  if (!parsed.ok) return { error: parsed.error }

  const allowed = await loadGate(publicId)
  if ("error" in allowed) return { error: allowed.error }

  try {
    await updateTeam({
      tournamentId: allowed.tournament.id,
      number,
      actorId: allowed.userId,
      next: parsed.value,
    })
  } catch (error) {
    if (error instanceof TeamConstraintError) return { error: error.message }
    throw error
  }
  go(managePath(publicId))
}

export async function deleteTeamAction(formData: FormData): Promise<void> {
  const publicId = normalizePublicId(String(formData.get("publicId") ?? ""))
  const number = Number(formData.get("number"))
  if (!publicId) go("/dashboard")
  const allowed = await loadGate(publicId)
  if ("error" in allowed || !Number.isInteger(number)) go(publicId ? managePath(publicId) : "/dashboard")
  try {
    const result = await deleteTeam({
      tournamentId: allowed.tournament.id,
      number,
      actorId: allowed.userId,
    })
    if (result === "referenced") go(`${managePath(publicId)}?error=referenced`)
  } catch (error) {
    if (error instanceof TeamConstraintError) go(`${managePath(publicId)}?error=referenced`)
    throw error
  }
  go(managePath(publicId))
}
