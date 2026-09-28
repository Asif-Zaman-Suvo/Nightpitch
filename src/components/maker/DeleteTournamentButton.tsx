"use client"

import { useId, useRef } from "react"
import { useFormStatus } from "react-dom"
import { btnDanger, btnSecondary } from "@/src/components/maker/styles"
import { deleteTournamentAction } from "@/src/server/tournaments/actions"

export function DeleteTournamentButton({
  publicId,
  permanent,
}: {
  publicId: string
  permanent: boolean
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const copyId = useId()

  return (
    <>
      <button type="button" className={btnDanger} onClick={() => dialogRef.current?.showModal()}>
        Delete tournament
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={copyId}
        className="delete-dialog w-[min(calc(100%-2rem),26rem)] rounded-xl border border-line bg-surface p-6 text-ink shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close()
        }}
      >
        <form action={deleteTournamentAction}>
          <input type="hidden" name="publicId" value={publicId} />
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-danger">Confirm</p>
          <h2 id={titleId} className="mt-2 text-xl font-semibold">
            Delete this tournament?
          </h2>
          <p id={copyId} className="mt-2 text-sm leading-6 text-text-muted">
            {permanent
              ? "This permanently deletes the tournament, including its teams, groups, stages, and matches. This cannot be undone."
              : "This removes the tournament from your dashboard and its public page."}
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <button type="button" className={btnSecondary} onClick={() => dialogRef.current?.close()}>
              Cancel
            </button>
            <ConfirmDelete />
          </div>
        </form>
      </dialog>
    </>
  )
}

function ConfirmDelete() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center rounded-md bg-danger px-3 py-1.5 text-sm font-semibold text-white transition duration-150 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Deleting…" : "Delete tournament"}
    </button>
  )
}
