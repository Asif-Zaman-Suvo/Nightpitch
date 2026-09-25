"use client"

import { useFormStatus } from "react-dom"
import { btnPrimarySm } from "@/src/components/maker/styles"
import { generateKnockoutBracketAction } from "@/src/server/matches/actions"

export function GenerateBracketButton({ publicId, stageId }: { publicId: string; stageId: string }) {
  return (
    <form action={generateKnockoutBracketAction} className="space-y-2">
      <input type="hidden" name="publicId" value={publicId} />
      <input type="hidden" name="stageId" value={stageId} />
      <p className="text-sm text-text-muted">
        Creates the rounds and match slots from the participant order. Later rounds stay empty until those matches are played.
      </p>
      <GenerateButton />
    </form>
  )
}

function GenerateButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className={btnPrimarySm}>
      {pending ? "Generating…" : "Generate bracket"}
    </button>
  )
}
