"use client"

import { useActionState } from "react"
import { ConfirmSubmit } from "@/src/components/maker/ConfirmSubmit"
import { btnDanger, btnPrimary, btnSecondary, field, label } from "@/src/components/maker/styles"
import { createTeamAction, updateTeamAction, deleteTeamAction, type TeamFormState } from "@/src/server/teams/actions"

interface EditableTeam {
  number: number
  name: string
  shortName: string
  logoUrl: string | null
}

const initial: TeamFormState = {}

const fieldClass = field

export function AddTeamForm({ publicId }: { publicId: string }) {
  const [state, formAction, pending] = useActionState(createTeamAction, initial)
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="publicId" value={publicId} />
      <TeamFields />
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <button type="submit" disabled={pending} className={btnPrimary}>
        {pending ? "Creating…" : "Add team"}
      </button>
    </form>
  )
}

export function EditTeamForm({ publicId, team }: { publicId: string; team: EditableTeam }) {
  const [state, formAction, pending] = useActionState(updateTeamAction, initial)
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="publicId" value={publicId} />
      <input type="hidden" name="number" value={team.number} />
      <TeamFields name={team.name} shortName={team.shortName} logoUrl={team.logoUrl ?? ""} />
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <button type="submit" disabled={pending} className={btnSecondary}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  )
}

export function DeleteTeamButton({ publicId, number, name }: { publicId: string; number: number; name: string }) {
  return (
    <ConfirmSubmit
      action={deleteTeamAction}
      trigger="Remove"
      triggerClassName={btnDanger}
      title={`Remove ${name}?`}
      description="This removes the team from the tournament."
      confirmLabel="Remove"
      pendingLabel="Removing…"
    >
      <input type="hidden" name="publicId" value={publicId} />
      <input type="hidden" name="number" value={number} />
    </ConfirmSubmit>
  )
}

function TeamFields({ name = "", shortName = "", logoUrl = "" }: { name?: string; shortName?: string; logoUrl?: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <label className={`${label} sm:col-span-2`}>
        Name
        <input name="name" required defaultValue={name} className={fieldClass} />
      </label>
      <label className={label}>
        Short name
        <input name="shortName" defaultValue={shortName} maxLength={12} className={fieldClass} />
      </label>
      <label className={`${label} sm:col-span-3`}>
        Logo URL
        <input name="logoUrl" type="url" defaultValue={logoUrl} placeholder="https://" className={fieldClass} />
      </label>
    </div>
  )
}
