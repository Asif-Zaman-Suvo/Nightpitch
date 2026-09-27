import "server-only"
import { calculateQualifiedEntries, resolveQualificationConfiguration, type QualificationPreview, type QualificationSource } from "@/src/domain/tournament/qualification"
import { calculateStandings, resolveStandingsRules } from "@/src/domain/tournament/standings"
import { getSql, type Sql } from "@/src/server/db"
import { listMatches, type MatchRow } from "@/src/server/matches/repository"
import { listStageEntries, type StageEntryRow } from "@/src/server/stage-entries/repository"
import { listStages, type StageRow } from "@/src/server/stages/repository"

export async function listQualificationPreviews(tournamentId: string, sql: Sql = getSql()): Promise<Map<string, QualificationPreview>> {
  const [stages, entries, matches] = await Promise.all([
    listStages(tournamentId, sql), listStageEntries(tournamentId, sql), listMatches(tournamentId, sql),
  ])
  return buildQualificationPreviews(tournamentId, stages, entries, matches)
}

export function buildQualificationPreviews(
  tournamentId: string, stages: StageRow[], entries: StageEntryRow[], matches: MatchRow[],
): Map<string, QualificationPreview> {
  const sources: QualificationSource[] = stages.flatMap((stage) => {
    const table = calculateStandings({
      stage: { id: stage.id, stageType: stage.stageType, standings: resolveStandingsRules(stage.stageType, stage.rules) },
      stageGroups: stage.groups.map((group) => ({ id: group.id, stageId: stage.id, name: group.name })),
      stageEntries: entries.map((entry) => ({ id: entry.id, stageId: entry.stageId,
        stageGroupId: entry.stageGroupId, teamId: entry.teamId, name: entry.name })),
      matches: matches.map((match) => ({ id: match.id, stageId: match.stageId,
        stageGroupId: match.stageGroupId, status: match.status })),
      matchParticipants: matches.flatMap((match) => match.participants.map((participant) => ({
        matchId: match.id, entryId: participant.entryId, score: participant.score,
      }))),
    })
    return stage.groups.map((group) => ({
      id: group.id, tournamentId, stageId: stage.id, stagePosition: stage.position,
      stageType: stage.stageType, stageGroupCount: stage.groups.length, name: group.name,
      rows: table?.kind === "groups" ? table.groups.find((item) => item.groupId === group.id)?.rows ?? []
        : table?.kind === "league" ? table.rows : [],
      entries: entries.filter((entry) => entry.stageGroupId === group.id).map((entry) => ({ id: entry.id, teamId: entry.teamId })),
      completedMatches: matches.filter((match) => match.stageId === stage.id && match.status === "completed"
        && (stage.stageType === "league" || match.stageGroupId === group.id)).length,
    }))
  })
  const previews = new Map<string, QualificationPreview>()
  for (const stage of stages.filter((item) => item.stageType === "knockout")) {
    const configuration = resolveQualificationConfiguration(stage.rules)
    previews.set(stage.id, configuration.ok
      ? calculateQualifiedEntries({ tournamentId, destinationStageId: stage.id,
        destinationPosition: stage.position, configuration: configuration.value, sources })
      : { ok: false, error: configuration.error, groups: [], qualified: [] })
  }
  return previews
}
