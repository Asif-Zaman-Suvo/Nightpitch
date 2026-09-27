"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { COMPLETED_TOURNAMENT_ERROR, completedMutationError } from "@/src/domain/tournament/champion"
import { parseStandingsConfiguration } from "@/src/domain/tournament/standings"
import {
  acceptsGroups,
  canManageStages,
  parseStageName,
  parseStageType,
  planStageGroupLink,
  reorderStages,
  stageDeleteError,
  stageTypeChangeError,
} from "@/src/domain/tournament/stage"
import { normalizePublicId } from "@/src/domain/tournament/public-id"
import { findGroup } from "@/src/server/groups/repository"
import { requireUser } from "@/src/server/auth/session"
import {
  attachGroupToStage,
  deleteStage,
  detachGroupFromStage,
  findStage,
  listStages,
  StageConstraintError,
  stageDependencyCounts,
  swapStageOrder,
  updateStage,
  updateStageRules,
  insertStage,
} from "@/src/server/stages/repository"
import { findTournament } from "@/src/server/tournaments/repository"

export interface StageFormState {
  error?: string
}

function stagesPath(publicId: string, error?: string): string {
  return error ? `/t/${publicId}/manage/stages?error=${error}` : `/t/${publicId}/manage/stages`
}

async function authorize(publicId: string, userId: string) {
  const tournament = await findTournament(publicId)
  if (!tournament || tournament.deletedAt) return { error: "Tournament not found." as const }
  const role = tournament.ownerId === userId ? "owner" as const : null
  if (!canManageStages({ role, status: tournament.status, deleted: tournament.deletedAt !== null })) {
    return { error: "You cannot change stages in this tournament." as const }
  }
  const locked = completedMutationError(tournament.status)
  if (locked) return { error: locked }
  return { tournament }
}

export async function createStageAction(_state: StageFormState, formData: FormData): Promise<StageFormState> {
  const user = await requireUser()
  const publicId = normalizePublicId(String(formData.get("publicId") ?? ""))
  if (!publicId) return { error: "Unknown tournament." }
  const name = parseStageName(formData.get("name"))
  const stageType = parseStageType(formData.get("stageType"))
  if (!name.ok) return { error: name.error }
  if (!stageType.ok) return { error: stageType.error }
  const allowed = await authorize(publicId, user.id)
  if ("error" in allowed) return { error: allowed.error }
  try {
    await insertStage({
      tournamentId: allowed.tournament.id,
      actorId: user.id,
      name: name.value,
      stageType: stageType.value,
    })
  } catch (error) {
    if (error instanceof StageConstraintError) return { error: error.message }
    throw error
  }
  redirect(stagesPath(publicId))
}

export async function updateStageAction(_state: StageFormState, formData: FormData): Promise<StageFormState> {
  const user = await requireUser()
  const publicId = normalizePublicId(String(formData.get("publicId") ?? ""))
  const stageId = String(formData.get("stageId") ?? "")
  if (!publicId || !stageId) return { error: "Unknown stage." }
  const name = parseStageName(formData.get("name"))
  const stageType = parseStageType(formData.get("stageType"))
  if (!name.ok) return { error: name.error }
  if (!stageType.ok) return { error: stageType.error }
  const allowed = await authorize(publicId, user.id)
  if ("error" in allowed) return { error: allowed.error }
  const stage = await findStage(allowed.tournament.id, stageId)
  if (!stage) return { error: "Stage not found." }
  const counts = await stageDependencyCounts(allowed.tournament.id, stageId)
  const typeError = stageTypeChangeError({
    current: stage.stageType,
    next: stageType.value,
    groups: stage.groups.length,
    entries: counts.entries,
    matches: counts.matches,
  })
  if (typeError) return { error: typeError }
  try {
    await updateStage({
      tournamentId: allowed.tournament.id,
      stageId,
      actorId: user.id,
      name: name.value,
      stageType: stageType.value,
    })
  } catch (error) {
    if (error instanceof StageConstraintError) return { error: error.message }
    throw error
  }
  redirect(stagesPath(publicId))
}

export async function deleteStageAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const publicId = normalizePublicId(String(formData.get("publicId") ?? ""))
  const stageId = String(formData.get("stageId") ?? "")
  if (!publicId) redirect("/dashboard")
  const allowed = await authorize(publicId, user.id)
  if ("error" in allowed || !stageId) {
    redirect(publicId ? stagesPath(publicId, "error" in allowed && allowed.error === COMPLETED_TOURNAMENT_ERROR ? "completed" : undefined) : "/dashboard")
  }
  const stage = await findStage(allowed.tournament.id, stageId)
  if (!stage) redirect(stagesPath(publicId))
  const counts = await stageDependencyCounts(allowed.tournament.id, stageId)
  if (stageDeleteError(counts)) redirect(stagesPath(publicId, "has-dependents"))
  await deleteStage({
    tournamentId: allowed.tournament.id,
    stageId,
    actorId: user.id,
    name: stage.name,
    position: stage.position,
  })
  redirect(stagesPath(publicId))
}

export async function updateStageRulesAction(_state: StageFormState, formData: FormData): Promise<StageFormState> {
  const user = await requireUser()
  const publicId = normalizePublicId(String(formData.get("publicId") ?? ""))
  const stageId = String(formData.get("stageId") ?? "")
  if (!publicId || !stageId) return { error: "Unknown stage." }
  const allowed = await authorize(publicId, user.id)
  if ("error" in allowed) return { error: allowed.error }
  const stage = await findStage(allowed.tournament.id, stageId)
  if (!stage) return { error: "Stage not found." }
  if (!acceptsGroups(stage.stageType)) return { error: "A knockout stage does not use standings rules." }
  // Form fields are strings; convert only at the transport boundary. Domain JSON stays strict.
  const point = (name: string) => {
    const value = formData.get(name)
    return typeof value === "string" && /^\d+$/.test(value.trim()) ? Number(value) : NaN
  }
  const parsed = parseStandingsConfiguration({
    winPoints: point("win"), drawPoints: point("draw"), lossPoints: point("loss"),
    tieBreakers: formData.getAll("tieBreakers"),
  })
  if (!parsed.ok) return { error: parsed.error }
  try {
    await updateStageRules({
      tournamentId: allowed.tournament.id, stageId, actorId: user.id,
      rules: { schemaVersion: "1", standings: parsed.value },
    })
  } catch (error) {
    if (error instanceof StageConstraintError) return { error: error.message }
    throw error
  }
  revalidatePath(stagesPath(publicId))
  revalidatePath(`/t/${publicId}/manage/standings`)
  revalidatePath(`/t/${publicId}`)
  redirect(stagesPath(publicId))
}

export async function reorderStageAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const publicId = normalizePublicId(String(formData.get("publicId") ?? ""))
  const stageId = String(formData.get("stageId") ?? "")
  const direction = formData.get("direction") === "down" ? "down" : "up"
  if (!publicId) redirect("/dashboard")
  const allowed = await authorize(publicId, user.id)
  if ("error" in allowed || !stageId) {
    redirect(publicId ? stagesPath(publicId, "error" in allowed && allowed.error === COMPLETED_TOURNAMENT_ERROR ? "completed" : undefined) : "/dashboard")
  }
  const stages = await listStages(allowed.tournament.id)
  const next = reorderStages(stages, stageId, direction)
  const current = stages.find((stage) => stage.id === stageId)
  const moved = next.find((stage) => stage.id === stageId)
  if (!current || !moved || current.position === moved.position) redirect(stagesPath(publicId))
  const other = stages.find((stage) => stage.position === moved.position)
  if (!other) redirect(stagesPath(publicId))
  await swapStageOrder({
    tournamentId: allowed.tournament.id,
    actorId: user.id,
    stageId,
    otherStageId: other.id,
    fromPosition: current.position,
    toPosition: moved.position,
  })
  redirect(stagesPath(publicId))
}

export async function attachGroupAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const publicId = normalizePublicId(String(formData.get("publicId") ?? ""))
  const stageId = String(formData.get("stageId") ?? "")
  const groupId = String(formData.get("groupId") ?? "")
  if (!publicId) redirect("/dashboard")
  const allowed = await authorize(publicId, user.id)
  if ("error" in allowed || !stageId || !groupId) {
    redirect(publicId ? stagesPath(publicId, "error" in allowed && allowed.error === COMPLETED_TOURNAMENT_ERROR ? "completed" : undefined) : "/dashboard")
  }
  const stage = await findStage(allowed.tournament.id, stageId)
  const group = await findGroup(allowed.tournament.id, groupId)
  const plan = planStageGroupLink({
    stageFound: stage !== null,
    groupFound: group !== null,
    sameTournament: group?.tournamentId === allowed.tournament.id,
    stageType: stage?.stageType ?? null,
    alreadyLinked: false,
  })
  if (!plan.ok || !group) redirect(stagesPath(publicId, "attach"))
  try {
    await attachGroupToStage({
      tournamentId: allowed.tournament.id,
      stageId,
      groupId,
      actorId: user.id,
      groupName: group.name,
    })
  } catch (error) {
    if (error instanceof StageConstraintError) redirect(stagesPath(publicId, "attach"))
    throw error
  }
  redirect(stagesPath(publicId))
}

export async function detachGroupAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const publicId = normalizePublicId(String(formData.get("publicId") ?? ""))
  const stageId = String(formData.get("stageId") ?? "")
  const stageGroupId = String(formData.get("stageGroupId") ?? "")
  if (!publicId) redirect("/dashboard")
  const allowed = await authorize(publicId, user.id)
  if ("error" in allowed || !stageId || !stageGroupId) {
    redirect(publicId ? stagesPath(publicId, "error" in allowed && allowed.error === COMPLETED_TOURNAMENT_ERROR ? "completed" : undefined) : "/dashboard")
  }
  try {
    await detachGroupFromStage({
      tournamentId: allowed.tournament.id,
      stageId,
      stageGroupId,
      actorId: user.id,
    })
  } catch (error) {
    if (error instanceof StageConstraintError) redirect(stagesPath(publicId, "detach"))
    throw error
  }
  redirect(stagesPath(publicId))
}
