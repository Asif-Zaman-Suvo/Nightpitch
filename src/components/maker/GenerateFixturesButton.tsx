"use client"

import { PendingSubmit } from "@/src/components/maker/PendingSubmit"

import { useState } from "react"
import { btnPrimarySm, btnSecondary, card } from "@/src/components/maker/styles"
import { generateFixturesAction } from "@/src/server/matches/actions"

export function GenerateFixturesButton({
  publicId,
  stageId,
  stageName,
  stageType,
  summaries,
}: {
  publicId: string
  stageId: string
  stageName: string
  stageType: "group" | "league"
  summaries: { name: string; existing: number; missing: number }[]
}) {
  const [open, setOpen] = useState(false)
  const missing = summaries.reduce((total, summary) => total + summary.missing, 0)
  const existing = summaries.reduce((total, summary) => total + summary.existing, 0)

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={btnSecondary}>
        {missing === 0 ? "Fixtures complete" : `Generate ${missing} fixtures`}
      </button>
    )
  }

  return (
    <form action={generateFixturesAction} className={`${card} space-y-3 p-4`}>
      <input type="hidden" name="publicId" value={publicId} />
      <input type="hidden" name="stageId" value={stageId} />
      <p className="font-medium">Generate fixtures</p>
      <p className="text-sm text-text-muted">
        This will create the missing round-robin matches for {stageName}. Existing matches will not be deleted or changed.
      </p>
      {stageType === "group" && <p className="text-sm text-text-muted">Each group is paired separately.</p>}
      <ul className="text-sm text-text-muted">
        {summaries.map((summary) => (
          <li key={summary.name}>
            {summary.name}: {summary.missing} missing, {summary.existing} existing
          </li>
        ))}
      </ul>
      <p className="text-sm">Existing fixtures: {existing}. Missing fixtures: {missing}.</p>
      <div className="flex gap-2">
        <button type="button" onClick={() => setOpen(false)} className={btnSecondary}>
          Cancel
        </button>
        <PendingSubmit pendingLabel="Generating fixtures…" disabled={missing === 0} className={btnPrimarySm}>
          {missing === 0 ? "Nothing to generate" : `Generate ${missing} fixtures`}
        </PendingSubmit>
      </div>
    </form>
  )
}
