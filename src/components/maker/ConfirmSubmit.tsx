"use client"

import { useId, useRef, type ReactNode } from "react"
import { useFormStatus } from "react-dom"
import { btnSecondary } from "@/src/components/maker/styles"

const confirmButton =
  "inline-flex items-center justify-center rounded-md bg-danger px-3 py-1.5 text-sm font-semibold text-white transition duration-150 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger disabled:cursor-not-allowed disabled:opacity-60"

export function ConfirmSubmit({
  action,
  trigger,
  triggerClassName,
  title,
  description,
  confirmLabel,
  pendingLabel,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>
  trigger: string
  triggerClassName: string
  title: string
  description: string
  confirmLabel: string
  pendingLabel: string
  children: ReactNode
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const copyId = useId()

  return (
    <>
      <button type="button" className={triggerClassName} onClick={() => dialogRef.current?.showModal()}>
        {trigger}
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
        <form action={action}>
          {children}
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-danger">Confirm</p>
          <h2 id={titleId} className="mt-2 text-xl font-semibold">
            {title}
          </h2>
          <p id={copyId} className="mt-2 text-sm leading-6 text-text-muted">
            {description}
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <button type="button" className={btnSecondary} onClick={() => dialogRef.current?.close()}>
              Cancel
            </button>
            <ConfirmButton label={confirmLabel} pendingLabel={pendingLabel} />
          </div>
        </form>
      </dialog>
    </>
  )
}

function ConfirmButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className={confirmButton}>
      {pending ? pendingLabel : label}
    </button>
  )
}
