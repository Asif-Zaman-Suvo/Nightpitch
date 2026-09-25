# Database setup

The maker stores data in the `app` schema. The browser uses the Supabase anon key only for authentication. Server code uses `DATABASE_URL`.

1. Create a Supabase project.
2. In `.env.local`, set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `DATABASE_URL`.
3. Use the transaction pooler URI (port `6543`) for `DATABASE_URL`.
4. Run `npm run db:migrate`.

Migrations live in `supabase/migrations/` and are applied in filename order. A second run skips files already listed in `app.schema_migrations`.

`app.profiles` is filled by `app.handle_new_user` when someone signs up. Do not expose the `app` schema through the Data API.
