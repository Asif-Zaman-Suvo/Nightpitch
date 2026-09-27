import type { StandingRow } from "./standings"

export interface GroupTopNRule {
  type: "group_top_n"
  sourceGroupId: string
  count: number
}

export interface QualificationConfiguration {
  schemaVersion: "1"
  rules: GroupTopNRule[]
}

export interface QualificationSource {
  id: string
  tournamentId: string
  stageId: string
  stagePosition: number
  stageType: "group" | "league" | "knockout"
  stageGroupCount: number
  name: string
  rows: StandingRow[]
  entries: { id: string; teamId: string }[]
  completedMatches: number
}

export interface QualifiedEntry {
  sourceGroupId: string
  rank: number
  stageEntryId: string
  teamId: string
  name: string
}

export interface QualificationGroupPreview {
  sourceGroupId: string
  name: string
  count: number
  rows: { rank: number; teamId: string; name: string; qualified: boolean }[]
  state: "ready" | "unavailable" | "error"
  message?: string
}

export type QualificationPreview =
  | { ok: true; groups: QualificationGroupPreview[]; qualified: QualifiedEntry[] }
  | { ok: false; error: string; groups: QualificationGroupPreview[]; qualified: [] }

type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null
}

export function parseQualificationConfiguration(value: unknown): ParseResult<QualificationConfiguration> {
  const input = object(value)
  if (!input || input.schemaVersion !== "1" || !Array.isArray(input.rules)) {
    return { ok: false, error: "Invalid qualification configuration." }
  }
  const rules: GroupTopNRule[] = []
  const seen = new Set<string>()
  for (const raw of input.rules) {
    const rule = object(raw)
    if (!rule || rule.type !== "group_top_n") return { ok: false, error: "Unsupported qualification rule." }
    if (typeof rule.sourceGroupId !== "string" || !UUID.test(rule.sourceGroupId)) {
      return { ok: false, error: "Choose a valid source group." }
    }
    if (typeof rule.count !== "number" || !Number.isSafeInteger(rule.count) || rule.count <= 0) {
      return { ok: false, error: "Qualifying count must be a positive whole number." }
    }
    const id = rule.sourceGroupId.toLowerCase()
    if (seen.has(id)) return { ok: false, error: "A source group can appear only once." }
    seen.add(id)
    rules.push({ type: "group_top_n", sourceGroupId: rule.sourceGroupId, count: rule.count })
  }
  return { ok: true, value: { schemaVersion: "1", rules } }
}

export function resolveQualificationConfiguration(stageRules: unknown): ParseResult<QualificationConfiguration> {
  const qualification = object(stageRules)?.qualification
  return qualification === undefined
    ? { ok: true, value: { schemaVersion: "1", rules: [] } }
    : parseQualificationConfiguration(qualification)
}

export function qualificationSourceError(input: {
  tournamentId: string
  destinationStageId: string
  destinationPosition: number
  source: QualificationSource | null
}): string | null {
  const source = input.source
  if (!source || source.tournamentId !== input.tournamentId) return "Source group not found in this tournament."
  if (source.stageId === input.destinationStageId || source.stagePosition >= input.destinationPosition || source.stageType === "knockout") {
    return "Choose a group attached to an earlier group or league stage."
  }
  if (source.stageType === "league" && source.stageGroupCount !== 1) {
    return "A league source must have exactly one attached group."
  }
  return null
}

export function calculateQualifiedEntries(input: {
  tournamentId: string
  destinationStageId: string
  destinationPosition: number
  configuration: QualificationConfiguration
  sources: QualificationSource[]
}): QualificationPreview {
  const parsed = parseQualificationConfiguration(input.configuration)
  if (!parsed.ok) return { ok: false, error: parsed.error, groups: [], qualified: [] }
  const groups: QualificationGroupPreview[] = []
  const qualified: QualifiedEntry[] = []
  const seenTeams = new Set<string>()
  let error: string | null = null
  for (const rule of parsed.value.rules) {
    const source = input.sources.find((item) => item.id.toLowerCase() === rule.sourceGroupId.toLowerCase()) ?? null
    const sourceError = qualificationSourceError({
      tournamentId: input.tournamentId, destinationStageId: input.destinationStageId,
      destinationPosition: input.destinationPosition, source,
    })
    if (sourceError || !source) {
      error ??= sourceError ?? "Source group not found."
      groups.push({ sourceGroupId: rule.sourceGroupId, name: source?.name ?? "Missing group", count: rule.count,
        rows: [], state: "error", message: sourceError ?? "Source group not found." })
      continue
    }
    const rows = source.rows.map((row, index) => ({
      rank: index + 1, teamId: row.teamId, name: row.name, qualified: index < rule.count,
    }))
    const group = { sourceGroupId: source.id, name: source.name, count: rule.count, rows }
    if (source.rows.length < rule.count) {
      const message = `${source.name} currently has only ${source.rows.length} eligible teams; ${rule.count} are required.`
      error ??= message
      groups.push({ ...group, rows: rows.map((row) => ({ ...row, qualified: false })), state: "error", message })
      continue
    }
    if (source.completedMatches === 0) {
      groups.push({ ...group, rows: rows.map((row) => ({ ...row, qualified: false })),
        state: "unavailable", message: "Standings are not available yet; no completed matches." })
      error ??= "Standings are not available yet."
      continue
    }
    const chosen: QualifiedEntry[] = []
    for (const row of source.rows.slice(0, rule.count)) {
      const matches = source.entries.filter((entry) => entry.teamId === row.teamId)
      if (matches.length !== 1 || seenTeams.has(row.teamId)) {
        const message = matches.length !== 1
          ? `${source.name} has an ambiguous stage entry for ${row.name}.`
          : `${row.name} qualifies more than once.`
        error ??= message
        groups.push({ ...group, rows: rows.map((item) => ({ ...item, qualified: false })), state: "error", message })
        break
      }
      seenTeams.add(row.teamId)
      chosen.push({ sourceGroupId: source.id, rank: chosen.length + 1,
        stageEntryId: matches[0].id, teamId: row.teamId, name: row.name })
    }
    if (chosen.length === rule.count) {
      qualified.push(...chosen)
      groups.push({ ...group, state: "ready" })
    }
  }
  if (!error) return { ok: true, groups, qualified }
  return {
    ok: false, error, qualified: [],
    groups: groups.map((group) => ({
      ...group, rows: group.rows.map((row) => ({ ...row, qualified: false })),
    })),
  }
}

export interface AppliedEntrySnapshot {
  id: string
  slot: number
  teamId: string
  name: string
  sourceKind: "team" | "group_rank" | "pooled_rank" | "match_outcome"
  sourceGroupId: string | null
  sourceRank: number | null
  referenced: boolean
}

export interface QualificationEntryChange {
  slot: number
  teamId: string
  name: string
  sourceGroupId: string
  rank: number
}

export type QualificationApplyPlan =
  | { ok: true; status: "unchanged" }
  | { ok: true; status: "apply"; create: QualificationEntryChange[]; update: (QualificationEntryChange & { id: string })[]; remove: { id: string }[] }
  | { ok: false; error: string }

const MANUAL_PARTICIPANTS = "This stage already has manually added participants. Remove them before applying qualification."
const BRACKET_LOCKED = "A bracket already uses these participants. Qualification cannot change them."

export function planQualificationApply(input: {
  preview: QualificationPreview
  hasRules: boolean
  entries: AppliedEntrySnapshot[]
  destinationHasMatches: boolean
}): QualificationApplyPlan {
  if (!input.hasRules) return { ok: false, error: "This stage has no qualification rules." }
  if (!input.preview.ok) return { ok: false, error: input.preview.error }
  if (input.preview.qualified.length === 0) return { ok: false, error: "No teams currently qualify." }
  if (input.entries.some((entry) => entry.sourceKind !== "group_rank")) return { ok: false, error: MANUAL_PARTICIPANTS }

  const key = (groupId: string, rank: number) => `${groupId.toLowerCase()}:${rank}`
  const existing = new Map<string, AppliedEntrySnapshot>()
  for (const entry of input.entries) {
    if (entry.sourceGroupId && entry.sourceRank) existing.set(key(entry.sourceGroupId, entry.sourceRank), entry)
  }
  const create: QualificationEntryChange[] = []
  const update: (QualificationEntryChange & { id: string })[] = []
  const seen = new Set<string>()
  input.preview.qualified.forEach((qualified, index) => {
    const slot = index + 1
    const match = existing.get(key(qualified.sourceGroupId, qualified.rank))
    const next = { slot, teamId: qualified.teamId, name: qualified.name, sourceGroupId: qualified.sourceGroupId, rank: qualified.rank }
    if (!match) {
      create.push(next)
      return
    }
    seen.add(match.id)
    if (match.teamId === qualified.teamId && match.slot === slot) return
    if (match.referenced && match.teamId !== qualified.teamId) return
    update.push({ ...next, id: match.id })
  })
  const blocked = input.entries.find((entry) => {
    const desired = input.preview.ok ? input.preview.qualified.find((item) => item.sourceGroupId.toLowerCase() === entry.sourceGroupId?.toLowerCase() && item.rank === entry.sourceRank) : undefined
    return entry.referenced && (!desired || desired.teamId !== entry.teamId)
  })
  if (blocked) {
    const desired = input.preview.qualified.find((item) => item.sourceGroupId.toLowerCase() === blocked.sourceGroupId?.toLowerCase() && item.rank === blocked.sourceRank)
    return { ok: false, error: desired
      ? `${blocked.name} is already used in a match and cannot be replaced.`
      : `${blocked.name} is already used in a match and cannot be removed.` }
  }
  const remove = input.entries.filter((entry) => !seen.has(entry.id)).map((entry) => ({ id: entry.id }))
  if (input.destinationHasMatches && (create.length > 0 || update.length > 0 || remove.length > 0)) {
    return { ok: false, error: BRACKET_LOCKED }
  }
  if (create.length === 0 && update.length === 0 && remove.length === 0) return { ok: true, status: "unchanged" }
  return { ok: true, status: "apply", create, update, remove }
}
