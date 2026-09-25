import type { MatchStatus } from "./match"
import type { StageType } from "./stage"

export type BracketSlot =
  | { kind: "participant"; participantId: string }
  | { kind: "winner"; matchIndex: number }

export interface BracketMatchPlan {
  index: number
  round: number
  position: number
  slots: readonly [BracketSlot, BracketSlot]
}

export interface KnockoutBracketPlan {
  participantCount: number
  roundCount: number
  matchCount: number
  matches: readonly BracketMatchPlan[]
}

const COUNT_ERROR = "Knockout bracket generation currently requires 2, 4, 8, 16... participants."
const STAGE_ERROR = "Knockout brackets can only be generated for a knockout stage."
const DUPLICATE_ERROR = "A participant cannot appear twice in the same bracket."

export function roundLabel(round: number, roundCount: number): string {
  if (roundCount > 0 && round === roundCount) return "Final"
  return `Round ${round}`
}

export function planKnockoutBracket(input: {
  stageType: StageType
  participants: readonly { id: string }[]
  existingMatchCount: number
}): { ok: true; status: "exists" } | { ok: true; status: "ready"; bracket: KnockoutBracketPlan } | { ok: false; error: string } {
  if (input.stageType !== "knockout") return { ok: false, error: STAGE_ERROR }
  if (input.existingMatchCount > 0) return { ok: true, status: "exists" }

  const ids = input.participants.map((participant) => participant.id)
  if (new Set(ids).size !== ids.length) return { ok: false, error: DUPLICATE_ERROR }
  if (!isPowerOfTwo(ids.length)) return { ok: false, error: COUNT_ERROR }

  const matches: BracketMatchPlan[] = []
  let feeders: BracketSlot[] = ids.map((participantId) => ({ kind: "participant", participantId }))
  let round = 1
  while (feeders.length > 1) {
    const next: BracketSlot[] = []
    for (let index = 0; index < feeders.length; index += 2) {
      const matchIndex = matches.length
      const home = feeders[index]
      const away = feeders[index + 1]
      if (!home || !away) return { ok: false, error: COUNT_ERROR }
      matches.push({
        index: matchIndex,
        round,
        position: index / 2 + 1,
        slots: [home, away],
      })
      next.push({ kind: "winner", matchIndex })
    }
    feeders = next
    round += 1
  }

  return {
    ok: true,
    status: "ready",
    bracket: {
      participantCount: ids.length,
      roundCount: round - 1,
      matchCount: matches.length,
      matches,
    },
  }
}

function isPowerOfTwo(count: number): boolean {
  return Number.isInteger(count) && count >= 2 && (count & (count - 1)) === 0
}

export type StoredBracketSlot =
  | { kind: "participant"; name: string; shortName: string | null; logoUrl: string | null; score: number | null }
  | { kind: "winner"; sourceMatchId: string }

export interface StoredBracketMatch {
  id: string
  round: number
  matchNumber: number
  status: MatchStatus
  slots: readonly StoredBracketSlot[]
}

export interface BracketCardSlot {
  label: string
  shortName: string | null
  logoUrl: string | null
  score: number | null
  resolved: boolean
}

export interface BracketCard {
  id: string
  number: number
  status: MatchStatus
  slots: readonly [BracketCardSlot, BracketCardSlot]
}

export interface BracketColumn {
  round: number
  label: string
  matches: readonly BracketCard[]
}

export interface BracketView {
  roundCount: number
  matchCount: number
  rounds: readonly BracketColumn[]
}

export function projectBracket(matches: readonly StoredBracketMatch[]): BracketView {
  const ordered = [...matches].sort(
    (left, right) => left.round - right.round || left.matchNumber - right.matchNumber || left.id.localeCompare(right.id),
  )
  const numbers = new Map(ordered.map((match, index) => [match.id, index + 1]))
  const cards = ordered.map((match, index) => ({
    id: match.id,
    number: index + 1,
    round: match.round,
    status: match.status,
    slots: [projectSlot(match.slots[0], numbers), projectSlot(match.slots[1], numbers)] as const,
  }))
  const roundCount = cards.reduce((highest, card) => Math.max(highest, card.round), 0)
  const rounds: { round: number; label: string; matches: BracketCard[] }[] = []
  for (const card of cards) {
    const label = roundLabel(card.round, roundCount)
    const column = rounds.find((round) => round.round === card.round)
    const viewCard: BracketCard = { id: card.id, number: card.number, status: card.status, slots: card.slots }
    if (column) column.matches.push(viewCard)
    else rounds.push({ round: card.round, label, matches: [viewCard] })
  }
  return { roundCount, matchCount: cards.length, rounds }
}

function projectSlot(
  slot: StoredBracketSlot | undefined,
  numbers: ReadonlyMap<string, number>,
): BracketCardSlot {
  if (!slot) {
    return { label: "Waiting", shortName: null, logoUrl: null, score: null, resolved: false }
  }
  if (slot.kind === "participant") {
    return {
      label: slot.name,
      shortName: slot.shortName,
      logoUrl: slot.logoUrl,
      score: slot.score,
      resolved: true,
    }
  }
  const number = numbers.get(slot.sourceMatchId)
  return {
    label: number ? `Winner of Match ${number}` : "Winner of an earlier match",
    shortName: null,
    logoUrl: null,
    score: null,
    resolved: false,
  }
}
