"use client"

import { PendingSubmit } from "@/src/components/maker/PendingSubmit"

import { useActionState, useState } from "react"
import { STAGE_TYPES, type StageType } from "@/src/domain/tournament/stage"
import { ConfirmSubmit } from "@/src/components/maker/ConfirmSubmit"
import { btnDanger, btnGhost, btnPrimary, btnPrimarySm, control, field, label } from "@/src/components/maker/styles"
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
import { type GroupTopNRule, type QualificationPreview } from "@/src/domain/tournament/qualification"
import { applyQualificationAction, updateQualificationRulesAction } from "@/src/server/stages/actions"

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
      <PendingSubmit disabled={pending} className={btnPrimary}>
        {pending ? "Adding" : "Add stage"}
      </PendingSubmit>
      {state.error && <p role="alert" className="w-full text-sm text-danger">{state.error}</p>}
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
      <PendingSubmit disabled={pending} className={btnGhost}>
        Save
      </PendingSubmit>
      {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
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
        <PendingSubmit className={btnGhost}>{pending ? "Saving…" : "Save rules"}</PendingSubmit>
      </fieldset>
      {locked && <p className="mt-2 text-sm text-text-muted">A completed tournament cannot be changed.</p>}
      {state.error && <p role="alert" className="mt-2 text-sm text-danger">{state.error}</p>}
    </form>
  )
}

export function QualificationRulesForm({ publicId, stageId, rules, sourceGroups, preview, locked }: {
  publicId: string
  stageId: string
  rules: GroupTopNRule[]
  sourceGroups: { id: string; name: string }[]
  preview: QualificationPreview | null
  locked: boolean
}) {
  const [state, formAction, pending] = useActionState(updateQualificationRulesAction, initial)
  const [applyState, applyAction, applying] = useActionState(applyQualificationAction, initial)
  const [selected, setSelected] = useState(rules.map((rule) => ({ sourceGroupId: rule.sourceGroupId, count: String(rule.count) })))
  const qualifiedCount = preview?.ok ? preview.qualified.length : 0
  const available = sourceGroups.filter((group) => !selected.some((rule) => rule.sourceGroupId === group.id))
  return (
    <section className="space-y-3 border-t border-line pt-4">
      <h3 className="font-medium">Qualification</h3>
      <p className="text-sm text-text-muted">Choose candidates from current group standings. Saving rules does not add knockout participants.</p>
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="publicId" value={publicId} />
        <input type="hidden" name="stageId" value={stageId} />
        <fieldset disabled={pending || locked} className="space-y-3">
          <legend className="sr-only">Qualification rules</legend>
          {selected.map((rule, index) => (
            <div key={index} className="flex flex-wrap items-end gap-2">
              <label className={label}>Source group
                <select name="sourceGroupId" value={rule.sourceGroupId} className={control}
                  onChange={(event) => setSelected((current) => current.map((item, i) => i === index
                    ? { ...item, sourceGroupId: event.target.value } : item))}>
                  {sourceGroups.filter((group) => group.id === rule.sourceGroupId || !selected.some((item) => item.sourceGroupId === group.id))
                    .map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                </select>
              </label>
              <label className={label}>Qualify top
                <input name="count" type="number" min="1" step="1" required value={rule.count}
                  onChange={(event) => setSelected((current) => current.map((item, i) => i === index
                    ? { ...item, count: event.target.value } : item))} className={`${control} w-20`} />
              </label>
              <button type="button" className={btnDanger} onClick={() => setSelected((current) => current.filter((_, i) => i !== index))}
                aria-label={`Remove qualification rule ${index + 1}`}>Remove</button>
            </div>
          ))}
          {available.length > 0 && <button type="button" className={btnGhost}
            onClick={() => setSelected((current) => [...current, { sourceGroupId: available[0].id, count: "1" }])}>
            Add qualification rule
          </button>}
          <PendingSubmit className={btnGhost}>{pending ? "Saving…" : "Save qualification rules"}</PendingSubmit>
        </fieldset>
        {locked && <p className="text-sm text-text-muted">A completed tournament cannot be changed.</p>}
        {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      </form>
      {rules.length > 0 && <div className="space-y-3" aria-label="Qualification preview">
        <h4 className="font-medium">Qualification Preview</h4>
        <p className="text-sm text-text-muted">Current qualification based on standings; candidates are not locked.</p>
        {preview?.groups.map((group) => <div key={group.sourceGroupId} className="space-y-1">
          <p className="text-sm font-medium">{group.name} → Top {group.count}</p>
          {group.message && <p className={`text-sm ${group.state === "error" ? "text-danger" : "text-text-muted"}`}>{group.message}</p>}
          {group.state === "ready" && <ol className="space-y-1 text-sm">
            {group.rows.map((row) => <li key={row.teamId} className={`rounded-lg px-3 py-2 ${preview?.ok && row.qualified ? "bg-success-soft font-medium text-success" : "bg-mist text-text-muted"}`}>{row.rank}. {row.name}{preview?.ok && row.qualified ? " ✓" : ""}</li>)}
          </ol>}
        </div>)}
        {preview && !preview.ok && preview.groups.length === 0 && <p className="text-sm text-danger">{preview.error}</p>}
        <form action={applyAction} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="publicId" value={publicId} />
          <input type="hidden" name="stageId" value={stageId} />
          <PendingSubmit className={btnPrimarySm} disabled={locked || qualifiedCount === 0 || applying}>
            {applying ? "Applying…" : "Apply Qualification"}
          </PendingSubmit>
          <p className="text-sm text-text-muted">
            {qualifiedCount > 0 ? `${qualifiedCount} ${qualifiedCount === 1 ? "team will" : "teams will"} advance to this knockout stage.` : "Qualification is not ready to apply."}
          </p>
        </form>
        {applyState.error && <p role="alert" className="text-sm text-danger">{applyState.error}</p>}
      </div>}
    </section>
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
      <PendingSubmit className={btnGhost}>
        {direction === "up" ? "Move up" : "Move down"}
      </PendingSubmit>
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
      <PendingSubmit className={btnGhost}>
        Attach
      </PendingSubmit>
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
      <PendingSubmit className={btnDanger}>
        Detach
      </PendingSubmit>
    </form>
  )
}
