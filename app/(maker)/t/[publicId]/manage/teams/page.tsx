import { notFound } from "next/navigation"
import { canManageTeams } from "@/src/domain/tournament/team"
import { normalizePublicId } from "@/src/domain/tournament/public-id"
import { card } from "@/src/components/maker/styles"
import { AddTeamForm, DeleteTeamButton, EditTeamForm } from "@/src/components/maker/TeamManager"
import { EmptyState, ErrorNote, PageHeading, TeamMark } from "@/src/components/maker/visual"
import { listGroups } from "@/src/server/groups/repository"
import { listTeams } from "@/src/server/teams/repository"
import { loadVisibleTournament } from "@/src/server/tournaments/view"

export default async function ManageTeamsPage({
  params,
  searchParams,
}: {
  params: Promise<{ publicId: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { publicId: raw } = await params
  const { error } = await searchParams
  const publicId = normalizePublicId(raw)
  if (!publicId) notFound()
  const { tournament, role } = await loadVisibleTournament(publicId, "update")
  if (!canManageTeams({ role, status: tournament.status, deleted: tournament.deletedAt !== null })) notFound()
  const [teams, { groups }] = await Promise.all([listTeams(tournament.id), listGroups(tournament.id)])
  const groupName = new Map<string, string>()
  for (const group of groups) {
    for (const team of group.teams) groupName.set(team.id, group.name)
  }

  return (
    <div className="space-y-6">
      <PageHeading title="Teams" hint={`${teams.length} ${teams.length === 1 ? "team" : "teams"}`} />
      {error === "referenced" && (
        <ErrorNote>This team is already used in the tournament and cannot be removed.</ErrorNote>
      )}
      {teams.length === 0 ? (
        <EmptyState title="No teams yet">Add your first team to start building the tournament.</EmptyState>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {teams.map((team) => (
            <li key={team.id} className={`${card} space-y-3 border-t-2 border-t-success p-4`}>
              <div className="flex items-center gap-3">
                <TeamMark name={team.name} shortName={team.shortName} logoUrl={team.logoUrl} size="lg" />
                <div className="min-w-0">
                  <p className="break-words font-semibold text-ink">{team.name}</p>
                  <p className="text-sm text-text-muted">
                    {team.shortName || "No short name"}
                    {" · #"}
                    {team.number}
                    {" · "}
                    {groupName.get(team.id) ?? "Unassigned"}
                  </p>
                </div>
              </div>
              <details>
                <summary className="cursor-pointer text-sm font-medium text-blue">Edit</summary>
                <div className="mt-3">
                  <EditTeamForm publicId={publicId} team={team} />
                </div>
              </details>
              <DeleteTeamButton publicId={publicId} number={team.number} name={team.name} />
            </li>
          ))}
        </ul>
      )}
      <section className={`${card} p-4`}>
        <h3 className="font-medium">Add team</h3>
        <div className="mt-3">
          <AddTeamForm publicId={publicId} />
        </div>
      </section>
    </div>
  )
}
