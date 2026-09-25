import { btnPrimary, field, label } from "@/src/components/maker/styles"

export function TournamentSearchForm({ query }: { query: string }) {
  return (
    <form action="/lookup" className="space-y-3">
      <label className={label}>
        Search by tournament name or Tournament ID
        <input
          name="q"
          defaultValue={query}
          placeholder="Enter tournament name or ID..."
          className={`${field} py-3 text-base`}
        />
      </label>
      <button type="submit" className={btnPrimary}>
        Search
      </button>
    </form>
  )
}
