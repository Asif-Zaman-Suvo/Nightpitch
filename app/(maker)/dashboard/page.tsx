import Link from "next/link"
import { redirect } from "next/navigation"
import { canOpenWithoutLogin } from "@/src/domain/tournament/search"
import { formatPublicId } from "@/src/domain/tournament/public-id"
import { PageFrame } from "@/src/components/maker/PageFrame"
import { btnSecondary, card } from "@/src/components/maker/styles"
import { TournamentForm } from "@/src/components/maker/TournamentForm"
import { EmptyState, ErrorNote, StatusBadge, VisibilityBadge } from "@/src/components/maker/visual"
import { getCurrentUser } from "@/src/server/auth/session"
import { listOwnedTournaments } from "@/src/server/tournaments/repository"

export default async function DashboardPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  let tournaments: Awaited<ReturnType<typeof listOwnedTournaments>> = []
  let databaseError: string | null = null
  try {
    tournaments = await listOwnedTournaments(user.id)
  } catch (error) {
    const message = error instanceof Error ? error.message : ""
    if (!message.includes("DATABASE_URL")) throw error
    databaseError = "Tournaments are temporarily unavailable. Please try again later."
  }

  return (
    <PageFrame width="wide">
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <section className="space-y-4">
        <div className="dark-panel rounded-2xl p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[.2em] text-emerald-200">Organizer workspace</p>
          <h1 className="mt-3 text-3xl font-semibold">Your tournaments</h1>
          <p className="mt-3 text-sm leading-6 text-white/70">From the first team to the final whistle. Build, manage, and share your competition.</p>
          <p className="mt-6 font-mono text-sm text-emerald-200">{tournaments.length} competitions in your workspace</p>
        </div>
        {databaseError ? (
          <ErrorNote>{databaseError}</ErrorNote>
        ) : tournaments.length === 0 ? (
          <EmptyState title="No tournaments yet">Create one to start adding teams, groups, and stages.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {tournaments.map((tournament) => {
              const open = canOpenWithoutLogin({
                status: tournament.status,
                visibility: tournament.visibility,
                deleted: tournament.deletedAt !== null,
              })
              return (
                <li key={tournament.id} className={`${card} flex flex-wrap items-center justify-between gap-3 p-4`}>
                  <div className="min-w-0">
                    <p className="break-words font-semibold text-ink">{tournament.name}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <StatusBadge status={tournament.status} />
                      <VisibilityBadge visibility={tournament.visibility} />
                    </div>
                    <p className="mt-2 font-mono text-xs text-blue">{formatPublicId(tournament.publicId)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/t/${tournament.publicId}/manage`} className={btnSecondary}>
                      Manage
                    </Link>
                    {open && (
                      <Link href={`/t/${tournament.publicId}`} className={btnSecondary}>
                        View tournament
                      </Link>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
      {!databaseError && (
        <section id="create-tournament" className={`${card} space-y-4 p-5 sm:p-6`}>
          <h2 className="text-xl font-semibold text-ink">Create a tournament</h2>
          <TournamentForm mode="create" />
        </section>
      )}
    </div>
    </PageFrame>
  )
}
