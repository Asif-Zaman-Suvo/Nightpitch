import { notFound } from "next/navigation"
import { canOpenWithoutLogin } from "@/src/domain/tournament/search"
import { formatPublicId, normalizePublicId } from "@/src/domain/tournament/public-id"
import { DeleteTournamentButton } from "@/src/components/maker/DeleteTournamentButton"
import { PublishTournamentButton } from "@/src/components/maker/PublishTournamentButton"
import { ShareLinkButton } from "@/src/components/maker/ShareLinkButton"
import { card } from "@/src/components/maker/styles"
import { TournamentForm } from "@/src/components/maker/TournamentForm"
import { PageHeading, StatusBadge, VisibilityBadge } from "@/src/components/maker/visual"
import { loadVisibleTournament } from "@/src/server/tournaments/view"

export default async function ManageSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ publicId: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const [{ publicId: raw }, query] = await Promise.all([params, searchParams])
  const publicId = normalizePublicId(raw)
  if (!publicId) notFound()
  const { tournament } = await loadVisibleTournament(publicId, "update")
  const open = canOpenWithoutLogin({
    status: tournament.status,
    visibility: tournament.visibility,
    deleted: tournament.deletedAt !== null,
  })

  return (
    <div className="max-w-3xl space-y-8">
      <PageHeading title="Tournament settings" hint="Name, description, and who can open this tournament." />
      <dl className={`${card} grid gap-4 p-4 text-sm sm:grid-cols-3`}>
        <div>
          <dt className="text-text-muted">Tournament ID</dt>
          <dd className="font-mono text-blue">{formatPublicId(tournament.publicId)}</dd>
          <p className="text-xs text-text-muted">Read only</p>
        </div>
        <div>
          <dt className="text-text-muted">Status</dt>
          <dd className="mt-1"><StatusBadge status={tournament.status} /></dd>
        </div>
        <div>
          <dt className="text-text-muted">Visibility</dt>
          <dd className="mt-1"><VisibilityBadge visibility={tournament.visibility} /></dd>
        </div>
      </dl>
      <section className={`${card} p-5 sm:p-6`}>
      <TournamentForm
        mode="update"
        publicId={tournament.publicId}
        name={tournament.name}
        description={tournament.description}
        visibility={tournament.visibility}
      />
      </section>
      <section className={`${card} space-y-4 p-5 sm:p-6`}>
      <h3 className="font-semibold">Publishing & sharing</h3>
      {tournament.status === "draft" || tournament.status === "published" ? (
        <PublishTournamentButton publicId={tournament.publicId} published={tournament.status === "published"} />
      ) : null}
      {open ? (
        <ShareLinkButton publicId={tournament.publicId} includeId />
      ) : (
        <p className="text-sm text-text-muted">This tournament is not publicly accessible yet.</p>
      )}
      </section>
      <div className="rounded-xl border border-danger/25 bg-danger-soft/40 p-5">
        <h3 className="font-semibold text-danger">Danger zone</h3>
        <p className="mb-3 mt-2 text-sm text-text-muted">Deleting removes this tournament from your workspace and its public page.</p>
        {query.error === "delete-failed" ? (
          <p className="mb-3 text-sm text-danger" role="alert">
            This tournament could not be deleted. Nothing was removed.
          </p>
        ) : null}
        <DeleteTournamentButton publicId={tournament.publicId} permanent={tournament.status === "draft"} />
      </div>
    </div>
  )
}
