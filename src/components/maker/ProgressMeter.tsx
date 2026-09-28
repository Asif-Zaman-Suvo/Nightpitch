export function ProgressMeter({ value, total, label }: { value: number; total: number; label: string }) {
  const percentage = total > 0 ? Math.round(value / total * 100) : 0
  return <div className="space-y-2">
    <div className="flex items-center justify-between gap-3 text-xs"><span className="text-text-muted">{label}</span><span className="font-semibold tabular-nums">{value} / {total}</span></div>
    <div role="progressbar" aria-label={label} aria-valuenow={percentage} aria-valuemin={0} aria-valuemax={100} className="h-2 overflow-hidden rounded-full bg-mist"><div className="h-full rounded-full bg-lime transition-[width] duration-200" style={{ width: `${percentage}%` }} /></div>
  </div>
}
