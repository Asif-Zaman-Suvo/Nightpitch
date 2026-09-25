"use client"

import { useState } from "react"
import { formatPublicId } from "@/src/domain/tournament/public-id"
import { btnSecondary } from "@/src/components/maker/styles"

export function ShareLinkButton({
  publicId,
  includeId = false,
  label = "Share tournament",
}: {
  publicId: string
  includeId?: boolean
  label?: string
}) {
  const [notice, setNotice] = useState<{ kind: "link" | "id"; ok: boolean } | null>(null)

  async function copy(kind: "link" | "id", value: string) {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard is unavailable.")
      await navigator.clipboard.writeText(value)
      setNotice({ kind, ok: true })
    } catch {
      setNotice({ kind, ok: false })
    }
    window.setTimeout(() => setNotice(null), 2000)
  }

  const linkLabel = notice?.kind === "link" ? (notice.ok ? "Link copied" : "Could not copy the link") : label
  const idLabel = notice?.kind === "id" ? (notice.ok ? "ID copied" : "Could not copy the ID") : "Copy tournament ID"

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => copy("link", `${window.location.origin}/t/${publicId}`)}
        className={btnSecondary}
      >
        {linkLabel}
      </button>
      {includeId && (
        <button
          type="button"
          onClick={() => copy("id", formatPublicId(publicId))}
          className={btnSecondary}
        >
          {idLabel}
        </button>
      )}
      <p className="sr-only" aria-live="polite">
        {notice ? (notice.ok ? "Copied." : "Copy failed.") : ""}
      </p>
    </div>
  )
}
