"use server"

import { refresh } from "next/cache"
import { redirect } from "next/navigation"
import { canManageGroups, parseGroupName, planAssignment } from "@/src/domain/tournament/group"
import { normalizePublicId } from "@/src/domain/tournament/public-id"
import {
  assignTeamToGroup,
  deleteGroup,
  GroupConstraintError,
  insertGroup,
  readAssignment,
  removeTeamFromGroup,
  renameGroup,
} from "@/src/server/groups/repository"
import { requireUserId } from "@/src/server/auth/session"
import { findTournamentGate, type TournamentGate } from "@/src/server/tournaments/repository"

export interface GroupFormState {
  error?: string
}

function groupsPath(publicId: string, error?: string): string {
  return error ? `/t/${publicId}/manage/groups?error=${error}` : `/t/${publicId}/manage/groups`
}

function go(path: string): never {
  refresh()
  redirect(path)
}

function authorize(tournament: TournamentGate | null, userId: string) {
  if (!tournament || tournament.deletedAt) return { error: "Tournament not found." as const }
  const role = tournament.ownerId === userId ? "owner" as const : null
  if (!canManageGroups({ role, status: tournament.status, deleted: tournament.deletedAt !== null })) {
    return { error: "You cannot change groups in this tournament." as const }
  }
  return { tournament, userId }
}

async function loadGate(publicId: string) {
  const [userId, tournament] = await Promise.all([
    requireUserId(),
    findTournamentGate(publicId),
  ])
  return authorize(tournament, userId)
}

export async function createGroupAction(_state: GroupFormState, formData: FormData): Promise<GroupFormState> {
  const publicId = normalizePublicId(String(formData.get("publicId") ?? ""))
  if (!publicId) return { error: "Unknown tournament." }
  const parsed = parseGroupName(formData.get("name"))
  if (!parsed.ok) return { error: parsed.error }
  const allowed = await loadGate(publicId)
  if ("error" in allowed) return { error: allowed.error }
  try {
    await insertGroup({ tournamentId: allowed.tournament.id, actorId: allowed.userId, name: parsed.value })
  } catch (error) {
    if (error instanceof GroupConstraintError) return { error: error.message }
    throw error
  }
  go(groupsPath(publicId))
}

export async function renameGroupAction(_state: GroupFormState, formData: FormData): Promise<GroupFormState> {
  const publicId = normalizePublicId(String(formData.get("publicId") ?? ""))
  const groupId = String(formData.get("groupId") ?? "")
  if (!publicId || !groupId) return { error: "Unknown group." }
  const parsed = parseGroupName(formData.get("name"))
  if (!parsed.ok) return { error: parsed.error }
  const allowed = await loadGate(publicId)
  if ("error" in allowed) return { error: allowed.error }
  try {
    await renameGroup({
      tournamentId: allowed.tournament.id,
      groupId,
      actorId: allowed.userId,
      name: parsed.value,
    })
  } catch (error) {
    if (error instanceof GroupConstraintError) return { error: error.message }
    throw error
  }
  go(groupsPath(publicId))
}

export async function deleteGroupAction(formData: FormData): Promise<void> {
  const publicId = normalizePublicId(String(formData.get("publicId") ?? ""))
  const groupId = String(formData.get("groupId") ?? "")
  if (!publicId) go("/dashboard")
  const allowed = await loadGate(publicId)
  if ("error" in allowed || !groupId) go(publicId ? groupsPath(publicId) : "/dashboard")
  try {
    const result = await deleteGroup({
      tournamentId: allowed.tournament.id,
      groupId,
      actorId: allowed.userId,
    })
    if (result === "has-teams") go(groupsPath(publicId, "has-teams"))
  } catch (error) {
    if (error instanceof GroupConstraintError) go(groupsPath(publicId, "linked"))
    throw error
  }
  go(groupsPath(publicId))
}

export async function assignTeamAction(formData: FormData): Promise<void> {
  const publicId = normalizePublicId(String(formData.get("publicId") ?? ""))
  const groupId = String(formData.get("groupId") ?? "")
  const number = Number(formData.get("number"))
  if (!publicId) go("/dashboard")
  const allowed = await loadGate(publicId)
  if ("error" in allowed || !groupId || !Number.isInteger(number)) {
    go(publicId ? groupsPath(publicId) : "/dashboard")
  }
  const row = await readAssignment(allowed.tournament.id, groupId, number)
  const plan = planAssignment({
    teamFound: row !== null,
    sameTournament: row !== null,
    currentGroupId: row?.currentGroupId ?? null,
    targetGroupId: groupId,
    teamReferenced: row?.referenced ?? false,
  })
  if (!row || !row.groupExists || !plan.ok) go(groupsPath(publicId, "assign"))
  try {
    await assignTeamToGroup({
      tournamentId: allowed.tournament.id,
      groupId,
      teamId: row.teamId,
      actorId: allowed.userId,
      kind: plan.kind,
      fromGroupId: row.currentGroupId,
    })
  } catch (error) {
    if (error instanceof GroupConstraintError) go(groupsPath(publicId, "assign"))
    throw error
  }
  go(groupsPath(publicId))
}

export async function removeTeamAction(formData: FormData): Promise<void> {
  const publicId = normalizePublicId(String(formData.get("publicId") ?? ""))
  const number = Number(formData.get("number"))
  if (!publicId) go("/dashboard")
  const allowed = await loadGate(publicId)
  if ("error" in allowed || !Number.isInteger(number)) go(publicId ? groupsPath(publicId) : "/dashboard")
  const result = await removeTeamFromGroup({
    tournamentId: allowed.tournament.id,
    number,
    actorId: allowed.userId,
  })
  if (result === "referenced") go(groupsPath(publicId, "locked"))
  go(groupsPath(publicId))
}
