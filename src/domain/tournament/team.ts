import type { TournamentRole, TournamentStatus } from "./access"

export interface TeamInput {
  name: string
  shortName: string
  logoUrl: string | null
}

export function parseTeamInput(input: {
  name: unknown
  shortName: unknown
  logoUrl: unknown
}): { ok: true; value: TeamInput } | { ok: false; error: string } {
  const name = typeof input.name === "string" ? input.name.trim() : ""
  const shortName = typeof input.shortName === "string" ? input.shortName.trim() : ""
  const rawLogo = typeof input.logoUrl === "string" ? input.logoUrl.trim() : ""

  if (!name || name.length > 80) return { ok: false, error: "Enter a team name of up to 80 characters." }
  if (shortName.length > 12) return { ok: false, error: "The short name can be at most 12 characters." }
  if (rawLogo.length > 2000) return { ok: false, error: "The logo URL is too long." }
  if (rawLogo && !/^https?:\/\/\S+$/i.test(rawLogo)) {
    return { ok: false, error: "The logo must be an http or https URL." }
  }

  return { ok: true, value: { name, shortName, logoUrl: rawLogo || null } }
}

export function canManageTeams(input: {
  role: TournamentRole | null
  status: TournamentStatus
  deleted: boolean
}): boolean {
  if (input.deleted || input.status === "archived") return false
  return input.role === "owner" || input.role === "admin"
}

export function teamDeleteError(referenced: boolean): string | null {
  if (!referenced) return null
  return "This team is already used in the tournament and cannot be removed."
}
