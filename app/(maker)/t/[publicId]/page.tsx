import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { acceptsGroups } from "@/src/domain/tournament/stage"
import { formatPublicId, normalizePublicId } from "@/src/domain/tournament/public-id"
import { PageFrame } from "@/src/components/maker/PageFrame"
import { StadiumBackground } from "@/src/components/maker/StadiumBackground"
import { ShareLinkButton } from "@/src/components/maker/ShareLinkButton"
import { card } from "@/src/components/maker/styles"
import { StandingsTable } from "@/src/components/maker/StandingsTable"
import { ChampionBanner, EmptyState, FixtureCard, StatusBadge, TeamMark, stageAccent } from "@/src/components/maker/visual"
import { KnockoutBracket } from "@/src/components/maker/KnockoutBracket"
import { findChampion, listKnockoutBrackets, listMatches } from "@/src/server/matches/repository"
import { listStageStandings } from "@/src/server/standings/repository"
import { listGroups } from "@/src/server/groups/repository"
import { listStageEntries } from "@/src/server/stage-entries/repository"
import { listStages } from "@/src/server/stages/repository"
import { listTeams } from "@/src/server/teams/repository"
import { loadVisibleTournament } from "@/src/server/tournaments/view"

const stageLabels = { group: "Group", league: "League", knockout: "Knockout" } as const

function kickoffLabel(startsAt: string | null) {
  if (!startsAt) return null
  const when = new Date(startsAt)
  return `${when.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })} · ${when.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ publicId: string }>
}): Promise<Metadata> {
  const { publicId: raw } = await params
  const publicId = normalizePublicId(raw)
  if (!publicId) return { title: "Custom Tournament Maker" }
  const { tournament } = await loadVisibleTournament(publicId, "view")
  return { title: `${tournament.name} | Custom Tournament Maker` }
}

export default async function PublicTournamentPage({
  params,
}: {
  params: Promise<{ publicId: string }>
}) {
  const { publicId: raw } = await params
  const publicId = normalizePublicId(raw)
  if (!publicId) notFound()
  const { tournament } = await loadVisibleTournament(publicId, "view")
  const [teams, { groups }, stages, entries, matches, standings, brackets, champion] = await Promise.all([
    listTeams(tournament.id),
    listGroups(tournament.id),
    listStages(tournament.id),
    listStageEntries(tournament.id),
    listMatches(tournament.id),
    listStageStandings(tournament.id),
    listKnockoutBrackets(tournament.id),
    findChampion(tournament.id),
  ])

  const playable = matches.filter((match) => match.participants.length === 2)
  const completed = playable.filter((match) => match.status === "completed")
  const scheduled = playable.filter((match) => match.status === "scheduled")
  const cancelled = playable.filter((match) => match.status === "cancelled")
  const summary = [
    ["Teams", teams.length],
    ["Groups", groups.length],
    ["Stages", stages.length],
    ["Matches", matches.length],
    ["Completed", completed.length],
  ] as const

  return (
    <PageFrame width="wide">
      <article className="space-y-8">
        <header className="rise relative min-h-56 overflow-hidden rounded-xl border border-success/25 bg-navy px-5 py-8 text-white shadow-[0_18px_40px_rgba(0,0,0,0.35)] sm:px-7 sm:py-10">
          <StadiumBackground />
          <div className="relative space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-lime">Match center</p>
            <h1 className="break-words text-3xl font-semibold sm:text-5xl">{tournament.name}</h1>
            <p className="font-mono text-sm text-blue">{formatPublicId(tournament.publicId)}</p>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={tournament.status} />
              <ShareLinkButton publicId={tournament.publicId} />
            </div>
            {tournament.description ? (
              <p className="max-w-2xl break-words text-sm leading-6 text-white/75">{tournament.description}</p>
            ) : null}
          </div>
        </header>

        {champion ? (
          <ChampionBanner name={champion.name} shortName={champion.shortName} logoUrl={champion.logoUrl} />
        ) : null}

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-lime">Tournament overview</h2>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {summary.map(([label, value]) => (
              <div key={label} className={`${card} px-4 py-3`}>
                <dt className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-lime">Stages</h2>
          {stages.length === 0 ? (
            <EmptyState title="No stages configured">This tournament has not configured any stages yet.</EmptyState>
          ) : (
            <ol className="space-y-4">
              {stages.map((stage) => {
                const participants = entries.filter((entry) => entry.stageId === stage.id)
                return (
                  <li key={stage.id} className={`${card} border-l-4 p-4 ${stageAccent(stage.stageType)}`}>
                    <p className="break-words font-semibold text-ink">
                      {stage.position}. {stage.name}
                    </p>
                    <p className="mt-1 text-sm text-text-muted">
                      {stageLabels[stage.stageType]} · {participants.length} {participants.length === 1 ? "team" : "teams"}
                      {stage.stageType === "group"
                        ? ` · ${stage.groups.length} ${stage.groups.length === 1 ? "group" : "groups"}`
                        : ""}
                    </p>
                    {acceptsGroups(stage.stageType) ? (
                      stage.groups.length === 0 ? (
                        <p className="mt-3 text-sm text-text-muted">No groups attached yet.</p>
                      ) : (
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          {stage.groups.map((group) => (
                            <div key={group.id} className="rounded-lg bg-mist px-3 py-2">
                              <p className="text-sm font-semibold text-ink">{group.name}</p>
                              <ul className="mt-1 text-sm text-text-muted">
                                {participants
                                  .filter((entry) => entry.stageGroupId === group.id)
                                  .map((entry) => (
                                    <li key={entry.id}>{entry.name}</li>
                                  ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      )
                    ) : (
                      <ul className="mt-3 text-sm text-text-muted">
                        {participants.map((entry) => (
                          <li key={entry.id}>
                            {entry.slot}. {entry.name}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ol>
          )}
        </section>

        {brackets.length > 0 ? (
          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-lime">Bracket</h2>
            {brackets.map((bracket) => {
              const stage = stages.find((item) => item.id === bracket.stageId)
              return (
                <div key={bracket.stageId} className={`${card} min-w-0 space-y-3 p-4`}>
                  <h3 className="font-semibold text-ink">{stage?.name ?? "Knockout"}</h3>
                  <p className="text-sm text-text-muted">
                    {bracket.view.roundCount} {bracket.view.roundCount === 1 ? "round" : "rounds"} · {bracket.view.matchCount}{" "}
                    {bracket.view.matchCount === 1 ? "match" : "matches"}
                  </p>
                  <KnockoutBracket rounds={bracket.view.rounds} />
                </div>
              )
            })}
          </section>
        ) : null}

        <MatchSection title="Upcoming" matches={scheduled} empty="No matches scheduled yet." />
        <MatchSection title="Recent results" matches={completed} empty="No completed matches yet." />
        {cancelled.length > 0 ? <MatchSection title="Cancelled" matches={cancelled} empty="" /> : null}

        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-lime">Standings</h2>
          {completed.length === 0 || standings.every((stage) => stage.table.kind === "none") ? (
            <EmptyState title="Standings unavailable">
              {stages.length === 0
                ? "No stages configured yet."
                : "No completed matches yet. Scheduled and cancelled matches are not included."}
            </EmptyState>
          ) : (
            standings.map((stage) => {
              if (stage.table.kind === "none") return null
              if (stage.table.kind === "league") {
                return (
                  <div key={stage.stageId} className="space-y-2">
                    <h3 className="font-semibold text-ink">{stage.stageName}</h3>
                    <p className="text-sm text-text-muted">League standings</p>
                    <StandingsTable caption={`${stage.stageName} standings`} rows={stage.table.rows} />
                  </div>
                )
              }
              return (
                <div key={stage.stageId} className="space-y-3">
                  <h3 className="font-semibold text-ink">{stage.stageName}</h3>
                  {stage.table.groups.map((group) => (
                    <div key={group.groupId} className="space-y-2">
                      <h4 className="text-sm font-semibold text-ink">{group.groupName}</h4>
                      <StandingsTable caption={`${group.groupName} standings`} rows={group.rows} />
                    </div>
                  ))}
                </div>
              )
            })
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-lime">Teams</h2>
          {teams.length === 0 ? (
            <EmptyState title="No teams yet">Teams will appear here once the organizer adds them.</EmptyState>
          ) : (
            <ul className={`${card} grid sm:grid-cols-2`}>
              {teams.map((team) => (
                <li key={team.id} className="border-b border-line last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0 sm:odd:border-r">
                  <Link href={`/t/${publicId}/teams/${team.number}`} className="flex min-w-0 items-center gap-3 px-4 py-3 hover:bg-mist">
                    <TeamMark name={team.name} shortName={team.shortName} logoUrl={team.logoUrl} />
                    <span className="min-w-0">
                      <span className="block break-words font-medium text-ink">{team.name}</span>
                      {team.shortName ? <span className="text-xs text-text-muted">{team.shortName}</span> : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </article>
    </PageFrame>
  )
}

function MatchSection({
  title,
  matches,
  empty,
}: {
  title: string
  matches: Awaited<ReturnType<typeof listMatches>>
  empty: string
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-lime">{title}</h2>
      {matches.length === 0 ? (
        <EmptyState title={title}>{empty}</EmptyState>
      ) : (
        <ul className="space-y-3">
          {matches.map((match) => {
            const [home, away] = match.participants
            return (
              <li key={match.id}>
                <FixtureCard
                  status={match.status}
                  meta={[match.stageName, match.groupName].filter(Boolean).join(" · ")}
                  kickoff={kickoffLabel(match.startsAt)}
                  home={{ name: home?.name ?? "Team", shortName: home?.shortName, logoUrl: home?.logoUrl, score: home?.score }}
                  away={{ name: away?.name ?? "Team", shortName: away?.shortName, logoUrl: away?.logoUrl, score: away?.score }}
                />
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
