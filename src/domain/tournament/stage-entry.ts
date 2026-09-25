import type { StageType } from "./stage"
import { acceptsGroups, canManageStages } from "./stage"
import type { TournamentRole, TournamentStatus } from "./access"

export function canManageStageEntries(input: {
  role: TournamentRole | null
  status: TournamentStatus
  deleted: boolean
}): boolean {
  return canManageStages(input)
}

export function planAddEntry(input: {
  stageFound: boolean
  teamFound: boolean
  sameTournament: boolean
  stageType: StageType | null
  alreadyInStage: boolean
  setupGroupId: string | null
  attachedStageGroupId: string | null
}): { ok: true; stageGroupId: string | null } | { ok: false; error: string } {
  if (!input.stageFound) return { ok: false, error: "Stage not found." }
  if (!input.teamFound || !input.sameTournament) {
    return { ok: false, error: "That team is not in this tournament." }
  }
  if (!input.stageType) return { ok: false, error: "Stage not found." }
  if (input.alreadyInStage) return { ok: false, error: "This team is already in this stage." }
  if (!acceptsGroups(input.stageType)) return { ok: true, stageGroupId: null }
  if (!input.setupGroupId || !input.attachedStageGroupId) {
    return { ok: false, error: "This team is not in a group attached to this stage." }
  }
  return { ok: true, stageGroupId: input.attachedStageGroupId }
}

export function entryRemoveError(referenced: boolean): string | null {
  if (!referenced) return null
  return "This entry is already used and cannot be removed."
}

export interface OrderedEntry {
  id: string
  slot: number
}

export function reorderEntries<T extends OrderedEntry>(entries: T[], entryId: string, direction: "up" | "down"): T[] {
  const ordered = [...entries].sort((a, b) => a.slot - b.slot || a.id.localeCompare(b.id))
  const index = ordered.findIndex((entry) => entry.id === entryId)
  if (index < 0) return ordered
  const swapWith = direction === "up" ? index - 1 : index + 1
  if (swapWith < 0 || swapWith >= ordered.length) return ordered
  const next = ordered.map((entry) => ({ ...entry }))
  const current = next[index]
  const other = next[swapWith]
  const slot = current.slot
  current.slot = other.slot
  other.slot = slot
  return next.sort((a, b) => a.slot - b.slot || a.id.localeCompare(b.id))
}
