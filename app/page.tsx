import Link from "next/link"
import { Football3D } from "@/src/components/maker/Football3D"
import { SiteHeader } from "@/src/components/maker/SiteHeader"
import { StadiumBackground } from "@/src/components/maker/StadiumBackground"
import { TournamentSearchForm } from "@/src/components/maker/TournamentSearchForm"
import { btnPrimary, btnSecondary, card } from "@/src/components/maker/styles"
import { getCurrentUser } from "@/src/server/auth/session"

export default async function HomePage() {
  const user = await getCurrentUser().catch(() => null)
  const createHref = user ? "/dashboard" : "/signup"

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <SiteHeader />
      <main className="relative flex-1 overflow-hidden">
        <StadiumBackground />
        <div className="relative mx-auto grid w-full max-w-6xl items-center gap-8 px-4 py-12 sm:py-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:py-24">
          <div className="rise max-w-xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-lime">Football tournament platform</p>
            <h1 className="mt-4 text-4xl font-semibold leading-[0.95] text-ink sm:text-6xl">
              Create your
              <span className="block text-lime">own tournament.</span>
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-text-muted">
              Build teams, groups, stages, fixtures, results and standings.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={createHref} className={btnPrimary}>
                Create tournament
              </Link>
              <Link href="/lookup" className={btnSecondary}>
                Find tournament
              </Link>
            </div>
          </div>
          <Football3D className="rise mx-auto h-72 w-full max-w-md sm:h-96" />
        </div>
        <section className={`${card} relative mx-auto mb-16 w-full max-w-6xl space-y-4 p-5`}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-lime">Find a tournament</p>
          <h2 className="text-lg font-semibold text-ink">Search by name or Tournament ID</h2>
          <TournamentSearchForm query="" />
        </section>
      </main>
    </div>
  )
}
