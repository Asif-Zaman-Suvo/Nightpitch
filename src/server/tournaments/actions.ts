"use server"

import { redirect } from "next/navigation"
import { canAccess, deletionMode } from "@/src/domain/tournament/access"
import {
  canChangeTournament,
  parseTournamentDescription,
  parseTournamentName,
  parseTournamentVisibility,
  planStatusTransition,
} from "@/src/domain/tournament/lifecycle"
import { allocatePublicId, normalizePublicId } from "@/src/domain/tournament/public-id"
import { requireUser } from "@/src/server/auth/session"
import {
  findTournament,
  insertTournament,
  publicIdTaken,
  setTournamentStatus,
  updateTournament,
  deleteTournament,
} from "@/src/server/tournaments/repository"

export interface TournamentFormState {
  error?: string
}

export async function createTournamentAction(
  _state: TournamentFormState,
  formData: FormData,
): Promise<TournamentFormState> {
  const user = await requireUser()
  const parsed = readDetails(formData, "unlisted")
  if (!parsed.ok) return { error: parsed.error }

  const publicId = await allocatePublicId(publicIdTaken)
  await insertTournament({ publicId, ownerId: user.id, ...parsed.value })
  redirect(`/t/${publicId}/manage`)
}

export async function updateTournamentAction(
  _state: TournamentFormState,
  formData: FormData,
): Promise<TournamentFormState> {
  const user = await requireUser()
  const publicId = normalizePublicId(String(formData.get("publicId") ?? ""))
  if (!publicId) return { error: "Unknown tournament." }
  const parsed = readDetails(formData)
  if (!parsed.ok) return { error: parsed.error }

  const tournament = await findTournament(publicId)
  const role = tournament?.ownerId === user.id ? "owner" : null
  if (
    !tournament ||
    !canChangeTournament(role, tournament.status, tournament.visibility, tournament.deletedAt !== null)
  ) {
    return { error: "You cannot edit this tournament." }
  }

  await updateTournament({
    id: tournament.id,
    actorId: user.id,
    ...parsed.value,
    previousVisibility: tournament.visibility,
  })
  redirect(`/t/${publicId}/manage/settings`)
}

export async function publishTournamentAction(formData: FormData): Promise<void> {
  await changeStatus(formData, "published")
}

export async function unpublishTournamentAction(formData: FormData): Promise<void> {
  await changeStatus(formData, "draft")
}

async function changeStatus(formData: FormData, to: "published" | "draft") {
  const user = await requireUser()
  const publicId = normalizePublicId(String(formData.get("publicId") ?? ""))
  if (!publicId) redirect("/dashboard")
  const tournament = await findTournament(publicId)
  const role = tournament?.ownerId === user.id ? "owner" : null
  const plan = tournament ? planStatusTransition(tournament.status, to) : { ok: false as const, error: "That status change is not allowed." }
  if (
    !tournament ||
    !plan.ok ||
    !canChangeTournament(role, tournament.status, tournament.visibility, tournament.deletedAt !== null)
  ) {
    redirect(publicId ? `/t/${publicId}/manage/settings` : "/dashboard")
  }
  await setTournamentStatus({
    id: tournament.id,
    actorId: user.id,
    from: tournament.status,
    to,
    action: plan.action,
  })
  redirect(`/t/${publicId}/manage/settings`)
}

function readDetails(formData: FormData, fallbackVisibility?: "unlisted") {
  const name = parseTournamentName(formData.get("name"))
  if (!name.ok) return name
  const description = parseTournamentDescription(formData.get("description") ?? "")
  if (!description.ok) return description
  const visibility = parseTournamentVisibility(formData.get("visibility") ?? fallbackVisibility)
  if (!visibility.ok) return visibility
  return { ok: true as const, value: { name: name.value, description: description.value, visibility: visibility.value } }
}

export async function deleteTournamentAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const publicId = normalizePublicId(String(formData.get("publicId") ?? ""))
  if (!publicId) redirect("/dashboard")
  const tournament = await findTournament(publicId)
  const role = tournament?.ownerId === user.id ? "owner" : null
  if (
    !tournament ||
    !canAccess({
      role,
      action: "delete",
      status: tournament.status,
      visibility: tournament.visibility,
      deleted: tournament.deletedAt !== null,
    })
  ) {
    redirect(`/t/${publicId}/manage`)
  }
  try {
    await deleteTournament({
      id: tournament.id,
      actorId: user.id,
      mode: deletionMode(tournament.status),
    })
  } catch {
    redirect(`/t/${publicId}/manage/settings?error=delete-failed`)
  }
  redirect("/dashboard")
}

