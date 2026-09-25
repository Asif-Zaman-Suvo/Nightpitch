import { AuthForm } from "@/src/components/maker/AuthForm"
import { PageFrame } from "@/src/components/maker/PageFrame"
import { card } from "@/src/components/maker/styles"

export default function LoginPage() {
  return (
    <PageFrame>
    <section className={`${card} mx-auto max-w-md space-y-6 p-6`}>
      <h1 className="text-2xl font-semibold text-ink">Sign in</h1>
      <AuthForm mode="sign-in" />
    </section>
    </PageFrame>
  )
}
