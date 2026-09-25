import { describe, expect, it } from "vitest"
import { canAccess } from "./access"
import { canDiscover, canOpenWithoutLogin, ilikeContains, parseTournamentSearch } from "./search"

const open = { deleted: false }

describe("parseTournamentSearch", () => {
  it("treats blank input as empty so it does not match every tournament", () => {
    expect(parseTournamentSearch("")).toEqual({ kind: "empty" })
    expect(parseTournamentSearch("   ")).toEqual({ kind: "empty" })
  })

  it("treats a tournament ID as an exact id lookup", () => {
    expect(parseTournamentSearch(" TMT-8F4K-2XQ9 ")).toEqual({ kind: "id", publicId: "8F4K2XQ9" })
    expect(parseTournamentSearch("tmt-8f4k-2xq9")).toEqual({ kind: "id", publicId: "8F4K2XQ9" })
  })

  it("treats other text as a name search and keeps the original case", () => {
    expect(parseTournamentSearch("  Football ")).toEqual({ kind: "name", term: "Football" })
  })
})

describe("ilikeContains", () => {
  it("escapes wildcard characters", () => {
    expect(ilikeContains("100%_cup")).toBe("%100\\%\\_cup%")
  })
})

describe("public discovery", () => {
  it("lets anyone search and open a published public tournament", () => {
    const tournament = { ...open, status: "published" as const, visibility: "public" as const }
    expect(canDiscover(tournament)).toBe(true)
    expect(canOpenWithoutLogin(tournament)).toBe(true)
  })

  it("lets anyone open an unlisted tournament by id, but not find it by name", () => {
    const tournament = { ...open, status: "published" as const, visibility: "unlisted" as const }
    expect(canDiscover(tournament)).toBe(false)
    expect(canOpenWithoutLogin(tournament)).toBe(true)
  })

  it("hides a draft from search and from logged-out visitors", () => {
    const tournament = { ...open, status: "draft" as const, visibility: "public" as const }
    expect(canDiscover(tournament)).toBe(false)
    expect(canOpenWithoutLogin(tournament)).toBe(false)
  })

  it("hides a private tournament from search and from logged-out visitors", () => {
    const tournament = { ...open, status: "published" as const, visibility: "private" as const }
    expect(canDiscover(tournament)).toBe(false)
    expect(canOpenWithoutLogin(tournament)).toBe(false)
  })

  it("still requires an owner or admin to manage a public tournament", () => {
    expect(
      canAccess({
        ...open,
        status: "published",
        visibility: "public",
        role: null,
        action: "update",
      }),
    ).toBe(false)
  })
})
