import { beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
vi.mock("next/navigation", () => ({ redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`) }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/src/server/auth/session", () => ({ requireUser: vi.fn() }))
vi.mock("@/src/server/tournaments/repository", () => ({ findTournament: vi.fn() }))
vi.mock("@/src/server/stages/repository", async (original) => ({
  ...await original<typeof import("./repository")>(), findStage: vi.fn(), updateQualificationRules: vi.fn(),
}))
vi.mock("./apply-qualification", () => ({ applyQualification: vi.fn() }))
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireUser } from "@/src/server/auth/session"
import { findTournament } from "@/src/server/tournaments/repository"
import { findStage, updateQualificationRules, StageConstraintError } from "./repository"
import { applyQualification } from "./apply-qualification"
import { applyQualificationAction, updateQualificationRulesAction } from "./actions"

const group = "10000000-0000-4000-8000-000000000004"
const configuration = { schemaVersion: "1" as const, rules: [{ type: "group_top_n" as const, sourceGroupId: group, count: 2 }] }
const legacy = { schemaVersion: "1", standings: { winPoints: 3, drawPoints: 1, lossPoints: 0,
  tieBreakers: ["points", "goalDifference", "goalsScored", "teamName"] } }
function form() {
  const data = new FormData()
  data.set("publicId", "ABCD1234"); data.set("stageId", "stage")
  data.append("sourceGroupId", group); data.append("count", "2")
  return data
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireUser).mockResolvedValue({ id: "owner", email: "owner@example.test", displayName: "Owner" })
  vi.mocked(findTournament).mockResolvedValue({ id: "tournament", ownerId: "owner", status: "draft", deletedAt: null } as NonNullable<Awaited<ReturnType<typeof findTournament>>>)
  vi.mocked(findStage).mockResolvedValue({ id: "stage", tournamentId: "tournament", name: "Final", position: 2, stageType: "knockout", rules: legacy, groups: [] })
  vi.mocked(updateQualificationRules).mockResolvedValue(undefined)
})

describe("updateQualificationRulesAction", () => {
  it("accepts the form rule and refreshes the stages page", async () => {
    await expect(updateQualificationRulesAction({}, form())).rejects.toThrow("redirect:/t/ABCD1234/manage/stages")
    expect(updateQualificationRules).toHaveBeenCalledWith({ tournamentId: "tournament", stageId: "stage", actorId: "owner", qualification: configuration })
    expect(revalidatePath).toHaveBeenCalledWith("/t/ABCD1234/manage/stages")
    expect(revalidatePath).toHaveBeenCalledWith("/t/ABCD1234/manage/standings")
    expect(revalidatePath).toHaveBeenCalledWith("/t/ABCD1234")
  })
  it("rejects nonowners and completed tournaments", async () => {
    vi.mocked(requireUser).mockResolvedValue({ id: "other", email: "", displayName: "" })
    expect(await updateQualificationRulesAction({}, form())).toHaveProperty("error", "You cannot change stages in this tournament.")
    vi.mocked(requireUser).mockResolvedValue({ id: "owner", email: "", displayName: "" })
    vi.mocked(findTournament).mockResolvedValue({ id: "tournament", ownerId: "owner", status: "completed", deletedAt: null } as NonNullable<Awaited<ReturnType<typeof findTournament>>>)
    expect(await updateQualificationRulesAction({}, form())).toHaveProperty("error", "A completed tournament cannot be changed.")
    expect(updateQualificationRules).not.toHaveBeenCalled()
  })
  it("rejects invalid source, count, and duplicate rules", async () => {
    for (const values of [["bad", "2"], [group, "0"], [group, "1.5"]]) {
      const data = form(); data.set("sourceGroupId", values[0]); data.set("count", values[1])
      expect(await updateQualificationRulesAction({}, data)).toHaveProperty("error")
    }
    const data = form(); data.append("sourceGroupId", group); data.append("count", "1")
    expect(await updateQualificationRulesAction({}, data)).toHaveProperty("error")
    expect(updateQualificationRules).not.toHaveBeenCalled()
  })
  it("returns transaction-time source and completed errors", async () => {
    vi.mocked(updateQualificationRules).mockRejectedValue(new StageConstraintError("Source group not found in this tournament."))
    expect(await updateQualificationRulesAction({}, form())).toHaveProperty("error", "Source group not found in this tournament.")
  })
})

describe("applyQualificationAction", () => {
  function request() {
    const data = new FormData()
    data.set("publicId", "ABCD1234")
    data.set("stageId", "stage")
    return data
  }
  it("applies for the owner and refreshes the stages page", async () => {
    vi.mocked(applyQualification).mockResolvedValue({ status: "applied", created: ["entry"], updated: [], removed: [] })
    await expect(applyQualificationAction({}, request())).rejects.toThrow("redirect:/t/ABCD1234/manage/stages?applied=1")
    expect(applyQualification).toHaveBeenCalledWith({ tournamentId: "tournament", stageId: "stage", actorId: "owner" })
    expect(revalidatePath).toHaveBeenCalledWith("/t/ABCD1234/manage/stages")
    expect(redirect).toHaveBeenCalledWith("/t/ABCD1234/manage/stages?applied=1")
  })
  it("reports an unchanged result without treating it as a new application", async () => {
    vi.mocked(applyQualification).mockResolvedValue({ status: "unchanged", created: [], updated: [], removed: [] })
    await expect(applyQualificationAction({}, request())).rejects.toThrow("redirect:/t/ABCD1234/manage/stages?applied=0")
  })
  it("rejects non-owners, completed tournaments, and failed qualification", async () => {
    vi.mocked(requireUser).mockResolvedValue({ id: "other", email: "", displayName: "" })
    expect(await applyQualificationAction({}, request())).toHaveProperty("error", "You cannot change stages in this tournament.")
    vi.mocked(requireUser).mockResolvedValue({ id: "owner", email: "", displayName: "" })
    vi.mocked(findTournament).mockResolvedValue({ id: "tournament", ownerId: "owner", status: "completed", deletedAt: null } as NonNullable<Awaited<ReturnType<typeof findTournament>>>)
    expect(await applyQualificationAction({}, request())).toHaveProperty("error", "A completed tournament cannot be changed.")
    vi.mocked(findTournament).mockResolvedValue({ id: "tournament", ownerId: "owner", status: "draft", deletedAt: null } as NonNullable<Awaited<ReturnType<typeof findTournament>>>)
    vi.mocked(applyQualification).mockRejectedValue(new StageConstraintError("Alpha qualifies more than once."))
    expect(await applyQualificationAction({}, request())).toHaveProperty("error", "Alpha qualifies more than once.")
    expect(applyQualification).toHaveBeenCalledTimes(1)
  })
})
