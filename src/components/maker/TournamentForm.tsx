"use client"

import { useActionState } from "react"
import {
  createTournamentAction,
  updateTournamentAction,
  type TournamentFormState,
} from "@/src/server/tournaments/actions"
import { btnPrimary, field, label } from "@/src/components/maker/styles"
import type { TournamentVisibility } from "@/src/domain/tournament/access"

const initial: TournamentFormState = {}

export function TournamentForm({
  mode,
  publicId,
  name = "",
  description = "",
  visibility = "unlisted",
}: {
  mode: "create" | "update"
  publicId?: string
  name?: string
  description?: string
  visibility?: TournamentVisibility
}) {
  const action = mode === "create" ? createTournamentAction : updateTournamentAction
  const [state, formAction, pending] = useActionState(action, initial)

  return (
    <form action={formAction} className="space-y-6">
      {publicId && <input type="hidden" name="publicId" value={publicId} />}
      <div className="space-y-1"><h3 className="font-semibold">Tournament information</h3><p className="text-sm text-text-muted">Give your competition an identity. Teams and fixtures come next.</p></div>
      <label className={label}>
        Tournament name
        <input name="name" required placeholder="e.g. Riverside Summer Cup" defaultValue={name} className={field} />
      </label>
      <label className={label}>
        Description (optional)
        <textarea name="description" defaultValue={description} rows={3} className={field} />
      </label>
      <div className="border-t border-line pt-5"><h3 className="font-semibold">Visibility</h3><p className="mt-1 text-sm text-text-muted">Choose who can follow your tournament once it is published.</p></div>
      <label className={label}>
        Who can view this tournament?
        <select name="visibility" defaultValue={visibility} className={field}>
          <option value="unlisted">Unlisted — anyone with the Tournament ID</option>
          <option value="public">Public</option>
          <option value="private">Private — only you</option>
        </select>
      </label>
      {state.error && <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">{state.error}</p>}
      <button type="submit" disabled={pending} className={btnPrimary}>
        {pending ? "Saving…" : mode === "create" ? "Create tournament" : "Save changes"}
      </button>
    </form>
  )
}
