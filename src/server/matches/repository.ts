import "server-only"
import type { TransactionSql } from "postgres"
import type { TournamentStatus } from "@/src/domain/tournament/access"
import type { BracketMatchPlan, BracketView, StoredBracketMatch, StoredBracketSlot } from "@/src/domain/tournament/bracket"
import { planKnockoutResult, projectBracket } from "@/src/domain/tournament/bracket"
import {
  isTournamentFinal,
  planTournamentCompletion,
  resolveChampion,
  type TournamentChampion,
} from "@/src/domain/tournament/champion"
import { planStatusChange, type MatchStatus } from "@/src/domain/tournament/match"
import type { StageType } from "@/src/domain/tournament/stage"
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
      and p.source_entry_id is not null
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
    const [match] = await tx<{ status: MatchStatus; stage_id: string; stage_type: StageType }[]>`
      select m.status, m.stage_id, s.stage_type
      from app.matches m
      join app.stages s on s.id = m.stage_id and s.tournament_id = m.tournament_id
      where m.id = ${input.matchId} and m.tournament_id = ${input.tournamentId}
      for update of m
    `
    if (!match) throw new MatchConstraintError("Match not found.")
    const change = planStatusChange({ from: match.status, to: "completed", scores: input.scores })
    if (!change.ok) throw new MatchConstraintError(change.error)
    const sides = await tx<{ position: number; source_entry_id: string | null; confirmed_team_id: string | null }[]>`
      select p.position, p.source_entry_id, e.confirmed_team_id
      from app.match_participants p
      left join app.stage_entries e on e.id = p.source_entry_id and e.tournament_id = p.tournament_id
      where p.match_id = ${input.matchId} and p.tournament_id = ${input.tournamentId}
      order by p.position
    `
    const home = sides[0]
    const away = sides[1]
    if (!home?.source_entry_id || !away?.source_entry_id || sides.length !== 2) {
      throw new MatchConstraintError("This match is waiting for earlier results and cannot be changed yet.")
    }
    const downstreamRows = match.stage_type === "knockout"
      ? await tx<{ id: string; match_id: string; position: number; source_entry_id: string | null; status: MatchStatus }[]>`
          select p.id, p.match_id, p.position, p.source_entry_id, dm.status
          from app.match_participants p
          join app.matches dm on dm.id = p.match_id and dm.tournament_id = p.tournament_id
          where p.tournament_id = ${input.tournamentId}
            and p.source_match_id = ${input.matchId}
            and p.source_outcome = 'winner'
          for update of dm
        `
      : []
    if (downstreamRows.length > 1) throw new MatchConstraintError("The winner could not be placed in the next match.")
    const downstream = downstreamRows[0] ?? null
    const plan = planKnockoutResult({
      stageType: match.stage_type,
      scores: input.scores,
      sides: [{ entryId: home.source_entry_id }, { entryId: away.source_entry_id }],
      downstream: downstream
        ? { status: downstream.status, resolvedEntryId: downstream.source_entry_id }
        : null,
    })
    if (!plan.ok) throw new MatchConstraintError(plan.error)
    const finalFacts = match.stage_type === "knockout"
      ? await tx<{
          stage_type: StageType
          stage_position: number
          latest_knockout_position: number | null
          round: number
          highest_round: number
          matches_in_round: number
          has_downstream: boolean
        }[]>`
          select
            s.stage_type,
            s.position as stage_position,
            (
              select max(position)::int from app.stages
              where tournament_id = ${input.tournamentId} and stage_type = 'knockout'
            ) as latest_knockout_position,
            m.round_number as round,
            (
              select max(round_number)::int from app.matches
              where tournament_id = ${input.tournamentId} and stage_id = m.stage_id
            ) as highest_round,
            (
              select count(*)::int from app.matches
              where tournament_id = ${input.tournamentId}
                and stage_id = m.stage_id
                and round_number = m.round_number
            ) as matches_in_round,
            exists (
              select 1 from app.match_participants downstream
              where downstream.tournament_id = ${input.tournamentId}
                and downstream.source_match_id = m.id
                and downstream.source_outcome = 'winner'
            ) as has_downstream
          from app.matches m
          join app.stages s on s.id = m.stage_id and s.tournament_id = m.tournament_id
          where m.id = ${input.matchId} and m.tournament_id = ${input.tournamentId}
        `
      : []
    const facts = finalFacts[0]
    const isFinal = facts
      ? isTournamentFinal({
          stageType: facts.stage_type,
          stagePosition: facts.stage_position,
          latestKnockoutStagePosition: facts.latest_knockout_position,
          round: facts.round,
          highestRound: facts.highest_round,
          matchesInRound: facts.matches_in_round,
          hasDownstream: facts.has_downstream,
        })
      : false
    const [tournament] = await tx<{ status: TournamentStatus }[]>`
      select status from app.tournaments where id = ${input.tournamentId} for update
    `
    if (!tournament) throw new MatchConstraintError("Tournament not found.")
    const winnerTeamId = plan.winnerEntryId === home.source_entry_id
      ? home.confirmed_team_id
      : plan.winnerEntryId === away.source_entry_id
        ? away.confirmed_team_id
        : null
    if (isFinal && plan.winnerEntryId && !winnerTeamId) {
      throw new MatchConstraintError("The tournament could not be completed.")
    }
    const completion = planTournamentCompletion({
      tournamentStatus: tournament.status,
      isFinal,
      winner: plan.winnerEntryId && winnerTeamId ? { entryId: plan.winnerEntryId, teamId: winnerTeamId } : null,
    })
    if (!completion.ok) throw new MatchConstraintError(completion.error)
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
    const completed = await tx<{ id: string }[]>`
      update app.matches
      set status = 'completed', decided_by = 'regular'
      where id = ${input.matchId} and tournament_id = ${input.tournamentId}
      returning id
    `
    if (!completed[0]) throw new MatchConstraintError("Match not found.")
    const entryIds: [string, string] = [home.source_entry_id, away.source_entry_id]
    await writeAudit(tx, {
      tournamentId: input.tournamentId,
      actorId: input.actorId,
      action: match.status === "completed" ? "match.result_updated" : "match.completed",
      entityId: input.matchId,
      payload: {
        stageId: match.stage_id,
        matchId: input.matchId,
        entryIds,
        previousStatus: match.status,
        status: "completed",
        scores: input.scores,
      },
    })
    if (plan.slotEntryId && downstream && downstream.source_entry_id !== plan.slotEntryId) {
      const placed = await tx<{ id: string }[]>`
        update app.match_participants
        set source_entry_id = ${plan.slotEntryId}
        where id = ${downstream.id}
          and tournament_id = ${input.tournamentId}
          and source_kind = 'match_outcome'
          and source_match_id = ${input.matchId}
        returning id
      `
      if (!placed[0]) throw new MatchConstraintError("The winner could not be placed in the next match.")
      const [winner] = await tx<{ confirmed_team_id: string }[]>`
        select confirmed_team_id
        from app.stage_entries
        where id = ${plan.slotEntryId} and tournament_id = ${input.tournamentId}
      `
      if (!winner) throw new MatchConstraintError("The winner could not be placed in the next match.")
      await tx`
        insert into app.audit_log (tournament_id, actor_id, action, entity_type, entity_id, after)
        values (
          ${input.tournamentId},
          ${input.actorId},
          'knockout.winner_propagated',
          'match',
          ${downstream.match_id},
          ${tx.json({
            tournamentId: input.tournamentId,
            stageId: match.stage_id,
            sourceMatchId: input.matchId,
            downstreamMatchId: downstream.match_id,
            winnerTeamId: winner.confirmed_team_id,
            participantSlot: downstream.position,
          })}
        )
      `
    }
    if (!completion.complete) return
    const finished = await tx<{ id: string }[]>`
      update app.tournaments
      set status = 'completed'
      where id = ${input.tournamentId} and status in ('draft', 'published')
      returning id
    `
    if (!finished[0]) throw new MatchConstraintError("The tournament could not be completed.")
    await tx`
      insert into app.audit_log (tournament_id, actor_id, action, entity_type, entity_id, after)
      values (
        ${input.tournamentId},
        ${input.actorId},
        'tournament.completed',
        'tournament',
        ${input.tournamentId},
        ${tx.json({
          tournamentId: input.tournamentId,
          finalMatchId: input.matchId,
          finalStageId: match.stage_id,
          championTeamId: completion.championTeamId,
          championStageEntryId: completion.championStageEntryId,
        })}
      )
    `
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
      match.slots = [
        ...match.slots,
        {
          kind: "winner",
          sourceMatchId: row.source_match_id,
          name: row.name,
          shortName: row.short_name,
          logoUrl: row.logo_url,
          score: row.score,
        },
      ]
    }
    stage.set(row.id, match)
    byStage.set(row.stage_id, stage)
  }
  return [...byStage.entries()].map(([stageId, matches]) => ({
    stageId,
    view: projectBracket([...matches.values()]),
  }))
}

export async function findChampion(tournamentId: string, sql: Sql = getSql()): Promise<TournamentChampion | null> {
  const rows = await sql<{
    status: TournamentStatus
    match_id: string
    stage_id: string
    match_status: MatchStatus
    entry_id: string
    team_id: string
    name: string
    short_name: string | null
    logo_url: string | null
    score: number | null
    position: number
  }[]>`
    select
      tr.status,
      m.id as match_id,
      m.stage_id,
      m.status as match_status,
      e.id as entry_id,
      t.id as team_id,
      t.name,
      t.short_name,
      t.logo_url,
      p.score,
      p.position
    from app.tournaments tr
    join app.stages s on s.tournament_id = tr.id and s.stage_type = 'knockout'
    join app.matches m on m.stage_id = s.id and m.tournament_id = tr.id
    join app.match_participants p on p.match_id = m.id and p.tournament_id = tr.id
    join app.stage_entries e on e.id = p.source_entry_id and e.tournament_id = tr.id
    join app.teams t on t.id = e.confirmed_team_id and t.tournament_id = tr.id
    where tr.id = ${tournamentId}
      and tr.status = 'completed'
      and s.position = (
        select max(position) from app.stages
        where tournament_id = tr.id and stage_type = 'knockout'
      )
      and m.round_number = (
        select max(round_number) from app.matches
        where tournament_id = tr.id and stage_id = s.id
      )
      and (
        select count(*) from app.matches
        where tournament_id = tr.id and stage_id = s.id and round_number = m.round_number
      ) = 1
      and not exists (
        select 1 from app.match_participants downstream
        where downstream.tournament_id = tr.id
          and downstream.source_match_id = m.id
          and downstream.source_outcome = 'winner'
      )
    order by p.position
  `
  const matchIds = new Set(rows.map((row) => row.match_id))
  const home = rows[0]
  const away = rows[1]
  if (matchIds.size !== 1 || !home || !away || rows.length !== 2 || home.score === null || away.score === null) return null
  return resolveChampion({
    tournamentStatus: home.status,
    final: {
      matchId: home.match_id,
      stageId: home.stage_id,
      status: home.match_status,
      sides: [
        {
          entryId: home.entry_id,
          teamId: home.team_id,
          name: home.name,
          shortName: home.short_name,
          logoUrl: home.logo_url,
          score: home.score,
        },
        {
          entryId: away.entry_id,
          teamId: away.team_id,
          name: away.name,
          shortName: away.short_name,
          logoUrl: away.logo_url,
          score: away.score,
        },
      ],
    },
  })
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
