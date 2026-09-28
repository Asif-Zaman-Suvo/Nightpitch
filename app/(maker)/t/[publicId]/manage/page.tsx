import Link from "next/link"
import { notFound } from "next/navigation"
import { tournamentSetup, type SetupFocus } from "@/src/domain/tournament/overview"
import { normalizePublicId } from "@/src/domain/tournament/public-id"
import { btnPrimary, card } from "@/src/components/maker/styles"
import { ProgressMeter } from "@/src/components/maker/ProgressMeter"
import { listStageStandings } from "@/src/server/standings/repository"
import { ChampionBanner, FixtureCard, PageHeading } from "@/src/components/maker/visual"
import { listGroups } from "@/src/server/groups/repository"
import { findChampion, listMatches } from "@/src/server/matches/repository"
import { listStageEntries } from "@/src/server/stage-entries/repository"
import { listStages } from "@/src/server/stages/repository"
import { listTeams } from "@/src/server/teams/repository"
import { loadVisibleTournament } from "@/src/server/tournaments/view"

const destinations: Record<SetupFocus, { href: string; label: string }> = {
  teams: { href: "/teams", label: "Add teams" },
  structure: { href: "/stages", label: "Configure groups and stages" },
  participants: { href: "/stages", label: "Add stage participants" },
  fixtures: { href: "/matches", label: "Generate fixtures" },
  results: { href: "/matches", label: "Schedule matches and enter results" },
  standings: { href: "/standings", label: "View standings" },
  publish: { href: "/settings", label: "Publish tournament" },
}

export default async function ManageTournamentPage({
  params,
}: {
  params: Promise<{ publicId: string }>
}) {
  const { publicId: raw } = await params
  const publicId = normalizePublicId(raw)
  if (!publicId) notFound()
  const { tournament } = await loadVisibleTournament(publicId, "update")
  const [teams, { groups }, stages, entries, matches, champion, standings] = await Promise.all([
    listTeams(tournament.id),
    listGroups(tournament.id),
    listStages(tournament.id),
    listStageEntries(tournament.id),
    listMatches(tournament.id),
    findChampion(tournament.id),
    listStageStandings(tournament.id),
  ])
  const completed = matches.filter((match) => match.status === "completed").length
  const canGenerateFixtures = stages.some(
    (stage) => stage.stageType !== "knockout" && entries.some((entry) => entry.stageId === stage.id),
  )
  const standingsAvailable = completed > 0 && stages.some((stage) => stage.stageType !== "knockout")
  const setup = tournamentSetup({
    teams: teams.length,
    groups: groups.length,
    stages: stages.length,
    entries: entries.length,
    matches: matches.length,
    completed,
    status: tournament.status,
    canGenerateFixtures,
  })
  const statusLabel = {
    draft: "Draft",
    published: "Published",
    completed: "Completed",
    archived: "Archived",
  }[tournament.status]
  const next = setup.focus ? destinations[setup.focus] : null
  const structureHref = groups.length === 0 ? "/groups" : "/stages"
  const kpis = [
    { label: "Teams", value: teams.length },
    { label: "Groups", value: groups.length },
    { label: "Stages", value: stages.length },
    { label: "Matches", value: matches.length },
    { label: "Completed", value: completed },
  ]

  const upcoming = matches.filter((match) => match.status === "scheduled" && match.participants.length === 2)
    .sort((a, b) => (a.startsAt ? Date.parse(a.startsAt) : Infinity) - (b.startsAt ? Date.parse(b.startsAt) : Infinity)).slice(0, 3)
  const results = matches.filter((match) => match.status === "completed" && match.participants.length === 2).slice(-3).reverse()
  const leaders = standings.flatMap((stage) => stage.table.kind === "league"
    ? [{ name: stage.stageName, row: stage.table.rows[0] }]
    : stage.table.kind === "groups" ? stage.table.groups.map((group) => ({ name: `${stage.stageName} · ${group.groupName}`, row: group.rows[0] })) : [])
    .filter((item) => item.row && item.row.played > 0)

  return (
    <div className="space-y-6">
      <PageHeading title="Tournament overview" hint="Your competition at a glance. Pick up where you left off." />
      {champion ? (
        <ChampionBanner name={champion.name} shortName={champion.shortName} logoUrl={champion.logoUrl} finalScore={matches.find((match) => match.id === champion.finalMatchId)?.participants.map((side) => `${side.name} ${side.score}`).join(" – ")} />
      ) : null}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {kpis.map((stat) => (
          <div key={stat.label} className={`${card} min-w-0 px-4 py-3`}>
            <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">{stat.label}</dt>
            <dd className="mt-1 text-3xl font-semibold tabular-nums text-lime">{stat.value}</dd>
          </div>
        ))}
      </dl>
      {next && (
        <section className={`${card} border-lime/30 p-4 sm:p-5`}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-lime">Next step</p>
          <h2 className="mt-1 text-lg font-semibold text-ink">
            {setup.focus === "structure" && groups.length === 0 ? "Configure groups" : next.label}
          </h2>
          <p className="mt-1 text-sm leading-6 text-text-muted">Keep your tournament moving. Complete this step, then return here for what comes next.</p>
          <Link
            href={`/t/${publicId}/manage${next.href === "/stages" && setup.focus === "structure" ? structureHref : next.href}`}
            className={`${btnPrimary} mt-4`}
          >
            {setup.focus === "structure" && groups.length === 0 ? "Configure groups" : next.label}
          </Link>
        </section>
      )}
      <div className={`${card} p-5`}><ProgressMeter label="Matches completed" value={completed} total={matches.length} /></div>
      {stages.length > 0 && <section className="space-y-3"><h2 className="font-semibold">Road to the final</h2><div className="stage-track">{stages.map((stage) => {
        const stageMatches = matches.filter((match) => match.stageId === stage.id)
        return <Link key={stage.id} href={`/t/${publicId}/manage/stages#stage-${stage.position}`} className={`${card} hover-lift p-4`}><p className="text-xs font-semibold uppercase tracking-wider text-lime">Stage {stage.position} · {stage.stageType}</p><h3 className="mt-2 font-semibold">{stage.name}</h3><div className="mt-4"><ProgressMeter label="Results recorded" value={stageMatches.filter((match) => match.status === "completed").length} total={stageMatches.length} /></div></Link>
      })}</div></section>}
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div className={`${card} p-4 sm:p-5`}>
          <h2 className="font-semibold text-ink">Setup checklist</h2>
          <ol className="mt-4 space-y-3 text-sm">
            {setup.checklist.map((step, index) => (
              <li key={step.id} className="flex items-start gap-3">
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                    step.done ? "bg-success-soft text-success" : "bg-mist text-text-muted"
                  }`}
                  aria-hidden="true"
                >
                  {step.done ? "✓" : index + 1}
                </span>
                <span className="min-w-0">
                  <span className={step.done ? "text-ink" : "text-text-muted"}>{step.label}</span>
                  <span className="sr-only">{step.done ? ", done" : ", not done"}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div className={`${card} p-4 sm:p-5`}>
          <h2 className="font-semibold text-ink">Current setup</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-text-muted">Status</dt>
              <dd className="font-medium text-ink">{statusLabel}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-text-muted">Champion</dt>
              <dd className="font-medium text-ink">{champion?.name ?? "Not yet"}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-text-muted">Fixtures</dt>
              <dd className="font-medium text-ink">{matches.length > 0 ? "Created" : "None yet"}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-text-muted">Standings</dt>
              <dd className="font-medium text-ink">{standingsAvailable ? "Available" : "Not yet"}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-text-muted">Completed matches</dt>
              <dd className="font-medium tabular-nums text-ink">{completed}</dd>
            </div>
          </dl>
        </div>
      </section>
      <div className="grid gap-6 xl:grid-cols-2">
        {[{ title: "Next on the pitch", items: upcoming }, { title: "Latest recorded results", items: results }].map(({ title, items }) => <section key={title} className="min-w-0 space-y-3"><h2 className="font-semibold">{title}</h2>{items.length ? items.map((match) => <FixtureCard key={match.id} home={match.participants[0]} away={match.participants[1]} status={match.status} meta={match.stageName} kickoff={match.startsAt ? new Date(match.startsAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC" : "Kickoff to be confirmed"} />) : <p className={`${card} p-5 text-sm text-text-muted`}>{title === "Next on the pitch" ? "Upcoming matches will appear once fixtures are created." : "Record a match result to start the story."}</p>}</section>)}
      </div>
      {leaders.length > 0 && <section className={`${card} p-5`}><h2 className="font-semibold">Current table leaders</h2><p className="mt-1 text-xs text-text-muted">Ordered by each stage’s configured tie-breakers.</p><ul className="mt-3 divide-y divide-line">{leaders.map(({ name, row }) => <li key={name} className="flex items-center justify-between gap-3 py-3"><div><p className="text-xs text-text-muted">{name}</p><p className="font-semibold">{row.name}</p></div><span className="font-mono text-lg font-semibold text-lime">{row.points} <span className="text-xs">pts</span></span></li>)}</ul></section>}
    </div>
  )
}
