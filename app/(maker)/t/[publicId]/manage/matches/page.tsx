import { notFound } from "next/navigation"
import { planRoundRobinFixtures } from "@/src/domain/tournament/fixtures"
import { canManageMatches } from "@/src/domain/tournament/match"
import { normalizePublicId } from "@/src/domain/tournament/public-id"
import { GenerateFixturesButton } from "@/src/components/maker/GenerateFixturesButton"
import { CreateMatchForm, MatchStatusButton, ResultForm, ScheduleForm } from "@/src/components/maker/MatchManager"
import { btnSecondary, card, control, label as labelClass } from "@/src/components/maker/styles"
import { EmptyState, ErrorNote, FixtureCard, PageHeading } from "@/src/components/maker/visual"
import { listMatches } from "@/src/server/matches/repository"
import { listStageEntries } from "@/src/server/stage-entries/repository"
import { listStages } from "@/src/server/stages/repository"
import { loadVisibleTournament } from "@/src/server/tournaments/view"

const errors: Record<string, string> = {
  create: "That match could not be created.",
  duplicate: "Those participants already play each other in that round.",
  result: "Enter a valid result. A cancelled match must be restored first.",
  status: "That status change is not allowed.",
  delete: "A completed match cannot be deleted.",
  schedule: "Enter a valid date and time, or leave both empty.",
  conflict: "That team already has a match at this time.",
  fixtures: "At least 2 participants are required to generate fixtures.",
  knockout: "Automatic round-robin fixtures are only available for group and league stages.",
  complete: "Fixtures are already complete.",
  waiting: "This match is waiting for earlier results and cannot be changed yet.",
}

export default async function ManageMatchesPage({
  params,
  searchParams,
}: {
  params: Promise<{ publicId: string }>
  searchParams: Promise<{ error?: string; created?: string; stage?: string; group?: string; status?: string }>
}) {
  const { publicId: raw } = await params
  const { error, created, stage: stageFilter, group: groupFilter, status: statusFilter } = await searchParams
  const publicId = normalizePublicId(raw)
  if (!publicId) notFound()
  const { tournament, role } = await loadVisibleTournament(publicId, "update")
  if (!canManageMatches({ role, status: tournament.status, deleted: tournament.deletedAt !== null })) notFound()
  const [stages, entries, matches] = await Promise.all([
    listStages(tournament.id),
    listStageEntries(tournament.id),
    listMatches(tournament.id),
  ])
  const visible = matches.filter((match) => {
    if (match.participants.length !== 2) return false
    if (stageFilter && match.stageId !== stageFilter) return false
    if (groupFilter && match.stageGroupId !== groupFilter) return false
    if (statusFilter && match.status !== statusFilter) return false
    return true
  })
  const formStages = stages.map((stage) => ({
    id: stage.id,
    name: stage.name,
    stageType: stage.stageType,
    groups: stage.groups.map((group) => ({ id: group.id, name: group.name })),
    entries: entries
      .filter((entry) => entry.stageId === stage.id)
      .map((entry) => ({ id: entry.id, name: entry.name, stageGroupId: entry.stageGroupId })),
  }))

  return (
    <div className="space-y-6">
      <PageHeading title="Matches" hint="Create a match, or generate the missing round-robin fixtures for a group or league stage." />
      {created && <p className="rounded-md bg-success-soft px-3 py-2 text-sm text-success">Created {created} fixtures.</p>}
      {error && errors[error] && <ErrorNote>{errors[error]}</ErrorNote>}
      <div className="space-y-3">
        {formStages
          .filter((stage) => stage.stageType !== "knockout")
          .map((stage) => {
            const plan = planRoundRobinFixtures({
              stageType: stage.stageType,
              groups: stage.groups,
              entries: stage.entries.map((entry) => ({ id: entry.id, stageGroupId: entry.stageGroupId })),
              existing: matches
                .filter((match) => match.stageId === stage.id)
                .flatMap((match) => {
                  const [first, second] = match.participants
                  return first && second
                    ? [{ stageGroupId: match.stageGroupId, entryIds: [first.entryId, second.entryId] as [string, string] }]
                    : []
                }),
            })
            if (!plan.ok || stage.stageType === "knockout") {
              return plan.ok ? null : (
                <p key={stage.id} className="text-sm text-text-muted">
                  {stage.name}: {plan.error}
                </p>
              )
            }
            return (
              <GenerateFixturesButton
                key={stage.id}
                publicId={publicId}
                stageId={stage.id}
                stageName={stage.name}
                stageType={stage.stageType}
                summaries={plan.summaries}
              />
            )
          })}
      </div>
      <form className={`${card} flex flex-wrap items-end gap-3 p-4`} action={`/t/${publicId}/manage/matches`}>
        <label className={labelClass}>
          Stage
          <select name="stage" defaultValue={stageFilter ?? ""} className={`${control} mt-1 block`}>
            <option value="">All stages</option>
            {stages.map((stage) => (
              <option key={stage.id} value={stage.id}>{stage.name}</option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Group
          <select name="group" defaultValue={groupFilter ?? ""} className={`${control} mt-1 block`}>
            <option value="">All groups</option>
            {stages.flatMap((stage) => stage.groups).map((group) => (
              <option key={group.id} value={group.id}>{group.name}</option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Status
          <select name="status" defaultValue={statusFilter ?? ""} className={`${control} mt-1 block`}>
            <option value="">Any status</option>
            <option value="scheduled">Scheduled</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <button type="submit" className={btnSecondary}>Filter</button>
      </form>
      {visible.length === 0 ? (
        <EmptyState title={matches.length === 0 ? "No matches yet" : "No matches match these filters"}>
          {matches.length === 0 ? "Create a match between two participants in a stage." : "Clear a filter to see the other matches."}
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {visible.map((match) => {
            const [home, away] = match.participants
            const when = match.startsAt ? new Date(match.startsAt) : null
            const date = when ? when.toLocaleDateString(undefined, { dateStyle: "medium" }) : "Not scheduled"
            const time = when ? when.toLocaleTimeString(undefined, { timeStyle: "short" }) : ""
            const scheduleDate = when
              ? `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, "0")}-${String(when.getDate()).padStart(2, "0")}`
              : ""
            const scheduleTime = when
              ? `${String(when.getHours()).padStart(2, "0")}:${String(when.getMinutes()).padStart(2, "0")}`
              : ""
            return (
              <li key={match.id}>
                <FixtureCard
                  status={match.status}
                  meta={[match.stageName, match.groupName].filter(Boolean).join(" · ")}
                  kickoff={when ? `${date}${time ? ` · ${time}` : ""}` : "Not scheduled"}
                  home={{ name: home?.name ?? "Participant 1", shortName: home?.shortName, logoUrl: home?.logoUrl, score: home?.score }}
                  away={{ name: away?.name ?? "Participant 2", shortName: away?.shortName, logoUrl: away?.logoUrl, score: away?.score }}
                >
                  {match.status !== "cancelled" && (
                    <ResultForm publicId={publicId} matchId={match.id} score1={home?.score ?? null} score2={away?.score ?? null} />
                  )}
                  {match.status === "scheduled" && (
                    <ScheduleForm
                      publicId={publicId}
                      matchId={match.id}
                      round={match.round}
                      date={scheduleDate}
                      time={scheduleTime}
                    />
                  )}
                  <div className="flex flex-wrap gap-2">
                    {match.status === "scheduled" && (
                      <MatchStatusButton publicId={publicId} matchId={match.id} action="cancel" label="Cancel" confirm="Cancel this match?" />
                    )}
                    {match.status === "cancelled" && (
                      <MatchStatusButton publicId={publicId} matchId={match.id} action="restore" label="Restore" />
                    )}
                    {match.status !== "completed" && (
                      <MatchStatusButton
                        publicId={publicId}
                        matchId={match.id}
                        action="delete"
                        label="Delete"
                        confirm="Delete this match?"
                      />
                    )}
                  </div>
                </FixtureCard>
              </li>
            )
          })}
        </ul>
      )}
      <section className={`${card} p-4`}>
        <h3 className="mb-3 font-medium">Create match</h3>
        <CreateMatchForm publicId={publicId} stages={formStages} />
      </section>
    </div>
  )
}
