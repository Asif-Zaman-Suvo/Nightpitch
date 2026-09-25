import "server-only"
import type { TransactionSql } from "postgres"
import type { BracketMatchPlan, BracketView, StoredBracketMatch, StoredBracketSlot } from "@/src/domain/tournament/bracket"
import { projectBracket } from "@/src/domain/tournament/bracket"
import type { MatchStatus } from "@/src/domain/tournament/match"
import { getSql, type Sql } from "@/src/server/db"

export interface MatchParticipantRow {
  entryId: string
  position: number
  name: string
  shortName: string | null
  logoUrl: string | null
  score: number | null
}

export interface MatchRow {
  id: string
  tournamentId: string
  stageId: string
  stageName: string
  stageGroupId: string | null
  groupName: string | null
  round: number
  matchNumber: number
  startsAt: string | null
  status: MatchStatus
  participants: MatchParticipantRow[]
}

export class MatchConstraintError extends Error {
  constructor(message: string) {
    super(message)
  }
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
      'match',
      ${input.entityId},
      ${tx.json(input.payload as never)}
    )
  `
}

export async function listMatches(tournamentId: string, sql: Sql = getSql()): Promise<MatchRow[]> {
  const matches = await sql<{
    id: string
    tournament_id: string
    stage_id: string
    stage_name: string
    group_id: string | null
    group_name: string | null
    round_number: number
    match_number: number
    starts_at: Date | string | null
    status: MatchStatus
  }[]>`
    select
      m.id,
      m.tournament_id,
      m.stage_id,
      s.name as stage_name,
      m.group_id,
      coalesce(g.name, sg.name) as group_name,
      m.round_number,
      m.match_number,
      m.starts_at,
      m.status
    from app.matches m
    join app.stages s on s.id = m.stage_id
    left join app.stage_groups sg on sg.id = m.group_id
    left join app.groups g on g.id = sg.source_group_id
    where m.tournament_id = ${tournamentId}
      and m.status in ('scheduled', 'cancelled', 'completed')
    order by s.position, m.group_id nulls first, m.round_number, m.match_number
  `
  const participants = await sql<{
    match_id: string
    position: number
    entry_id: string
    name: string
    short_name: string | null
    logo_url: string | null
    score: number | null
  }[]>`
    select p.match_id, p.position, p.source_entry_id as entry_id, t.name, t.short_name, t.logo_url, p.score
    from app.match_participants p
    join app.stage_entries e on e.id = p.source_entry_id
    join app.teams t on t.id = e.confirmed_team_id
    where p.tournament_id = ${tournamentId}
      and p.source_kind = 'entry'
    order by p.match_id, p.position
  `
  const byMatch = new Map<string, MatchParticipantRow[]>()
  for (const row of participants) {
    const list = byMatch.get(row.match_id) ?? []
    list.push({
      entryId: row.entry_id,
      position: row.position,
      name: row.name,
      shortName: row.short_name,
      logoUrl: row.logo_url,
      score: row.score,
    })
    byMatch.set(row.match_id, list)
  }
  return matches.map((match) => ({
    id: match.id,
    tournamentId: match.tournament_id,
    stageId: match.stage_id,
    stageName: match.stage_name,
    stageGroupId: match.group_id,
    groupName: match.group_name,
    round: match.round_number,
    matchNumber: match.match_number,
    startsAt: match.starts_at ? new Date(match.starts_at).toISOString() : null,
    status: match.status,
    participants: byMatch.get(match.id) ?? [],
  }))
}

export async function findMatch(tournamentId: string, matchId: string, sql: Sql = getSql()): Promise<MatchRow | null> {
  const matches = await listMatches(tournamentId, sql)
  return matches.find((match) => match.id === matchId) ?? null
}

export async function insertGeneratedMatches(
  input: {
    tournamentId: string
    stageId: string
    stageType: string
    actorId: string
    fixtures: { stageGroupId: string | null; entryIds: [string, string] }[]
  },
  sql: Sql = getSql(),
): Promise<number> {
  if (input.fixtures.length === 0) return 0
  return sql.begin(async (tx) => {
    const number = await tx<{ match_number: number }[]>`
      select coalesce(max(match_number), 0) as match_number
      from app.matches
      where tournament_id = ${input.tournamentId}
    `
    let nextNumber = number[0].match_number
    for (const fixture of input.fixtures) {
      nextNumber += 1
      const inserted = await tx<{ id: string }[]>`
        insert into app.matches (
          tournament_id, stage_id, group_id, round_number, match_number, starts_at, status
        )
        values (
          ${input.tournamentId},
          ${input.stageId},
          ${fixture.stageGroupId},
          1,
          ${nextNumber},
          null,
          'scheduled'
        )
        returning id
      `
      await tx`
        insert into app.match_participants (
          tournament_id, match_id, position, source_kind, source_entry_id
        )
        values
          (${input.tournamentId}, ${inserted[0].id}, 1, 'entry', ${fixture.entryIds[0]}),
          (${input.tournamentId}, ${inserted[0].id}, 2, 'entry', ${fixture.entryIds[1]})
      `
    }
    await writeAudit(tx, {
      tournamentId: input.tournamentId,
      actorId: input.actorId,
      action: "fixtures.generated",
      entityId: input.stageId,
      payload: {
        stageId: input.stageId,
        stageType: input.stageType,
        created: input.fixtures.length,
        groupIds: [...new Set(input.fixtures.map((fixture) => fixture.stageGroupId).filter((id) => id !== null))],
      },
    })
    return input.fixtures.length
  })
}

export async function insertMatch(
  input: {
    tournamentId: string
    stageId: string
    stageGroupId: string | null
    round: number
    startsAt: string | null
    entryIds: [string, string]
    actorId: string
  },
  sql: Sql = getSql(),
): Promise<void> {
  await sql.begin(async (tx) => {
    const number = await tx<{ match_number: number }[]>`
      select coalesce(max(match_number), 0) + 1 as match_number
      from app.matches
      where tournament_id = ${input.tournamentId}
    `
    const inserted = await tx<{ id: string }[]>`
      insert into app.matches (
        tournament_id, stage_id, group_id, round_number, match_number, starts_at, status
      )
      values (
        ${input.tournamentId},
        ${input.stageId},
        ${input.stageGroupId},
        ${input.round},
        ${number[0].match_number},
        ${input.startsAt},
        'scheduled'
      )
      returning id
    `
    await tx`
      insert into app.match_participants (
        tournament_id, match_id, position, source_kind, source_entry_id
      )
      values
        (${input.tournamentId}, ${inserted[0].id}, 1, 'entry', ${input.entryIds[0]}),
        (${input.tournamentId}, ${inserted[0].id}, 2, 'entry', ${input.entryIds[1]})
    `
    await writeAudit(tx, {
      tournamentId: input.tournamentId,
      actorId: input.actorId,
      action: "match.created",
      entityId: inserted[0].id,
      payload: {
        stageId: input.stageId,
        matchId: inserted[0].id,
        entryIds: input.entryIds,
        round: input.round,
        status: "scheduled",
      },
    })
  })
}

export async function updateMatchSchedule(
  input: {
    tournamentId: string
    matchId: string
    actorId: string
    stageId: string
    round: number
    startsAt: string | null
    entryIds: [string, string]
  },
  sql: Sql = getSql(),
): Promise<void> {
  await sql.begin(async (tx) => {
    const updated = await tx<{ id: string }[]>`
      update app.matches
      set round_number = ${input.round}, starts_at = ${input.startsAt}
      where id = ${input.matchId}
        and tournament_id = ${input.tournamentId}
        and status = 'scheduled'
      returning id
    `
    if (!updated[0]) throw new MatchConstraintError("Only a scheduled match can be rescheduled.")
    await writeAudit(tx, {
      tournamentId: input.tournamentId,
      actorId: input.actorId,
      action: "match.scheduled",
      entityId: input.matchId,
      payload: { stageId: input.stageId, matchId: input.matchId, entryIds: input.entryIds, round: input.round, startsAt: input.startsAt },
    })
  })
}

export async function completeMatch(
  input: {
    tournamentId: string
    matchId: string
    actorId: string
    stageId: string
    entryIds: [string, string]
    scores: [number, number]
    previousStatus: MatchStatus
  },
  sql: Sql = getSql(),
): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`
      update app.match_participants
      set score = ${input.scores[0]}
      where match_id = ${input.matchId} and tournament_id = ${input.tournamentId} and position = 1
    `
    await tx`
      update app.match_participants
      set score = ${input.scores[1]}
      where match_id = ${input.matchId} and tournament_id = ${input.tournamentId} and position = 2
    `
    await tx`
      update app.matches
      set status = 'completed', decided_by = 'regular'
      where id = ${input.matchId} and tournament_id = ${input.tournamentId}
    `
    await writeAudit(tx, {
      tournamentId: input.tournamentId,
      actorId: input.actorId,
      action: input.previousStatus === "completed" ? "match.result_updated" : "match.completed",
      entityId: input.matchId,
      payload: {
        stageId: input.stageId,
        matchId: input.matchId,
        entryIds: input.entryIds,
        previousStatus: input.previousStatus,
        status: "completed",
        scores: input.scores,
      },
    })
  })
}

export async function setMatchStatus(
  input: {
    tournamentId: string
    matchId: string
    actorId: string
    stageId: string
    entryIds: [string, string]
    status: "scheduled" | "cancelled"
    action: "match.cancelled" | "match.restored"
  },
  sql: Sql = getSql(),
): Promise<void> {
  await sql.begin(async (tx) => {
    const updated = await tx<{ id: string }[]>`
      update app.matches
      set status = ${input.status}, decided_by = null
      where id = ${input.matchId} and tournament_id = ${input.tournamentId}
      returning id
    `
    if (!updated[0]) throw new MatchConstraintError("Match not found.")
    await writeAudit(tx, {
      tournamentId: input.tournamentId,
      actorId: input.actorId,
      action: input.action,
      entityId: input.matchId,
      payload: { stageId: input.stageId, matchId: input.matchId, entryIds: input.entryIds, status: input.status },
    })
  })
}

export async function matchIsReferenced(tournamentId: string, matchId: string, sql: Sql = getSql()): Promise<boolean> {
  const rows = await sql<{ referenced: boolean }[]>`
    select exists (
      select 1 from app.stage_entries
      where tournament_id = ${tournamentId} and source_match_id = ${matchId}
      union all
      select 1 from app.match_participants
      where tournament_id = ${tournamentId}
        and source_match_id = ${matchId}
        and match_id <> ${matchId}
    ) as referenced
  `
  return rows[0]?.referenced ?? false
}

export async function countStageMatches(tournamentId: string, stageId: string, sql: Sql = getSql()): Promise<number> {
  const rows = await sql<{ n: number }[]>`
    select count(*)::int as n
    from app.matches
    where tournament_id = ${tournamentId} and stage_id = ${stageId}
  `
  return rows[0]?.n ?? 0
}

export async function insertKnockoutBracket(
  input: {
    tournamentId: string
    stageId: string
    actorId: string
    participantCount: number
    roundCount: number
    matches: readonly BracketMatchPlan[]
  },
  sql: Sql = getSql(),
): Promise<{ status: "exists" } | { status: "generated"; created: number; roundCount: number }> {
  const matchSeed = input.matches.map((match) => ({ round: match.round, ordinal: match.index + 1 }))
  return sql.begin(async (tx) => {
    const rows = await tx<{
      stage_found: boolean
      existing_count: number
      base_number: number
      id: string | null
      match_number: number | null
    }[]>`
      with locked as (
        select id
        from app.stages
        where id = ${input.stageId} and tournament_id = ${input.tournamentId}
        for update
      ),
      existing as (
        select count(*)::int as n
        from app.matches
        where stage_id = ${input.stageId} and tournament_id = ${input.tournamentId}
      ),
      base as (
        select coalesce(max(match_number), 0)::int as n
        from app.matches
        where tournament_id = ${input.tournamentId}
      ),
      seed as (
        select round, ordinal, (select n from base) + ordinal as match_number
        from jsonb_to_recordset(${tx.json(matchSeed)}) as x(round int, ordinal int)
        where (select n from existing) = 0
          and exists (select 1 from locked)
      ),
      inserted as (
        insert into app.matches (
          tournament_id, stage_id, group_id, round_number, match_number, starts_at, status
        )
        select ${input.tournamentId}, ${input.stageId}, null, round, match_number, null, 'scheduled'
        from seed
        returning id, match_number
      )
      select
        exists (select 1 from locked) as stage_found,
        (select n from existing) as existing_count,
        (select n from base) as base_number,
        inserted.id,
        inserted.match_number
      from (select 1) as anchor
      left join inserted on true
    `
    const head = rows[0]
    if (!head?.stage_found) throw new MatchConstraintError("Stage not found.")
    const created = rows.filter((row) => row.id)
    if (head.existing_count > 0 || created.length === 0) return { status: "exists" }
    if (created.length !== input.matches.length) throw new MatchConstraintError("Bracket could not be created.")

    const ids = new Map<number, string>()
    for (const row of created) {
      if (!row.id || row.match_number === null) continue
      ids.set(row.match_number - head.base_number, row.id)
    }
    const slots = input.matches.flatMap((match) => {
      const matchId = ids.get(match.index + 1)
      if (!matchId) throw new MatchConstraintError("Bracket could not be created.")
      return match.slots.map((slot, index) => ({
        match_id: matchId,
        position: index + 1,
        source_kind: slot.kind === "participant" ? "entry" : "match_outcome",
        source_entry_id: slot.kind === "participant" ? slot.participantId : null,
        source_match_id: slot.kind === "winner" ? (ids.get(slot.matchIndex + 1) ?? null) : null,
        source_outcome: slot.kind === "winner" ? "winner" : null,
      }))
    })
    if (slots.some((slot) => slot.source_kind === "match_outcome" && !slot.source_match_id)) {
      throw new MatchConstraintError("Bracket could not be created.")
    }
    await tx`
      insert into app.match_participants (
        tournament_id, match_id, position, source_kind, source_entry_id, source_match_id, source_outcome
      )
      select
        ${input.tournamentId},
        match_id,
        position,
        source_kind,
        source_entry_id,
        source_match_id,
        source_outcome
      from jsonb_to_recordset(${tx.json(slots)}) as s(
        match_id uuid,
        position int,
        source_kind text,
        source_entry_id uuid,
        source_match_id uuid,
        source_outcome text
      )
    `
    await tx`
      insert into app.audit_log (tournament_id, actor_id, action, entity_type, entity_id, after)
      values (
        ${input.tournamentId},
        ${input.actorId},
        'knockout.bracket_generated',
        'stage',
        ${input.stageId},
        ${tx.json({
          tournamentId: input.tournamentId,
          stageId: input.stageId,
          participantCount: input.participantCount,
          roundCount: input.roundCount,
          createdMatchCount: created.length,
        })}
      )
    `
    return { status: "generated", created: created.length, roundCount: input.roundCount }
  })
}

export async function listKnockoutBrackets(
  tournamentId: string,
  sql: Sql = getSql(),
): Promise<{ stageId: string; view: BracketView }[]> {
  const rows = await sql<{
    stage_id: string
    id: string
    round_number: number
    match_number: number
    status: MatchStatus
    position: number | null
    source_kind: "entry" | "match_outcome" | null
    source_match_id: string | null
    score: number | null
    name: string | null
    short_name: string | null
    logo_url: string | null
  }[]>`
    select
      m.stage_id,
      m.id,
      m.round_number,
      m.match_number,
      m.status,
      p.position,
      p.source_kind,
      p.source_match_id,
      p.score,
      t.name,
      t.short_name,
      t.logo_url
    from app.matches m
    join app.stages s on s.id = m.stage_id and s.tournament_id = m.tournament_id
    left join app.match_participants p on p.match_id = m.id and p.tournament_id = m.tournament_id
    left join app.stage_entries e on e.id = p.source_entry_id and e.tournament_id = p.tournament_id
    left join app.teams t on t.id = e.confirmed_team_id and t.tournament_id = e.tournament_id
    where m.tournament_id = ${tournamentId}
      and s.stage_type = 'knockout'
      and m.status in ('scheduled', 'cancelled', 'completed')
    order by m.stage_id, m.round_number, m.match_number, p.position
  `
  const byStage = new Map<string, Map<string, StoredBracketMatch>>()
  for (const row of rows) {
    const stage = byStage.get(row.stage_id) ?? new Map<string, StoredBracketMatch>()
    const match = stage.get(row.id) ?? {
      id: row.id,
      round: row.round_number,
      matchNumber: row.match_number,
      status: row.status,
      slots: [] as StoredBracketSlot[],
    }
    if (row.source_kind === "entry" && row.name) {
      match.slots = [
        ...match.slots,
        { kind: "participant", name: row.name, shortName: row.short_name, logoUrl: row.logo_url, score: row.score },
      ]
    } else if (row.source_kind === "match_outcome" && row.source_match_id) {
      match.slots = [...match.slots, { kind: "winner", sourceMatchId: row.source_match_id }]
    }
    stage.set(row.id, match)
    byStage.set(row.stage_id, stage)
  }
  return [...byStage.entries()].map(([stageId, matches]) => ({
    stageId,
    view: projectBracket([...matches.values()]),
  }))
}

export async function deleteMatch(
  input: { tournamentId: string; matchId: string; actorId: string; stageId: string; entryIds: [string, string] },
  sql: Sql = getSql(),
): Promise<void> {
  await sql.begin(async (tx) => {
    await writeAudit(tx, {
      tournamentId: input.tournamentId,
      actorId: input.actorId,
      action: "match.deleted",
      entityId: input.matchId,
      payload: { stageId: input.stageId, matchId: input.matchId, entryIds: input.entryIds },
    })
    await tx`
      delete from app.matches
      where id = ${input.matchId} and tournament_id = ${input.tournamentId}
    `
  })
}
