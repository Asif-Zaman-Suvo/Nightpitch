import { describe, expect, it } from "vitest"
import {
  canChangeTournament,
  parseTournamentDescription,
  parseTournamentName,
  parseTournamentVisibility,
  planStatusTransition,
  publicReach,
} from "./lifecycle"

describe("tournament details", () => {
  it("trims a name and keeps a description", () => {
    expect(parseTournamentName("  Cup  ")).toEqual({ ok: true, value: "Cup" })
    expect(parseTournamentDescription("  Annual event  ")).toEqual({ ok: true, value: "Annual event" })
  })

  it("rejects an empty or whitespace-only name", () => {
    expect(parseTournamentName("").ok).toBe(false)
    expect(parseTournamentName("   ").ok).toBe(false)
    expect(parseTournamentName(null).ok).toBe(false)
  })

  it("accepts the existing visibility values", () => {
    expect(parseTournamentVisibility("public").ok).toBe(true)
    expect(parseTournamentVisibility("unlisted").ok).toBe(true)
    expect(parseTournamentVisibility("private").ok).toBe(true)
    expect(parseTournamentVisibility("hidden").ok).toBe(false)
  })
})

describe("publication", () => {
  it("publishes a draft and returns a published tournament to draft", () => {
    expect(planStatusTransition("draft", "published")).toEqual({ ok: true, action: "tournament.published" })
    expect(planStatusTransition("published", "draft")).toEqual({ ok: true, action: "tournament.unpublished" })
  })

  it("does not publish or unpublish a completed or archived tournament", () => {
    expect(planStatusTransition("completed", "draft").ok).toBe(false)
    expect(planStatusTransition("published", "published").ok).toBe(false)
    expect(planStatusTransition("archived", "draft").ok).toBe(false)
    expect(planStatusTransition("draft", "draft").ok).toBe(false)
  })

  it("lets only an owner or admin change settings", () => {
    expect(canChangeTournament("owner", "draft", "private", false)).toBe(true)
    expect(canChangeTournament(null, "draft", "private", false)).toBe(false)
    expect(canChangeTournament("viewer", "published", "public", false)).toBe(false)
  })
})

describe("public reach after a status or visibility change", () => {
  it("hides a draft and a private tournament", () => {
    expect(publicReach("draft", "public")).toEqual({ searchable: false, open: false })
    expect(publicReach("published", "private")).toEqual({ searchable: false, open: false })
  })

  it("lists a published or completed public tournament and opens an unlisted one only by id", () => {
    expect(publicReach("published", "public")).toEqual({ searchable: true, open: true })
    expect(publicReach("completed", "public")).toEqual({ searchable: true, open: true })
    expect(publicReach("published", "unlisted")).toEqual({ searchable: false, open: true })
  })
})
