import { card } from "@/src/components/maker/styles"

const tournamentStatus = {
  draft: { label: "Draft", tone: "bg-warn-soft text-warn" },
  published: { label: "Published", tone: "bg-blue-soft text-blue" },
  completed: { label: "Completed", tone: "bg-success-soft text-success" },
  archived: { label: "Archived", tone: "bg-mist text-text-muted" },
} as const

const visibilityStatus = {
  public: { label: "Public", tone: "bg-success-soft text-success" },
  unlisted: { label: "Unlisted", tone: "bg-blue-soft text-blue" },
  private: { label: "Private", tone: "bg-gold-soft text-gold" },
} as const

const matchStatus = {
  scheduled: { label: "Scheduled", tone: "bg-blue-soft text-blue" },
  completed: { label: "Completed", tone: "bg-success-soft text-success" },
  cancelled: { label: "Cancelled", tone: "bg-danger-soft text-danger" },
} as const

function Badge({ label, tone }: { label: string; tone: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] ${tone}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {label}
    </span>
  )
}

export function StatusBadge({ status }: { status: string }) {
  const known = tournamentStatus[status as keyof typeof tournamentStatus]
  return <Badge label={known?.label ?? status} tone={known?.tone ?? "bg-mist text-ink"} />
}

export function VisibilityBadge({ visibility }: { visibility: string }) {
  const known = visibilityStatus[visibility as keyof typeof visibilityStatus]
  return <Badge label={known?.label ?? visibility} tone={known?.tone ?? "bg-mist text-ink"} />
}

export function MatchStatusBadge({ status }: { status: string }) {
  const known = matchStatus[status as keyof typeof matchStatus]
  return <Badge label={known?.label ?? status} tone={known?.tone ?? "bg-mist text-ink"} />
}

export function TeamMark({
  name,
  shortName,
  logoUrl,
  size = "md",
}: {
  name: string
  shortName?: string | null
  logoUrl?: string | null
  size?: "sm" | "md" | "lg"
}) {
  const box = size === "lg" ? "h-14 w-14 text-sm" : size === "sm" ? "h-7 w-7 text-[10px]" : "h-9 w-9 text-[11px]"
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logoUrl} alt="" className={`team-mark ${box} shrink-0 rounded-full object-cover ring-1 ring-lime/40`} />
    )
  }
  const initials = (shortName || name).replace(/\s+/g, "").slice(0, 3).toUpperCase()
  return (
    <span
      aria-hidden="true"
      className={`team-mark inline-flex ${box} shrink-0 items-center justify-center rounded-full border border-lime/40 bg-navy font-semibold tracking-wide text-lime shadow-[0_0_16px_rgba(214,255,74,0.15)]`}
    >
      {initials}
    </span>
  )
}

export function ChampionBanner({
  name,
  shortName,
  logoUrl,
}: {
  name: string
  shortName: string | null
  logoUrl: string | null
}) {
  return (
    <section className={`${card} flex items-center gap-4 border-gold/40 p-4 sm:p-5`}>
      <TeamMark name={name} shortName={shortName} logoUrl={logoUrl} size="lg" />
      <div className="min-w-0">
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-gold">🏆 Tournament Champion</h2>
        <p className="mt-1 break-words text-2xl font-semibold text-ink">{name}</p>
      </div>
    </section>
  )
}

export function PageHeading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <h2 className="text-xl font-semibold uppercase tracking-[0.08em] text-ink">{title}</h2>
      {hint ? <p className="mt-1 text-sm leading-6 text-text-muted">{hint}</p> : null}
    </div>
  )
}

export function EmptyState({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-success/30 bg-surface/80 px-4 py-10 text-center">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-success-soft text-success" aria-hidden="true">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M7 4h10v3a5 5 0 0 1-10 0V4Z" />
          <path d="M7 6H5a3 3 0 0 0 3 3M17 6h2a3 3 0 0 1-3 3M12 12v3M9 20h6" strokeLinecap="round" />
        </svg>
      </div>
      <p className="mt-3 font-semibold text-ink">{title}</p>
      <div className="mx-auto mt-1 max-w-md text-sm leading-6 text-text-muted">{children}</div>
    </div>
  )
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-md border border-danger/15 bg-danger-soft px-3 py-2 text-sm text-danger">
      {children}
    </p>
  )
}

const stageTone = {
  group: "border-l-success",
  league: "border-l-blue",
  knockout: "border-l-gold",
} as const

export function stageAccent(type: string) {
  return stageTone[type as keyof typeof stageTone] ?? "border-l-blue"
}

export function FixtureCard({
  home,
  away,
  status,
  meta,
  kickoff,
  children,
}: {
  home: { name: string; shortName?: string | null; logoUrl?: string | null; score?: number | null }
  away: { name: string; shortName?: string | null; logoUrl?: string | null; score?: number | null }
  status: string
  meta: string
  kickoff?: string | null
  children?: React.ReactNode
}) {
  const completed = status === "completed"
  const cancelled = status === "cancelled"
  return (
    <article className={`${card} match-card min-w-0 overflow-hidden ${cancelled ? "opacity-75" : ""}`}>
      <div className="flex items-center justify-between gap-3 border-b border-success/20 px-4 py-2">
        <p className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">{meta}</p>
        <MatchStatusBadge status={status} />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-3 py-5 sm:gap-4 sm:px-6">
        <Side team={home} align="end" score={completed ? home.score : null} muted={cancelled} />
        <span className={`text-xs font-semibold uppercase tracking-[0.2em] text-lime ${completed ? "score-pop" : ""}`}>
          {completed ? "–" : "vs"}
        </span>
        <Side team={away} align="start" score={completed ? away.score : null} muted={cancelled} />
      </div>
      {kickoff ? (
        <p className="px-4 pb-4 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">{kickoff}</p>
      ) : null}
      {children ? <div className="space-y-3 border-t border-line bg-navy/40 px-4 py-3">{children}</div> : null}
    </article>
  )
}

function Side({
  team,
  align,
  score,
  muted,
}: {
  team: { name: string; shortName?: string | null; logoUrl?: string | null }
  align: "start" | "end"
  score?: number | null
  muted: boolean
}) {
  const name = (
    <span className={`min-w-0 break-words text-sm font-semibold sm:text-base ${muted ? "text-text-muted" : "text-ink"} ${align === "end" ? "text-right" : "text-left"}`}>
      {team.name}
    </span>
  )
  const mark = <TeamMark name={team.name} shortName={team.shortName} logoUrl={team.logoUrl} />
  const points =
    score !== null && score !== undefined ? (
      <span className="score-pop text-2xl font-semibold tabular-nums text-ink sm:text-4xl">{score}</span>
    ) : null
  return (
    <div className={`flex min-w-0 items-center gap-2 ${align === "end" ? "justify-end" : "justify-start"}`}>
      {align === "end" ? (
        <>
          {mark}
          {name}
          {points}
        </>
      ) : (
        <>
          {points}
          {name}
          {mark}
        </>
      )}
    </div>
  )
}
