import "server-only"
import { cache } from "react"
import { getSql } from "@/src/server/db"
import { createAuthClient } from "@/src/server/auth/supabase"

export interface CurrentUser {
  id: string
  email: string
  displayName: string
}

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createAuthClient()
  const { data, error } = await supabase.auth.getClaims()
  if (error || !data?.claims?.sub) return null

  const id = data.claims.sub
  const email = typeof data.claims.email === "string" ? data.claims.email : ""
  const sql = getSql()
  const rows = await sql<{ display_name: string }[]>`
    select display_name from app.profiles where id = ${id}
  `
  const displayName = rows[0]?.display_name
  if (!displayName) return { id, email, displayName: email || "Organizer" }
  return { id, email, displayName }
})

export async function requireUserId(): Promise<string> {
  const supabase = await createAuthClient()
  const { data, error } = await supabase.auth.getClaims()
  if (error || !data?.claims?.sub) throw new Error("You need to sign in")
  return data.claims.sub
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) throw new Error("You need to sign in")
  return user
}
