import { notFound } from "next/navigation"
import { normalizePublicId } from "@/src/domain/tournament/public-id"
import { ManageShell } from "@/src/components/maker/ManageShell"
import { loadVisibleTournament } from "@/src/server/tournaments/view"

export default async function ManageLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ publicId: string }>
}) {
  const { publicId: raw } = await params
  const publicId = normalizePublicId(raw)
  if (!publicId) notFound()
  const { tournament } = await loadVisibleTournament(publicId, "update")

  return (
    <ManageShell
      publicId={tournament.publicId}
      name={tournament.name}
      status={tournament.status}
      visibility={tournament.visibility}
      description={tournament.description}
      counts={{ teams: tournament.teamCount, groups: tournament.groupCount, matches: tournament.matchCount }}
    >
      {children}
    </ManageShell>
  )
}
