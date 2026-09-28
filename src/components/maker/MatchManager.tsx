"use client"

import { PendingSubmit } from "@/src/components/maker/PendingSubmit"

import { useMemo, useState } from "react"
import { acceptsGroups, type StageType } from "@/src/domain/tournament/stage"
import { ConfirmSubmit } from "@/src/components/maker/ConfirmSubmit"
import { btnDanger, btnGhost, btnPrimary, control, field, label } from "@/src/components/maker/styles"
import {
  cancelMatchAction,
  createMatchAction,
  deleteMatchAction,
  restoreMatchAction,
  saveResultAction,
  updateMatchAction,
} from "@/src/server/matches/actions"

export interface MatchFormStage {
  id: string
  name: string
  stageType: StageType
  groups: { id: string; name: string }[]
  entries: { id: string; name: string; stageGroupId: string | null }[]
}

export function CreateMatchForm({ publicId, stages }: { publicId: string; stages: MatchFormStage[] }) {
  const [stageId, setStageId] = useState(stages[0]?.id ?? "")
  const stage = stages.find((item) => item.id === stageId) ?? null
  const grouped = stage ? acceptsGroups(stage.stageType) : false
  const [groupId, setGroupId] = useState(stage?.groups[0]?.id ?? "")
  const entries = useMemo(() => {
    if (!stage) return []
    if (!grouped) return stage.entries
    return stage.entries.filter((entry) => entry.stageGroupId === groupId)
  }, [stage, grouped, groupId])

  if (stages.length === 0) return <p className="text-sm text-text-muted">Add a stage and its participants before creating a match.</p>

  return (
    <form action={createMatchAction} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="publicId" value={publicId} />
      <label className={label}>
        Stage
        <select
          name="stageId"
          value={stageId}
          onChange={(event) => {
            const next = stages.find((item) => item.id === event.target.value)
            setStageId(event.target.value)
            setGroupId(next?.groups[0]?.id ?? "")
          }}
          className={field}
        >
          {stages.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      {grouped && (
        <label className={label}>
          Group
          <select
            name="stageGroupId"
            value={groupId}
            onChange={(event) => setGroupId(event.target.value)}
            className={field}
          >
            {stage?.groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className={label}>
        Participant 1
        <select name="entry1" className={field}>
          {entries.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
        </select>
      </label>
      <label className={label}>
        Participant 2
        <select name="entry2" className={field}>
          {entries.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
        </select>
      </label>
      <label className={label}>
        Round
        <input name="round" type="number" min={1} defaultValue={1} className={field} />
      </label>
      <label className={label}>
        Date and time
        <input name="startsAt" type="datetime-local" className={field} />
      </label>
      <PendingSubmit className={`${btnPrimary} sm:col-span-2 sm:w-fit`}>
        Create match
      </PendingSubmit>
    </form>
  )
}

export function ResultForm({
  publicId,
  matchId,
  score1,
  score2,
}: {
  publicId: string
  matchId: string
  score1: number | null
  score2: number | null
}) {
  return (
    <form action={saveResultAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="publicId" value={publicId} />
      <input type="hidden" name="matchId" value={matchId} />
      <input name="score1" type="number" min={0} required aria-label="Score 1" defaultValue={score1 ?? ""} className={`${control} w-16`} />
      <input name="score2" type="number" min={0} required aria-label="Score 2" defaultValue={score2 ?? ""} className={`${control} w-16`} />
      <PendingSubmit className={btnGhost}>
        {score1 === null ? "Enter result" : "Edit result"}
      </PendingSubmit>
    </form>
  )
}

export function ScheduleForm({
  publicId,
  matchId,
  round,
  date,
  time,
}: {
  publicId: string
  matchId: string
  round: number
  date: string
  time: string
}) {
  return (
    <form action={updateMatchAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="publicId" value={publicId} />
      <input type="hidden" name="matchId" value={matchId} />
      <input type="hidden" name="round" value={round} />
      <label className={label}>
        Date
        <input name="date" type="date" defaultValue={date} className={`${control} mt-1 block`} />
      </label>
      <label className={label}>
        Time
        <input name="time" type="time" defaultValue={time} className={`${control} mt-1 block`} />
      </label>
      <PendingSubmit className={btnGhost}>
        Save schedule
      </PendingSubmit>
    </form>
  )
}

export function MatchStatusButton({
  publicId,
  matchId,
  action,
  label,
  confirm,
}: {
  publicId: string
  matchId: string
  action: "cancel" | "restore" | "delete"
  label: string
  confirm?: string
}) {
  const formAction = action === "cancel" ? cancelMatchAction : action === "restore" ? restoreMatchAction : deleteMatchAction
  const fields = (
    <>
      <input type="hidden" name="publicId" value={publicId} />
      <input type="hidden" name="matchId" value={matchId} />
    </>
  )
  if (!confirm) {
    return (
      <form action={formAction}>
        {fields}
        <PendingSubmit className={btnGhost}>
          {label}
        </PendingSubmit>
      </form>
    )
  }
  return (
    <ConfirmSubmit
      action={formAction}
      trigger={label}
      triggerClassName={action === "delete" ? btnDanger : btnGhost}
      title={confirm}
      description={action === "delete" ? "This removes the match from the tournament." : "You can restore it later."}
      confirmLabel={label}
      pendingLabel={action === "delete" ? "Deleting…" : "Canceling…"}
    >
      {fields}
    </ConfirmSubmit>
  )
}
