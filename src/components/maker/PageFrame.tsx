export function PageFrame({
  children,
  width = "narrow",
}: {
  children: React.ReactNode
  width?: "narrow" | "wide"
}) {
  const max = width === "wide" ? "max-w-5xl" : "max-w-3xl"
  return <div className={`mx-auto w-full ${max} px-4 py-8 sm:py-10`}>{children}</div>
}
