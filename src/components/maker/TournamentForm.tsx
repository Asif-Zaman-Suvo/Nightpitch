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
    <form action={formAction} className="space-y-4">
      {publicId && <input type="hidden" name="publicId" value={publicId} />}
      <label className={label}>
        Name
        <input name="name" required defaultValue={name} className={field} />
      </label>
      <label className={label}>
        Description
        <textarea name="description" defaultValue={description} rows={3} className={field} />
      </label>
      <label className={label}>
        Visibility
        <select name="visibility" defaultValue={visibility} className={field}>
          <option value="unlisted">Unlisted — anyone with the Tournament ID</option>
          <option value="public">Public</option>
          <option value="private">Private — only you</option>
        </select>
      </label>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <button type="submit" disabled={pending} className={btnPrimary}>
        {pending ? "Saving" : mode === "create" ? "Create tournament" : "Save changes"}
      </button>
    </form>
  )
}
