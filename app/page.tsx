import Link from "next/link"
import { PitchPhoto, type PitchName } from "@/src/components/maker/PitchPhoto"
import { SiteHeader } from "@/src/components/maker/SiteHeader"
import { TournamentSearchForm } from "@/src/components/maker/TournamentSearchForm"
import { btnPrimary, btnSecondary } from "@/src/components/maker/styles"
import { getCurrentUser } from "@/src/server/auth/session"

const grounds: { name: PitchName; label: string }[] = [
  { name: "cage", label: "Covered ground" },
  { name: "corner", label: "Touchline" },
  { name: "stripes", label: "Center circle" },
]

export default async function HomePage() {
  const user = await getCurrentUser().catch(() => null)
  const createHref = user ? "/dashboard" : "/signup"

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <SiteHeader />
      <main>
        <section className="relative min-h-[32rem] overflow-hidden sm:min-h-[40rem]">
          <PitchPhoto name="night" priority sizes="100vw" className="object-cover object-center" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/55 to-black/25" />
          <div className="relative mx-auto flex min-h-[32rem] w-full max-w-6xl flex-col justify-end px-4 py-14 sm:min-h-[40rem] sm:py-20">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/80">Nightpitch</p>
            <h1 className="mt-3 max-w-xl text-4xl font-semibold leading-[0.95] text-white sm:text-6xl">
              Create your
              <span className="block">own tournament.</span>
            </h1>
            <p className="mt-5 max-w-md text-base leading-7 text-white/80">
              Build teams, groups, stages, fixtures, results and standings.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={createHref} className={btnPrimary}>
                Create tournament
              </Link>
              <Link href="/lookup" className={`${btnSecondary} border-white/20 bg-black/30 text-white hover:bg-black/50`}>
                Find tournament
              </Link>
            </div>
          </div>
        </section>

        <section className="mx-auto grid w-full max-w-6xl gap-3 px-4 py-8 sm:grid-cols-3">
          {grounds.map((ground) => (
            <figure key={ground.name} className="relative aspect-[4/3] overflow-hidden rounded-xl">
              <PitchPhoto name={ground.name} sizes="(min-width: 640px) 33vw, 100vw" />
              <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 pb-3 pt-10 text-sm font-medium text-white">
                {ground.label}
              </figcaption>
            </figure>
          ))}
        </section>

        <section className="mx-auto mb-16 w-full max-w-6xl space-y-4 px-4">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">Find a tournament</p>
            <h2 className="text-lg font-semibold text-ink">Search by name or Tournament ID</h2>
          </div>
          <TournamentSearchForm query="" />
        </section>
      </main>
    </div>
  )
}
