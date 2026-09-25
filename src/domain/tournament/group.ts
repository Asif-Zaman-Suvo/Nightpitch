import { canManageTeams } from "./team"
import type { TournamentRole, TournamentStatus } from "./access"

export function parseGroupName(name: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const trimmed = typeof name === "string" ? name.trim() : ""
  if (!trimmed || trimmed.length > 40) return { ok: false, error: "Enter a group name of up to 40 characters." }
  return { ok: true, value: trimmed }
}

export function canManageGroups(input: {
  role: TournamentRole | null
  status: TournamentStatus
  deleted: boolean
}): boolean {
  return canManageTeams(input)
}

export function groupDeleteError(assignedTeamCount: number): string | null {
  if (assignedTeamCount === 0) return null
  return "Move every team out of this group before deleting it."
}

export function planAssignment(input: {
  teamFound: boolean
  sameTournament: boolean
  currentGroupId: string | null
  targetGroupId: string
  teamReferenced: boolean
}): { ok: true; kind: "assign" | "move" } | { ok: false; error: string } {
  if (!input.teamFound) return { ok: false, error: "Team not found." }
  if (!input.sameTournament) return { ok: false, error: "That team is not in this tournament." }
  if (input.teamReferenced) {
    return { ok: false, error: "This team is already used in the tournament and cannot be moved." }
  }
  if (input.currentGroupId === input.targetGroupId) {
    return { ok: false, error: "This team is already in that group." }
  }
  return { ok: true, kind: input.currentGroupId ? "move" : "assign" }
}

export function groupSizes(assignments: { teamId: string; groupId: string }[]): Map<string, number> {
  const seen = new Set<string>()
  const sizes = new Map<string, number>()
  for (const assignment of assignments) {
    if (seen.has(assignment.teamId)) {
      throw new Error("A team cannot belong to two groups")
    }
    seen.add(assignment.teamId)
    sizes.set(assignment.groupId, (sizes.get(assignment.groupId) ?? 0) + 1)
  }
  return sizes
}
