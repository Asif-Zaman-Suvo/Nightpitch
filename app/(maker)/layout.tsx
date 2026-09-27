import { SiteHeader } from "@/src/components/maker/SiteHeader"

export const metadata = {
  title: "Nightpitch",
  description: "Create a tournament and share it with a Tournament ID.",
}

export default function MakerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>
    </div>
  )
}
