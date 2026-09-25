import { canManageTeams } from "./team"
import type { TournamentRole, TournamentStatus } from "./access"

export const STAGE_TYPES = ["group", "league", "knockout"] as const
export type StageType = (typeof STAGE_TYPES)[number]

const NAME_LIMIT = 80

export function parseStageName(name: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const trimmed = typeof name === "string" ? name.trim() : ""
  if (!trimmed || trimmed.length > NAME_LIMIT) {
    return { ok: false, error: "Enter a stage name of up to 80 characters." }
  }
  return { ok: true, value: trimmed }
}

export function parseStageType(type: unknown): { ok: true; value: StageType } | { ok: false; error: string } {
  if (typeof type === "string" && (STAGE_TYPES as readonly string[]).includes(type)) {
    return { ok: true, value: type as StageType }
  }
  return { ok: false, error: "Choose a group, league, or knockout stage." }
}

export function acceptsGroups(type: StageType): boolean {
  return type === "group" || type === "league"
}

export function canManageStages(input: {
  role: TournamentRole | null
  status: TournamentStatus
  deleted: boolean
}): boolean {
  return canManageTeams(input)
}

export function stageNameConflict(
  stages: { id: string; tournamentId: string; name: string }[],
  input: { tournamentId: string; name: string; exceptId?: string },
): string | null {
  const name = input.name.trim().toLowerCase()
  const taken = stages.some(
    (stage) =>
      stage.tournamentId === input.tournamentId &&
      stage.id !== input.exceptId &&
      stage.name.trim().toLowerCase() === name,
  )
  return taken ? "A stage with this name already exists." : null
}

export function stageDeleteError(counts: {
  groups: number
  entries: number
  tieOrders: number
  matches: number
}): string | null {
  if (counts.groups + counts.entries + counts.tieOrders + counts.matches === 0) return null
  return "Remove this stage's groups and other setup before deleting it."
}

export interface OrderedStage {
  id: string
  position: number
}

export function reorderStages<T extends OrderedStage>(stages: T[], stageId: string, direction: "up" | "down"): T[] {
  const ordered = [...stages].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
  const index = ordered.findIndex((stage) => stage.id === stageId)
  if (index < 0) return ordered
  const swapWith = direction === "up" ? index - 1 : index + 1
  if (swapWith < 0 || swapWith >= ordered.length) return ordered
  const next = ordered.map((stage) => ({ ...stage }))
  const current = next[index]
  const other = next[swapWith]
  const position = current.position
  current.position = other.position
  other.position = position
  return next.sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
}

export function planStageGroupLink(input: {
  stageFound: boolean
  groupFound: boolean
  sameTournament: boolean
  stageType: StageType | null
  alreadyLinked: boolean
}): { ok: true } | { ok: false; error: string } {
  if (!input.stageFound) return { ok: false, error: "Stage not found." }
  if (!input.groupFound || !input.sameTournament) {
    return { ok: false, error: "That group is not in this tournament." }
  }
  if (!input.stageType || !acceptsGroups(input.stageType)) {
    return { ok: false, error: "Only a group or league stage can use groups." }
  }
  if (input.alreadyLinked) return { ok: false, error: "This group is already attached to a stage." }
  return { ok: true }
}

export function stageTypeChangeError(input: {
  current: StageType
  next: StageType
  groups: number
  entries: number
  matches: number
}): string | null {
  if (input.current === input.next) return null
  if (input.matches > 0) return "Cannot change stage type because this stage already contains matches."
  if (input.entries > 0) return "Cannot change stage type because this stage already contains participants."
  if (!acceptsGroups(input.next) && input.groups > 0) {
    return "Detach every group before changing this stage to knockout."
  }
  return null
}

export function validateStageConfiguration(input: {
  tournamentId: string
  stageType: StageType
  groups: { id: string; tournamentId: string }[]
  entries: { teamId: string; tournamentId: string; stageGroupId: string | null }[]
  positions?: number[]
}): string | null {
  const groupIds = new Set<string>()
  for (const group of input.groups) {
    if (group.tournamentId !== input.tournamentId) return "That group is not in this tournament."
    if (groupIds.has(group.id)) return "This group is already attached to a stage."
    groupIds.add(group.id)
  }
  if (input.stageType === "knockout" && input.groups.length > 0) {
    return "A knockout stage cannot use groups."
  }
  if (input.stageType === "group" && input.entries.length > 0 && input.groups.length === 0) {
    return "Attach a group before adding participants."
  }
  const teams = new Set<string>()
  for (const entry of input.entries) {
    if (entry.tournamentId !== input.tournamentId) return "That team is not in this tournament."
    if (teams.has(entry.teamId)) return "This team is already in this stage."
    teams.add(entry.teamId)
    if (input.stageType === "knockout") {
      if (entry.stageGroupId) return "A knockout participant does not belong to a group."
      continue
    }
    if (!entry.stageGroupId || !groupIds.has(entry.stageGroupId)) {
      return "This team is not in a group attached to this stage."
    }
  }
  if (input.positions) {
    const seen = new Set<number>()
    for (const position of input.positions) {
      if (seen.has(position)) return "Stage positions must be unique."
      seen.add(position)
    }
  }
  return null
}
