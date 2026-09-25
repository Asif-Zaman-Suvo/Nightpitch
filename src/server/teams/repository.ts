import "server-only"
import { cache } from "react"
import type { TeamInput } from "@/src/domain/tournament/team"
import { getSql, type Sql } from "@/src/server/db"

export interface TeamRow {
  id: string
  tournamentId: string
  number: number
  name: string
  shortName: string
  logoUrl: string | null
  createdAt: string
}

interface TeamDbRow {
  id: string
  tournament_id: string
  number: number
  name: string
  short_name: string
  logo_url: string | null
  created_at: string
}

function mapTeam(row: TeamDbRow): TeamRow {
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    number: row.number,
    name: row.name,
    shortName: row.short_name,
    logoUrl: row.logo_url,
    createdAt: row.created_at,
  }
}

export class TeamConstraintError extends Error {
  constructor(message: string) {
    super(message)
  }
}

function constraintMessage(error: unknown): string | null {
  const code = (error as { code?: string }).code
  const constraint = (error as { constraint_name?: string }).constraint_name
  if (code === "23505" && constraint === "teams_tournament_name_lower_key") {
    return "A team with this name already exists in the tournament."
  }
  if (code === "23505" && constraint === "teams_tournament_short_name_key") {
    return "A team with this short name already exists in the tournament."
  }
  if (code === "23503") return "This team is already used in the tournament and cannot be removed."
  return null
}

export const listTeams = cache(async (tournamentId: string): Promise<TeamRow[]> => {
  const sql = getSql()
  const rows = await sql<TeamDbRow[]>`
    select id, tournament_id, number, name, short_name, logo_url, created_at
    from app.teams
    where tournament_id = ${tournamentId}
    order by number
  `
  return rows.map(mapTeam)
})

export async function findTeam(tournamentId: string, number: number): Promise<TeamRow | null> {
  const sql = getSql()
  const rows = await sql<TeamDbRow[]>`
    select id, tournament_id, number, name, short_name, logo_url, created_at
    from app.teams
    where tournament_id = ${tournamentId} and number = ${number}
  `
  return rows[0] ? mapTeam(rows[0]) : null
}

export async function teamIsReferenced(tournamentId: string, teamId: string, sql: Sql = getSql()): Promise<boolean> {
  const rows = await sql<{ referenced: boolean }[]>`
    select exists (
      select 1 from app.stage_entries
      where tournament_id = ${tournamentId}
        and (source_team_id = ${teamId} or confirmed_team_id = ${teamId})
      union all
      select 1 from app.tie_orders
      where tournament_id = ${tournamentId} and team_id = ${teamId}
    ) as referenced
  `
  return rows[0]?.referenced ?? false
}

export async function insertTeam(
  input: { tournamentId: string; actorId: string; team: TeamInput },
  sql: Sql = getSql(),
): Promise<number> {
  try {
    const rows = await sql<{ number: number }[]>`
      with allocated as (
        update app.tournaments
        set next_team_number = next_team_number + 1
        where id = ${input.tournamentId}
        returning next_team_number - 1 as number
      ),
      inserted as (
        insert into app.teams (tournament_id, number, name, short_name, logo_url)
        select ${input.tournamentId}, number, ${input.team.name}, ${input.team.shortName}, ${input.team.logoUrl}
        from allocated
        returning id, number
      ),
      audited as (
        insert into app.audit_log (tournament_id, actor_id, action, entity_type, entity_id, after)
        select ${input.tournamentId}, ${input.actorId}, 'team.created', 'team', id,
          ${sql.json({ name: input.team.name, shortName: input.team.shortName })}
        from inserted
        returning entity_id
      )
      select inserted.number
      from inserted
      where exists (select 1 from audited)
    `
    if (!rows[0]) throw new TeamConstraintError("Tournament not found.")
    return rows[0].number
  } catch (error) {
    if (error instanceof TeamConstraintError) throw error
    const message = constraintMessage(error)
    if (message) throw new TeamConstraintError(message)
    throw error
  }
}

export async function updateTeam(
  input: { tournamentId: string; number: number; actorId: string; next: TeamInput },
  sql: Sql = getSql(),
): Promise<void> {
  try {
    const rows = await sql<{ id: string }[]>`
      with updated as (
        update app.teams
        set name = ${input.next.name},
            short_name = ${input.next.shortName},
            logo_url = ${input.next.logoUrl}
        where tournament_id = ${input.tournamentId} and number = ${input.number}
        returning id
      )
      insert into app.audit_log (tournament_id, actor_id, action, entity_type, entity_id, after)
      select ${input.tournamentId}, ${input.actorId}, 'team.updated', 'team', id,
        ${sql.json({ name: input.next.name, shortName: input.next.shortName })}
      from updated
      returning entity_id as id
    `
    if (!rows[0]) throw new TeamConstraintError("Team not found.")
  } catch (error) {
    if (error instanceof TeamConstraintError) throw error
    const message = constraintMessage(error)
    if (message) throw new TeamConstraintError(message)
    throw error
  }
}

export async function deleteTeam(
  input: { tournamentId: string; number: number; actorId: string },
  sql: Sql = getSql(),
): Promise<"deleted" | "missing" | "referenced"> {
  try {
    const rows = await sql<{ id: string | null; referenced: boolean; removed: boolean }[]>`
      with victim as (
        select id, name, short_name,
          exists (
            select 1 from app.stage_entries
            where tournament_id = ${input.tournamentId}
              and (source_team_id = app.teams.id or confirmed_team_id = app.teams.id)
            union all
            select 1 from app.tie_orders
            where tournament_id = ${input.tournamentId} and team_id = app.teams.id
          ) as referenced
        from app.teams
        where tournament_id = ${input.tournamentId} and number = ${input.number}
      ),
      removed as (
        delete from app.teams
        where id = (select id from victim)
          and not coalesce((select referenced from victim), false)
        returning id
      ),
      audited as (
        insert into app.audit_log (tournament_id, actor_id, action, entity_type, entity_id, before)
        select ${input.tournamentId}, ${input.actorId}, 'team.deleted', 'team', victim.id,
          jsonb_build_object('name', victim.name, 'shortName', victim.short_name)
        from victim
        where exists (select 1 from removed)
        returning entity_id
      )
      select
        (select id from victim) as id,
        coalesce((select referenced from victim), false) as referenced,
        exists (select 1 from removed) as removed,
        exists (select 1 from audited) as audited
    `
    const row = rows[0]
    if (!row?.id) return "missing"
    if (row.referenced && !row.removed) return "referenced"
    return "deleted"
  } catch (error) {
    const message = constraintMessage(error)
    if (message) throw new TeamConstraintError(message)
    throw error
  }
}
