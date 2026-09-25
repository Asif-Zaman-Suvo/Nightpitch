import type { MatchStatus } from "./match"
import type { StageType } from "./stage"

export interface ScoringRules {
  win: number
  draw: number
  loss: number
}

export interface StandingsRules {
  enabled: boolean
  scoring: ScoringRules
}

export interface StageRules {
  schemaVersion: "1"
  standings: StandingsRules
}

const DEFAULT_SCORING: ScoringRules = { win: 3, draw: 1, loss: 0 }

export function defaultStageRules(stageType: StageType): StageRules {
  return {
    schemaVersion: "1",
    standings: {
      enabled: stageType !== "knockout",
      scoring: { ...DEFAULT_SCORING },
    },
  }
}

export function resolveStandingsRules(stageType: StageType, rules: unknown): StandingsRules {
  const fallback = defaultStageRules(stageType).standings
  if (!rules || typeof rules !== "object") return fallback
  const standings = (rules as { standings?: unknown }).standings
  if (!standings || typeof standings !== "object") return fallback
  const scoring = (standings as { scoring?: unknown }).scoring
  const enabled = (standings as { enabled?: unknown }).enabled
  return {
    enabled: typeof enabled === "boolean" ? enabled : fallback.enabled,
    scoring: readScoring(scoring) ?? fallback.scoring,
  }
}

export function parseScoringRules(input: {
  win: unknown
  draw: unknown
  loss: unknown
}): { ok: true; value: ScoringRules } | { ok: false; error: string } {
  const win = readPoint(input.win)
  const draw = readPoint(input.draw)
  const loss = readPoint(input.loss)
  if (win === null || draw === null || loss === null) {
    return { ok: false, error: "Scoring values must be whole numbers of zero or more." }
  }
  return { ok: true, value: { win, draw, loss } }
}

function readPoint(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN
  if (!Number.isInteger(parsed) || parsed < 0) return null
  return parsed
}

function readScoring(value: unknown): ScoringRules | null {
  if (!value || typeof value !== "object") return null
  const scoring = value as { win?: unknown; draw?: unknown; loss?: unknown }
  if (!isPoints(scoring.win) || !isPoints(scoring.draw) || !isPoints(scoring.loss)) return null
  return { win: scoring.win, draw: scoring.draw, loss: scoring.loss }
}

function isPoints(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

export interface StandingRow {
  teamId: string
  name: string
  played: number
  won: number
  drawn: number
  lost: number
  scored: number
  conceded: number
  difference: number
  points: number
}

export interface GroupStandings {
  groupId: string
  groupName: string
  rows: StandingRow[]
}

export type StageStandings =
  | { kind: "none" }
  | { kind: "groups"; groups: GroupStandings[] }
  | { kind: "league"; rows: StandingRow[] }

export interface StandingsInput {
  stage: { id: string; stageType: StageType; standings: StandingsRules }
  stageGroups: { id: string; stageId: string; name: string }[]
  stageEntries: { id: string; stageId: string; stageGroupId: string | null; teamId: string; name: string }[]
  matches: { id: string; stageId: string; stageGroupId: string | null; status: MatchStatus }[]
  matchParticipants: { matchId: string; entryId: string; score: number | null }[]
}

export function calculateStandings(input: StandingsInput): StageStandings {
  if (input.stage.stageType === "knockout" || !input.stage.standings.enabled) return { kind: "none" }

  const entries = input.stageEntries.filter((entry) => entry.stageId === input.stage.id)
  const entryById = new Map(entries.map((entry) => [entry.id, entry]))
  const participants = new Map<string, StandingsInput["matchParticipants"]>()
  for (const participant of input.matchParticipants) {
    const list = participants.get(participant.matchId) ?? []
    list.push(participant)
    participants.set(participant.matchId, list)
  }

  const completed = input.matches.filter((match) => match.stageId === input.stage.id && match.status === "completed")

  function resultFor(match: StandingsInput["matches"][number], groupId: string | null) {
    const sides = participants.get(match.id) ?? []
    if (sides.length !== 2) return null
    const [first, second] = sides
    if (!validScore(first.score) || !validScore(second.score)) return null
    const left = entryById.get(first.entryId)
    const right = entryById.get(second.entryId)
    if (!left || !right || left.teamId === right.teamId) return null
    if (groupId && (match.stageGroupId !== groupId || left.stageGroupId !== groupId || right.stageGroupId !== groupId)) {
      return null
    }
    return { left, right, leftScore: first.score, rightScore: second.score }
  }

  if (input.stage.stageType === "league") {
    const rows = zeroRows(entries)
    for (const match of completed) {
      const result = resultFor(match, null)
      if (result) applyResult(rows, result, input.stage.standings.scoring)
    }
    return { kind: "league", rows: sortRows(rows) }
  }

  return {
    kind: "groups",
    groups: input.stageGroups
      .filter((group) => group.stageId === input.stage.id)
      .map((group) => {
        const rows = zeroRows(entries.filter((entry) => entry.stageGroupId === group.id))
        for (const match of completed) {
          const result = resultFor(match, group.id)
          if (result) applyResult(rows, result, input.stage.standings.scoring)
        }
        return { groupId: group.id, groupName: group.name, rows: sortRows(rows) }
      }),
  }
}

function validScore(score: number | null): score is number {
  return score !== null && Number.isInteger(score) && score >= 0
}

function zeroRows(entries: StandingsInput["stageEntries"]): Map<string, StandingRow> {
  const rows = new Map<string, StandingRow>()
  for (const entry of entries) {
    if (rows.has(entry.teamId)) continue
    rows.set(entry.teamId, {
      teamId: entry.teamId,
      name: entry.name,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      scored: 0,
      conceded: 0,
      difference: 0,
      points: 0,
    })
  }
  return rows
}

function applyResult(
  rows: Map<string, StandingRow>,
  result: {
    left: { teamId: string }
    right: { teamId: string }
    leftScore: number
    rightScore: number
  },
  scoring: ScoringRules,
) {
  const left = rows.get(result.left.teamId)
  const right = rows.get(result.right.teamId)
  if (!left || !right) return
  record(left, result.leftScore, result.rightScore, scoring)
  record(right, result.rightScore, result.leftScore, scoring)
}

function record(row: StandingRow, scored: number, conceded: number, scoring: ScoringRules) {
  row.played += 1
  row.scored += scored
  row.conceded += conceded
  row.difference = row.scored - row.conceded
  if (scored > conceded) {
    row.won += 1
    row.points += scoring.win
  } else if (scored === conceded) {
    row.drawn += 1
    row.points += scoring.draw
  } else {
    row.lost += 1
    row.points += scoring.loss
  }
}

function sortRows(rows: Map<string, StandingRow>): StandingRow[] {
  return [...rows.values()].sort(
    (a, b) =>
      b.points - a.points ||
      b.difference - a.difference ||
      b.scored - a.scored ||
      a.name.localeCompare(b.name) ||
      a.teamId.localeCompare(b.teamId),
  )
}
