import "server-only"
import postgres from "postgres"

const globalForDb = globalThis as unknown as { sql?: postgres.Sql }

export function getSql(): postgres.Sql {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error("DATABASE_URL is not set. The app schema is not reachable through the anon key.")
  }
  if (!globalForDb.sql) {
    globalForDb.sql = postgres(url, { prepare: false, max: 5 })
  }
  return globalForDb.sql
}

export type Sql = postgres.Sql
