import "server-only"
import { cache } from "react"
import type { TournamentStatus, TournamentVisibility } from "@/src/domain/tournament/access"
import {
  canDiscover,
  canOpenWithoutLogin,
  ilikeContains,
  parseTournamentSearch,
  SEARCH_RESULT_LIMIT,
} from "@/src/domain/tournament/search"
import { getSql, type Sql } from "@/src/server/db"

export interface TournamentRow {
  id: string
  publicId: string
  ownerId: string
  ownerName: string
  name: string
  description: string
  visibility: TournamentVisibility
  status: TournamentStatus
  deletedAt: string | null
  teamCount: number
  groupCount: number
  stageCount: number
  matchCount: number
}

interface TournamentDbRow {
  id: string
  public_id: string
  owner_id: string
  owner_name: string
  name: string
  description: string
  visibility: TournamentVisibility
  status: TournamentStatus
  deleted_at: string | null
  team_count: number
  group_count: number
  stage_count: number
  match_count: number
}

function mapRow(row: TournamentDbRow): TournamentRow {
  return {
    id: row.id,
    publicId: row.public_id,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    name: row.name,
    description: row.description,
    visibility: row.visibility,
    status: row.status,
    deletedAt: row.deleted_at,
    teamCount: Number(row.team_count),
    groupCount: Number(row.group_count),
    stageCount: Number(row.stage_count),
    matchCount: Number(row.match_count),
  }
}

const tournamentSelect = `
  select t.id, t.public_id, t.owner_id, p.display_name as owner_name,
         t.name, t.description, t.visibility, t.status, t.deleted_at,
         (select count(*) from app.teams where tournament_id = t.id) as team_count,
         (select count(*) from app.groups where tournament_id = t.id) as group_count,
         (select count(*) from app.stages where tournament_id = t.id) as stage_count,
         (select count(*) from app.matches where tournament_id = t.id) as match_count
  from app.tournaments t
  join app.profiles p on p.id = t.owner_id
`

export async function publicIdTaken(publicId: string, sql: Sql = getSql()): Promise<boolean> {
  const rows = await sql<{ exists: boolean }[]>`
    select true as exists from app.tournaments where public_id = ${publicId}
  `
  return rows.length > 0
}

export async function insertTournament(
  input: {
    publicId: string
    ownerId: string
    name: string
    description: string
    visibility: TournamentVisibility
  },
  sql: Sql = getSql(),
): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`
      insert into app.profiles (id, display_name)
      values (${input.ownerId}, 'Organizer')
      on conflict (id) do nothing
    `
    const inserted = await tx<{ id: string }[]>`
      insert into app.tournaments (public_id, owner_id, name, description, visibility)
      values (${input.publicId}, ${input.ownerId}, ${input.name}, ${input.description}, ${input.visibility})
      returning id
    `
    await tx`
      insert into app.audit_log (tournament_id, actor_id, action, entity_type, entity_id, after)
      values (
        ${inserted[0].id},
        ${input.ownerId},
        'tournament.created',
        'tournament',
        ${inserted[0].id},
        ${tx.json({ name: input.name, visibility: input.visibility })}
      )
    `
  })
}

export async function listOwnedTournaments(ownerId: string): Promise<TournamentRow[]> {
  const sql = getSql()
  const rows = await sql.unsafe<TournamentDbRow[]>(
    `${tournamentSelect} where t.owner_id = $1 and t.deleted_at is null order by t.created_at desc`,
    [ownerId],
  )
  return rows.map(mapRow)
}

export interface PublicTournamentHit {
  publicId: string
  name: string
  status: TournamentStatus
  teamCount: number
  stageCount: number
}

export async function searchPublicTournaments(raw: string, sql: Sql = getSql()): Promise<PublicTournamentHit[]> {
  const parsed = parseTournamentSearch(raw)
  if (parsed.kind === "empty") return []

  const rows =
    parsed.kind === "id"
      ? await sql.unsafe<TournamentDbRow[]>(
          `${tournamentSelect}
           where t.public_id = $1
             and t.deleted_at is null
             and t.status in ('published', 'completed')
             and t.visibility in ('public', 'unlisted')
           limit 1`,
          [parsed.publicId],
        )
      : await sql.unsafe<TournamentDbRow[]>(
          `${tournamentSelect}
           where t.deleted_at is null
             and t.status in ('published', 'completed')
             and t.visibility = 'public'
             and t.name ilike $1 escape '\\'
           order by t.name, t.public_id
           limit $2`,
          [ilikeContains(parsed.term), SEARCH_RESULT_LIMIT],
        )

  return rows
    .map(mapRow)
    .filter((row) =>
      parsed.kind === "id"
        ? canOpenWithoutLogin({ status: row.status, visibility: row.visibility, deleted: row.deletedAt !== null })
        : canDiscover({ status: row.status, visibility: row.visibility, deleted: row.deletedAt !== null }),
    )
    .map((row) => ({
      publicId: row.publicId,
      name: row.name,
      status: row.status,
      teamCount: row.teamCount,
      stageCount: row.stageCount,
    }))
}

export const findTournament = cache(async (publicId: string): Promise<TournamentRow | null> => {
  const sql = getSql()
  const rows = await sql.unsafe<TournamentDbRow[]>(
    `${tournamentSelect} where t.public_id = $1`,
    [publicId],
  )
  return rows[0] ? mapRow(rows[0]) : null
})

export interface TournamentGate {
  id: string
  ownerId: string
  status: TournamentStatus
  visibility: TournamentVisibility
  deletedAt: string | null
}

export async function findTournamentGate(publicId: string): Promise<TournamentGate | null> {
  const sql = getSql()
  const rows = await sql<{
    id: string
    owner_id: string
    status: TournamentStatus
    visibility: TournamentVisibility
    deleted_at: string | null
  }[]>`
    select id, owner_id, status, visibility, deleted_at
    from app.tournaments
    where public_id = ${publicId}
  `
  const row = rows[0]
  if (!row) return null
  return {
    id: row.id,
    ownerId: row.owner_id,
    status: row.status,
    visibility: row.visibility,
    deletedAt: row.deleted_at,
  }
}

export async function updateTournament(
  input: {
    id: string
    actorId: string
    name: string
    description: string
    visibility: TournamentVisibility
    previousVisibility: TournamentVisibility
  },
  sql: Sql = getSql(),
): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`
      update app.tournaments
      set name = ${input.name},
          description = ${input.description},
          visibility = ${input.visibility},
          version = version + 1
      where id = ${input.id} and deleted_at is null
    `
    await tx`
      insert into app.audit_log (tournament_id, actor_id, action, entity_type, entity_id, after)
      values (
        ${input.id},
        ${input.actorId},
        'tournament.updated',
        'tournament',
        ${input.id},
        ${tx.json({ name: input.name, description: input.description })}
      )
    `
    if (input.visibility !== input.previousVisibility) {
      await tx`
        insert into app.audit_log (tournament_id, actor_id, action, entity_type, entity_id, before, after)
        values (
          ${input.id},
          ${input.actorId},
          'tournament.visibility_changed',
          'tournament',
          ${input.id},
          ${tx.json({ visibility: input.previousVisibility })},
          ${tx.json({ visibility: input.visibility })}
        )
      `
    }
  })
}

export async function setTournamentStatus(
  input: {
    id: string
    actorId: string
    from: TournamentStatus
    to: "draft" | "published"
    action: "tournament.published" | "tournament.unpublished"
  },
  sql: Sql = getSql(),
): Promise<boolean> {
  return sql.begin(async (tx) => {
    const updated = await tx<{ id: string }[]>`
      update app.tournaments
      set status = ${input.to}, version = version + 1
      where id = ${input.id} and status = ${input.from} and deleted_at is null
      returning id
    `
    if (!updated[0]) return false
    await tx`
      insert into app.audit_log (tournament_id, actor_id, action, entity_type, entity_id, before, after)
      values (
        ${input.id},
        ${input.actorId},
        ${input.action},
        'tournament',
        ${input.id},
        ${tx.json({ status: input.from })},
        ${tx.json({ status: input.to })}
      )
    `
    return true
  })
}

export async function deleteTournament(
  input: { id: string; actorId: string; mode: "hard" | "soft" },
  sql: Sql = getSql(),
): Promise<void> {
  const sqlClient = sql
  await sqlClient.begin(async (tx) => {
    if (input.mode === "soft") {
      await tx`
        insert into app.audit_log (tournament_id, actor_id, action, entity_type, entity_id)
        values (${input.id}, ${input.actorId}, 'tournament.deleted', 'tournament', ${input.id})
      `
      await tx`
        update app.tournaments
        set deleted_at = now(), version = version + 1
        where id = ${input.id}
      `
      return
    }
    // These foreign keys are not ON DELETE CASCADE, so a tournament delete
    // fails while stage entries still point at teams and groups.
    await tx`delete from app.match_participants where tournament_id = ${input.id}`
    await tx`delete from app.matches where tournament_id = ${input.id}`
    await tx`delete from app.stage_entries where tournament_id = ${input.id}`
    await tx`delete from app.tie_orders where tournament_id = ${input.id}`
    await tx`delete from app.stage_groups where tournament_id = ${input.id}`
    await tx`delete from app.tournaments where id = ${input.id}`
  })
}
