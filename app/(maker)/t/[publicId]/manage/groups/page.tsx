import { notFound } from "next/navigation"
import { canManageGroups } from "@/src/domain/tournament/group"
import { normalizePublicId } from "@/src/domain/tournament/public-id"
import {
  AddGroupForm,
  AssignTeamForm,
  DeleteGroupButton,
  MoveTeamForm,
  RemoveTeamButton,
  RenameGroupForm,
} from "@/src/components/maker/GroupManager"
import { card } from "@/src/components/maker/styles"
import { EmptyState, ErrorNote, PageHeading } from "@/src/components/maker/visual"
import { listGroups } from "@/src/server/groups/repository"
import { loadVisibleTournament } from "@/src/server/tournaments/view"

const errors: Record<string, string> = {
  "has-teams": "Move every team out of this group before deleting it.",
  assign: "That team could not be assigned.",
  locked: "This team is already used in the tournament and cannot be moved.",
  linked: "Detach this group from its stage before deleting it.",
}

export default async function ManageGroupsPage({
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
  if (!canManageGroups({ role, status: tournament.status, deleted: tournament.deletedAt !== null })) notFound()
  const { groups, unassigned } = await listGroups(tournament.id)

  return (
    <div className="space-y-6">
      <PageHeading title="Groups" hint="Groups can hold different numbers of teams." />
      {error && errors[error] && <ErrorNote>{errors[error]}</ErrorNote>}
      {groups.length === 0 ? (
        <EmptyState title="No groups yet">Create groups to organize your teams.</EmptyState>
      ) : (
        <ul className="grid gap-3 xl:grid-cols-2">
          {groups.map((group) => (
            <li key={group.id} className={`${card} space-y-3 border-l-4 border-l-success p-4`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-words font-semibold text-ink">{group.name}</p>
                  <p className="text-sm text-text-muted">
                    {group.teams.length} {group.teams.length === 1 ? "team" : "teams"}
                  </p>
                </div>
                <DeleteGroupButton publicId={publicId} groupId={group.id} name={group.name} />
              </div>
              <RenameGroupForm publicId={publicId} groupId={group.id} name={group.name} />
              {group.teams.length === 0 ? (
                <p className="text-sm text-text-muted">No teams in this group.</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {group.teams.map((team) => (
                    <li key={team.id} className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg bg-mist px-3 py-2 text-sm">
                      <span className="min-w-0 break-words font-medium text-ink">
                        {team.name}
                        {team.shortName ? <span className="ml-2 text-xs font-semibold text-indigo">{team.shortName}</span> : null}
                      </span>
                      <span className="flex flex-wrap items-center gap-2">
                        <MoveTeamForm
                          publicId={publicId}
                          number={team.number}
                          groups={groups.filter((item) => item.id !== group.id)}
                        />
                        <RemoveTeamButton publicId={publicId} number={team.number} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <AssignTeamForm publicId={publicId} groupId={group.id} teams={unassigned} />
            </li>
          ))}
        </ul>
      )}
      <section className="rounded-xl border border-dashed border-success/30 bg-success-soft/40 p-4">
        <h3 className="font-semibold text-ink">Unassigned teams</h3>
        {unassigned.length === 0 ? (
          <p className="mt-2 text-sm text-text-muted">Every team is in a group, or there are no teams yet.</p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {unassigned.map((team) => (
              <li key={team.id} className="rounded-full border border-line bg-navy px-3 py-1 text-sm font-medium text-ink">
                {team.name}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className={`${card} p-4`}>
        <h3 className="mb-3 font-medium">Create group</h3>
        <AddGroupForm publicId={publicId} />
      </section>
    </div>
  )
}
