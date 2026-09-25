"use client"

import { useId, useRef } from "react"

function pentagon(cx: number, cy: number, radius: number, rotation: number) {
  return Array.from({ length: 5 }, (_, index) => {
    const angle = ((rotation - 90 + index * 72) * Math.PI) / 180
    return `${(cx + radius * Math.cos(angle)).toFixed(1)},${(cy + radius * Math.sin(angle)).toFixed(1)}`
  }).join(" ")
}

export function Football3D({ className = "" }: { className?: string }) {
  const tilt = useRef<HTMLDivElement>(null)
  const shadeId = useId().replace(/:/g, "")

  function lean(event: React.PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - bounds.left) / bounds.width - 0.5
    const y = (event.clientY - bounds.top) / bounds.height - 0.5
    if (tilt.current) {
      tilt.current.style.transform = `rotateX(${(-y * 18).toFixed(2)}deg) rotateY(${(x * 22).toFixed(2)}deg)`
    }
  }

  function release() {
    if (tilt.current) tilt.current.style.transform = ""
  }

  const outer = Array.from({ length: 5 }, (_, index) => {
    const angle = ((-90 + index * 72) * Math.PI) / 180
    return pentagon(100 + 56 * Math.cos(angle), 100 + 56 * Math.sin(angle), 15, -90 + index * 72)
  })

  return (
    <div
      className={`relative ${className}`}
      onPointerMove={lean}
      onPointerLeave={release}
      aria-hidden="true"
    >
      <div className="absolute bottom-[6%] left-1/2 h-8 w-2/3 -translate-x-1/2 rounded-full bg-black/50 blur-md" />
      <div className="football-float relative mx-auto aspect-square w-[72%] max-w-[280px]">
        <div ref={tilt} className="h-full w-full transition-transform duration-200 [transform-style:preserve-3d]">
          <div className="absolute -inset-[8%] rounded-full border border-success/30 orbit" />
          <div className="relative h-full overflow-hidden rounded-full shadow-[inset_-18px_-24px_40px_rgba(0,0,0,0.45),0_20px_50px_rgba(0,0,0,0.45)]">
            <div className="football-spin h-full w-full">
              <svg viewBox="0 0 200 200" className="h-full w-full">
                <defs>
                  <radialGradient id={shadeId} cx="32%" cy="28%" r="75%">
                    <stop offset="0%" stopColor="#ffffff" />
                    <stop offset="58%" stopColor="#ececec" />
                    <stop offset="100%" stopColor="#c8c8c8" />
                  </radialGradient>
                </defs>
                <circle cx="100" cy="100" r="97" fill="#f4f4f4" />
                <circle cx="100" cy="100" r="97" fill={`url(#${shadeId})`} />
                <polygon points={pentagon(100, 100, 28, -90)} fill="#121417" />
                {outer.map((points) => (
                  <polygon key={points} points={points} fill="#121417" />
                ))}
                <circle cx="100" cy="100" r="96" fill="none" stroke="#1b1e22" strokeWidth="4" />
              </svg>
            </div>
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.72),transparent_36%)]" />
          </div>
        </div>
      </div>
    </div>
  )
}
