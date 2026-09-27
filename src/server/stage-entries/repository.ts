import "server-only"
import type { TransactionSql } from "postgres"
import { getSql, type Sql } from "@/src/server/db"

export interface StageEntryRow {
  id: string
  tournamentId: string
  stageId: string
  stageGroupId: string | null
  slot: number
  teamId: string
  number: number
  name: string
  shortName: string
  sourceKind: "team" | "group_rank" | "pooled_rank" | "match_outcome"
}

export class StageEntryConstraintError extends Error {
  constructor(message: string) {
    super(message)
  }
}

function constraintMessage(error: unknown): string | null {
  const code = (error as { code?: string }).code
  const constraint = (error as { constraint_name?: string }).constraint_name
  if (
    code === "23505" &&
    (constraint === "stage_entries_one_team_source_key" || constraint === "stage_entries_one_confirmed_team_key")
  ) {
    return "This team is already in this stage."
  }
  return null
}

export async function listStageEntries(tournamentId: string, sql: Sql = getSql()): Promise<StageEntryRow[]> {
  const rows = await sql<{
    id: string
    tournament_id: string
    stage_id: string
    group_id: string | null
    slot: number
    team_id: string
    number: number
    name: string
    short_name: string
    source_kind: "team" | "group_rank" | "pooled_rank" | "match_outcome"
  }[]>`
    select
      e.id,
      e.tournament_id,
      e.stage_id,
      e.group_id,
      e.slot,
      e.confirmed_team_id as team_id,
      t.number,
      t.name,
      t.short_name,
      e.source_kind
    from app.stage_entries e
    join app.teams t on t.id = e.confirmed_team_id and t.tournament_id = e.tournament_id
    where e.tournament_id = ${tournamentId}
      and e.confirmed_team_id is not null
    order by e.stage_id, e.group_id nulls first, e.slot, e.id
  `
  return rows.map((row) => ({
    id: row.id,
    tournamentId: row.tournament_id,
    stageId: row.stage_id,
    stageGroupId: row.group_id,
    slot: row.slot,
    teamId: row.team_id,
    number: row.number,
    name: row.name,
    shortName: row.short_name,
    sourceKind: row.source_kind,
  }))
}

export async function findStageEntry(
  tournamentId: string,
  entryId: string,
  sql: Sql = getSql(),
): Promise<StageEntryRow | null> {
  const entries = await listStageEntries(tournamentId, sql)
  return entries.find((entry) => entry.id === entryId) ?? null
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
      'stage_entry',
      ${input.entityId},
      ${tx.json(input.payload as never)}
    )
  `
}

export async function insertStageEntry(
  input: {
    tournamentId: string
    stageId: string
    stageGroupId: string | null
    teamId: string
    actorId: string
  },
  sql: Sql = getSql(),
): Promise<void> {
  try {
    await sql.begin(async (tx) => {
      const slot = await tx<{ slot: number }[]>`
        select coalesce(max(slot), 0) + 1 as slot
        from app.stage_entries
        where tournament_id = ${input.tournamentId}
          and stage_id = ${input.stageId}
          and group_id is not distinct from ${input.stageGroupId}
      `
      const inserted = await tx<{ id: string; slot: number }[]>`
        insert into app.stage_entries (
          tournament_id,
          stage_id,
          group_id,
          slot,
          source_kind,
          source_team_id,
          confirmed_team_id,
          confirmed_via
        )
        values (
          ${input.tournamentId},
          ${input.stageId},
          ${input.stageGroupId},
          ${slot[0].slot},
          'team',
          ${input.teamId},
          ${input.teamId},
          'override'
        )
        returning id, slot
      `
      await writeAudit(tx, {
        tournamentId: input.tournamentId,
        actorId: input.actorId,
        action: "stage_entry.created",
        entityId: inserted[0].id,
        payload: {
          stageId: input.stageId,
          teamId: input.teamId,
          entryId: inserted[0].id,
          slot: inserted[0].slot,
          stageGroupId: input.stageGroupId,
        },
      })
    })
  } catch (error) {
    const message = constraintMessage(error)
    if (message) throw new StageEntryConstraintError(message)
    throw error
  }
}

export async function entryIsReferenced(tournamentId: string, entryId: string, sql: Sql = getSql()): Promise<boolean> {
  const rows = await sql<{ referenced: boolean }[]>`
    select exists (
      select 1 from app.match_participants
      where tournament_id = ${tournamentId} and source_entry_id = ${entryId}
    ) as referenced
  `
  return rows[0]?.referenced ?? false
}

export async function deleteStageEntry(
  input: { tournamentId: string; entryId: string; actorId: string; stageId: string; teamId: string; slot: number },
  sql: Sql = getSql(),
): Promise<void> {
  await sql.begin(async (tx) => {
    await writeAudit(tx, {
      tournamentId: input.tournamentId,
      actorId: input.actorId,
      action: "stage_entry.deleted",
      entityId: input.entryId,
      payload: { stageId: input.stageId, teamId: input.teamId, entryId: input.entryId, slot: input.slot },
    })
    await tx`
      delete from app.stage_entries
      where id = ${input.entryId} and tournament_id = ${input.tournamentId}
    `
  })
}

export async function swapEntrySlots(
  input: {
    tournamentId: string
    actorId: string
    entryId: string
    otherEntryId: string
    stageId: string
    stageGroupId: string | null
    fromSlot: number
    toSlot: number
    teamId: string
  },
  sql: Sql = getSql(),
): Promise<void> {
  await sql.begin(async (tx) => {
    const temp = await tx<{ slot: number }[]>`
      select coalesce(max(slot), 0) + 1 as slot
      from app.stage_entries
      where tournament_id = ${input.tournamentId}
        and stage_id = ${input.stageId}
        and group_id is not distinct from ${input.stageGroupId}
    `
    await tx`
      update app.stage_entries
      set slot = ${temp[0].slot}
      where id = ${input.entryId} and tournament_id = ${input.tournamentId}
    `
    await tx`
      update app.stage_entries
      set slot = ${input.fromSlot}
      where id = ${input.otherEntryId} and tournament_id = ${input.tournamentId}
    `
    await tx`
      update app.stage_entries
      set slot = ${input.toSlot}
      where id = ${input.entryId} and tournament_id = ${input.tournamentId}
    `
    await writeAudit(tx, {
      tournamentId: input.tournamentId,
      actorId: input.actorId,
      action: "stage_entry.reordered",
      entityId: input.entryId,
      payload: {
        stageId: input.stageId,
        teamId: input.teamId,
        entryId: input.entryId,
        fromSlot: input.fromSlot,
        toSlot: input.toSlot,
      },
    })
  })
}
