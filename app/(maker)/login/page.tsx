import { AuthForm } from "@/src/components/maker/AuthForm"
import { PitchPhoto } from "@/src/components/maker/PitchPhoto"
import { PageFrame } from "@/src/components/maker/PageFrame"
import { card } from "@/src/components/maker/styles"

export default function LoginPage() {
  return (
    <PageFrame>
      <section className="mx-auto grid max-w-3xl overflow-hidden rounded-xl border border-line bg-surface md:grid-cols-2">
        <div className="relative min-h-40 md:min-h-full">
          <PitchPhoto name="corner" sizes="(min-width: 768px) 24rem, 100vw" />
        </div>
        <div className={`${card} space-y-6 border-0 p-6`}>
          <h1 className="text-2xl font-semibold text-ink">Sign in</h1>
          <AuthForm mode="sign-in" />
        </div>
      </section>
    </PageFrame>
  )
}
