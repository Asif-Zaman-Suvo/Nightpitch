import fs from "node:fs"
import postgres from "postgres"

const url = process.env.DATABASE_URL
if (!url) {
  console.error("Set DATABASE_URL to the development database, then run npm run db:migrate")
  process.exit(1)
}

const sql = postgres(url, { prepare: false })
const files = [
  "20260925170000_app_tournament_schema.sql",
  "20260925180000_app_team_logo.sql",
  "20260925190000_app_groups.sql",
  "20260925200000_app_stages.sql",
  "20260925210000_remove_legacy_world_cup.sql",
  "20260925220000_league_fixture_group.sql",
]
const alreadyApplied = files.slice(0, 4)

async function appliedNames() {
  const ready = await sql`select to_regclass('app.schema_migrations') as name`
  if (!ready[0]?.name) return new Set()
  const rows = await sql`select name from app.schema_migrations`
  return new Set(rows.map((row) => row.name))
}

async function markApplied(name) {
  await sql`
    create table if not exists app.schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )
  `
  await sql`
    insert into app.schema_migrations (name)
    values (${name})
    on conflict (name) do nothing
  `
}

const existing = await sql`select to_regclass('app.tournaments') as name`
const applied = await appliedNames()
if (existing[0]?.name && applied.size === 0) {
  for (const name of alreadyApplied) await markApplied(name)
  for (const name of alreadyApplied) applied.add(name)
}

for (const name of files) {
  if (applied.has(name)) continue
  const file = new URL(`../supabase/migrations/${name}`, import.meta.url)
  await sql.unsafe(fs.readFileSync(file, "utf8"))
  await markApplied(name)
  console.log("Applied", name)
}

await sql.end()
console.log("Schema app is current")
