import Link from "next/link"
import { formatPublicId } from "@/src/domain/tournament/public-id"
import { parseTournamentSearch } from "@/src/domain/tournament/search"
import { PageFrame } from "@/src/components/maker/PageFrame"
import { btnSecondary, card } from "@/src/components/maker/styles"
import { TournamentSearchForm } from "@/src/components/maker/TournamentSearchForm"
import { EmptyState, StatusBadge } from "@/src/components/maker/visual"
import { searchPublicTournaments } from "@/src/server/tournaments/repository"

export default async function LookupPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q = "" } = await searchParams
  const parsed = parseTournamentSearch(q)
  const results = parsed.kind === "empty" ? [] : await searchPublicTournaments(q)

  return (
    <PageFrame>
      <section className="space-y-6 rounded-2xl border border-line bg-surface p-5 sm:p-8">
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue">Nightpitch</p>
          <h1 className="text-3xl font-semibold text-ink">Find a tournament</h1>
          <p className="text-sm leading-6 text-text-muted">Search by tournament ID or search by tournament name.</p>
        </div>
        <TournamentSearchForm query={q} />
        {parsed.kind === "empty" ? (
          <EmptyState title="Search for a tournament">Enter a tournament name or Tournament ID.</EmptyState>
        ) : results.length === 0 ? (
          <EmptyState title="No public tournaments found">Try another tournament name or ID.</EmptyState>
        ) : (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-ink">Search results</h2>
            <ul className="space-y-3">
              {results.map((tournament) => (
                <li key={tournament.publicId} className={`${card} p-4`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="break-words font-semibold text-ink">{tournament.name}</h3>
                      <p className="mt-1 font-mono text-sm text-blue">{formatPublicId(tournament.publicId)}</p>
                    </div>
                    <StatusBadge status={tournament.status} />
                  </div>
                  <p className="mt-3 text-sm text-text-muted">
                    {tournament.teamCount} teams · {tournament.stageCount} stages
                  </p>
                  <Link href={`/t/${tournament.publicId}`} className={`${btnSecondary} mt-4`}>
                    View tournament
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </PageFrame>
  )
}
