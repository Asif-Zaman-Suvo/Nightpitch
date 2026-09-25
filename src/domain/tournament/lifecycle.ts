import { canAccess, type TournamentStatus, type TournamentVisibility } from "./access"
import { canDiscover, canOpenWithoutLogin } from "./search"

const NAME_LIMIT = 120
const DESCRIPTION_LIMIT = 2000

export function parseTournamentName(name: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const value = typeof name === "string" ? name.trim() : ""
  if (!value || value.length > NAME_LIMIT) return { ok: false, error: "Give the tournament a name." }
  return { ok: true, value }
}

export function parseTournamentDescription(description: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const value = typeof description === "string" ? description.trim() : ""
  if (value.length > DESCRIPTION_LIMIT) return { ok: false, error: "Description is too long." }
  return { ok: true, value }
}

export function parseTournamentVisibility(
  visibility: unknown,
): { ok: true; value: TournamentVisibility } | { ok: false; error: string } {
  if (visibility === "public" || visibility === "unlisted" || visibility === "private") {
    return { ok: true, value: visibility }
  }
  return { ok: false, error: "Choose a visibility." }
}

export function planStatusTransition(
  from: TournamentStatus,
  to: "published" | "draft",
): { ok: true; action: "tournament.published" | "tournament.unpublished" } | { ok: false; error: string } {
  if (from === "draft" && to === "published") return { ok: true, action: "tournament.published" }
  if (from === "published" && to === "draft") return { ok: true, action: "tournament.unpublished" }
  return { ok: false, error: "That status change is not allowed." }
}

export function canChangeTournament(
  role: "owner" | "admin" | "participant" | "viewer" | null,
  status: TournamentStatus,
  visibility: TournamentVisibility,
  deleted: boolean,
): boolean {
  return canAccess({ role, action: "update", status, visibility, deleted })
}

export function publicReach(status: TournamentStatus, visibility: TournamentVisibility, deleted = false) {
  const input = { status, visibility, deleted }
  return { searchable: canDiscover(input), open: canOpenWithoutLogin(input) }
}
