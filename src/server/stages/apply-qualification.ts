import "server-only"
import { completedMutationError } from "@/src/domain/tournament/champion"
import { planQualificationApply, resolveQualificationConfiguration, type AppliedEntrySnapshot } from "@/src/domain/tournament/qualification"
import { getSql, type Sql } from "@/src/server/db"
import { listMatches } from "@/src/server/matches/repository"
import { listStageEntries } from "@/src/server/stage-entries/repository"
import { listStages, StageConstraintError } from "@/src/server/stages/repository"
import { buildQualificationPreviews } from "@/src/server/stages/qualification-preview"

export interface QualificationApplyResult {
  status: "unchanged" | "applied"
  created: string[]
  updated: string[]
  removed: string[]
}

export async function applyQualification(
  input: { tournamentId: string; stageId: string; actorId: string },
  sql: Sql = getSql(),
): Promise<QualificationApplyResult> {
  return sql.begin(async (tx) => {
    const [tournament] = await tx<{ status: "draft" | "published" | "completed" | "archived"; owner_id: string; deleted_at: Date | null }[]>`
      select status, owner_id, deleted_at from app.tournaments where id = ${input.tournamentId} for update
    `
    if (!tournament || tournament.deleted_at || tournament.owner_id !== input.actorId || tournament.status === "archived") {
      throw new StageConstraintError("You cannot change stages in this tournament.")
    }
    const locked = completedMutationError(tournament.status)
    if (locked) throw new StageConstraintError(locked)
    const [stage] = await tx<{ rules: unknown; stage_type: string }[]>`
      select rules, stage_type from app.stages
      where id = ${input.stageId} and tournament_id = ${input.tournamentId}
      for update
    `
    if (!stage) throw new StageConstraintError("Stage not found.")
    if (stage.stage_type !== "knockout") throw new StageConstraintError("Qualification rules belong to a knockout stage.")
    const configuration = resolveQualificationConfiguration(stage.rules)
    if (!configuration.ok) throw new StageConstraintError(configuration.error)
    if (configuration.value.rules.length === 0) throw new StageConstraintError("This stage has no qualification rules.")

    const connection = tx as unknown as Sql
    const [stages, entries, matches] = await Promise.all([
      listStages(input.tournamentId, connection),
      listStageEntries(input.tournamentId, connection),
      listMatches(input.tournamentId, connection),
    ])
    const preview = buildQualificationPreviews(input.tournamentId, stages, entries, matches).get(input.stageId)
    if (!preview) throw new StageConstraintError("Stage not found.")
    const rows = await tx<{
      id: string
      slot: number
      source_kind: AppliedEntrySnapshot["sourceKind"]
      source_group_id: string | null
      source_rank: number | null
      team_id: string | null
      name: string | null
      referenced: boolean
    }[]>`
      select e.id, e.slot, e.source_kind, e.source_group_id, e.source_rank,
        e.confirmed_team_id as team_id, t.name,
        exists (
          select 1 from app.match_participants p
          where p.tournament_id = e.tournament_id and p.source_entry_id = e.id
        ) as referenced
      from app.stage_entries e
      left join app.teams t on t.id = e.confirmed_team_id and t.tournament_id = e.tournament_id
      where e.tournament_id = ${input.tournamentId} and e.stage_id = ${input.stageId}
      order by e.slot
      for update of e
    `
    const [matchCount] = await tx<{ n: number }[]>`
      select count(*)::int as n from app.matches
      where tournament_id = ${input.tournamentId} and stage_id = ${input.stageId}
    `
    const plan = planQualificationApply({
      preview,
      hasRules: true,
      destinationHasMatches: (matchCount?.n ?? 0) > 0,
      entries: rows.map((row) => ({
        id: row.id,
        slot: row.slot,
        teamId: row.team_id ?? "",
        name: row.name ?? "Participant",
        sourceKind: row.source_kind,
        sourceGroupId: row.source_group_id,
        sourceRank: row.source_rank,
        referenced: row.referenced,
      })),
    })
    if (!plan.ok) throw new StageConstraintError(plan.error)
    if (plan.status === "unchanged") return { status: "unchanged", created: [], updated: [], removed: [] }

    for (const item of plan.remove) {
      await tx`
        delete from app.stage_entries
        where id = ${item.id} and tournament_id = ${input.tournamentId}
          and stage_id = ${input.stageId} and source_kind = 'group_rank'
      `
    }
    for (const item of plan.update) {
      await tx`
        update app.stage_entries
        set slot = slot + 1000, confirmed_team_id = null, confirmed_via = null
        where id = ${item.id} and tournament_id = ${input.tournamentId}
          and stage_id = ${input.stageId} and source_kind = 'group_rank'
      `
    }
    for (const item of plan.update) {
      await tx`
        update app.stage_entries
        set slot = ${item.slot}, source_group_id = ${item.sourceGroupId}, source_rank = ${item.rank},
          confirmed_team_id = ${item.teamId}, confirmed_via = 'resolution'
        where id = ${item.id} and tournament_id = ${input.tournamentId}
          and stage_id = ${input.stageId} and source_kind = 'group_rank'
      `
    }
    const created: string[] = []
    for (const item of plan.create) {
      const [row] = await tx<{ id: string }[]>`
        insert into app.stage_entries (
          tournament_id, stage_id, group_id, slot, source_kind,
          source_group_id, source_rank, confirmed_team_id, confirmed_via
        )
        values (
          ${input.tournamentId}, ${input.stageId}, null, ${item.slot}, 'group_rank',
          ${item.sourceGroupId}, ${item.rank}, ${item.teamId}, 'resolution'
        )
        returning id
      `
      if (!row) throw new StageConstraintError("Qualification could not be applied.")
      created.push(row.id)
    }
    await tx`
      insert into app.audit_log (tournament_id, actor_id, action, entity_type, entity_id, after)
      values (
        ${input.tournamentId}, ${input.actorId}, 'qualification.applied', 'stage', ${input.stageId},
        ${tx.json({
          tournamentId: input.tournamentId,
          destinationStageId: input.stageId,
          rules: configuration.value.rules,
          qualifiedTeamIds: preview.ok ? preview.qualified.map((item) => item.teamId) : [],
          createdEntryIds: created,
          updatedEntryIds: plan.update.map((item) => item.id),
          removedEntryIds: plan.remove.map((item) => item.id),
        } as never)}
      )
    `
    return { status: "applied", created, updated: plan.update.map((item) => item.id), removed: plan.remove.map((item) => item.id) }
  })
}
