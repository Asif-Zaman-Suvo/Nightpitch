import { canAccess, type TournamentStatus, type TournamentVisibility } from "./access"
import { normalizePublicId } from "./public-id"

export const SEARCH_RESULT_LIMIT = 20

export type TournamentSearch =
  | { kind: "empty" }
  | { kind: "id"; publicId: string }
  | { kind: "name"; term: string }

const ID_SHAPE = /^(?:TMT[-\s]?)?[0-9A-Z]{4}[-\s][0-9A-Z]{4}$|^[0-9A-HJ-KM-NP-TV-Z]{8}$/i

export function parseTournamentSearch(raw: string): TournamentSearch {
  const query = raw.trim()
  if (!query) return { kind: "empty" }
  const publicId = ID_SHAPE.test(query) ? normalizePublicId(query) : null
  if (publicId) return { kind: "id", publicId }
  return { kind: "name", term: query.slice(0, 120) }
}

export function ilikeContains(term: string): string {
  return `%${term.replace(/[\\%_]/g, (character) => `\\${character}`)}%`
}

export function canDiscover(input: {
  status: TournamentStatus
  visibility: TournamentVisibility
  deleted: boolean
}): boolean {
  return input.visibility === "public" && canAccess({ ...input, role: null, action: "view" })
}

export function canOpenWithoutLogin(input: {
  status: TournamentStatus
  visibility: TournamentVisibility
  deleted: boolean
}): boolean {
  return canAccess({ ...input, role: null, action: "view" })
}
