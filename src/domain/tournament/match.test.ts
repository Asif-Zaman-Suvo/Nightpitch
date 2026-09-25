import { describe, expect, it } from "vitest"
import {
  canManageMatches,
  isRematchDuplicate,
  matchDeleteError,
  parseScore,
  parseSchedule,
  sameTeamScheduleConflict,
  planMatch,
  planStatusChange,
  type MatchSide,
} from "./match"

const open = { status: "draft" as const, deleted: false }
const tournament = "tour"
const stage = "stage"

function side(entryId: string, stageGroupId: string | null = null, stageId = stage): MatchSide {
  return { entryId, stageId, tournamentId: tournament, stageGroupId }
}

describe("planMatch", () => {
  it("accepts two different participants", () => {
    expect(
      planMatch({
        stageFound: true,
        stageId: stage,
        stageType: "knockout",
        stageTournamentId: tournament,
        stageGroupId: null,
        first: side("a"),
        second: side("b"),
      }),
    ).toEqual({ ok: true, stageGroupId: null })
  })

  it("requires two different participants from the same stage and tournament", () => {
    expect(planMatch({
      stageFound: true,
      stageId: stage,
      stageType: "knockout",
      stageTournamentId: tournament,
      stageGroupId: null,
      first: side("a"),
      second: null,
    }).ok).toBe(false)
    expect(planMatch({
      stageFound: true,
      stageId: stage,
      stageType: "knockout",
      stageTournamentId: tournament,
      stageGroupId: null,
      first: side("a"),
      second: side("a"),
    }).ok).toBe(false)
    expect(planMatch({
      stageFound: true,
      stageId: stage,
      stageType: "knockout",
      stageTournamentId: tournament,
      stageGroupId: null,
      first: side("a"),
      second: side("b", null, "other-stage"),
    }).ok).toBe(false)
    expect(planMatch({
      stageFound: true,
      stageId: stage,
      stageType: "knockout",
      stageTournamentId: tournament,
      stageGroupId: null,
      first: side("a"),
      second: { ...side("b"), tournamentId: "other" },
    }).ok).toBe(false)
  })

  it("keeps a group match inside one group and leaves knockout ungrouped", () => {
    expect(
      planMatch({
        stageFound: true,
        stageId: stage,
        stageType: "group",
        stageTournamentId: tournament,
        stageGroupId: "alpha",
        first: side("a", "alpha"),
        second: side("b", "alpha"),
      }),
    ).toEqual({ ok: true, stageGroupId: "alpha" })
    expect(
      planMatch({
        stageFound: true,
        stageId: stage,
        stageType: "group",
        stageTournamentId: tournament,
        stageGroupId: "alpha",
        first: side("a", "alpha"),
        second: side("c", "beta"),
      }).ok,
    ).toBe(false)
    expect(
      planMatch({
        stageFound: true,
        stageId: stage,
        stageType: "knockout",
        stageTournamentId: tournament,
        stageGroupId: "alpha",
        first: side("a"),
        second: side("b"),
      }).ok,
    ).toBe(false)
  })
})

describe("duplicates and scores", () => {
  const existing = [{ stageId: stage, round: 1, entryIds: ["a", "b"] as [string, string] }]

  it("blocks the same pairing in the same round and allows another round", () => {
    expect(isRematchDuplicate(existing, { stageId: stage, round: 1, entryIds: ["b", "a"] })).toBe(true)
    expect(isRematchDuplicate(existing, { stageId: stage, round: 2, entryIds: ["a", "b"] })).toBe(false)
  })

  it("accepts a draw and rejects bad scores", () => {
    expect(parseScore("0")).toEqual({ ok: true, value: 0 })
    expect(parseScore("2")).toEqual({ ok: true, value: 2 })
    expect(parseScore("-1").ok).toBe(false)
    expect(parseScore("1.5").ok).toBe(false)
    expect(parseScore("").ok).toBe(false)
  })
})

describe("parseSchedule", () => {
  it("accepts an empty schedule and a valid date and time", () => {
    expect(parseSchedule({ date: "", time: "" })).toEqual({ ok: true, value: null })
    expect(parseSchedule({ date: "2026-10-05", time: "18:30" }).ok).toBe(true)
  })

  it("rejects a partial or impossible schedule", () => {
    expect(parseSchedule({ date: "2026-10-05", time: "" }).ok).toBe(false)
    expect(parseSchedule({ date: "2026-13-40", time: "18:30" }).ok).toBe(false)
    expect(parseSchedule({ date: "2026-02-31", time: "18:30" }).ok).toBe(false)
    expect(parseSchedule({ date: "2026-10-05", time: "25:00" }).ok).toBe(false)
  })

  it("blocks the same team at the same kickoff", () => {
    const startsAt = "2026-10-05T12:30:00.000Z"
    const existing = [{ id: "m1", startsAt, status: "scheduled" as const, entryIds: ["a", "b"] }]
    expect(sameTeamScheduleConflict(existing, { id: "m2", startsAt, entryIds: ["b", "c"] })).toBe(true)
    expect(sameTeamScheduleConflict(existing, { id: "m2", startsAt, entryIds: ["c", "d"] })).toBe(false)
    expect(sameTeamScheduleConflict([{ ...existing[0], status: "cancelled" }], { id: "m2", startsAt, entryIds: ["a", "c"] })).toBe(false)
  })
})

describe("lifecycle", () => {
  it("completes a scheduled match only when both scores exist", () => {
    expect(planStatusChange({ from: "scheduled", to: "completed", scores: [2, 1] }).ok).toBe(true)
    expect(planStatusChange({ from: "scheduled", to: "completed", scores: [1, 1] }).ok).toBe(true)
    expect(planStatusChange({ from: "scheduled", to: "completed", scores: [1, null] }).ok).toBe(false)
    expect(planStatusChange({ from: "scheduled", to: "cancelled", scores: [null, null] }).ok).toBe(true)
    expect(planStatusChange({ from: "cancelled", to: "completed", scores: [1, 0] }).ok).toBe(false)
    expect(planStatusChange({ from: "cancelled", to: "scheduled", scores: [null, null] }).ok).toBe(true)
    expect(planStatusChange({ from: "completed", to: "completed", scores: [3, 3] }).ok).toBe(true)
    expect(planStatusChange({ from: "completed", to: "cancelled", scores: [1, 0] }).ok).toBe(false)
  })

  it("refuses to delete a completed or referenced match", () => {
    expect(matchDeleteError("scheduled", false)).toBeNull()
    expect(matchDeleteError("completed", false)).toMatch(/cannot be deleted/)
    expect(matchDeleteError("scheduled", true)).toMatch(/cannot be removed/)
  })
})

describe("canManageMatches", () => {
  it("allows the owner and an admin, and denies everyone else", () => {
    expect(canManageMatches({ ...open, role: "owner" })).toBe(true)
    expect(canManageMatches({ ...open, role: "admin" })).toBe(true)
    expect(canManageMatches({ ...open, role: "participant" })).toBe(false)
    expect(canManageMatches({ ...open, role: "viewer" })).toBe(false)
    expect(canManageMatches({ ...open, role: null })).toBe(false)
    expect(canManageMatches({ role: "owner", status: "archived", deleted: false })).toBe(false)
  })
})

describe("scale shapes", () => {
  it("records several matches inside six groups without generating a fixture list", () => {
    const plans = Array.from({ length: 6 }, (_, group) =>
      planMatch({
        stageFound: true,
        stageId: stage,
        stageType: "group",
        stageTournamentId: tournament,
        stageGroupId: `g${group}`,
        first: side(`t${group}a`, `g${group}`),
        second: side(`t${group}b`, `g${group}`),
      }),
    )
    expect(plans.every((plan) => plan.ok)).toBe(true)
    expect(plans).toHaveLength(6)
  })

  it("records a knockout pairing with no group", () => {
    const plan = planMatch({
      stageFound: true,
      stageId: stage,
      stageType: "knockout",
      stageTournamentId: tournament,
      stageGroupId: null,
      first: side("k1"),
      second: side("k2"),
    })
    expect(plan).toEqual({ ok: true, stageGroupId: null })
  })
})
