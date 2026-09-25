import { PageFrame } from "@/src/components/maker/PageFrame"

export default function PublicTournamentLoading() {
  return (
    <PageFrame width="wide">
      <div className="space-y-4" aria-busy="true" aria-label="Loading tournament">
        <div className="h-40 animate-pulse rounded-xl bg-surface" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="h-20 animate-pulse rounded-xl bg-surface" />
          ))}
        </div>
        <div className="h-28 animate-pulse rounded-xl bg-surface" />
        <div className="h-28 animate-pulse rounded-xl bg-surface" />
      </div>
    </PageFrame>
  )
}
