# Nightpitch

Organizers build a football tournament: teams, groups, stages, fixtures, results, standings, and an optional knockout that ends in a champion.

This is not a World Cup predictor. Match data lives in the Postgres schema `app`. That schema is not exposed through the Supabase Data API.

## Run

```bash
npm install
cp .env.local.example .env.local
npm run db:migrate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

| Script | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run build` / `npm start` | Production build and server |
| `npm test` | Vitest |
| `npm run lint` | ESLint |
| `npm run db:migrate` | Apply `supabase/migrations` in filename order |

`db:migrate` records applied files in `app.schema_migrations` and skips ones that already ran. Use the transaction-pooler URI (port `6543`) for `DATABASE_URL`. Do not commit `.env.local`.

## Authentication

Sign-up and sign-in use Supabase Auth (`getClaims()`). The trigger `app.handle_new_user` inserts `app.profiles`.

The anon key is used for auth only. Server queries use `DATABASE_URL` as `app_writer` (`NOLOGIN`, `BYPASSRLS`). Row-level security is enabled on `app` tables and there are no client policies.

## Access

| Who | What they can do |
| --- | --- |
| Owner | Create and edit their tournament, including after it is published |
| Anyone | Open a **published** or **completed** tournament that is **public** or **unlisted** |
| Search | Find **public** published or completed tournaments by name, or open one by ID (`TMT-XXXX-XXXX`) |

`private` tournaments are owner-only. Draft tournaments are owner-only. A completed tournament stays readable; score, roster, and configuration changes are rejected. Deleting a draft removes it. Deleting any other status marks it deleted.

There is no invitation or membership system. `admin`, `participant`, and `viewer` exist in the access types and are not assigned.

## Workflow

1. Create a tournament. It receives an 8-character public ID, shown as `TMT-XXXX-XXXX`.
2. Add teams. A logo is an `http` or `https` URL.
3. Create groups and assign teams. A team is in at most one group. Group sizes do not have to match.
4. Add a `group`, `league`, or `knockout` stage.
5. Attach groups to a group or league stage, then add those teams as **stage participants**. The match form lists stage participants, not the team list. A team must already belong to a group that is attached to that stage.
6. Generate the missing round-robin fixtures, or create a match by hand. Enter a score, reschedule, cancel, restore, or delete a match that is not completed.
7. Read standings. They are calculated from completed matches and are not stored.
8. On a later knockout stage, save `group_top_n` rules, preview who qualifies, then **Apply Qualification**. That writes knockout participants. It does not do it when the rules are saved.
9. Generate a knockout bracket from the participant order (2, 4, 8, 16, … teams). Completing a match places the winner in the next round. A draw is rejected.
10. Completing the final sets the tournament to `completed`. The champion is derived from that match and shown on the public page and the management overview.

## What is implemented

- Tournaments: draft, published, completed, archived; visibility public, unlisted, private; audit log for changes.
- Teams, groups, stages, stage participants, and participant order.
- Idempotent round-robin generation for group and league stages. League matches may have no stage group. Group matches stay inside their group.
- Manual matches: scheduling, results, cancellation, restoration, duplicate pairing checks, and same-team kickoff checks.
- Standings for group and league stages. Scoring (`win` / `draw` / `loss` points) and tie-break order are configurable. Tie-breakers: points, head-to-head, goal difference, goals scored, team name. Head-to-head is optional and is not added to existing stages. It only reorders teams still tied on the criteria before it, including a reduced table when three or more teams are tied. Knockout stages have no standings table.
- Qualification: `group_top_n` rules, preview, and apply into `stage_entries` (`source_kind = group_rank`). Apply is idempotent. It will not replace a manually added participant, or a participant already used by a match.
- Knockout brackets, winner progression, final completion, and public champion display.
- Public tournament page and owner management for teams, groups, stages, matches, standings, and settings.

## Not implemented

- Completing a tournament that has no knockout final
- Best third-place, wildcards, manual qualification override, qualification locking
- Extra time, penalties, aggregate ties, byes, third-place match
- Reopening a completed tournament
- Invitations, shared admins, notifications, medals, and a tournament history page

`stage_entries` still allows `pooled_rank` and `confirmed_via = override`. Nothing in the app writes those.
