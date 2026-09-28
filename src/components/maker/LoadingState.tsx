export function LoadingState({ label = "Loading tournament" }: { label?: string }) {
  return <div role="status" aria-busy="true" aria-label={label} className="space-y-5">
    <span className="sr-only">{label}…</span>
    <div className="h-32 animate-pulse rounded-2xl border border-line bg-mist" />
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <div key={i} className="h-24 animate-pulse rounded-xl border border-line bg-surface" />)}</div>
    <div className="h-56 animate-pulse rounded-xl border border-line bg-surface" />
  </div>
}
