"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { formatPublicId } from "@/src/domain/tournament/public-id"
import { ShareLinkButton } from "@/src/components/maker/ShareLinkButton"
import { btnSecondary } from "@/src/components/maker/styles"
import { StatusBadge, VisibilityBadge } from "@/src/components/maker/visual"

const links = [
  { label: "Overview", segment: "", count: null, icon: "◫" },
  { label: "Teams", segment: "/teams", count: "teams", icon: "◉" },
  { label: "Groups", segment: "/groups", count: "groups", icon: "▦" },
  { label: "Stages", segment: "/stages", count: null, icon: "≋" },
  { label: "Matches", segment: "/matches", count: "matches", icon: "⚑" },
  { label: "Standings", segment: "/standings", count: null, icon: "≡" },
  { label: "Settings", segment: "/settings", count: null, icon: "⚙" },
] as const

export function ManageShell({ publicId, name, status, visibility, description, counts, children }: {
  publicId: string; name: string; status: string; visibility: string; description: string | null
  counts: { teams: number; groups: number; matches: number }; children: React.ReactNode
}) {
  const pathname = usePathname()
  const base = `/t/${publicId}/manage`
  const active = links.find((link) => link.segment ? pathname.startsWith(`${base}${link.segment}`) : pathname === base)
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col lg:flex-row">
      <aside className="shrink-0 border-b border-line bg-surface lg:min-h-[calc(100vh-4rem)] lg:w-56 lg:border-b-0 lg:border-r">
        <div className="sticky top-0">
          <div className="hidden px-5 pb-5 pt-7 lg:block">
            <Link href="/dashboard" className="text-xs font-medium text-text-muted hover:text-lime">← All tournaments</Link>
            <p className="mt-7 text-[10px] font-bold uppercase tracking-[.18em] text-text-muted">Tournament workspace</p>
            <p className="mt-2 break-words font-semibold">{name}</p>
            <p className="mt-1 font-mono text-xs text-text-muted">{formatPublicId(publicId)}</p>
          </div>
          <nav aria-label="Tournament" className="flex gap-1 overflow-x-auto p-3 lg:flex-col">
            {links.map((link) => {
              const selected = active?.label === link.label
              return <Link key={link.label} href={`${base}${link.segment}`} aria-current={selected ? "page" : undefined}
                className={`flex min-h-11 shrink-0 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${selected ? "nav-active" : "text-text-muted hover:bg-mist hover:text-ink"}`}>
                <span aria-hidden="true" className="hidden w-5 text-lg lg:inline">{link.icon}</span>
                <span>{link.label}</span>
                {link.count ? <span className="ml-auto rounded bg-mist px-1.5 py-0.5 text-xs tabular-nums">{counts[link.count]}</span> : null}
              </Link>
            })}
          </nav>
          <p className="hidden px-6 pt-8 text-xs leading-5 text-text-muted lg:block">Your competition.<br />Every detail, under control.</p>
        </div>
      </aside>
      <div className="min-w-0 flex-1 p-4 sm:p-6 xl:p-8">
        <header className="dark-panel relative mb-7 overflow-hidden rounded-2xl p-5 sm:p-7">
          <div aria-hidden="true" className="pointer-events-none absolute -right-14 -top-20 h-80 w-80 rounded-full border-[40px] border-white/5" />
          <div className="relative">
            <div className="mb-4 flex flex-wrap items-center gap-2"><StatusBadge status={status} /><VisibilityBadge visibility={visibility} /></div>
            <p className="text-xs font-medium text-white/65">Tournament control center / {active?.label ?? "Overview"}</p>
            <h1 className="mt-2 break-words text-2xl font-semibold sm:text-3xl">{name}</h1>
            {description ? <p className="mt-2 max-w-2xl break-words text-sm leading-6 text-white/70">{description}</p> : null}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-white/15 pt-4">
              <p className="font-mono text-xs text-white/70">ID · {formatPublicId(publicId)}</p>
              <div className="flex flex-wrap gap-2"><Link href={`/t/${publicId}`} className={btnSecondary}>Public match center ↗</Link><ShareLinkButton publicId={publicId} label="Copy link" includeId /></div>
            </div>
          </div>
        </header>
        <div className="min-w-0 rise" key={pathname}>{children}</div>
      </div>
    </div>
  )
}
