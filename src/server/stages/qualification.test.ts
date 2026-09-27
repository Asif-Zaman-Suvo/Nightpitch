import { beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
vi.mock("next/navigation", () => ({ redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`) }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/src/server/auth/session", () => ({ requireUser: vi.fn() }))
vi.mock("@/src/server/tournaments/repository", () => ({ findTournament: vi.fn() }))
vi.mock("@/src/server/stages/repository", async (original) => ({
  ...await original<typeof import("./repository")>(), findStage: vi.fn(), updateQualificationRules: vi.fn(),
}))
import { requireUser } from "@/src/server/auth/session"
import { findTournament } from "@/src/server/tournaments/repository"
import { findStage, updateQualificationRules, StageConstraintError } from "./repository"
import { updateQualificationRulesAction } from "./actions"

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
  it("accepts the form rule and returns a save result", async () => {
    expect(await updateQualificationRulesAction({}, form())).toEqual({ saved: true })
    expect(updateQualificationRules).toHaveBeenCalledWith({ tournamentId: "tournament", stageId: "stage", actorId: "owner", qualification: configuration })
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
