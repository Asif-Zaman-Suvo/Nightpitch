import { AuthForm } from "@/src/components/maker/AuthForm"
import { PitchPhoto } from "@/src/components/maker/PitchPhoto"
import { PageFrame } from "@/src/components/maker/PageFrame"
import { card } from "@/src/components/maker/styles"

export default function SignupPage() {
  return (
    <PageFrame>
      <section className="mx-auto grid max-w-3xl overflow-hidden rounded-xl border border-line bg-surface md:grid-cols-2">
        <div className="relative min-h-40 md:min-h-full">
          <PitchPhoto name="night" sizes="(min-width: 768px) 24rem, 100vw" className="object-cover object-center" />
        </div>
        <div className={`${card} space-y-6 border-0 p-6`}>
          <h1 className="text-2xl font-semibold text-ink">Create an account</h1>
          <AuthForm mode="sign-up" />
        </div>
      </section>
    </PageFrame>
  )
}
