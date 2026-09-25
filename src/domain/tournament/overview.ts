import type { TournamentStatus } from "./access"

export type SetupFocus = "teams" | "structure" | "participants" | "fixtures" | "results" | "standings" | "publish"

export interface SetupInput {
  teams: number
  groups: number
  stages: number
  entries: number
  matches: number
  completed: number
  status: TournamentStatus
  canGenerateFixtures: boolean
}

export function tournamentSetup(input: SetupInput): {
  focus: SetupFocus | null
  checklist: { id: SetupFocus; label: string; done: boolean }[]
} {
  const checklist: { id: SetupFocus; label: string; done: boolean }[] = [
    { id: "teams", label: "Add teams", done: input.teams > 0 },
    { id: "structure", label: "Configure groups and stages", done: input.stages > 0 },
    { id: "participants", label: "Add stage participants", done: input.entries > 0 },
    { id: "fixtures", label: "Create fixtures", done: input.matches > 0 },
    { id: "results", label: "Enter match results", done: input.completed > 0 },
    { id: "publish", label: "Publish tournament", done: input.status !== "draft" },
  ]

  let focus: SetupFocus | null = null
  if (input.teams === 0) focus = "teams"
  else if (input.stages === 0) focus = "structure"
  else if (input.entries === 0) focus = "participants"
  else if (input.canGenerateFixtures && input.matches === 0) focus = "fixtures"
  else if (input.matches > 0 && input.completed === 0) focus = "results"
  else if (input.status === "draft") focus = "publish"
  else if (input.completed > 0) focus = "standings"

  return { focus, checklist }
}
