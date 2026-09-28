import Link from "next/link"
import Image from "next/image"
import { signOutAction } from "@/src/server/auth/actions"
import { getCurrentUser } from "@/src/server/auth/session"

export async function SiteHeader() {
  const user = await getCurrentUser().catch(() => null)

  return (
    <header className="dark-panel sticky top-0 z-50 h-16 border-b border-white/10 text-white shadow-sm">
      <div className="mx-auto flex h-full w-full max-w-[1600px] items-center justify-between gap-2 px-3 sm:px-4">
        <Link href="/" className="inline-flex shrink-0 items-center gap-1" aria-label="Nightpitch home">
          <Image src="/brand/mark.png" alt="" width={40} height={40} className="h-10 w-10 shrink-0 object-contain" />
          <Image src="/brand/wordmark.png" alt="Nightpitch" width={140} height={33} className="h-auto w-24 object-contain min-[390px]:w-28 min-[430px]:w-32 sm:w-36" />
        </Link>
        <nav className="flex min-w-0 items-center gap-0.5 text-sm sm:gap-1" aria-label="Site">
          <Link href="/lookup" aria-label="Find tournament" className="rounded-md px-2 py-3 text-white/75 hover:bg-white/10 hover:text-white sm:px-2.5">
            <span className="sm:hidden">Find</span><span className="hidden sm:inline">Find tournament</span>
          </Link>
          {user ? (
            <>
              <Link href="/dashboard" aria-label="Dashboard" className="rounded-md px-2 py-3 text-white/75 hover:bg-white/10 hover:text-white sm:px-2.5">
                <span className="sm:hidden">My</span><span className="hidden sm:inline">Dashboard</span>
              </Link>
              <form action={signOutAction}>
                <button type="submit" aria-label="Sign out" className="rounded-md px-2 py-3 text-white/75 hover:bg-white/10 hover:text-white sm:px-2.5">
                  <span className="sm:hidden">Out</span><span className="hidden sm:inline">Sign out</span>
                </button>
              </form>
            </>
          ) : (
            <Link href="/login" className="rounded-md bg-white px-3 py-2 font-semibold text-navy hover:bg-mist">
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  )
}
