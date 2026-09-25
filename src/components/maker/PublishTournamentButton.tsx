"use client"

import { useState } from "react"
import { btnPrimarySm, btnSecondary, card } from "@/src/components/maker/styles"
import { publishTournamentAction, unpublishTournamentAction } from "@/src/server/tournaments/actions"

export function PublishTournamentButton({ publicId, published }: { publicId: string; published: boolean }) {
  const [open, setOpen] = useState(false)
  const action = published ? unpublishTournamentAction : publishTournamentAction

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={btnSecondary}>
        {published ? "Unpublish" : "Publish tournament"}
      </button>
    )
  }

  return (
    <form action={action} className={`${card} space-y-3 p-4`}>
      <input type="hidden" name="publicId" value={publicId} />
      <p className="font-medium">{published ? "Return this tournament to draft?" : "Publish tournament?"}</p>
      <p className="text-sm text-text-muted">
        {published
          ? "It will disappear from search and the public page until you publish it again."
          : "Once published, this tournament can be viewed according to its visibility setting."}
      </p>
      <div className="flex gap-2">
        <button type="button" onClick={() => setOpen(false)} className={btnSecondary}>
          Cancel
        </button>
        <button type="submit" className={btnPrimarySm}>
          {published ? "Unpublish" : "Publish"}
        </button>
      </div>
    </form>
  )
}
