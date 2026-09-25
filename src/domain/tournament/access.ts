export type TournamentRole = "owner" | "admin" | "participant" | "viewer"
export type TournamentStatus = "draft" | "published" | "completed" | "archived"
export type TournamentVisibility = "public" | "unlisted" | "private"
export type TournamentAction = "view" | "update" | "delete"

export interface AccessInput {
  role: TournamentRole | null
  action: TournamentAction
  status: TournamentStatus
  visibility: TournamentVisibility
  deleted: boolean
}

export function canAccess(input: AccessInput): boolean {
  if (input.deleted) return false

  if (input.action === "view") return canView(input)
  if (input.role !== "owner" && input.role !== "admin") return false
  if (input.action === "delete") return input.role === "owner" && input.status !== "archived"
  return input.status === "draft" || input.status === "published" || input.status === "completed"
}

function canView(input: AccessInput): boolean {
  if (input.role === "owner" || input.role === "admin") return true
  if (input.status !== "published" && input.status !== "completed") return false
  if (input.visibility === "private") return input.role === "participant" || input.role === "viewer"
  return true
}

export function deletionMode(status: TournamentStatus): "hard" | "soft" {
  return status === "draft" ? "hard" : "soft"
}
