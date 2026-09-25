import { describe, expect, it } from "vitest"
import { canManageGroups, groupDeleteError, groupSizes, parseGroupName, planAssignment } from "./group"

const open = { status: "draft" as const, deleted: false }

describe("parseGroupName", () => {
  it("trims a group name and rejects an empty one", () => {
    expect(parseGroupName("  Group A ")).toEqual({ ok: true, value: "Group A" })
    expect(parseGroupName("   ").ok).toBe(false)
  })
})

describe("canManageGroups", () => {
  it("allows the owner and an admin, and denies everyone else", () => {
    expect(canManageGroups({ ...open, role: "owner" })).toBe(true)
    expect(canManageGroups({ ...open, role: "admin" })).toBe(true)
    expect(canManageGroups({ ...open, role: "participant" })).toBe(false)
    expect(canManageGroups({ ...open, role: "viewer" })).toBe(false)
    expect(canManageGroups({ ...open, role: null })).toBe(false)
  })
})

describe("group deletion and assignment", () => {
  it("refuses to delete a group that still has teams", () => {
    expect(groupDeleteError(0)).toBeNull()
    expect(groupDeleteError(2)).toMatch(/Move every team/)
  })

  it("assigns, moves, and rejects a team from another tournament or one already used", () => {
    expect(
      planAssignment({
        teamFound: true,
        sameTournament: true,
        currentGroupId: null,
        targetGroupId: "g1",
        teamReferenced: false,
      }).ok,
    ).toBe(true)
    expect(
      planAssignment({
        teamFound: true,
        sameTournament: true,
        currentGroupId: "g1",
        targetGroupId: "g2",
        teamReferenced: false,
      }),
    ).toMatchObject({ ok: true, kind: "move" })
    expect(
      planAssignment({
        teamFound: false,
        sameTournament: false,
        currentGroupId: null,
        targetGroupId: "g1",
        teamReferenced: false,
      }).ok,
    ).toBe(false)
    expect(
      planAssignment({
        teamFound: true,
        sameTournament: false,
        currentGroupId: null,
        targetGroupId: "g1",
        teamReferenced: false,
      }).ok,
    ).toBe(false)
    expect(
      planAssignment({
        teamFound: true,
        sameTournament: true,
        currentGroupId: "g1",
        targetGroupId: "g2",
        teamReferenced: true,
      }).ok,
    ).toBe(false)
  })
})

describe("uneven groups", () => {
  it("allows 36 teams in 6 groups and 5 teams split 3 and 2", () => {
    const six = Array.from({ length: 36 }, (_, index) => ({
      teamId: `t${index}`,
      groupId: `g${index % 6}`,
    }))
    expect([...groupSizes(six).values()].sort()).toEqual([6, 6, 6, 6, 6, 6])

    const uneven = [
      ...["a", "b", "c"].map((teamId) => ({ teamId, groupId: "ga" })),
      ...["d", "e"].map((teamId) => ({ teamId, groupId: "gb" })),
    ]
    expect(groupSizes(uneven).get("ga")).toBe(3)
    expect(groupSizes(uneven).get("gb")).toBe(2)
  })

  it("rejects a team placed in two groups", () => {
    expect(() =>
      groupSizes([
        { teamId: "t1", groupId: "ga" },
        { teamId: "t1", groupId: "gb" },
      ]),
    ).toThrow(/two groups/)
  })
})
