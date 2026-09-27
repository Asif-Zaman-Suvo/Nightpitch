import { notFound } from "next/navigation"
import { planKnockoutBracket, type BracketView } from "@/src/domain/tournament/bracket"
import { resolveStandingsRules } from "@/src/domain/tournament/standings"
import { resolveQualificationConfiguration } from "@/src/domain/tournament/qualification"
import { acceptsGroups, canManageStages } from "@/src/domain/tournament/stage"
import { normalizePublicId } from "@/src/domain/tournament/public-id"
import { GenerateBracketButton } from "@/src/components/maker/GenerateBracketButton"
import { KnockoutBracket } from "@/src/components/maker/KnockoutBracket"
import {
  AddStageForm,
  AttachGroupForm,
  DeleteStageButton,
  DetachGroupButton,
  EditStageForm,
  MoveStageButton,
  ScoringRulesForm,
  QualificationRulesForm,
} from "@/src/components/maker/StageManager"
import { AddEntryForm, EntryRow } from "@/src/components/maker/StageEntryManager"
import { card } from "@/src/components/maker/styles"
import { EmptyState, ErrorNote, PageHeading, stageAccent } from "@/src/components/maker/visual"
import { listKnockoutBrackets, listMatches } from "@/src/server/matches/repository"
import { listGroups } from "@/src/server/groups/repository"
import { listStageEntries } from "@/src/server/stage-entries/repository"
import { listStages } from "@/src/server/stages/repository"
import { buildQualificationPreviews } from "@/src/server/stages/qualification-preview"
import { listTeams } from "@/src/server/teams/repository"
import { loadVisibleTournament } from "@/src/server/tournaments/view"

const typeLabel = { group: "Group", league: "League", knockout: "Knockout" } as const

const errors: Record<string, string> = {
  "has-dependents": "Remove this stage's groups and other setup before deleting it.",
  attach: "That group could not be attached.",
  detach: "This group is already used by the stage and cannot be detached.",
  entry: "That team could not be added to this stage.",
  "entry-used": "This entry is already used and cannot be removed.",
  "bracket-count": "Knockout bracket generation currently requires 2, 4, 8, 16... participants.",
  "bracket-type": "Knockout brackets can only be generated for a knockout stage.",
  "bracket-duplicate": "A participant cannot appear twice in the same bracket.",
  "bracket-exists": "Bracket already generated.",
  completed: "A completed tournament cannot be changed.",
}

export default async function ManageStagesPage({
  params,
  searchParams,
}: {
  params: Promise<{ publicId: string }>
  searchParams: Promise<{ error?: string; rounds?: string; matches?: string }>
}) {
  const { publicId: raw } = await params
  const { error, rounds: roundsRaw, matches: matchesRaw } = await searchParams
  const generatedRounds = /^\d+$/.test(roundsRaw ?? "") ? Number(roundsRaw) : null
  const generatedMatches = /^\d+$/.test(matchesRaw ?? "") ? Number(matchesRaw) : null
  const publicId = normalizePublicId(raw)
  if (!publicId) notFound()
  const { tournament, role } = await loadVisibleTournament(publicId, "update")
  if (!canManageStages({ role, status: tournament.status, deleted: tournament.deletedAt !== null })) notFound()
  const [stages, { groups }, entries, teams, brackets, matches] = await Promise.all([
    listStages(tournament.id),
    listGroups(tournament.id),
    listStageEntries(tournament.id),
    listTeams(tournament.id),
    listKnockoutBrackets(tournament.id),
    listMatches(tournament.id),
  ])
  const qualificationPreviews = buildQualificationPreviews(tournament.id, stages, entries, matches)
  const bracketByStage = new Map(brackets.map((bracket) => [bracket.stageId, bracket.view]))
  const attached = new Set(stages.flatMap((stage) => stage.groups.map((group) => group.sourceGroupId)))
  const available = groups.filter((group) => !attached.has(group.id)).map((group) => ({ id: group.id, name: group.name }))

  return (
    <div className="space-y-6">
      <PageHeading title="Stages" hint="Order the stages, then choose who plays in each one." />
      {generatedRounds !== null && generatedMatches !== null ? (
        <p className="rounded-md bg-success-soft px-3 py-2 text-sm text-success">
          Bracket generated. {generatedRounds} {generatedRounds === 1 ? "round" : "rounds"}, {generatedMatches}{" "}
          {generatedMatches === 1 ? "match" : "matches"}.
        </p>
      ) : null}
      {error && errors[error] && <ErrorNote>{errors[error]}</ErrorNote>}
      {stages.length === 0 ? (
        <EmptyState title="No stages yet">Add a stage to define the tournament structure.</EmptyState>
      ) : (
        <ol className="space-y-4">
          {stages.map((stage) => {
            const participants = entries.filter((entry) => entry.stageId === stage.id)
            const rules = resolveStandingsRules(stage.stageType, stage.rules)
            const qualification = resolveQualificationConfiguration(stage.rules)
            const sourceGroups = stages
              .filter((source) => source.position < stage.position && acceptsGroups(source.stageType)
                && (source.stageType === "group" || source.groups.length === 1))
              .flatMap((source) => source.groups.map((group) => ({ id: group.id, name: `${source.name} · ${group.name}` })))
            return (
            <li key={stage.id} className={`${card} space-y-4 border-l-4 p-4 ${stageAccent(stage.stageType)}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Stage {stage.position}</p>
                  <p className="break-words text-lg font-semibold text-ink">{stage.name}</p>
                </div>
                <span className="rounded-full bg-mist px-2.5 py-0.5 text-xs font-semibold text-ink">{typeLabel[stage.stageType]}</span>
              </div>
              <p className="text-sm text-text-muted">
                {participants.length} {participants.length === 1 ? "participant" : "participants"}
                {stage.stageType === "group"
                  ? ` · ${stage.groups.length === 0 ? "No groups" : stage.groups.map((group) => group.name).join(", ")}`
                  : ""}
                {rules.enabled ? ` · Win ${rules.scoring.win} · Draw ${rules.scoring.draw} · Loss ${rules.scoring.loss}` : " · No standings table"}
              </p>
              <EditStageForm publicId={publicId} stageId={stage.id} name={stage.name} stageType={stage.stageType} />
              {acceptsGroups(stage.stageType) ? (
                <ScoringRulesForm
                  publicId={publicId}
                  stageId={stage.id}
                  win={rules.scoring.win}
                  draw={rules.scoring.draw}
                  loss={rules.scoring.loss}
                  tieBreakers={rules.tieBreakers}
                  locked={tournament.status === "completed"}
                  key={JSON.stringify(rules)}
                />
              ) : (
                <p className="text-sm text-text-muted">This stage does not use a standings table.</p>
              )}
              {stage.stageType === "knockout" && qualification.ok && <QualificationRulesForm
                publicId={publicId} stageId={stage.id} rules={qualification.value.rules}
                sourceGroups={sourceGroups} preview={qualificationPreviews.get(stage.id) ?? null}
                locked={tournament.status === "completed"} key={JSON.stringify(qualification.value)}
              />}
              <div className="flex flex-wrap gap-3">
                <MoveStageButton publicId={publicId} stageId={stage.id} direction="up" />
                <MoveStageButton publicId={publicId} stageId={stage.id} direction="down" />
                <DeleteStageButton publicId={publicId} stageId={stage.id} name={stage.name} />
              </div>
              {acceptsGroups(stage.stageType) ? (
                <div className="space-y-3">
                  {stage.groups.length === 0 ? (
                    <p className="text-sm text-text-muted">No groups attached.</p>
                  ) : (
                    stage.groups.map((group) => {
                      const setup = groups.find((item) => item.id === group.sourceGroupId)
                      const inStage = new Set(
                        entries.filter((entry) => entry.stageId === stage.id).map((entry) => entry.teamId),
                      )
                      const participants = entries.filter(
                        (entry) => entry.stageId === stage.id && entry.stageGroupId === group.id,
                      )
                      const eligible = (setup?.teams ?? []).filter((team) => !inStage.has(team.id))
                      return (
                        <div key={group.id} className="space-y-2">
                          <div className="flex items-center justify-between gap-3 text-sm font-medium">
                            <span>{group.name}</span>
                            <DetachGroupButton publicId={publicId} stageId={stage.id} stageGroupId={group.id} />
                          </div>
                          {participants.length === 0 ? (
                            <p className="text-sm text-text-muted">No teams have been added to this stage yet.</p>
                          ) : (
                            <ul className="space-y-1">
                              {participants.map((entry) => (
                                <EntryRow
                                  key={entry.id}
                                  publicId={publicId}
                                  entryId={entry.id}
                                  slot={entry.slot}
                                  name={entry.name}
                                />
                              ))}
                            </ul>
                          )}
                          <AddEntryForm publicId={publicId} stageId={stage.id} teams={eligible} />
                        </div>
                      )
                    })
                  )}
                  <AttachGroupForm publicId={publicId} stageId={stage.id} groups={available} />
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Participants</p>
                  {participants.length === 0 ? (
                    <p className="text-sm text-text-muted">No teams have been added to this stage yet.</p>
                  ) : (
                    <ul className="space-y-1">
                      {entries
                        .filter((entry) => entry.stageId === stage.id)
                        .map((entry) => (
                          <EntryRow
                            key={entry.id}
                            publicId={publicId}
                            entryId={entry.id}
                            slot={entry.slot}
                            name={entry.name}
                          />
                        ))}
                    </ul>
                  )}
                  <AddEntryForm
                    publicId={publicId}
                    stageId={stage.id}
                    teams={teams
                      .filter((team) => !entries.some((entry) => entry.stageId === stage.id && entry.teamId === team.id))
                      .map((team) => ({ number: team.number, name: team.name }))}
                  />
                  <KnockoutSetup
                    publicId={publicId}
                    stageId={stage.id}
                    participants={participants
                      .slice()
                      .sort((left, right) => left.slot - right.slot || left.id.localeCompare(right.id))
                      .map((entry) => ({ id: entry.id }))}
                    bracket={bracketByStage.get(stage.id) ?? null}
                  />
                </div>
              )}
            </li>
            )
          })}
        </ol>
      )}
      <section className={`${card} p-4`}>
        <h3 className="mb-3 font-medium">Add stage</h3>
        <AddStageForm publicId={publicId} />
      </section>
    </div>
  )
}

function KnockoutSetup({
  publicId,
  stageId,
  participants,
  bracket,
}: {
  publicId: string
  stageId: string
  participants: { id: string }[]
  bracket: BracketView | null
}) {
  if (bracket) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-ink">
          Bracket generated. {bracket.roundCount} {bracket.roundCount === 1 ? "round" : "rounds"}, {bracket.matchCount}{" "}
          {bracket.matchCount === 1 ? "match" : "matches"}.
        </p>
        <KnockoutBracket rounds={bracket.rounds} />
      </div>
    )
  }
  const plan = planKnockoutBracket({ stageType: "knockout", participants, existingMatchCount: 0 })
  if (!plan.ok) return <p className="text-sm text-text-muted">{plan.error}</p>
  return <GenerateBracketButton publicId={publicId} stageId={stageId} />
}
