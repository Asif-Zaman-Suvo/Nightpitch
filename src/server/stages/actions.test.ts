import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("next/navigation", () => ({ redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`) }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/src/server/auth/session", () => ({ requireUser: vi.fn() }))
vi.mock("@/src/server/tournaments/repository", () => ({ findTournament: vi.fn() }))
vi.mock("@/src/server/stages/repository", async (original) => ({
  ...await original<typeof import("./repository")>(), findStage: vi.fn(), updateStageRules: vi.fn(),
}))

import { revalidatePath } from "next/cache"
import { requireUser } from "@/src/server/auth/session"
import { findTournament } from "@/src/server/tournaments/repository"
import { findStage, updateStageRules, StageConstraintError } from "./repository"
import { updateStageRulesAction } from "./actions"

function form() {
  const data = new FormData()
  for (const [key, value] of Object.entries({ publicId: "ABCD1234", stageId: "stage", win: "5", draw: "2", loss: "0" })) data.set(key, value)
  for (const rule of ["points", "goalsScored", "goalDifference", "teamName"]) data.append("tieBreakers", rule)
  return data
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireUser).mockResolvedValue({ id: "owner", email: "owner@example.test", displayName: "Owner" })
  vi.mocked(findTournament).mockResolvedValue({ id: "tournament", ownerId: "owner", status: "draft", deletedAt: null } as NonNullable<Awaited<ReturnType<typeof findTournament>>>)
  vi.mocked(findStage).mockResolvedValue({ id: "stage", tournamentId: "tournament", name: "Group", position: 1, stageType: "group", rules: { schemaVersion: "1" }, groups: [] })
  vi.mocked(updateStageRules).mockResolvedValue(undefined)
})

describe("updateStageRulesAction", () => {
  it("saves validated numeric configuration in the exact submitted order and refreshes both views", async () => {
    await expect(updateStageRulesAction({}, form())).rejects.toThrow("redirect:/t/ABCD1234/manage/stages")
    expect(updateStageRules).toHaveBeenCalledWith({ tournamentId: "tournament", stageId: "stage", actorId: "owner", rules: {
      schemaVersion: "1", standings: { winPoints: 5, drawPoints: 2, lossPoints: 0, tieBreakers: ["points", "goalsScored", "goalDifference", "teamName"] },
    } })
    expect(revalidatePath).toHaveBeenCalledWith("/t/ABCD1234/manage/standings")
    expect(revalidatePath).toHaveBeenCalledWith("/t/ABCD1234")
  })

  it("requires authentication", async () => {
    vi.mocked(requireUser).mockRejectedValue(new Error("You need to sign in"))
    await expect(updateStageRulesAction({}, form())).rejects.toThrow("sign in")
    expect(updateStageRules).not.toHaveBeenCalled()
  })

  it("rejects non-owners using the existing authorization boundary", async () => {
    vi.mocked(requireUser).mockResolvedValue({ id: "stranger", email: "", displayName: "" })
    expect(await updateStageRulesAction({}, form())).toHaveProperty("error", "You cannot change stages in this tournament.")
    expect(updateStageRules).not.toHaveBeenCalled()
  })

  it("rejects completed tournaments", async () => {
    vi.mocked(findTournament).mockResolvedValue({ id: "tournament", ownerId: "owner", status: "completed", deletedAt: null } as NonNullable<Awaited<ReturnType<typeof findTournament>>>)
    expect(await updateStageRulesAction({}, form())).toHaveProperty("error", "A completed tournament cannot be changed.")
    expect(updateStageRules).not.toHaveBeenCalled()
  })

  it("rejects knockout configuration", async () => {
    vi.mocked(findStage).mockResolvedValue({ id: "stage", tournamentId: "tournament", name: "Final", position: 1, stageType: "knockout", rules: {}, groups: [] })
    expect(await updateStageRulesAction({}, form())).toHaveProperty("error", "A knockout stage does not use standings rules.")
    expect(updateStageRules).not.toHaveBeenCalled()
  })

  it.each(["", "-1", "1.5", "null", "NaN"])("rejects invalid form scoring %s", async (value) => {
    const data = form(); data.set("win", value)
    expect(await updateStageRulesAction({}, data)).toHaveProperty("error")
    expect(updateStageRules).not.toHaveBeenCalled()
  })

  it.each([[], ["points", "points"], ["goalsScored"], ["points", "unknown"]])("rejects invalid submitted order %j", async (...rules) => {
    const data = form(); data.delete("tieBreakers")
    rules.forEach((rule) => data.append("tieBreakers", rule))
    expect(await updateStageRulesAction({}, data)).toHaveProperty("error")
    expect(updateStageRules).not.toHaveBeenCalled()
  })

  it("returns transaction-time completed protection errors", async () => {
    vi.mocked(updateStageRules).mockRejectedValue(new StageConstraintError("A completed tournament cannot be changed."))
    expect(await updateStageRulesAction({}, form())).toHaveProperty("error", "A completed tournament cannot be changed.")
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
