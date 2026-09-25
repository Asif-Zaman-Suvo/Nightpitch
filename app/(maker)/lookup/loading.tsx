import { PageFrame } from "@/src/components/maker/PageFrame"

export default function LookupLoading() {
  return (
    <PageFrame>
      <p className="py-8 text-sm text-text-muted" role="status">
        Searching tournaments…
      </p>
    </PageFrame>
  )
}
