import Link from "next/link"
import { PitchPhoto } from "@/src/components/maker/PitchPhoto"
import { SiteHeader } from "@/src/components/maker/SiteHeader"
import { TournamentSearchForm } from "@/src/components/maker/TournamentSearchForm"
import { btnSecondary } from "@/src/components/maker/styles"
import { getCurrentUser } from "@/src/server/auth/session"

export default async function HomePage() {
  const user = await getCurrentUser().catch(() => null)
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <SiteHeader />
      <main id="main-content">
        <section className="dark-panel relative overflow-hidden">
          <div className="mx-auto grid max-w-7xl items-center gap-8 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-[1.1fr_1fr]">
            <div className="relative z-10 rise">
              <p className="text-xs font-semibold uppercase tracking-[.2em] text-emerald-200">Built for the competition</p>
              <h1 className="mt-5 max-w-xl text-4xl font-semibold leading-[1.06] sm:text-6xl">Your tournament.<br /><span className="text-emerald-200">From kickoff<br />to champion.</span></h1>
              <p className="mt-6 max-w-md text-base leading-7 text-white/70">Bring your teams together. Set the stage, run match day, and give every competition a home worth sharing.</p>
              <div className="mt-8 flex flex-wrap gap-3"><Link href={user ? "/dashboard" : "/signup"} className="ui-button inline-flex items-center justify-center rounded-lg bg-white px-5 py-3 text-sm font-semibold text-navy hover:bg-emerald-100">Create a tournament ↗</Link><Link href="/lookup" className={`${btnSecondary} border-white/30 bg-transparent text-white hover:bg-white/10`}>Find your competition</Link></div>
              <p className="mt-5 text-xs text-white/55">Teams · Groups · Leagues · Knockout brackets</p>
            </div>
            <div className="relative min-h-72 overflow-hidden rounded-2xl border border-white/15 sm:min-h-96 lg:min-h-[30rem]">
              <PitchPhoto name="night" priority sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover object-center" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-6"><span className="text-xs font-semibold uppercase tracking-[.2em] text-emerald-200">Make it a tournament</span><p className="mt-2 max-w-xs text-2xl font-semibold text-white">Big rivalries.<br />Every little detail, handled.</p></div>
            </div>
          </div>
        </section>
        <section className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
          <div className="flex flex-wrap items-end justify-between gap-3"><h2 className="max-w-sm text-2xl font-semibold">One competition.<br />One place to run it.</h2><p className="max-w-sm text-sm leading-6 text-text-muted">A clear path from your first team to your final result.</p></div>
          <div className="mt-7 grid gap-5 md:grid-cols-3">
            {[["01", "Build your field", "Add team identities, organize groups, and choose the stages that fit your competition."], ["02", "Own match day", "Generate fixtures, schedule kickoffs, and record results with standings that follow along."], ["03", "Share the story", "Give participants a public match center with tables, knockout rounds, and a champion." ]].map(([n,title,copy]) => <article key={n} className="rounded-xl border border-line bg-surface p-6"><p className="font-mono text-sm text-lime">{n} /</p><h3 className="mt-5 text-xl font-semibold">{title}</h3><p className="mt-3 text-sm leading-6 text-text-muted">{copy}</p></article>)}
          </div>
          <div className="mt-12 grid items-center gap-6 rounded-2xl border border-line bg-surface p-6 sm:p-8 md:grid-cols-2"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-lime">Follow the action</p><h2 className="mt-2 text-2xl font-semibold">Already part of a tournament?</h2><p className="mt-2 text-sm text-text-muted">Find your teams, fixtures, and latest results.</p></div><TournamentSearchForm query="" /></div>
        </section>
      </main>
      <footer className="border-t border-line px-5 py-6 text-center text-xs text-text-muted">Nightpitch · A home for every competition.</footer>
    </div>
  )
}
