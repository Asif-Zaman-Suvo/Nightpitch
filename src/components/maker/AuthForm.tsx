"use client"

import { useActionState } from "react"
import Link from "next/link"
import { btnPrimary, field, label } from "@/src/components/maker/styles"
import { signInAction, signUpAction, type AuthFormState } from "@/src/server/auth/actions"

const initial: AuthFormState = {}

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const action = mode === "sign-in" ? signInAction : signUpAction
  const [state, formAction, pending] = useActionState(action, initial)

  return (
    <form action={formAction} className="space-y-4">
      {mode === "sign-up" && (
        <label className={label}>
          Name
          <input name="displayName" required className={field} />
        </label>
      )}
      <label className={label}>
        Email
        <input name="email" type="email" required autoComplete="email" className={field} />
      </label>
      <label className={label}>
        Password
        <input name="password" type="password" required minLength={8} autoComplete={mode === "sign-in" ? "current-password" : "new-password"} className={field} />
      </label>
      {state.error && <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">{state.error}</p>}
      {state.message && <p className="text-sm text-text-muted">{state.message}</p>}
      <button type="submit" disabled={pending} className={btnPrimary}>
        {pending ? "Please wait" : mode === "sign-in" ? "Sign in" : "Create account"}
      </button>
      <p className="text-sm text-text-muted">
        {mode === "sign-in" ? (
          <Link href="/signup" className="font-medium text-blue">Create an account</Link>
        ) : (
          <Link href="/login" className="font-medium text-blue">Already have an account</Link>
        )}
      </p>
    </form>
  )
}
