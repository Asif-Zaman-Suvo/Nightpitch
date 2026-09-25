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
    databaseError = "The tournament database is not connected. Add DATABASE_URL, apply the migrations, then restart the server."
  }

  return (
    <PageFrame>
    <div className="space-y-10">
      <section className="space-y-4">
        <h1 className="text-2xl font-semibold text-ink">Your tournaments</h1>
        <p className="text-sm text-text-muted">Create and manage your own tournament.</p>
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
        <section className={`${card} space-y-4 p-5`}>
          <h2 className="text-xl font-semibold text-ink">Create a tournament</h2>
          <TournamentForm mode="create" />
        </section>
      )}
    </div>
    </PageFrame>
  )
}
