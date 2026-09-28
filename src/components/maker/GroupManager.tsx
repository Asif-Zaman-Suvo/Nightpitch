"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { ConfirmSubmit } from "@/src/components/maker/ConfirmSubmit"
import { btnDanger, btnGhost, btnPrimary, control, field, label } from "@/src/components/maker/styles"
import {
  assignTeamAction,
  createGroupAction,
  deleteGroupAction,
  removeTeamAction,
  renameGroupAction,
  type GroupFormState,
} from "@/src/server/groups/actions"

function PendingButton({ idle, pending, className }: { idle: string; pending: string; className: string }) {
  const status = useFormStatus()
  return (
    <button type="submit" disabled={status.pending} className={`${className} disabled:cursor-not-allowed disabled:opacity-60`}>
      {status.pending ? pending : idle}
    </button>
  )
}

const initial: GroupFormState = {}
const fieldClass = field

export function AddGroupForm({ publicId }: { publicId: string }) {
  const [state, formAction, pending] = useActionState(createGroupAction, initial)
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="publicId" value={publicId} />
      <label className={label}>
        Group name
        <input name="name" required placeholder="Group A" className={fieldClass} />
      </label>
      <button type="submit" disabled={pending} className={btnPrimary}>
        {pending ? "Creating…" : "Add group"}
      </button>
      {state.error && <p className="w-full text-sm text-danger">{state.error}</p>}
    </form>
  )
}

export function RenameGroupForm({ publicId, groupId, name }: { publicId: string; groupId: string; name: string }) {
  const [state, formAction, pending] = useActionState(renameGroupAction, initial)
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="publicId" value={publicId} />
      <input type="hidden" name="groupId" value={groupId} />
      <input name="name" required defaultValue={name} aria-label="Group name" className={control} />
      <button type="submit" disabled={pending} className={`${btnGhost} disabled:cursor-not-allowed disabled:opacity-60`}>
        {pending ? "Saving…" : "Rename"}
      </button>
      {state.error && <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">{state.error}</p>}
    </form>
  )
}

export function DeleteGroupButton({ publicId, groupId, name }: { publicId: string; groupId: string; name: string }) {
  return (
    <ConfirmSubmit
      action={deleteGroupAction}
      trigger="Delete"
      triggerClassName={btnDanger}
      title={`Delete ${name}?`}
      description="Teams in it must be moved out first."
      confirmLabel="Delete"
      pendingLabel="Deleting…"
    >
      <input type="hidden" name="publicId" value={publicId} />
      <input type="hidden" name="groupId" value={groupId} />
    </ConfirmSubmit>
  )
}

export function AssignTeamForm({
  publicId,
  groupId,
  teams,
}: {
  publicId: string
  groupId: string
  teams: { number: number; name: string }[]
}) {
  if (teams.length === 0) return null
  return (
    <form action={assignTeamAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="publicId" value={publicId} />
      <input type="hidden" name="groupId" value={groupId} />
      <select name="number" aria-label="Team" className={control}>
        {teams.map((team) => (
          <option key={team.number} value={team.number}>
            {team.name}
          </option>
        ))}
      </select>
      <PendingButton idle="Assign" pending="Assigning…" className={btnGhost} />
    </form>
  )
}

export function MoveTeamForm({
  publicId,
  number,
  groups,
}: {
  publicId: string
  number: number
  groups: { id: string; name: string }[]
}) {
  if (groups.length === 0) return null
  return (
    <form action={assignTeamAction} className="flex min-w-0 flex-wrap items-center gap-2">
      <input type="hidden" name="publicId" value={publicId} />
      <input type="hidden" name="number" value={number} />
      <select name="groupId" aria-label="Move to group" className={control}>
        {groups.map((group) => (
          <option key={group.id} value={group.id}>
            {group.name}
          </option>
        ))}
      </select>
      <PendingButton idle="Move" pending="Moving…" className={btnGhost} />
    </form>
  )
}

export function RemoveTeamButton({ publicId, number }: { publicId: string; number: number }) {
  return (
    <form action={removeTeamAction}>
      <input type="hidden" name="publicId" value={publicId} />
      <input type="hidden" name="number" value={number} />
      <PendingButton idle="Unassign" pending="Removing…" className={btnGhost} />
    </form>
  )
}
