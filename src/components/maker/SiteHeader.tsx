import Link from "next/link"
import { signOutAction } from "@/src/server/auth/actions"
import { getCurrentUser } from "@/src/server/auth/session"

export async function SiteHeader() {
  const user = await getCurrentUser().catch(() => null)

  return (
    <header className="border-b border-white/10 bg-navy text-white">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="inline-flex min-w-0 items-center gap-2 font-semibold tracking-tight">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-lime/50 bg-navy text-[10px] font-bold text-lime" aria-hidden="true">
            NP
          </span>
          <span className="truncate">Nightpitch</span>
        </Link>
        <nav className="flex flex-wrap items-center gap-1 text-sm" aria-label="Site">
          <Link href="/lookup" className="rounded-md px-2.5 py-1.5 text-white/75 hover:bg-white/10 hover:text-white">
            Find tournament
          </Link>
          {user ? (
            <>
              <Link href="/dashboard" className="rounded-md px-2.5 py-1.5 text-white/75 hover:bg-white/10 hover:text-white">
                Dashboard
              </Link>
              <form action={signOutAction}>
                <button type="submit" className="rounded-md px-2.5 py-1.5 text-white/75 hover:bg-white/10 hover:text-white">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <Link href="/login" className="rounded-md bg-lime px-3 py-1.5 font-semibold text-navy hover:bg-lime-dark">
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  )
}
