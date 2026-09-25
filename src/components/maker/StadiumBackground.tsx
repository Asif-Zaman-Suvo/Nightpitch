const motes = [
  { left: "12%", top: "18%", delay: "0s" },
  { left: "28%", top: "8%", delay: "1.4s" },
  { left: "70%", top: "14%", delay: "0.6s" },
  { left: "84%", top: "28%", delay: "2s" },
  { left: "46%", top: "6%", delay: "1s" },
]

export function StadiumBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="stadium-lights absolute inset-0" />
      {motes.map((mote) => (
        <span
          key={mote.left}
          className="stadium-mote absolute h-1 w-1 rounded-full bg-white/70"
          style={{ left: mote.left, top: mote.top, animationDelay: mote.delay }}
        />
      ))}
      <div className="pitch-plane absolute inset-x-[6%] bottom-0 h-[46%] sm:inset-x-[10%]" />
    </div>
  )
}
