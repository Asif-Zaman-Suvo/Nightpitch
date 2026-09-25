import "server-only"
import { cache } from "react"
import { getSql, type Sql } from "@/src/server/db"

export interface GroupTeam {
  id: string
  number: number
  name: string
  shortName: string
}

export interface GroupRow {
  id: string
  tournamentId: string
  position: number
  name: string
  teams: GroupTeam[]
}

export class GroupConstraintError extends Error {
  constructor(message: string) {
    super(message)
  }
}

function constraintMessage(error: unknown): string | null {
  const code = (error as { code?: string }).code
  const constraint = (error as { constraint_name?: string }).constraint_name
  if (code === "23505" && constraint === "groups_tournament_name_lower_key") {
    return "A group with this name already exists."
  }
  if (code === "23505" && constraint === "group_teams_tournament_id_team_id_key") {
    return "This team is already in a group."
  }
  if (code === "23503" && constraint === "stage_groups_source_group_fk") {
    return "Detach this group from its stage before deleting it."
  }
  if (code === "23505" && constraint === "stage_groups_stage_id_name_key") {
    return "A group with this name is already attached to that stage."
  }
  return null
}

export const listGroups = cache(async (tournamentId: string): Promise<{ groups: GroupRow[]; unassigned: GroupTeam[] }> => {
  const sql = getSql()
  const [groups, assigned, unassigned] = await Promise.all([
    sql<{ id: string; tournament_id: string; position: number; name: string }[]>`
      select id, tournament_id, position, name
      from app.groups
      where tournament_id = ${tournamentId}
      order by position
    `,
    sql<{ group_id: string; id: string; number: number; name: string; short_name: string }[]>`
      select gt.group_id, t.id, t.number, t.name, t.short_name
      from app.group_teams gt
      join app.teams t on t.id = gt.team_id
      where gt.tournament_id = ${tournamentId}
      order by t.number
    `,
    sql<GroupTeam[]>`
      select t.id, t.number, t.name, t.short_name as "shortName"
      from app.teams t
      where t.tournament_id = ${tournamentId}
        and not exists (
          select 1 from app.group_teams gt
          where gt.team_id = t.id and gt.tournament_id = t.tournament_id
        )
      order by t.number
    `,
  ])
  const byGroup = new Map<string, GroupTeam[]>()
  for (const row of assigned) {
    const list = byGroup.get(row.group_id) ?? []
    list.push({ id: row.id, number: row.number, name: row.name, shortName: row.short_name })
    byGroup.set(row.group_id, list)
  }
  return {
    groups: groups.map((group) => ({
      id: group.id,
      tournamentId: group.tournament_id,
      position: group.position,
      name: group.name,
      teams: byGroup.get(group.id) ?? [],
    })),
    unassigned,
  }
})

export async function findGroup(tournamentId: string, groupId: string): Promise<GroupRow | null> {
  const sql = getSql()
  const rows = await sql<{
    id: string
    tournament_id: string
    position: number
    name: string
    team_id: string | null
    number: number | null
    team_name: string | null
    short_name: string | null
  }[]>`
    select g.id, g.tournament_id, g.position, g.name,
           t.id as team_id, t.number, t.name as team_name, t.short_name
    from app.groups g
    left join app.group_teams gt on gt.group_id = g.id
    left join app.teams t on t.id = gt.team_id
    where g.tournament_id = ${tournamentId} and g.id = ${groupId}
    order by t.number
  `
  const first = rows[0]
  if (!first) return null
  return {
    id: first.id,
    tournamentId: first.tournament_id,
    position: first.position,
    name: first.name,
    teams: rows.flatMap((row) =>
      row.team_id && row.number !== null && row.team_name !== null
        ? [{ id: row.team_id, number: row.number, name: row.team_name, shortName: row.short_name ?? "" }]
        : [],
    ),
  }
}

export async function insertGroup(input: { tournamentId: string; actorId: string; name: string }, sql: Sql = getSql()): Promise<void> {
  try {
    await sql`
      with pos as (
        select coalesce(max(position), 0) + 1 as position
        from app.groups
        where tournament_id = ${input.tournamentId}
      ),
      inserted as (
        insert into app.groups (tournament_id, position, name)
        select ${input.tournamentId}, position, ${input.name}
        from pos
        returning id
      ),
      audited as (
        insert into app.audit_log (tournament_id, actor_id, action, entity_type, entity_id, after)
        select ${input.tournamentId}, ${input.actorId}, 'group.created', 'group', id, ${sql.json({ name: input.name })}
        from inserted
        returning entity_id
      )
      select id from inserted where exists (select 1 from audited)
    `
  } catch (error) {
    const message = constraintMessage(error)
    if (message) throw new GroupConstraintError(message)
    throw error
  }
}

export async function renameGroup(
  input: { tournamentId: string; groupId: string; actorId: string; name: string },
  sql: Sql = getSql(),
): Promise<void> {
  try {
    const rows = await sql<{ id: string | null }[]>`
      with updated as (
        update app.groups set name = ${input.name}
        where id = ${input.groupId} and tournament_id = ${input.tournamentId}
        returning id
      ),
      synced as (
        update app.stage_groups set name = ${input.name}
        where source_group_id = ${input.groupId}
          and tournament_id = ${input.tournamentId}
          and exists (select 1 from updated)
        returning id
      ),
      audited as (
        insert into app.audit_log (tournament_id, actor_id, action, entity_type, entity_id, after)
        select ${input.tournamentId}, ${input.actorId}, 'group.updated', 'group', id, ${sql.json({ name: input.name })}
        from updated
        returning entity_id
      )
      select (select id from updated) as id, (select count(*) from synced) as synced
      where exists (select 1 from audited) or not exists (select 1 from updated)
    `
    if (!rows[0]?.id) throw new GroupConstraintError("Group not found.")
  } catch (error) {
    if (error instanceof GroupConstraintError) throw error
    const message = constraintMessage(error)
    if (message) throw new GroupConstraintError(message)
    throw error
  }
}

export async function deleteGroup(
  input: { tournamentId: string; groupId: string; actorId: string },
  sql: Sql = getSql(),
): Promise<"deleted" | "missing" | "has-teams"> {
  try {
    const rows = await sql<{ id: string | null; has_teams: boolean; removed: boolean }[]>`
      with target as (
        select g.id, g.name,
          (select count(*) from app.group_teams gt where gt.group_id = g.id) as team_count
        from app.groups g
        where g.id = ${input.groupId} and g.tournament_id = ${input.tournamentId}
      ),
      removed as (
        delete from app.groups
        where id = (select id from target)
          and (select team_count from target) = 0
        returning id
      ),
      audited as (
        insert into app.audit_log (tournament_id, actor_id, action, entity_type, entity_id, after)
        select ${input.tournamentId}, ${input.actorId}, 'group.deleted', 'group', target.id,
          jsonb_build_object('name', target.name)
        from target
        where exists (select 1 from removed)
        returning entity_id
      )
      select
        (select id from target) as id,
        coalesce((select team_count from target) > 0, false) as has_teams,
        exists (select 1 from removed) as removed,
        exists (select 1 from audited) as audited
    `
    const row = rows[0]
    if (!row?.id) return "missing"
    if (row.has_teams) return "has-teams"
    return "deleted"
  } catch (error) {
    const message = constraintMessage(error)
    if (message) throw new GroupConstraintError(message)
    throw error
  }
}

export async function currentGroupId(tournamentId: string, teamId: string, sql: Sql = getSql()): Promise<string | null> {
  const rows = await sql<{ group_id: string }[]>`
    select group_id from app.group_teams
    where tournament_id = ${tournamentId} and team_id = ${teamId}
  `
  return rows[0]?.group_id ?? null
}

export interface AssignmentState {
  teamId: string
  currentGroupId: string | null
  referenced: boolean
  groupExists: boolean
}

export async function readAssignment(
  tournamentId: string,
  groupId: string,
  number: number,
  sql: Sql = getSql(),
): Promise<AssignmentState | null> {
  const rows = await sql<{
    team_id: string
    current_group_id: string | null
    referenced: boolean
    group_exists: boolean
  }[]>`
    select
      t.id as team_id,
      (
        select gt.group_id from app.group_teams gt
        where gt.tournament_id = t.tournament_id and gt.team_id = t.id
      ) as current_group_id,
      exists (
        select 1 from app.stage_entries
        where tournament_id = t.tournament_id
          and (source_team_id = t.id or confirmed_team_id = t.id)
        union all
        select 1 from app.tie_orders
        where tournament_id = t.tournament_id and team_id = t.id
      ) as referenced,
      exists (
        select 1 from app.groups g
        where g.id = ${groupId} and g.tournament_id = t.tournament_id
      ) as group_exists
    from app.teams t
    where t.tournament_id = ${tournamentId} and t.number = ${number}
  `
  const row = rows[0]
  if (!row) return null
  return {
    teamId: row.team_id,
    currentGroupId: row.current_group_id,
    referenced: row.referenced,
    groupExists: row.group_exists,
  }
}

export async function assignTeamToGroup(
  input: {
    tournamentId: string
    groupId: string
    teamId: string
    actorId: string
    kind: "assign" | "move"
    fromGroupId: string | null
  },
  sql: Sql = getSql(),
): Promise<void> {
  const action = input.kind === "move" ? "team.moved_between_groups" : "team.assigned_to_group"
  try {
    const rows = await sql<{ changed: boolean; referenced: boolean }[]>`
      with referenced as (
        select exists (
          select 1 from app.stage_entries
          where tournament_id = ${input.tournamentId}
            and (source_team_id = ${input.teamId} or confirmed_team_id = ${input.teamId})
          union all
          select 1 from app.tie_orders
          where tournament_id = ${input.tournamentId} and team_id = ${input.teamId}
        ) as yes
      ),
      changed as (
        insert into app.group_teams (tournament_id, group_id, team_id)
        select ${input.tournamentId}, ${input.groupId}, ${input.teamId}
        where not (select yes from referenced)
        on conflict (tournament_id, team_id)
        do update set group_id = excluded.group_id
        where app.group_teams.group_id is distinct from excluded.group_id
          and not (select yes from referenced)
        returning team_id
      ),
      audited as (
        insert into app.audit_log (tournament_id, actor_id, action, entity_type, entity_id, after)
        select ${input.tournamentId}, ${input.actorId}, ${action}, 'group', ${input.groupId},
          ${sql.json({ teamId: input.teamId, fromGroupId: input.fromGroupId, toGroupId: input.groupId })}
        where exists (select 1 from changed)
        returning entity_id
      )
      select
        exists (select 1 from changed) as changed,
        (select yes from referenced) as referenced,
        exists (select 1 from audited) as audited
    `
    const row = rows[0]
    if (row?.referenced && !row.changed) {
      throw new GroupConstraintError("This team is already used in the tournament and cannot be moved.")
    }
    if (!row?.changed) throw new GroupConstraintError("That team could not be assigned.")
  } catch (error) {
    if (error instanceof GroupConstraintError) throw error
    const message = constraintMessage(error)
    if (message) throw new GroupConstraintError(message)
    throw error
  }
}

export async function removeTeamFromGroup(
  input: { tournamentId: string; number: number; actorId: string },
  sql: Sql = getSql(),
): Promise<"removed" | "missing" | "referenced"> {
  const rows = await sql<{ team_id: string | null; in_group: boolean; referenced: boolean; removed: boolean }[]>`
    with team as (
      select id from app.teams
      where tournament_id = ${input.tournamentId} and number = ${input.number}
    ),
    membership as (
      select group_id from app.group_teams
      where tournament_id = ${input.tournamentId} and team_id = (select id from team)
    ),
    referenced as (
      select exists (
        select 1 from app.stage_entries
        where tournament_id = ${input.tournamentId}
          and (
            source_team_id = (select id from team)
            or confirmed_team_id = (select id from team)
          )
        union all
        select 1 from app.tie_orders
        where tournament_id = ${input.tournamentId} and team_id = (select id from team)
      ) as yes
    ),
    removed as (
      delete from app.group_teams
      where tournament_id = ${input.tournamentId}
        and team_id = (select id from team)
        and not coalesce((select yes from referenced), false)
        and exists (select 1 from membership)
      returning team_id
    ),
    audited as (
      insert into app.audit_log (tournament_id, actor_id, action, entity_type, entity_id, after)
      select ${input.tournamentId}, ${input.actorId}, 'team.removed_from_group', 'group', membership.group_id,
        jsonb_build_object(
          'teamId', (select id from team),
          'groupId', membership.group_id
        )
      from membership
      where exists (select 1 from removed)
      returning entity_id
    )
    select
      (select id from team) as team_id,
      exists (select 1 from membership) as in_group,
      coalesce((select yes from referenced), false) as referenced,
      exists (select 1 from removed) as removed,
      exists (select 1 from audited) as audited
  `
  const row = rows[0]
  if (!row?.team_id || !row.in_group) return "missing"
  if (row.referenced && !row.removed) return "referenced"
  return "removed"
}
