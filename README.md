# Custom Tournament Maker

Create a tournament, add teams and groups, define stages, and enter matches.

## Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). `/` goes to the dashboard. Sign in is required to manage a tournament.

## Supabase

Copy `.env.local.example` to `.env.local`.

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are the project API settings. They are used for sign-in only.
- `DATABASE_URL` is the transaction-pooler Postgres URI (port 6543). The app schema is not exposed through the anon key.

Apply the schema:

```bash
npm run db:migrate
```

The script records applied files in `app.schema_migrations` and skips ones that already ran.

## Authentication

Sign up and sign in use Supabase Auth. A database trigger, `app.handle_new_user`, inserts `app.profiles`. Creating a tournament also inserts a profile if that row is missing.

## Workflow

1. Create a tournament. It gets a public ID such as `TMT-XXXX-XXXX`.
2. Add teams.
3. Create groups and assign teams. Group sizes do not have to match.
4. Add stages (`group`, `league`, or `knockout`) and attach existing groups to a group or league stage.
5. Add stage participants.
6. Create matches by hand, then enter a score, cancel, restore, or delete a match that has no completed result.

Anyone with the ID can open a public or unlisted tournament at `/lookup`.

## Implemented

Tournaments, teams, groups, stages, stage participants, matches, and standings. Standings are calculated from completed results. Audit rows are written for tournament changes.

## Not implemented

Qualification, stage progression, bracket generation, automatic fixtures, invitations, and membership.
