import { describe, expect, it } from "vitest"
import {
  allocatePublicId,
  formatPublicId,
  generatePublicId,
  normalizePublicId,
} from "./public-id"

describe("public tournament id", () => {
  it("generates an 8-character Crockford id", () => {
    const id = generatePublicId()
    expect(id).toMatch(/^[0-9A-HJ-KM-NP-TV-Z]{8}$/)
  })

  it("normalizes a shared id and rejects anything else", () => {
    expect(normalizePublicId("tmt-8f4k-2xq9")).toBe("8F4K2XQ9")
    expect(normalizePublicId("TMT 8F4K2XQ9")).toBe("8F4K2XQ9")
    expect(normalizePublicId("tmt-8f4k-2xqi")).toBe("8F4K2XQ1")
    expect(normalizePublicId("TMT-8F4K2X")).toBeNull()
    expect(normalizePublicId("not-an-id")).toBeNull()
  })

  it("formats the stored id for display", () => {
    expect(formatPublicId("8F4K2XQ9")).toBe("TMT-8F4K-2XQ9")
  })

  it("retries when an id is already taken and then returns a free one", async () => {
    const issued = ["AAAAAAAA", "BBBBBBBB", "CCCCCCCC"]
    const id = await allocatePublicId(
      async (candidate) => candidate !== "CCCCCCCC",
      () => issued.shift() ?? "DDDDDDDD",
    )
    expect(id).toBe("CCCCCCCC")
  })

  it("stops after five collisions", async () => {
    await expect(allocatePublicId(async () => true, () => "AAAAAAAA")).rejects.toThrow(
      /allocate/,
    )
  })
})
