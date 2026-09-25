import { describe, expect, it } from "vitest"
import { canAccess, deletionMode } from "./access"

const published = {
  status: "published" as const,
  visibility: "unlisted" as const,
  deleted: false,
}

describe("tournament access", () => {
  it("lets only the owner and an admin update, and only the owner delete", () => {
    expect(canAccess({ ...published, role: "owner", action: "update" })).toBe(true)
    expect(canAccess({ ...published, role: "admin", action: "update" })).toBe(true)
    expect(canAccess({ ...published, role: "admin", action: "delete" })).toBe(false)
    expect(canAccess({ ...published, role: "participant", action: "update" })).toBe(false)
    expect(canAccess({ ...published, role: "viewer", action: "update" })).toBe(false)
    expect(canAccess({ ...published, role: null, action: "update" })).toBe(false)
    expect(canAccess({ ...published, role: "owner", action: "delete" })).toBe(true)
  })

  it("hides drafts and private tournaments from people who are not members", () => {
    expect(
      canAccess({ ...published, status: "draft", role: null, action: "view" }),
    ).toBe(false)
    expect(
      canAccess({ ...published, status: "draft", role: "owner", action: "view" }),
    ).toBe(true)
    expect(
      canAccess({
        ...published,
        visibility: "private",
        role: null,
        action: "view",
      }),
    ).toBe(false)
    expect(
      canAccess({
        ...published,
        visibility: "private",
        role: "viewer",
        action: "view",
      }),
    ).toBe(true)
    expect(canAccess({ ...published, role: null, action: "view" })).toBe(true)
  })

  it("blocks changes to an archived or deleted tournament", () => {
    expect(
      canAccess({ ...published, status: "archived", role: "owner", action: "update" }),
    ).toBe(false)
    expect(
      canAccess({ ...published, status: "archived", role: "owner", action: "delete" }),
    ).toBe(false)
    expect(canAccess({ ...published, deleted: true, role: "owner", action: "view" })).toBe(
      false,
    )
  })

  it("hard-deletes a draft and soft-deletes a published tournament", () => {
    expect(deletionMode("draft")).toBe("hard")
    expect(deletionMode("published")).toBe("soft")
  })
})