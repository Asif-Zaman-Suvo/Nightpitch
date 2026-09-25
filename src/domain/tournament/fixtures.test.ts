import { describe, expect, it } from "vitest"
import { calculateStandings } from "./standings"
import { generateRoundRobinFixtures, planRoundRobinFixtures, roundRobinCount } from "./fixtures"

const teams = ["a", "b", "c", "d"]

describe("generateRoundRobinFixtures", () => {
  it("pairs two and three participants once", () => {
    expect(generateRoundRobinFixtures(["a", "b"])).toEqual([["a", "b"]])
    expect(generateRoundRobinFixtures(["a", "b", "c"])).toEqual([
      ["a", "b"],
      ["a", "c"],
      ["b", "c"],
    ])
  })

  it("creates six fixtures for four participants", () => {
    expect(generateRoundRobinFixtures(teams)).toHaveLength(6)
    expect(roundRobinCount(4)).toBe(6)
    expect(roundRobinCount(8)).toBe(28)
    expect(roundRobinCount(1)).toBe(0)
  })

  it("keeps the same pairing order for the same participant order", () => {
    expect(generateRoundRobinFixtures(teams)).toEqual(generateRoundRobinFixtures(teams))
  })
})

describe("planRoundRobinFixtures", () => {
  it("keeps groups separate", () => {
    const plan = planRoundRobinFixtures({
      stageType: "group",
      groups: [
        { id: "ga", name: "Group A" },
        { id: "gb", name: "Group B" },
      ],
      entries: [
        { id: "a1", stageGroupId: "ga" },
        { id: "a2", stageGroupId: "ga" },
        { id: "b1", stageGroupId: "gb" },
        { id: "b2", stageGroupId: "gb" },
      ],
      existing: [],
    })
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.fixtures).toEqual([
      { stageGroupId: "ga", entryIds: ["a1", "a2"] },
      { stageGroupId: "gb", entryIds: ["b1", "b2"] },
    ])
  })

  it("pairs every league participant once", () => {
    const plan = planRoundRobinFixtures({
      stageType: "league",
      groups: [{ id: "g", name: "Unused" }],
      entries: teams.map((id) => ({ id, stageGroupId: "g" })),
      existing: [],
    })
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.fixtures).toHaveLength(6)
    expect(plan.fixtures.every((fixture) => fixture.stageGroupId === null)).toBe(true)
  })

  it("creates nothing when every pairing already exists", () => {
    const plan = planRoundRobinFixtures({
      stageType: "group",
      groups: [{ id: "ga", name: "Group A" }],
      entries: [
        { id: "a", stageGroupId: "ga" },
        { id: "b", stageGroupId: "ga" },
      ],
      existing: [{ stageGroupId: "ga", entryIds: ["b", "a"] }],
    })
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.fixtures).toEqual([])
    expect(plan.summaries[0]).toMatchObject({ existing: 1, missing: 0 })
  })

  it("creates only the missing pairing", () => {
    const plan = planRoundRobinFixtures({
      stageType: "group",
      groups: [{ id: "ga", name: "Group A" }],
      entries: ["a", "b", "c"].map((id) => ({ id, stageGroupId: "ga" })),
      existing: [{ stageGroupId: "ga", entryIds: ["a", "b"] }],
    })
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.fixtures.map((fixture) => fixture.entryIds)).toEqual([
      ["a", "c"],
      ["b", "c"],
    ])
  })

  it("rejects a knockout stage and a stage with fewer than two participants", () => {
    expect(planRoundRobinFixtures({
      stageType: "knockout",
      groups: [],
      entries: [
        { id: "a", stageGroupId: null },
        { id: "b", stageGroupId: null },
      ],
      existing: [],
    }).ok).toBe(false)
    expect(planRoundRobinFixtures({
      stageType: "knockout",
      groups: [],
      entries: [],
      existing: [],
    })).toMatchObject({ error: "Automatic round-robin fixtures are only available for group and league stages." })
    expect(planRoundRobinFixtures({
      stageType: "league",
      groups: [],
      entries: [{ id: "a", stageGroupId: null }],
      existing: [],
    })).toMatchObject({ error: "At least 2 participants are required to generate fixtures." })
  })

  it("does not count a scheduled generated fixture in standings", () => {
    const table = calculateStandings({
      stage: { id: "stage", stageType: "group", standings: { enabled: true, scoring: { win: 3, draw: 1, loss: 0 } } },
      stageGroups: [{ id: "ga", stageId: "stage", name: "Group A" }],
      stageEntries: [
        { id: "a", stageId: "stage", stageGroupId: "ga", teamId: "ta", name: "A" },
        { id: "b", stageId: "stage", stageGroupId: "ga", teamId: "tb", name: "B" },
      ],
      matches: [{ id: "m", stageId: "stage", stageGroupId: "ga", status: "scheduled" }],
      matchParticipants: [
        { matchId: "m", entryId: "a", score: null },
        { matchId: "m", entryId: "b", score: null },
      ],
    })
    expect(table.kind).toBe("groups")
    if (table.kind !== "groups") return
    expect(table.groups[0].rows.every((row) => row.played === 0 && row.points === 0)).toBe(true)
  })
})
