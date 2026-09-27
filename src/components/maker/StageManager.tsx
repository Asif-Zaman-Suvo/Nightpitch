"use client"

import { useActionState, useState } from "react"
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

import { TIE_BREAKERS, TIE_BREAKER_LABELS, type TieBreaker } from "@/src/domain/tournament/standings"

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
  publicId, stageId, win, draw, loss, tieBreakers, locked,
}: {
  publicId: string
  stageId: string
  win: number
  draw: number
  loss: number
  tieBreakers: TieBreaker[]
  locked: boolean
}) {
  const [state, formAction, pending] = useActionState(updateStageRulesAction, initial)
  const [order, setOrder] = useState(tieBreakers)
  function move(index: number, offset: number) {
    setOrder((current) => {
      const next = [...current]
      ;[next[index], next[index + offset]] = [next[index + offset], next[index]]
      return next
    })
  }
  return (
    <form action={formAction}>
      <input type="hidden" name="publicId" value={publicId} />
      <input type="hidden" name="stageId" value={stageId} />
      <fieldset disabled={pending || locked} className="space-y-3">
        <legend className="mb-3 font-medium">Standings Rules</legend>
        <div className="flex flex-wrap gap-3">
          {([["win", win], ["draw", draw], ["loss", loss]] as const).map(([name, value]) => (
            <label key={name} className="text-sm capitalize">
              {name} points
              <input name={name} type="number" min="0" step="1" required defaultValue={value}
                className={`${control} ml-2 w-20`} />
            </label>
          ))}
        </div>
        <p className="text-sm font-medium">Tie-break order</p>
        <ol className="space-y-2" aria-label="Tie-break order">
          {order.map((rule, index) => (
            <li key={rule} className="flex flex-wrap items-center gap-2 text-sm">
              <input type="hidden" name="tieBreakers" value={rule} />
              <span className="min-w-40">{index + 1}. {TIE_BREAKER_LABELS[rule]}</span>
              <button type="button" className={btnGhost} disabled={index === 0}
                aria-label={`Move ${TIE_BREAKER_LABELS[rule]} up`} onClick={() => move(index, -1)}>Move up</button>
              <button type="button" className={btnGhost} disabled={index === order.length - 1}
                aria-label={`Move ${TIE_BREAKER_LABELS[rule]} down`} onClick={() => move(index, 1)}>Move down</button>
              {rule !== "points" && <button type="button" className={btnGhost}
                aria-label={`Remove ${TIE_BREAKER_LABELS[rule]}`}
                onClick={() => setOrder(order.filter((item) => item !== rule))}>Remove</button>}
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-2">
          {TIE_BREAKERS.filter((rule) => !order.includes(rule)).map((rule) => (
            <button key={rule} type="button" className={btnGhost}
              onClick={() => setOrder([...order, rule])}>Add {TIE_BREAKER_LABELS[rule]}</button>
          ))}
        </div>
        <p className="text-sm text-text-muted">Ties remaining after this order use team name, then team ID.</p>
        <button type="submit" className={btnGhost}>{pending ? "Saving…" : "Save rules"}</button>
      </fieldset>
      {locked && <p className="mt-2 text-sm text-text-muted">A completed tournament cannot be changed.</p>}
      {state.error && <p role="alert" className="mt-2 text-sm text-danger">{state.error}</p>}
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
