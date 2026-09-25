import Link from "next/link"
import { notFound } from "next/navigation"
import { normalizePublicId } from "@/src/domain/tournament/public-id"
import { PageFrame } from "@/src/components/maker/PageFrame"
import { card } from "@/src/components/maker/styles"
import { TeamMark } from "@/src/components/maker/visual"
import { findTeam } from "@/src/server/teams/repository"
import { loadVisibleTournament } from "@/src/server/tournaments/view"

export default async function TeamPage({
  params,
}: {
  params: Promise<{ publicId: string; number: string }>
}) {
  const { publicId: raw, number: rawNumber } = await params
  const publicId = normalizePublicId(raw)
  const number = Number(rawNumber)
  if (!publicId || !Number.isInteger(number)) notFound()
  const { tournament } = await loadVisibleTournament(publicId, "view")
  const team = await findTeam(tournament.id, number)
  if (!team) notFound()

  return (
    <PageFrame>
    <article className={`${card} space-y-4 p-5`}>
      <Link href={`/t/${publicId}`} className="text-sm font-medium text-blue">
        {tournament.name}
      </Link>
      <div className="flex items-center gap-4">
        <TeamMark name={team.name} shortName={team.shortName} logoUrl={team.logoUrl} size="lg" />
        <div className="min-w-0">
          <h1 className="break-words text-3xl font-semibold text-ink">{team.name}</h1>
          {team.shortName ? <p className="text-text-muted">{team.shortName}</p> : null}
        </div>
      </div>
    </article>
    </PageFrame>
  )
}
