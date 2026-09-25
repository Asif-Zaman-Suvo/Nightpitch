import { notFound } from "next/navigation"
import { canManageStages } from "@/src/domain/tournament/stage"
import { normalizePublicId } from "@/src/domain/tournament/public-id"
import { StandingsFilters } from "@/src/components/maker/StandingsFilters"
import { StandingsTable } from "@/src/components/maker/StandingsTable"
import { card } from "@/src/components/maker/styles"
import { EmptyState, PageHeading } from "@/src/components/maker/visual"
import { listStageStandings } from "@/src/server/standings/repository"
import { loadVisibleTournament } from "@/src/server/tournaments/view"

export default async function ManageStandingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ publicId: string }>
  searchParams: Promise<{ stage?: string; group?: string }>
}) {
  const { publicId: raw } = await params
  const { stage: requestedStage, group: requestedGroup } = await searchParams
  const publicId = normalizePublicId(raw)
  if (!publicId) notFound()
  const { tournament, role } = await loadVisibleTournament(publicId, "update")
  if (!canManageStages({ role, status: tournament.status, deleted: tournament.deletedAt !== null })) notFound()

  const standings = await listStageStandings(tournament.id)
  const selected = standings.find((stage) => stage.stageId === requestedStage) ?? standings[0]
  const groups = selected?.table.kind === "groups" ? selected.table.groups : []
  const selectedGroup = groups.find((group) => group.groupId === requestedGroup) ?? groups[0]

  return (
    <div className="space-y-6">
      <PageHeading title="Standings" hint="Calculated from completed match results." />
      {standings.length === 0 || !selected ? (
        <EmptyState title="No stages yet">Add a group or league stage before standings can be shown.</EmptyState>
      ) : (
        <>
          <div className={`${card} p-4`}>
          <StandingsFilters
            publicId={publicId}
            stages={standings.map((stage) => ({ id: stage.stageId, name: stage.stageName }))}
            stageId={selected.stageId}
            groups={groups.map((group) => ({ id: group.groupId, name: group.groupName }))}
            groupId={selectedGroup?.groupId ?? null}
          />
          </div>
          <p className="text-sm font-medium text-ink">
            Showing {selected.stageName}
            {selected.table.kind === "groups" && selectedGroup ? ` · ${selectedGroup.groupName}` : ""}
            {selected.table.kind === "league" ? " · league table" : ""}
          </p>
          {selected.table.kind === "none" ? (
            <p className="text-sm text-text-muted">A knockout stage does not use a standings table.</p>
          ) : selected.table.kind === "league" ? (
            <section className="space-y-2">
              <h3 className="font-medium">{selected.stageName}</h3>
              {selected.table.rows.every((row) => row.played === 0) && (
                <p className="text-sm text-text-muted">No completed matches yet. Scheduled and cancelled matches are not included.</p>
              )}
              <StandingsTable caption={`${selected.stageName} standings`} rows={selected.table.rows} />
            </section>
          ) : selectedGroup ? (
            <section className="space-y-2">
              <h3 className="font-medium">{selected.stageName} · {selectedGroup.groupName}</h3>
              {selectedGroup.rows.every((row) => row.played === 0) && (
                <p className="text-sm text-text-muted">No completed matches yet. Scheduled and cancelled matches are not included.</p>
              )}
              <StandingsTable caption={`${selectedGroup.groupName} standings`} rows={selectedGroup.rows} />
            </section>
          ) : (
            <p className="text-sm text-text-muted">Attach a group to this stage to see a table.</p>
          )}
        </>
      )}
    </div>
  )
}
