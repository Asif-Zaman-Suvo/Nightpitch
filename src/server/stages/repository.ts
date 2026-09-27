import "server-only"
import type { TransactionSql } from "postgres"
import { completedMutationError } from "@/src/domain/tournament/champion"
import type { TournamentStatus } from "@/src/domain/tournament/access"
import { defaultStageRules, parseStandingsConfiguration, resolveStandingsRules, sameStandingsRules, type StageRules } from "@/src/domain/tournament/standings"
import { parseQualificationConfiguration, resolveQualificationConfiguration, type QualificationConfiguration } from "@/src/domain/tournament/qualification"
import type { StageType } from "@/src/domain/tournament/stage"
import { getSql, type Sql } from "@/src/server/db"

export interface StageGroupLink {
  id: string
  sourceGroupId: string
  name: string
}

export interface StageRow {
  id: string
  tournamentId: string
  position: number
  name: string
  stageType: StageType
  rules: unknown
  groups: StageGroupLink[]
}

export interface StageDependencyCounts {
  groups: number
  entries: number
  tieOrders: number
  matches: number
}

export class StageConstraintError extends Error {
  constructor(message: string) {
    super(message)
  }
}

function constraintMessage(error: unknown): string | null {
  const code = (error as { code?: string }).code
  const constraint = (error as { constraint_name?: string }).constraint_name
  if (code === "23505" && constraint === "stages_tournament_name_lower_key") {
    return "A stage with this name already exists."
  }
  if (code === "23505" && constraint === "stage_groups_source_group_key") {
    return "This group is already attached to a stage."
  }
  if (code === "23514" && String((error as { message?: string }).message).includes("groups belong only")) {
    return "Only a group or league stage can use groups."
  }
  return null
}

export async function listStages(tournamentId: string, sql: Sql = getSql()): Promise<StageRow[]> {
  const stages = await sql<{
    id: string
    tournament_id: string
    position: number
    name: string
    stage_type: StageType
    rules: unknown
  }[]>`
    select id, tournament_id, position, name, stage_type, rules
    from app.stages
    where tournament_id = ${tournamentId}
    order by position, id
  `
  const links = await sql<{ id: string; stage_id: string; source_group_id: string; name: string }[]>`
    select sg.id, sg.stage_id, sg.source_group_id, g.name
    from app.stage_groups sg
    join app.groups g on g.id = sg.source_group_id and g.tournament_id = sg.tournament_id
    where sg.tournament_id = ${tournamentId}
    order by g.position, g.name
  `
  const byStage = new Map<string, StageGroupLink[]>()
  for (const link of links) {
    const list = byStage.get(link.stage_id) ?? []
    list.push({ id: link.id, sourceGroupId: link.source_group_id, name: link.name })
    byStage.set(link.stage_id, list)
  }
  return stages.map((stage) => ({
    id: stage.id,
    tournamentId: stage.tournament_id,
    position: stage.position,
    name: stage.name,
    stageType: stage.stage_type,
    rules: stage.rules,
    groups: byStage.get(stage.id) ?? [],
  }))
}

export async function findStage(tournamentId: string, stageId: string, sql: Sql = getSql()): Promise<StageRow | null> {
  const stages = await listStages(tournamentId, sql)
  return stages.find((stage) => stage.id === stageId) ?? null
}

async function writeAudit(
  tx: TransactionSql,
  input: { tournamentId: string; actorId: string; action: string; entityId: string; payload: unknown },
) {
  await tx`
    insert into app.audit_log (tournament_id, actor_id, action, entity_type, entity_id, after)
    values (
      ${input.tournamentId},
      ${input.actorId},
      ${input.action},
      'stage',
      ${input.entityId},
      ${tx.json(input.payload as never)}
    )
  `
}

export async function insertStage(
  input: { tournamentId: string; actorId: string; name: string; stageType: StageType },
  sql: Sql = getSql(),
): Promise<void> {
  try {
    await sql.begin(async (tx) => {
      const position = await tx<{ position: number }[]>`
        select coalesce(max(position), 0) + 1 as position
        from app.stages
        where tournament_id = ${input.tournamentId}
      `
      const inserted = await tx<{ id: string; position: number }[]>`
        insert into app.stages (tournament_id, position, name, stage_type, rules)
        values (
          ${input.tournamentId},
          ${position[0].position},
          ${input.name},
          ${input.stageType},
          ${tx.json(defaultStageRules(input.stageType) as never)}
        )
        returning id, position
      `
      await writeAudit(tx, {
        tournamentId: input.tournamentId,
        actorId: input.actorId,
        action: "stage.created",
        entityId: inserted[0].id,
        payload: { name: input.name, stageType: input.stageType, position: inserted[0].position },
      })
    })
  } catch (error) {
    const message = constraintMessage(error)
    if (message) throw new StageConstraintError(message)
    throw error
  }
}

export async function updateStageRules(
  input: { tournamentId: string; stageId: string; actorId: string; rules: StageRules },
  sql: Sql = getSql(),
): Promise<void> {
  const parsed = parseStandingsConfiguration(input.rules.standings)
  if (!parsed.ok) throw new StageConstraintError(parsed.error)
  await sql.begin(async (tx) => {
    const [tournament] = await tx<{ status: TournamentStatus; owner_id: string; deleted_at: Date | null }[]>`
      select status, owner_id, deleted_at from app.tournaments where id = ${input.tournamentId} for update
    `
    if (!tournament || tournament.deleted_at || tournament.owner_id !== input.actorId || tournament.status === "archived") {
      throw new StageConstraintError("You cannot change stages in this tournament.")
    }
    const locked = completedMutationError(tournament.status)
    if (locked) throw new StageConstraintError(locked)
    const [stage] = await tx<{ rules: unknown; stage_type: StageType }[]>`
      select rules, stage_type from app.stages
      where id = ${input.stageId} and tournament_id = ${input.tournamentId} for update
    `
    if (!stage) throw new StageConstraintError("Stage not found.")
    if (stage.stage_type === "knockout") throw new StageConstraintError("A knockout stage does not use standings rules.")
    const previous = resolveStandingsRules(stage.stage_type, stage.rules)
    // Preserve unrelated stage configuration and the legacy enabled flag.
    const existing = stage.rules as Record<string, unknown>
    const previousStandings = existing.standings as Record<string, unknown> | undefined
    const { scoring: _scoring, ...standings } = previousStandings ?? {}
    void _scoring
    const rules = { ...existing, schemaVersion: "1", standings: { ...standings, ...parsed.value } }
    if (sameStandingsRules(previous, resolveStandingsRules(stage.stage_type, rules))) return
    await tx`
      update app.stages set rules = ${tx.json(rules as never)}
      where id = ${input.stageId} and tournament_id = ${input.tournamentId}
    `
    await writeAudit(tx, {
      tournamentId: input.tournamentId, actorId: input.actorId,
      action: "stage.configuration_changed", entityId: input.stageId,
      payload: { stageId: input.stageId, previousRules: stage.rules, newRules: rules },
    })
  })
}

export async function updateQualificationRules(
  input: { tournamentId: string; stageId: string; actorId: string; qualification: QualificationConfiguration },
  sql: Sql = getSql(),
): Promise<void> {
  const parsed = parseQualificationConfiguration(input.qualification)
  if (!parsed.ok) throw new StageConstraintError(parsed.error)
  await sql.begin(async (tx) => {
    const [tournament] = await tx<{ status: TournamentStatus; owner_id: string; deleted_at: Date | null }[]>`
      select status, owner_id, deleted_at from app.tournaments where id = ${input.tournamentId} for update
    `
    if (!tournament || tournament.deleted_at || tournament.owner_id !== input.actorId || tournament.status === "archived") {
      throw new StageConstraintError("You cannot change stages in this tournament.")
    }
    const locked = completedMutationError(tournament.status)
    if (locked) throw new StageConstraintError(locked)
    const [stage] = await tx<{ rules: unknown; stage_type: StageType; position: number }[]>`
      select rules, stage_type, position from app.stages
      where id = ${input.stageId} and tournament_id = ${input.tournamentId} for update
    `
    if (!stage) throw new StageConstraintError("Stage not found.")
    if (stage.stage_type !== "knockout") throw new StageConstraintError("Qualification rules belong to a knockout stage.")
    for (const rule of parsed.value.rules) {
      const [source] = await tx<{ tournament_id: string; stage_id: string; position: number; stage_type: StageType; group_count: number }[]>`
        select sg.tournament_id, sg.stage_id, s.position, s.stage_type,
          (select count(*)::int from app.stage_groups where stage_id = s.id) as group_count
        from app.stage_groups sg join app.stages s on s.id = sg.stage_id and s.tournament_id = sg.tournament_id
        where sg.id = ${rule.sourceGroupId} for share of sg, s
      `
      if (!source || source.tournament_id !== input.tournamentId) {
        throw new StageConstraintError("Source group not found in this tournament.")
      }
      if (source.stage_id === input.stageId || source.position >= stage.position || source.stage_type === "knockout") {
        throw new StageConstraintError("Choose a group attached to an earlier group or league stage.")
      }
      if (source.stage_type === "league" && source.group_count !== 1) {
        throw new StageConstraintError("A league source must have exactly one attached group.")
      }
    }
    const previous = resolveQualificationConfiguration(stage.rules)
    if (!previous.ok) throw new StageConstraintError(previous.error)
    if (JSON.stringify(previous.value.rules) === JSON.stringify(parsed.value.rules)) return
    const existing = stage.rules as Record<string, unknown>
    const rules = { ...existing, qualification: parsed.value }
    await tx`update app.stages set rules = ${tx.json(rules as never)} where id = ${input.stageId} and tournament_id = ${input.tournamentId}`
    await writeAudit(tx, {
      tournamentId: input.tournamentId, actorId: input.actorId, action: "stage.configuration_changed", entityId: input.stageId,
      payload: { stageId: input.stageId, previousRules: stage.rules, newRules: rules },
    })
  })
}

export async function updateStage(
  input: { tournamentId: string; stageId: string; actorId: string; name: string; stageType: StageType },
  sql: Sql = getSql(),
): Promise<void> {
  try {
    await sql.begin(async (tx) => {
      const updated = await tx<{ id: string; position: number }[]>`
        update app.stages
        set name = ${input.name}, stage_type = ${input.stageType}
        where id = ${input.stageId} and tournament_id = ${input.tournamentId}
        returning id, position
      `
      if (!updated[0]) throw new StageConstraintError("Stage not found.")
      await writeAudit(tx, {
        tournamentId: input.tournamentId,
        actorId: input.actorId,
        action: "stage.updated",
        entityId: input.stageId,
        payload: { name: input.name, stageType: input.stageType, position: updated[0].position },
      })
    })
  } catch (error) {
    if (error instanceof StageConstraintError) throw error
    const message = constraintMessage(error)
    if (message) throw new StageConstraintError(message)
    throw error
  }
}

export async function stageDependencyCounts(
  tournamentId: string,
  stageId: string,
  sql: Sql = getSql(),
): Promise<StageDependencyCounts> {
  const rows = await sql<StageDependencyCounts[]>`
    select
      (select count(*) from app.stage_groups where tournament_id = ${tournamentId} and stage_id = ${stageId})::int as groups,
      (select count(*) from app.stage_entries where tournament_id = ${tournamentId} and stage_id = ${stageId})::int as entries,
      (select count(*) from app.tie_orders where tournament_id = ${tournamentId} and stage_id = ${stageId})::int as "tieOrders",
      (select count(*) from app.matches where tournament_id = ${tournamentId} and stage_id = ${stageId})::int as matches
  `
  return rows[0]
}

export async function deleteStage(
  input: { tournamentId: string; stageId: string; actorId: string; name: string; position: number },
  sql: Sql = getSql(),
): Promise<void> {
  await sql.begin(async (tx) => {
    await writeAudit(tx, {
      tournamentId: input.tournamentId,
      actorId: input.actorId,
      action: "stage.deleted",
      entityId: input.stageId,
      payload: { name: input.name, position: input.position },
    })
    await tx`
      delete from app.stages
      where id = ${input.stageId} and tournament_id = ${input.tournamentId}
    `
  })
}

export async function swapStageOrder(
  input: {
    tournamentId: string
    actorId: string
    stageId: string
    otherStageId: string
    fromPosition: number
    toPosition: number
  },
  sql: Sql = getSql(),
): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`set constraints stages_tournament_id_position_key deferred`
    await tx`
      update app.stages
      set position = case id
        when ${input.stageId} then ${input.toPosition}
        when ${input.otherStageId} then ${input.fromPosition}
      end
      where tournament_id = ${input.tournamentId}
        and id in (${input.stageId}, ${input.otherStageId})
    `
    await writeAudit(tx, {
      tournamentId: input.tournamentId,
      actorId: input.actorId,
      action: "stage.reordered",
      entityId: input.stageId,
      payload: {
        stageId: input.stageId,
        fromPosition: input.fromPosition,
        toPosition: input.toPosition,
      },
    })
  })
}

export async function attachGroupToStage(
  input: {
    tournamentId: string
    stageId: string
    groupId: string
    actorId: string
    groupName: string
  },
  sql: Sql = getSql(),
): Promise<void> {
  try {
    await sql.begin(async (tx) => {
      const position = await tx<{ position: number }[]>`
        select coalesce(max(position), 0) + 1 as position
        from app.stage_groups
        where stage_id = ${input.stageId}
      `
      const inserted = await tx<{ id: string }[]>`
        insert into app.stage_groups (tournament_id, stage_id, position, name, source_group_id)
        values (
          ${input.tournamentId},
          ${input.stageId},
          ${position[0].position},
          ${input.groupName},
          ${input.groupId}
        )
        returning id
      `
      await writeAudit(tx, {
        tournamentId: input.tournamentId,
        actorId: input.actorId,
        action: "stage.updated",
        entityId: input.stageId,
        payload: { attachedGroupId: input.groupId, stageGroupId: inserted[0].id, name: input.groupName },
      })
    })
  } catch (error) {
    const message = constraintMessage(error)
    if (message) throw new StageConstraintError(message)
    throw error
  }
}

export async function detachGroupFromStage(
  input: { tournamentId: string; stageId: string; stageGroupId: string; actorId: string },
  sql: Sql = getSql(),
): Promise<void> {
  const blocked = await sql<{ blocked: boolean }[]>`
    select exists (
      select 1 from app.stage_entries
      where tournament_id = ${input.tournamentId}
        and (group_id = ${input.stageGroupId} or source_group_id = ${input.stageGroupId})
      union all
      select 1 from app.tie_orders
      where tournament_id = ${input.tournamentId} and group_id = ${input.stageGroupId}
      union all
      select 1 from app.matches
      where tournament_id = ${input.tournamentId} and group_id = ${input.stageGroupId}
    ) as blocked
  `
  if (blocked[0]?.blocked) {
    throw new StageConstraintError("This group is already used by the stage and cannot be detached.")
  }
  await sql.begin(async (tx) => {
    const removed = await tx<{ source_group_id: string | null }[]>`
      delete from app.stage_groups
      where id = ${input.stageGroupId}
        and stage_id = ${input.stageId}
        and tournament_id = ${input.tournamentId}
      returning source_group_id
    `
    if (!removed[0]) throw new StageConstraintError("Group link not found.")
    await writeAudit(tx, {
      tournamentId: input.tournamentId,
      actorId: input.actorId,
      action: "stage.updated",
      entityId: input.stageId,
      payload: { detachedGroupId: removed[0].source_group_id, stageGroupId: input.stageGroupId },
    })
  })
}
