import type { StandingRow } from "@/src/domain/tournament/standings"
import { TeamMark } from "@/src/components/maker/visual"

const columns = [
  ["P", "Played"],
  ["W", "Won"],
  ["D", "Drawn"],
  ["L", "Lost"],
  ["GF", "Scored"],
  ["GA", "Conceded"],
  ["GD", "Difference"],
  ["Pts", "Points"],
] as const

export function StandingsTable({ caption, rows, qualifiedTeamIds = [] }: { caption: string; rows: StandingRow[]; qualifiedTeamIds?: string[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-text-muted">No participants in this table.</p>
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-text-muted">Ranking follows the configured tie-breakers, including head-to-head where enabled. {qualifiedTeamIds.length > 0 ? "✓ Currently in a qualifying position." : ""}</p>
      <p className="text-xs text-text-muted">P played · W won · D drawn · L lost · GF scored · GA conceded · GD difference · Pts points</p>
      <div tabIndex={0} role="region" aria-label={`${caption}, scroll horizontally for all statistics`} className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[40rem] text-left text-xs sm:text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-mist text-text-muted">
            <tr>
              <th scope="col" className="px-2 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.14em] sm:px-3">Pos</th>
              <th scope="col" className="px-2 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] sm:px-3">Team</th>
              {columns.map(([label, title]) => (
                <th
                  key={label}
                  scope="col"
                  title={title}
                  className={`px-2 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.12em] sm:px-3 ${label === "Pts" ? "text-lime" : ""}`}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.teamId} className={`border-t border-line transition hover:bg-mist ${index === 0 && row.played > 0 ? "bg-success-soft/50" : ""}`}>
                <td className="px-2 py-3 text-center text-base font-semibold tabular-nums text-lime sm:px-3">{index + 1}</td>
                <th scope="row" className="px-2 py-3 font-medium sm:px-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <TeamMark name={row.name} size="sm" />
                    <span className="min-w-0 break-words">{row.name}{qualifiedTeamIds.includes(row.teamId) ? <span className="ml-2 text-success" aria-label="Currently qualifying">✓</span> : null}</span>
                  </span>
                </th>
                <td className="px-2 py-3 text-right tabular-nums sm:px-3">{row.played}</td>
                <td className="px-2 py-3 text-right tabular-nums sm:px-3">{row.won}</td>
                <td className="px-2 py-3 text-right tabular-nums sm:px-3">{row.drawn}</td>
                <td className="px-2 py-3 text-right tabular-nums sm:px-3">{row.lost}</td>
                <td className="px-2 py-3 text-right tabular-nums sm:px-3">{row.scored}</td>
                <td className="px-2 py-3 text-right tabular-nums sm:px-3">{row.conceded}</td>
                <td className="px-2 py-3 text-right tabular-nums sm:px-3">{row.difference}</td>
                <td className="px-2 py-3 text-right text-base font-semibold tabular-nums text-lime sm:px-3">{row.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
