import type { StageType } from "./stage"

export interface FixturePairing {
  stageGroupId: string | null
  entryIds: [string, string]
}

export interface FixtureGroupSummary {
  groupId: string | null
  name: string
  existing: number
  missing: number
}

export function generateRoundRobinFixtures(participantIds: readonly string[]): [string, string][] {
  const pairs: [string, string][] = []
  for (let first = 0; first < participantIds.length; first += 1) {
    for (let second = first + 1; second < participantIds.length; second += 1) {
      pairs.push([participantIds[first], participantIds[second]])
    }
  }
  return pairs
}

export function roundRobinCount(participants: number): number {
  if (participants < 2) return 0
  return (participants * (participants - 1)) / 2
}

export function planRoundRobinFixtures(input: {
  stageType: StageType
  groups: { id: string; name: string }[]
  entries: { id: string; stageGroupId: string | null }[]
  existing: { stageGroupId: string | null; entryIds: [string, string] }[]
}): { ok: true; fixtures: FixturePairing[]; summaries: FixtureGroupSummary[] } | { ok: false; error: string } {
  if (input.stageType === "knockout") {
    return { ok: false, error: "Automatic round-robin fixtures are only available for group and league stages." }
  }

  const buckets =
    input.stageType === "group"
      ? input.groups.map((group) => ({
          groupId: group.id,
          name: group.name,
          ids: input.entries.filter((entry) => entry.stageGroupId === group.id).map((entry) => entry.id),
        }))
      : [{ groupId: null, name: "League", ids: input.entries.map((entry) => entry.id) }]

  if (!buckets.some((bucket) => bucket.ids.length >= 2)) {
    return { ok: false, error: "At least 2 participants are required to generate fixtures." }
  }

  const fixtures: FixturePairing[] = []
  const summaries: FixtureGroupSummary[] = []
  for (const bucket of buckets) {
    const pairs = generateRoundRobinFixtures(bucket.ids)
    const existing = new Set(
      input.existing
        .filter((match) => (input.stageType === "league" ? true : match.stageGroupId === bucket.groupId))
        .map((match) => pairKey(match.entryIds)),
    )
    const missing = pairs.filter((pair) => !existing.has(pairKey(pair)))
    summaries.push({
      groupId: bucket.groupId,
      name: bucket.name,
      existing: pairs.length - missing.length,
      missing: missing.length,
    })
    for (const pair of missing) {
      fixtures.push({ stageGroupId: bucket.groupId, entryIds: pair })
    }
  }
  return { ok: true, fixtures, summaries }
}

function pairKey(entryIds: readonly [string, string]): string {
  return entryIds[0] < entryIds[1] ? `${entryIds[0]}:${entryIds[1]}` : `${entryIds[1]}:${entryIds[0]}`
}
