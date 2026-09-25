import { describe, expect, it } from "vitest"
import { canManageStageEntries, entryRemoveError, planAddEntry, reorderEntries } from "./stage-entry"
import type { StageType } from "./stage"

const open = { status: "draft" as const, deleted: false }

function add(input: Partial<Parameters<typeof planAddEntry>[0]> = {}) {
  return planAddEntry({
    stageFound: true,
    teamFound: true,
    sameTournament: true,
    stageType: "knockout",
    alreadyInStage: false,
    setupGroupId: null,
    attachedStageGroupId: null,
    ...input,
  })
}

describe("planAddEntry", () => {
  it("adds a team and rejects a duplicate in the same stage", () => {
    expect(add()).toEqual({ ok: true, stageGroupId: null })
    expect(add({ alreadyInStage: true }).ok).toBe(false)
  })

  it("rejects a team or stage from another tournament", () => {
    expect(add({ sameTournament: false }).ok).toBe(false)
    expect(add({ stageFound: false }).ok).toBe(false)
    expect(add({ teamFound: false }).ok).toBe(false)
    expect(
      add({
        stageType: "group",
        setupGroupId: "group-b",
        attachedStageGroupId: null,
      }).ok,
    ).toBe(false)
  })

  it("allows the same team in a later stage", () => {
    const group = add({ stageType: "group", setupGroupId: "g", attachedStageGroupId: "sg" })
    const knockout = add({ stageType: "knockout", alreadyInStage: false })
    expect(group).toEqual({ ok: true, stageGroupId: "sg" })
    expect(knockout).toEqual({ ok: true, stageGroupId: null })
  })

  it("accepts a team in an attached group and rejects one that is not", () => {
    expect(add({ stageType: "group", setupGroupId: "g1", attachedStageGroupId: "sg1" }).ok).toBe(true)
    expect(add({ stageType: "group", setupGroupId: null, attachedStageGroupId: null }).ok).toBe(false)
    expect(add({ stageType: "league", setupGroupId: "g1", attachedStageGroupId: "sg1" }).ok).toBe(true)
  })
})

describe("canManageStageEntries", () => {
  it("allows the owner and an admin, and denies everyone else", () => {
    expect(canManageStageEntries({ ...open, role: "owner" })).toBe(true)
    expect(canManageStageEntries({ ...open, role: "admin" })).toBe(true)
    expect(canManageStageEntries({ ...open, role: "participant" })).toBe(false)
    expect(canManageStageEntries({ ...open, role: "viewer" })).toBe(false)
    expect(canManageStageEntries({ ...open, role: null })).toBe(false)
  })
})

describe("removal and order", () => {
  it("refuses to remove an entry that is already referenced", () => {
    expect(entryRemoveError(false)).toBeNull()
    expect(entryRemoveError(true)).toMatch(/cannot be removed/)
  })

  it("swaps slots and leaves the ends alone", () => {
    const entries = [
      { id: "a", slot: 1 },
      { id: "b", slot: 2 },
    ]
    expect(reorderEntries(entries, "b", "up").map((entry) => entry.id)).toEqual(["b", "a"])
    expect(reorderEntries(entries, "a", "up")).toEqual(entries)
    expect(reorderEntries(entries, "b", "down")).toEqual(entries)
  })
})

describe("configuration shapes", () => {
  function fill(stageType: StageType, teams: { id: string; groupId: string | null; stageGroupId: string | null }[]) {
    return teams.map((team) =>
      planAddEntry({
        stageFound: true,
        teamFound: true,
        sameTournament: true,
        stageType,
        alreadyInStage: false,
        setupGroupId: team.groupId,
        attachedStageGroupId: team.stageGroupId,
      }),
    )
  }

  it("adds 10 teams to a knockout stage without a bracket", () => {
    const teams = Array.from({ length: 10 }, (_, index) => ({
      id: `t${index}`,
      groupId: null,
      stageGroupId: null,
    }))
    const plans = fill("knockout", teams)
    expect(plans.every((plan) => plan.ok && plan.stageGroupId === null)).toBe(true)
    expect(plans).toHaveLength(10)
  })

  it("allows uneven groups, such as 3 and 2", () => {
    const teams = [
      ...Array.from({ length: 3 }, (_, index) => ({ id: `a${index}`, groupId: "ga", stageGroupId: "sga" })),
      ...Array.from({ length: 2 }, (_, index) => ({ id: `b${index}`, groupId: "gb", stageGroupId: "sgb" })),
    ]
    const plans = fill("group", teams)
    expect(plans.every((plan) => plan.ok)).toBe(true)
    expect(plans.filter((plan) => plan.ok && plan.stageGroupId === "sga")).toHaveLength(3)
    expect(plans.filter((plan) => plan.ok && plan.stageGroupId === "sgb")).toHaveLength(2)
  })

  it("adds 12 teams through one group stage", () => {
    const teams = Array.from({ length: 12 }, (_, index) => ({
      id: `t${index}`,
      groupId: "g",
      stageGroupId: "sg",
    }))
    expect(fill("group", teams).every((plan) => plan.ok)).toBe(true)
  })

  it("adds 36 teams across 6 uneven-capable groups", () => {
    const teams = Array.from({ length: 36 }, (_, index) => {
      const group = index % 6
      return { id: `t${index}`, groupId: `g${group}`, stageGroupId: `sg${group}` }
    })
    const plans = fill("group", teams)
    expect(plans.filter((plan) => plan.ok)).toHaveLength(36)
    const byGroup = new Map<string, number>()
    for (const plan of plans) {
      if (!plan.ok || !plan.stageGroupId) continue
      byGroup.set(plan.stageGroupId, (byGroup.get(plan.stageGroupId) ?? 0) + 1)
    }
    expect(byGroup.size).toBe(6)
  })

  it("keeps group-stage entries and later knockout entries separate", () => {
    const team = { id: "t1", groupId: "g1", stageGroupId: "sg1" }
    expect(fill("group", [team])[0]).toEqual({ ok: true, stageGroupId: "sg1" })
    expect(fill("knockout", [{ ...team, groupId: null, stageGroupId: null }])[0]).toEqual({
      ok: true,
      stageGroupId: null,
    })
  })
})
