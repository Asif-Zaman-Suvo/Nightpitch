"use client"

import Link from "next/link"
import { btnPrimary, btnSecondary, card } from "@/src/components/maker/styles"

export default function MakerError({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return <section role="alert" className={`${card} mx-auto my-10 max-w-xl space-y-4 p-6`}>
    <p className="text-xs font-semibold uppercase tracking-wider text-danger">Something went wrong</p>
    <h1 className="text-2xl font-semibold">We couldn’t load this view.</h1>
    <p className="text-sm leading-6 text-text-muted">Please try again. If you just submitted a change, check its current state before submitting it again.</p>
    <div className="flex flex-wrap gap-3"><button onClick={unstable_retry} className={btnPrimary}>Try again</button><Link href="/dashboard" className={btnSecondary}>Your tournaments</Link></div>
  </section>
}
