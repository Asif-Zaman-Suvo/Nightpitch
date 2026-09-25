"use client"

import { useActionState } from "react"
import { STAGE_TYPES, type StageType } from "@/src/domain/tournament/stage"
import { ConfirmSubmit } from "@/src/components/maker/ConfirmSubmit"
import { btnDanger, btnGhost, btnPrimary, control, field, label } from "@/src/components/maker/styles"
import {
  attachGroupAction,
  createStageAction,
  deleteStageAction,
  detachGroupAction,
  reorderStageAction,
  updateStageAction,
  updateStageRulesAction,
  type StageFormState,
} from "@/src/server/stages/actions"

const initial: StageFormState = {}
const fieldClass = field
const labels: Record<StageType, string> = { group: "Group", league: "League", knockout: "Knockout" }

export function AddStageForm({ publicId }: { publicId: string }) {
  const [state, formAction, pending] = useActionState(createStageAction, initial)
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="publicId" value={publicId} />
      <label className={label}>
        Stage name
        <input name="name" required placeholder="Group Stage" className={fieldClass} />
      </label>
      <label className={label}>
        Type
        <select name="stageType" className={fieldClass}>
          {STAGE_TYPES.map((type) => (
            <option key={type} value={type}>
              {labels[type]}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={pending} className={btnPrimary}>
        {pending ? "Adding" : "Add stage"}
      </button>
      {state.error && <p className="w-full text-sm text-danger">{state.error}</p>}
    </form>
  )
}

export function EditStageForm({
  publicId,
  stageId,
  name,
  stageType,
}: {
  publicId: string
  stageId: string
  name: string
  stageType: StageType
}) {
  const [state, formAction, pending] = useActionState(updateStageAction, initial)
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="publicId" value={publicId} />
      <input type="hidden" name="stageId" value={stageId} />
      <input name="name" required defaultValue={name} aria-label="Stage name" className={control} />
      <select name="stageType" defaultValue={stageType} aria-label="Stage type" className={control}>
        {STAGE_TYPES.map((type) => (
          <option key={type} value={type}>
            {labels[type]}
          </option>
        ))}
      </select>
      <button type="submit" disabled={pending} className={btnGhost}>
        Save
      </button>
      {state.error && <p className={btnDanger}>{state.error}</p>}
    </form>
  )
}

export function ScoringRulesForm({
  publicId,
  stageId,
  win,
  draw,
  loss,
}: {
  publicId: string
  stageId: string
  win: number
  draw: number
  loss: number
}) {
  const [state, formAction, pending] = useActionState(updateStageRulesAction, initial)
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="publicId" value={publicId} />
      <input type="hidden" name="stageId" value={stageId} />
      <label className="text-sm">
        Win
        <input name="win" required defaultValue={win} inputMode="numeric" className={`${control} mt-1 w-16`} />
      </label>
      <label className="text-sm">
        Draw
        <input name="draw" required defaultValue={draw} inputMode="numeric" className={`${control} mt-1 w-16`} />
      </label>
      <label className="text-sm">
        Loss
        <input name="loss" required defaultValue={loss} inputMode="numeric" className={`${control} mt-1 w-16`} />
      </label>
      <button type="submit" disabled={pending} className={btnGhost}>
        Save rules
      </button>
      {state.error && <p className="w-full text-sm text-danger">{state.error}</p>}
    </form>
  )
}

export function MoveStageButton({
  publicId,
  stageId,
  direction,
}: {
  publicId: string
  stageId: string
  direction: "up" | "down"
}) {
  return (
    <form action={reorderStageAction}>
      <input type="hidden" name="publicId" value={publicId} />
      <input type="hidden" name="stageId" value={stageId} />
      <input type="hidden" name="direction" value={direction} />
      <button type="submit" className={btnGhost}>
        {direction === "up" ? "Move up" : "Move down"}
      </button>
    </form>
  )
}

export function DeleteStageButton({ publicId, stageId, name }: { publicId: string; stageId: string; name: string }) {
  return (
    <ConfirmSubmit
      action={deleteStageAction}
      trigger="Delete"
      triggerClassName={btnDanger}
      title={`Delete ${name}?`}
      description="Detach its groups first."
      confirmLabel="Delete"
      pendingLabel="Deleting…"
    >
      <input type="hidden" name="publicId" value={publicId} />
      <input type="hidden" name="stageId" value={stageId} />
    </ConfirmSubmit>
  )
}

export function AttachGroupForm({
  publicId,
  stageId,
  groups,
}: {
  publicId: string
  stageId: string
  groups: { id: string; name: string }[]
}) {
  if (groups.length === 0) return null
  return (
    <form action={attachGroupAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="publicId" value={publicId} />
      <input type="hidden" name="stageId" value={stageId} />
      <select name="groupId" aria-label="Group" className={control}>
        {groups.map((group) => (
          <option key={group.id} value={group.id}>
            {group.name}
          </option>
        ))}
      </select>
      <button type="submit" className={btnGhost}>
        Attach
      </button>
    </form>
  )
}

export function DetachGroupButton({
  publicId,
  stageId,
  stageGroupId,
}: {
  publicId: string
  stageId: string
  stageGroupId: string
}) {
  return (
    <form action={detachGroupAction}>
      <input type="hidden" name="publicId" value={publicId} />
      <input type="hidden" name="stageId" value={stageId} />
      <input type="hidden" name="stageGroupId" value={stageGroupId} />
      <button type="submit" className={btnDanger}>
        Detach
      </button>
    </form>
  )
}
