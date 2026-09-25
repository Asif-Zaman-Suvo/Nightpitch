import Link from "next/link"
import { PageFrame } from "@/src/components/maker/PageFrame"
import { btnPrimary } from "@/src/components/maker/styles"

export default function TournamentNotFound() {
  return (
    <PageFrame>
      <section className="rounded-xl border border-dashed border-success/30 bg-surface px-4 py-12 text-center">
        <h1 className="text-2xl font-semibold text-ink">Tournament not found</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-text-muted">
          Check the Tournament ID, or the tournament may be private.
        </p>
        <Link href="/lookup" className={`${btnPrimary} mt-5`}>
          Try another ID
        </Link>
      </section>
    </PageFrame>
  )
}
