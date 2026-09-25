"use client"

import { btnDanger, btnGhost, control } from "@/src/components/maker/styles"
import { addStageEntryAction, removeStageEntryAction, reorderStageEntryAction } from "@/src/server/stage-entries/actions"

export function AddEntryForm({
  publicId,
  stageId,
  teams,
}: {
  publicId: string
  stageId: string
  teams: { number: number; name: string }[]
}) {
  if (teams.length === 0) return null
  return (
    <form action={addStageEntryAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="publicId" value={publicId} />
      <input type="hidden" name="stageId" value={stageId} />
      <select name="number" aria-label="Team" className={control}>
        {teams.map((team) => (
          <option key={team.number} value={team.number}>
            {team.name}
          </option>
        ))}
      </select>
      <button type="submit" className={btnGhost}>
        Add team
      </button>
    </form>
  )
}

export function EntryRow({
  publicId,
  entryId,
  slot,
  name,
}: {
  publicId: string
  entryId: string
  slot: number
  name: string
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <span>
        {slot}. {name}
      </span>
      <span className="flex gap-3">
        <form action={reorderStageEntryAction}>
          <input type="hidden" name="publicId" value={publicId} />
          <input type="hidden" name="entryId" value={entryId} />
          <input type="hidden" name="direction" value="up" />
          <button type="submit" className={btnGhost}>
            Up
          </button>
        </form>
        <form action={reorderStageEntryAction}>
          <input type="hidden" name="publicId" value={publicId} />
          <input type="hidden" name="entryId" value={entryId} />
          <input type="hidden" name="direction" value="down" />
          <button type="submit" className={btnGhost}>
            Down
          </button>
        </form>
        <form action={removeStageEntryAction}>
          <input type="hidden" name="publicId" value={publicId} />
          <input type="hidden" name="entryId" value={entryId} />
          <button type="submit" className={btnDanger}>
            Remove
          </button>
        </form>
      </span>
    </li>
  )
}
