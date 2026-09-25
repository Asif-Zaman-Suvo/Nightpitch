"use server"

import { redirect } from "next/navigation"
import { z } from "zod"
import { createAuthClient } from "@/src/server/auth/supabase"

const credentials = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(72),
})

export interface AuthFormState {
  error?: string
  message?: string
}

export async function signUpAction(
  _state: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = credentials
    .extend({ displayName: z.string().trim().min(1).max(80) })
    .safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
      displayName: formData.get("displayName"),
    })
  if (!parsed.success) return { error: "Enter a name, a valid email, and a password of at least 8 characters." }

  const supabase = await createAuthClient()
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { display_name: parsed.data.displayName } },
  })
  if (error) return { error: error.message }
  if (!data.session) return { message: "Check your email to confirm the account, then sign in." }
  redirect("/dashboard")
}

export async function signInAction(
  _state: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  })
  if (!parsed.success) return { error: "Enter a valid email and a password of at least 8 characters." }

  const supabase = await createAuthClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error) return { error: error.message }
  redirect("/dashboard")
}

export async function signOutAction(): Promise<void> {
  const supabase = await createAuthClient()
  await supabase.auth.signOut()
  redirect("/login")
}
