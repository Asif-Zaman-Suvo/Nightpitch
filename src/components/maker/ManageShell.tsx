"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { formatPublicId } from "@/src/domain/tournament/public-id"
import { ShareLinkButton } from "@/src/components/maker/ShareLinkButton"
import { btnSecondary } from "@/src/components/maker/styles"
import { StatusBadge, VisibilityBadge } from "@/src/components/maker/visual"

const links = [
  { label: "Overview", segment: "", count: null },
  { label: "Teams", segment: "/teams", count: "teams" },
  { label: "Groups", segment: "/groups", count: "groups" },
  { label: "Stages", segment: "/stages", count: null },
  { label: "Matches", segment: "/matches", count: "matches" },
  { label: "Standings", segment: "/standings", count: null },
  { label: "Settings", segment: "/settings", count: null },
] as const

export function ManageShell({
  publicId,
  name,
  status,
  visibility,
  description,
  counts,
  children,
}: {
  publicId: string
  name: string
  status: string
  visibility: string
  description: string | null
  counts: { teams: number; groups: number; matches: number }
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const base = `/t/${publicId}/manage`
  const [open, setOpen] = useState(false)

  const nav = (
    <nav className="flex flex-col gap-1 p-3" aria-label="Tournament">
      {links.map((link) => {
        const href = `${base}${link.segment}`
        const active = link.segment === "" ? pathname === base : pathname.startsWith(href)
        return (
          <Link
            key={link.label}
            href={href}
            aria-current={active ? "page" : undefined}
            onClick={() => setOpen(false)}
            className={`flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm font-medium transition ${
              active ? "nav-active bg-lime/10 text-lime" : "text-white/70 hover:bg-white/5 hover:text-white"
            }`}
          >
            <span className="truncate">{link.label}</span>
            {link.count ? (
              <span className={`rounded-md px-1.5 py-0.5 font-mono text-[11px] tabular-nums ${active ? "bg-lime text-navy" : "bg-white/10 text-white"}`}>
                {counts[link.count]}
              </span>
            ) : null}
          </Link>
        )
      })}
    </nav>
  )

  return (
    <div className="flex min-h-[calc(100vh-4.25rem)] flex-col lg:flex-row">
      <aside className="hidden w-60 shrink-0 border-r border-white/5 bg-navy lg:block">
        <p className="px-6 pb-1 pt-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-lime">Control</p>
        {nav}
      </aside>
      <div className="min-w-0 flex-1">
        <div className="px-4 py-4 lg:px-8 lg:pt-6">
          <header className="rise relative overflow-hidden rounded-xl border border-success/20 bg-navy px-4 py-5 text-white shadow-[0_16px_40px_rgba(0,0,0,0.35)] sm:px-6">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(420px_160px_at_100%_0%,rgba(214,255,74,0.16),transparent_60%),linear-gradient(90deg,transparent,rgba(34,197,94,0.08)_50%,transparent)]"
            />
            <div className="relative flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-lime">Matchday control center</p>
                <p className="font-mono text-xs text-blue">{formatPublicId(publicId)}</p>
                <h1 className="break-words text-2xl font-semibold sm:text-3xl">{name}</h1>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={status} />
                  <VisibilityBadge visibility={visibility} />
                </div>
                {description ? <p className="max-w-2xl break-words text-sm leading-6 text-white/75">{description}</p> : null}
              </div>
              <div className="flex max-w-full flex-wrap items-center gap-2">
                <Link href={`/t/${publicId}`} className={btnSecondary}>
                  View public page
                </Link>
                <ShareLinkButton publicId={publicId} label="Share" />
                <button
                  type="button"
                  className={`${btnSecondary} lg:hidden`}
                  aria-expanded={open}
                  aria-controls="tournament-menu"
                  onClick={() => setOpen((value) => !value)}
                >
                  Menu
                </button>
              </div>
            </div>
          </header>
          {open ? (
            <div id="tournament-menu" className="mt-3 overflow-hidden rounded-xl bg-navy lg:hidden">
              {nav}
            </div>
          ) : null}
        </div>
        <div className="px-4 pb-10 lg:px-8">{children}</div>
      </div>
    </div>
  )
}
