import "server-only"
import {
  calculateStandings,
  resolveStandingsRules,
  type StageStandings,
} from "@/src/domain/tournament/standings"
import type { StageType } from "@/src/domain/tournament/stage"
import { getSql, type Sql } from "@/src/server/db"
import { listMatches } from "@/src/server/matches/repository"
import { listStageEntries } from "@/src/server/stage-entries/repository"
import { listStages } from "@/src/server/stages/repository"

export interface StageStandingsView {
  stageId: string
  stageName: string
  stageType: StageType
  position: number
  table: StageStandings
}

export async function listStageStandings(tournamentId: string, sql: Sql = getSql()): Promise<StageStandingsView[]> {
  const [stages, entries, matches] = await Promise.all([
    listStages(tournamentId, sql),
    listStageEntries(tournamentId, sql),
    listMatches(tournamentId, sql),
  ])

  return stages.map((stage) => ({
    stageId: stage.id,
    stageName: stage.name,
    stageType: stage.stageType,
    position: stage.position,
    table: calculateStandings({
      stage: {
        id: stage.id,
        stageType: stage.stageType,
        standings: resolveStandingsRules(stage.stageType, stage.rules),
      },
      stageGroups: stage.groups.map((group) => ({ id: group.id, stageId: stage.id, name: group.name })),
      stageEntries: entries.map((entry) => ({
        id: entry.id,
        stageId: entry.stageId,
        stageGroupId: entry.stageGroupId,
        teamId: entry.teamId,
        name: entry.name,
      })),
      matches: matches.map((match) => ({
        id: match.id,
        stageId: match.stageId,
        stageGroupId: match.stageGroupId,
        status: match.status,
      })),
      matchParticipants: matches.flatMap((match) =>
        match.participants.map((participant) => ({
          matchId: match.id,
          entryId: participant.entryId,
          score: participant.score,
        })),
      ),
    }),
  }))
}
