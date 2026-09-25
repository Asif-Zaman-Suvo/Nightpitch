import { describe, expect, it } from "vitest"
import {
  canManageStages,
  parseStageName,
  parseStageType,
  planStageGroupLink,
  reorderStages,
  stageDeleteError,
  stageNameConflict,
  stageTypeChangeError,
  validateStageConfiguration,
} from "./stage"

const open = { status: "draft" as const, deleted: false }

describe("parseStageName", () => {
  it("trims a name and rejects empty or whitespace", () => {
    expect(parseStageName("  Group Stage ")).toEqual({ ok: true, value: "Group Stage" })
    expect(parseStageName("").ok).toBe(false)
    expect(parseStageName("   ").ok).toBe(false)
  })
})

describe("parseStageType", () => {
  it("accepts group, league, and knockout", () => {
    expect(parseStageType("group").ok).toBe(true)
    expect(parseStageType("league").ok).toBe(true)
    expect(parseStageType("knockout").ok).toBe(true)
  })

  it("rejects an unknown type", () => {
    expect(parseStageType("R32").ok).toBe(false)
    expect(parseStageType("quarter").ok).toBe(false)
  })
})

describe("stage names", () => {
  const stages = [
    { id: "s1", tournamentId: "a", name: "Group Stage" },
    { id: "s2", tournamentId: "b", name: "Group Stage" },
  ]

  it("rejects a duplicate name in the same tournament and allows it in another", () => {
    expect(stageNameConflict(stages, { tournamentId: "a", name: " group stage " })).toMatch(/already exists/)
    expect(stageNameConflict(stages, { tournamentId: "c", name: "Group Stage" })).toBeNull()
  })

  it("allows a stage to keep its own name", () => {
    expect(stageNameConflict(stages, { tournamentId: "a", name: "Group Stage", exceptId: "s1" })).toBeNull()
  })
})

describe("canManageStages", () => {
  it("allows the owner and an admin, and denies everyone else", () => {
    expect(canManageStages({ ...open, role: "owner" })).toBe(true)
    expect(canManageStages({ ...open, role: "admin" })).toBe(true)
    expect(canManageStages({ ...open, role: "participant" })).toBe(false)
    expect(canManageStages({ ...open, role: "viewer" })).toBe(false)
    expect(canManageStages({ ...open, role: null })).toBe(false)
    expect(canManageStages({ role: "owner", status: "archived", deleted: false })).toBe(false)
  })
})

describe("reorderStages", () => {
  const stages = [
    { id: "group", position: 1 },
    { id: "knockout", position: 2 },
  ]

  it("swaps neighbors and leaves the ends alone", () => {
    expect(reorderStages(stages, "knockout", "up").map((stage) => stage.id)).toEqual(["knockout", "group"])
    expect(reorderStages(stages, "group", "up")).toEqual(stages)
    expect(reorderStages(stages, "knockout", "down")).toEqual(stages)
  })
})

describe("stage deletion and group links", () => {
  it("refuses deletion when setup still hangs off the stage", () => {
    expect(stageDeleteError({ groups: 0, entries: 0, tieOrders: 0, matches: 0 })).toBeNull()
    expect(stageDeleteError({ groups: 1, entries: 0, tieOrders: 0, matches: 0 })).toMatch(/before deleting/)
    expect(stageDeleteError({ groups: 0, entries: 1, tieOrders: 0, matches: 0 })).toMatch(/before deleting/)
  })

  it("rejects a group from another tournament and a knockout attachment", () => {
    expect(
      planStageGroupLink({
        stageFound: true,
        groupFound: true,
        sameTournament: false,
        stageType: "group",
        alreadyLinked: false,
      }).ok,
    ).toBe(false)
    expect(
      planStageGroupLink({
        stageFound: true,
        groupFound: true,
        sameTournament: true,
        stageType: "knockout",
        alreadyLinked: false,
      }).ok,
    ).toBe(false)
    expect(
      planStageGroupLink({
        stageFound: true,
        groupFound: true,
        sameTournament: true,
        stageType: "group",
        alreadyLinked: false,
      }).ok,
    ).toBe(true)
  })

  it("blocks a knockout conversion while groups are attached", () => {
    expect(stageTypeChangeError({ current: "group", next: "knockout", groups: 2, entries: 0, matches: 0 })).toMatch(/Detach/)
    expect(stageTypeChangeError({ current: "group", next: "knockout", groups: 0, entries: 0, matches: 0 })).toBeNull()
  })

  it("rejects a type change after participants or matches exist", () => {
    expect(stageTypeChangeError({ current: "group", next: "league", groups: 0, entries: 1, matches: 0 })).toMatch(/participants/)
    expect(stageTypeChangeError({ current: "league", next: "knockout", groups: 0, entries: 0, matches: 1 })).toMatch(/matches/)
    expect(stageTypeChangeError({ current: "group", next: "group", groups: 1, entries: 4, matches: 2 })).toBeNull()
  })
})

describe("validateStageConfiguration", () => {
  const tournamentId = "tour"

  it("accepts a group stage, a league stage, and a knockout stage", () => {
    expect(validateStageConfiguration({
      tournamentId,
      stageType: "group",
      groups: [{ id: "g", tournamentId }],
      entries: [{ teamId: "a", tournamentId, stageGroupId: "g" }],
    })).toBeNull()
    expect(validateStageConfiguration({
      tournamentId,
      stageType: "league",
      groups: [{ id: "g", tournamentId }],
      entries: [{ teamId: "a", tournamentId, stageGroupId: "g" }, { teamId: "b", tournamentId, stageGroupId: "g" }],
    })).toBeNull()
    expect(validateStageConfiguration({
      tournamentId,
      stageType: "knockout",
      groups: [],
      entries: [{ teamId: "a", tournamentId, stageGroupId: null }],
    })).toBeNull()
  })

  it("rejects a foreign group, a duplicate attachment, and a knockout group", () => {
    expect(validateStageConfiguration({
      tournamentId,
      stageType: "group",
      groups: [{ id: "g", tournamentId: "other" }],
      entries: [],
    })).toMatch(/not in this tournament/)
    expect(validateStageConfiguration({
      tournamentId,
      stageType: "league",
      groups: [{ id: "g", tournamentId }, { id: "g", tournamentId }],
      entries: [],
    })).toMatch(/already attached/)
    expect(validateStageConfiguration({
      tournamentId,
      stageType: "knockout",
      groups: [{ id: "g", tournamentId }],
      entries: [],
    })).toMatch(/cannot use groups/)
  })

  it("rejects a duplicate team in one stage and allows that team in the check for another stage", () => {
    expect(validateStageConfiguration({
      tournamentId,
      stageType: "knockout",
      groups: [],
      entries: [
        { teamId: "a", tournamentId, stageGroupId: null },
        { teamId: "a", tournamentId, stageGroupId: null },
      ],
    })).toMatch(/already in this stage/)
    expect(validateStageConfiguration({
      tournamentId,
      stageType: "knockout",
      groups: [],
      entries: [{ teamId: "a", tournamentId, stageGroupId: null }],
    })).toBeNull()
  })

  it("rejects a team from another tournament and duplicate positions", () => {
    expect(validateStageConfiguration({
      tournamentId,
      stageType: "knockout",
      groups: [],
      entries: [{ teamId: "a", tournamentId: "other", stageGroupId: null }],
    })).toMatch(/not in this tournament/)
    expect(validateStageConfiguration({
      tournamentId,
      stageType: "group",
      groups: [],
      entries: [],
      positions: [1, 1],
    })).toMatch(/unique/)
  })
})

describe("configuration shapes", () => {
  it("allows one knockout stage for 10 teams", () => {
    const stages = [{ id: "k", name: "Knockout", type: "knockout" as const, position: 1, teamCount: 10 }]
    expect(stages).toHaveLength(1)
    expect(stages[0].type).toBe("knockout")
    expect(planStageGroupLink({
      stageFound: true,
      groupFound: true,
      sameTournament: true,
      stageType: stages[0].type,
      alreadyLinked: false,
    }).ok).toBe(false)
  })

  it("allows one group stage for 12 teams", () => {
    const stages = [{ id: "g", name: "Groups", type: "group" as const, position: 1 }]
    expect(reorderStages(stages, "g", "down")).toEqual(stages)
    expect(parseStageType(stages[0].type).ok).toBe(true)
  })

  it("orders a group stage before a knockout stage for 36 teams", () => {
    const stages = [
      { id: "g", position: 1, type: "group" as const },
      { id: "k", position: 2, type: "knockout" as const },
    ]
    expect(reorderStages(stages, "k", "down").map((stage) => stage.position)).toEqual([1, 2])
    expect(reorderStages(stages, "k", "up")[0].id).toBe("k")
  })
})
