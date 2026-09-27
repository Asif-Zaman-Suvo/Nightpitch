import type { MatchStatus } from "./match"
import type { StageType } from "./stage"

export interface ScoringRules {
  win: number
  draw: number
  loss: number
}

export const TIE_BREAKERS = ["points", "headToHead", "goalDifference", "goalsScored", "teamName"] as const
export type TieBreaker = (typeof TIE_BREAKERS)[number]
export const DEFAULT_TIE_BREAKERS: TieBreaker[] = ["points", "goalDifference", "goalsScored", "teamName"]
export const TIE_BREAKER_LABELS: Record<TieBreaker, string> = {
  points: "Points", headToHead: "Head-to-head", goalDifference: "Goal Difference", goalsScored: "Goals Scored", teamName: "Team Name",
}

export interface StandingsRules {
  enabled: boolean
  scoring: ScoringRules
  tieBreakers: TieBreaker[]
}

export interface StandingsConfiguration {
  winPoints: number
  drawPoints: number
  lossPoints: number
  tieBreakers: TieBreaker[]
}

export interface StageRules {
  schemaVersion: "1"
  standings: StandingsConfiguration
}

const DEFAULT_SCORING: ScoringRules = { win: 3, draw: 1, loss: 0 }

type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string }

export function defaultStageRules(stageType: StageType) {
  if (stageType === "knockout") {
    // Preserve the existing knockout JSON; these stages never calculate standings.
    return { schemaVersion: "1" as const, standings: { enabled: false, scoring: { ...DEFAULT_SCORING } } }
  }
  return {
    schemaVersion: "1" as const,
    standings: { winPoints: 3, drawPoints: 1, lossPoints: 0, tieBreakers: [...DEFAULT_TIE_BREAKERS] },
  }
}

export function parseScoringRules(input: { win: unknown; draw: unknown; loss: unknown }): ParseResult<ScoringRules> {
  if (![input.win, input.draw, input.loss].every(isPoints)) {
    return { ok: false, error: "Scoring values must be whole numbers of zero or more." }
  }
  return { ok: true, value: { win: input.win as number, draw: input.draw as number, loss: input.loss as number } }
}

function isPoints(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
}

export function parseTieBreakers(value: unknown): ParseResult<TieBreaker[]> {
  if (!Array.isArray(value) || value.length === 0 ||
      value.some((item) => !TIE_BREAKERS.includes(item)) ||
      new Set(value).size !== value.length || !value.includes("points")) {
    return { ok: false, error: "Choose unique supported tie-breakers, including Points exactly once." }
  }
  return { ok: true, value: [...value] }
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null
}

export function parseStandingsConfiguration(value: unknown): ParseResult<StandingsConfiguration> {
  const input = object(value)
  if (!input) return { ok: false, error: "Invalid standings rules." }
  const scoring = parseScoringRules({ win: input.winPoints, draw: input.drawPoints, loss: input.lossPoints })
  if (!scoring.ok) return scoring
  const tieBreakers = parseTieBreakers(input.tieBreakers)
  if (!tieBreakers.ok) return tieBreakers
  return { ok: true, value: {
    winPoints: scoring.value.win, drawPoints: scoring.value.draw, lossPoints: scoring.value.loss,
    tieBreakers: tieBreakers.value,
  } }
}

export function resolveStandingsRules(stageType: StageType, rules: unknown): StandingsRules {
  const stored = object(object(rules)?.standings)
  const legacyScoring = object(stored?.scoring)
  const scoring = parseScoringRules(stored && "winPoints" in stored
    ? { win: stored.winPoints, draw: stored.drawPoints, loss: stored.lossPoints }
    : { win: legacyScoring?.win, draw: legacyScoring?.draw, loss: legacyScoring?.loss })
  const tieBreakers = parseTieBreakers(stored?.tieBreakers)
  return {
    enabled: stageType !== "knockout" && stored?.enabled !== false,
    scoring: scoring.ok ? scoring.value : { ...DEFAULT_SCORING },
    tieBreakers: tieBreakers.ok ? tieBreakers.value : [...DEFAULT_TIE_BREAKERS],
  }
}

export function sameStandingsRules(left: StandingsRules, right: StandingsRules): boolean {
  return left.enabled === right.enabled &&
    left.scoring.win === right.scoring.win && left.scoring.draw === right.scoring.draw &&
    left.scoring.loss === right.scoring.loss &&
    left.tieBreakers.length === right.tieBreakers.length &&
    left.tieBreakers.every((rule, index) => rule === right.tieBreakers[index])
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
    const direct: DirectResult[] = []
    for (const match of completed) {
      const result = resultFor(match, null)
      if (!result) continue
      applyResult(rows, result, input.stage.standings.scoring)
      direct.push(result)
    }
    return { kind: "league", rows: sortRows(rows, input.stage.standings.tieBreakers, input.stage.standings.scoring, direct) }
  }

  return {
    kind: "groups",
    groups: input.stageGroups
      .filter((group) => group.stageId === input.stage.id)
      .map((group) => {
        const rows = zeroRows(entries.filter((entry) => entry.stageGroupId === group.id))
        const direct: DirectResult[] = []
        for (const match of completed) {
          const result = resultFor(match, group.id)
          if (!result) continue
          applyResult(rows, result, input.stage.standings.scoring)
          direct.push(result)
        }
        return {
          groupId: group.id,
          groupName: group.name,
          rows: sortRows(rows, input.stage.standings.tieBreakers, input.stage.standings.scoring, direct),
        }
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

interface DirectResult {
  left: { teamId: string }
  right: { teamId: string }
  leftScore: number
  rightScore: number
}

function applyResult(
  rows: Map<string, StandingRow>,
  result: DirectResult,
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

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function compareNames(a: StandingRow, b: StandingRow): number {
  return compareText(a.name.toLowerCase(), b.name.toLowerCase())
}

interface MiniRow {
  points: number
  difference: number
  scored: number
  conceded: number
}

function sortRows(
  rows: Map<string, StandingRow>,
  tieBreakers: readonly TieBreaker[],
  scoring: ScoringRules,
  matches: DirectResult[],
): StandingRow[] {
  return orderRows([...rows.values()], tieBreakers, scoring, matches, 0)
}

function orderRows(
  rows: StandingRow[],
  tieBreakers: readonly TieBreaker[],
  scoring: ScoringRules,
  matches: DirectResult[],
  index: number,
): StandingRow[] {
  if (rows.length <= 1) return rows
  if (index >= tieBreakers.length) return byNameThenId(rows)
  const rule = tieBreakers[index]
  if (rule === "headToHead") {
    const bands = headToHeadBands(rows, scoring, matches)
    if (!bands) return orderRows(rows, tieBreakers, scoring, matches, index + 1)
    return bands.flatMap((band) => band.length === 1 ? band : orderRows(band, tieBreakers, scoring, matches, index + 1))
  }
  const bands = partitionRows(rows, rule)
  if (bands.length === 1) return orderRows(rows, tieBreakers, scoring, matches, index + 1)
  return bands.flatMap((band) => orderRows(band, tieBreakers, scoring, matches, index + 1))
}

function partitionRows(rows: StandingRow[], rule: Exclude<TieBreaker, "headToHead">): StandingRow[][] {
  const value = (row: StandingRow) => rule === "points" ? row.points
    : rule === "goalDifference" ? row.difference
    : rule === "goalsScored" ? row.scored
    : row.name.toLowerCase()
  const ordered = [...rows].sort((a, b) => {
    const left = value(a)
    const right = value(b)
    if (left === right) return 0
    if (typeof left === "string" && typeof right === "string") return compareText(left, right)
    return (right as number) - (left as number)
  })
  const bands: StandingRow[][] = []
  for (const row of ordered) {
    const last = bands[bands.length - 1]
    if (!last || value(last[0]) !== value(row)) bands.push([row])
    else last.push(row)
  }
  return bands
}

function headToHeadBands(rows: StandingRow[], scoring: ScoringRules, matches: DirectResult[]): StandingRow[][] | null {
  if (rows.length < 2) return rows.map((row) => [row])
  const stats = miniStandings(rows, scoring, matches)
  return splitHeadToHead(rows, stats, ["points", "difference", "scored"], scoring, matches)
}

function splitHeadToHead(
  rows: StandingRow[],
  stats: Map<string, MiniRow>,
  metrics: readonly ("points" | "difference" | "scored")[],
  scoring: ScoringRules,
  matches: DirectResult[],
): StandingRow[][] | null {
  const [metric, ...rest] = metrics
  if (!metric) return null
  const bands = groupByStat(rows, stats, metric)
  if (bands.length === 1) return splitHeadToHead(rows, stats, rest, scoring, matches)
  const resolved: StandingRow[][] = []
  for (const band of bands) {
    if (band.length === 1) {
      resolved.push(band)
      continue
    }
    const nested = headToHeadBands(band, scoring, matches)
    if (!nested) resolved.push(band)
    else resolved.push(...nested)
  }
  return resolved
}

function groupByStat(
  rows: StandingRow[],
  stats: Map<string, MiniRow>,
  metric: "points" | "difference" | "scored",
): StandingRow[][] {
  const ordered = [...rows].sort((a, b) => stats.get(b.teamId)![metric] - stats.get(a.teamId)![metric])
  const bands: StandingRow[][] = []
  for (const row of ordered) {
    const value = stats.get(row.teamId)![metric]
    const last = bands[bands.length - 1]
    if (!last || stats.get(last[0].teamId)![metric] !== value) bands.push([row])
    else last.push(row)
  }
  return bands
}

function miniStandings(rows: StandingRow[], scoring: ScoringRules, matches: DirectResult[]): Map<string, MiniRow> {
  const ids = new Set(rows.map((row) => row.teamId))
  const stats = new Map<string, MiniRow>()
  for (const row of rows) stats.set(row.teamId, { points: 0, difference: 0, scored: 0, conceded: 0 })
  for (const match of matches) {
    if (!ids.has(match.left.teamId) || !ids.has(match.right.teamId)) continue
    addMini(stats.get(match.left.teamId)!, match.leftScore, match.rightScore, scoring)
    addMini(stats.get(match.right.teamId)!, match.rightScore, match.leftScore, scoring)
  }
  return stats
}

function addMini(stat: MiniRow, scored: number, conceded: number, scoring: ScoringRules) {
  stat.scored += scored
  stat.conceded += conceded
  stat.difference = stat.scored - stat.conceded
  stat.points += scored > conceded ? scoring.win : scored === conceded ? scoring.draw : scoring.loss
}

function byNameThenId(rows: StandingRow[]): StandingRow[] {
  return [...rows].sort((a, b) => compareNames(a, b) || compareText(a.teamId, b.teamId))
}
