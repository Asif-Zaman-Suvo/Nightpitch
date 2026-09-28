import type { BracketColumn } from "@/src/domain/tournament/bracket"
import { MatchStatusBadge, TeamMark } from "@/src/components/maker/visual"

export function KnockoutBracket({ rounds }: { rounds: readonly BracketColumn[] }) {
  if (rounds.length === 0) return null
  return (
    <div tabIndex={0} role="region" aria-label="Tournament bracket, scroll horizontally to see all rounds" className="max-w-full overflow-x-auto overscroll-x-contain">
      <div className="flex w-max items-stretch py-1" role="list" aria-label="Knockout bracket">
        {rounds.map((round, roundIndex) => (
          <section
            key={round.round}
            aria-label={round.label}
            className={`flex w-72 shrink-0 flex-col ${roundIndex > 0 ? "border-l-2 border-line" : ""}`}
          >
            <h3 className="px-3 pb-3 text-xs font-semibold uppercase tracking-[0.16em] text-lime">{round.label}</h3>
            <div className="flex flex-1 flex-col justify-around gap-4">
              {round.matches.map((match) => (
                <article key={match.id} className="px-3" role="listitem">
                  <div className={`rounded-xl border bg-surface shadow-sm ${roundIndex === rounds.length - 1 ? "border-gold/50 ring-4 ring-gold/10" : "border-line"}`}>
                    <div className="flex items-center justify-between gap-2 border-b border-line px-2.5 py-1.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Match {match.number}</p>
                      <MatchStatusBadge status={match.status} />
                    </div>
                    <ul>
                      {match.slots.map((slot, index) => (
                        <li
                          key={`${match.id}-${index}`}
                          className={`flex min-w-0 items-center gap-2 border-b border-line/70 px-3 py-3 last:border-b-0 ${match.status === "completed" && slot.score !== null && slot.score > (match.slots[1 - index]?.score ?? Infinity) ? "bg-success-soft" : ""}`}
                        >
                          {slot.resolved ? (
                            <TeamMark name={slot.label} shortName={slot.shortName} logoUrl={slot.logoUrl} size="sm" />
                          ) : (
                            <span
                              aria-hidden="true"
                              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-dashed border-line text-[10px] text-text-muted"
                            >
                              ?
                            </span>
                          )}
                          <span className={`min-w-0 flex-1 break-words text-sm ${slot.resolved ? "font-medium text-ink" : "text-text-muted"}`}>
                            {slot.label}
                          </span>
                          {slot.score !== null ? (
                            <span className="font-mono text-sm font-semibold tabular-nums text-ink">{slot.score}</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
