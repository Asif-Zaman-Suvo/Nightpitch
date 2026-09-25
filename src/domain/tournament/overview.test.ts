import { describe, expect, it } from "vitest"
import { tournamentSetup, type SetupInput } from "./overview"

function input(overrides: Partial<SetupInput> = {}): SetupInput {
  return {
    teams: 4,
    groups: 1,
    stages: 1,
    entries: 4,
    matches: 6,
    completed: 1,
    status: "draft",
    canGenerateFixtures: true,
    ...overrides,
  }
}

describe("tournamentSetup", () => {
  it("points at the first missing setup step", () => {
    expect(tournamentSetup(input({ teams: 0, groups: 0, stages: 0, entries: 0, matches: 0, completed: 0 })).focus).toBe("teams")
    expect(tournamentSetup(input({ stages: 0, entries: 0, matches: 0, completed: 0 })).focus).toBe("structure")
    expect(tournamentSetup(input({ entries: 0, matches: 0, completed: 0 })).focus).toBe("participants")
    expect(tournamentSetup(input({ matches: 0, completed: 0 })).focus).toBe("fixtures")
    expect(tournamentSetup(input({ completed: 0 })).focus).toBe("results")
    expect(tournamentSetup(input()).focus).toBe("publish")
    expect(tournamentSetup(input({ status: "published" })).focus).toBe("standings")
  })

  it("does not ask for fixtures when the stages cannot use them", () => {
    expect(tournamentSetup(input({ canGenerateFixtures: false, matches: 0, completed: 0 })).focus).toBe("publish")
  })

  it("marks checklist items from the current counts", () => {
    const setup = tournamentSetup(input({ groups: 0, matches: 0, completed: 0, status: "published" }))
    expect(setup.checklist.find((item) => item.id === "teams")?.done).toBe(true)
    expect(setup.checklist.find((item) => item.id === "fixtures")?.done).toBe(false)
    expect(setup.checklist.find((item) => item.id === "publish")?.done).toBe(true)
  })
})