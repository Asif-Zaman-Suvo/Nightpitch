"use server"

import { redirect } from "next/navigation"
import { planAddEntry, canManageStageEntries, entryRemoveError, reorderEntries } from "@/src/domain/tournament/stage-entry"
import { normalizePublicId } from "@/src/domain/tournament/public-id"
import { currentGroupId } from "@/src/server/groups/repository"
import { requireUser } from "@/src/server/auth/session"
import {
  deleteStageEntry,
  entryIsReferenced,
  findStageEntry,
  insertStageEntry,
  listStageEntries,
  StageEntryConstraintError,
  swapEntrySlots,
} from "@/src/server/stage-entries/repository"
import { findStage } from "@/src/server/stages/repository"
import { findTeam } from "@/src/server/teams/repository"
import { findTournament } from "@/src/server/tournaments/repository"

function stagesPath(publicId: string, error?: string): string {
  return error ? `/t/${publicId}/manage/stages?error=${error}` : `/t/${publicId}/manage/stages`
}

async function authorize(publicId: string, userId: string) {
  const tournament = await findTournament(publicId)
  if (!tournament || tournament.deletedAt) return { error: "Tournament not found." as const }
  const role = tournament.ownerId === userId ? "owner" as const : null
  if (!canManageStageEntries({ role, status: tournament.status, deleted: tournament.deletedAt !== null })) {
    return { error: "You cannot change stage entries in this tournament." as const }
  }
  return { tournament }
}

export async function addStageEntryAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const publicId = normalizePublicId(String(formData.get("publicId") ?? ""))
  const stageId = String(formData.get("stageId") ?? "")
  const number = Number(formData.get("number"))
  if (!publicId) redirect("/dashboard")
  const allowed = await authorize(publicId, user.id)
  if ("error" in allowed || !stageId || !Number.isInteger(number)) {
    redirect(publicId ? stagesPath(publicId) : "/dashboard")
  }
  const stage = await findStage(allowed.tournament.id, stageId)
  const team = await findTeam(allowed.tournament.id, number)
  const entries = await listStageEntries(allowed.tournament.id)
  const setupGroupId = team ? await currentGroupId(allowed.tournament.id, team.id) : null
  const attached = stage?.groups.find((group) => group.sourceGroupId === setupGroupId) ?? null
  const plan = planAddEntry({
    stageFound: stage !== null,
    teamFound: team !== null,
    sameTournament: team?.tournamentId === allowed.tournament.id,
    stageType: stage?.stageType ?? null,
    alreadyInStage: entries.some((entry) => entry.stageId === stageId && entry.teamId === team?.id),
    setupGroupId,
    attachedStageGroupId: attached?.id ?? null,
  })
  if (!plan.ok || !team) redirect(stagesPath(publicId, "entry"))
  try {
    await insertStageEntry({
      tournamentId: allowed.tournament.id,
      stageId,
      stageGroupId: plan.stageGroupId,
      teamId: team.id,
      actorId: user.id,
    })
  } catch (error) {
    if (error instanceof StageEntryConstraintError) redirect(stagesPath(publicId, "entry"))
    throw error
  }
  redirect(stagesPath(publicId))
}

export async function removeStageEntryAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const publicId = normalizePublicId(String(formData.get("publicId") ?? ""))
  const entryId = String(formData.get("entryId") ?? "")
  if (!publicId) redirect("/dashboard")
  const allowed = await authorize(publicId, user.id)
  if ("error" in allowed || !entryId) redirect(publicId ? stagesPath(publicId) : "/dashboard")
  const entry = await findStageEntry(allowed.tournament.id, entryId)
  if (!entry) redirect(stagesPath(publicId))
  if (entryRemoveError(await entryIsReferenced(allowed.tournament.id, entryId))) {
    redirect(stagesPath(publicId, "entry-used"))
  }
  await deleteStageEntry({
    tournamentId: allowed.tournament.id,
    entryId,
    actorId: user.id,
    stageId: entry.stageId,
    teamId: entry.teamId,
    slot: entry.slot,
  })
  redirect(stagesPath(publicId))
}

export async function reorderStageEntryAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const publicId = normalizePublicId(String(formData.get("publicId") ?? ""))
  const entryId = String(formData.get("entryId") ?? "")
  const direction = formData.get("direction") === "down" ? "down" : "up"
  if (!publicId) redirect("/dashboard")
  const allowed = await authorize(publicId, user.id)
  if ("error" in allowed || !entryId) redirect(publicId ? stagesPath(publicId) : "/dashboard")
  const entry = await findStageEntry(allowed.tournament.id, entryId)
  if (!entry) redirect(stagesPath(publicId))
  const scope = (await listStageEntries(allowed.tournament.id)).filter(
    (item) => item.stageId === entry.stageId && item.stageGroupId === entry.stageGroupId,
  )
  const next = reorderEntries(scope, entryId, direction)
  const moved = next.find((item) => item.id === entryId)
  if (!moved || moved.slot === entry.slot) redirect(stagesPath(publicId))
  const other = scope.find((item) => item.slot === moved.slot)
  if (!other) redirect(stagesPath(publicId))
  await swapEntrySlots({
    tournamentId: allowed.tournament.id,
    actorId: user.id,
    entryId,
    otherEntryId: other.id,
    stageId: entry.stageId,
    stageGroupId: entry.stageGroupId,
    fromSlot: entry.slot,
    toSlot: moved.slot,
    teamId: entry.teamId,
  })
  redirect(stagesPath(publicId))
}
