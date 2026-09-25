import { describe, expect, it } from "vitest"
import { canManageTeams, parseTeamInput, teamDeleteError } from "./team"

const fields = { name: " North ", shortName: " NOR ", logoUrl: "" }

describe("parseTeamInput", () => {
  it("trims the name and short name and treats a blank logo as unset", () => {
    expect(parseTeamInput(fields)).toEqual({
      ok: true,
      value: { name: "North", shortName: "NOR", logoUrl: null },
    })
  })

  it("rejects an empty name, a long short name, and a logo that is not an http URL", () => {
    expect(parseTeamInput({ ...fields, name: "  " }).ok).toBe(false)
    expect(parseTeamInput({ ...fields, shortName: "ABCDEFGHIJKLM" }).ok).toBe(false)
    expect(parseTeamInput({ ...fields, logoUrl: "ftp://cdn.example/a.png" }).ok).toBe(false)
    expect(parseTeamInput({ ...fields, logoUrl: "https://cdn.example/a.png" })).toMatchObject({
      ok: true,
    })
  })
})

describe("canManageTeams", () => {
  const open = { status: "draft" as const, deleted: false }

  it("lets the owner and an admin change teams", () => {
    expect(canManageTeams({ ...open, role: "owner" })).toBe(true)
    expect(canManageTeams({ ...open, role: "admin" })).toBe(true)
  })

  it("blocks a participant, a viewer, and someone who is not a member", () => {
    expect(canManageTeams({ ...open, role: "participant" })).toBe(false)
    expect(canManageTeams({ ...open, role: "viewer" })).toBe(false)
    expect(canManageTeams({ ...open, role: null })).toBe(false)
  })

  it("blocks changes to an archived or deleted tournament", () => {
    expect(canManageTeams({ role: "owner", status: "archived", deleted: false })).toBe(false)
    expect(canManageTeams({ role: "owner", status: "draft", deleted: true })).toBe(false)
    expect(canManageTeams({ role: "owner", status: "published", deleted: false })).toBe(true)
  })
})

describe("teamDeleteError", () => {
  it("explains why a team that is already used cannot be removed", () => {
    expect(teamDeleteError(true)).toMatch(/cannot be removed/)
    expect(teamDeleteError(false)).toBeNull()
  })
})
