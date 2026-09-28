# Nightpitch UI redesign

## Visual system

The tournament product keeps its Nightpitch identity and uses an emerald brand (#087f5b), deep pine identity panels (#112c24), warm light canvas (#f3f5f2), white surfaces, and slate-green text (#182b25). Blue (#236b86) supports informational controls; green, amber, red, and restrained gold communicate results, pending states, errors, and champions.

Global semantic variables live in `app/globals.css`. Existing Tailwind color aliases remain compatible with the application. Shared control classes live in `src/components/maker/styles.ts`. Geist typography, tabular scores, compact metadata, restrained borders, and consistent 44px form controls unify the experience.

## Experience changes

- Desktop management workspace with active navigation, counts, tournament identity, sharing, and public-page access. Mobile uses a horizontally scrollable section navigation.
- Overview includes existing setup guidance, real statistics, completion progress, stage progression, upcoming fixtures, recorded results, and configured table leaders.
- Dashboard separates tournament management from creation. Creation and settings group identity and visibility fields; publishing and destructive controls have their own sections.
- Team identities and forms use the shared system. Groups explain assigned/unassigned counts and balanced or uneven sizes. Stage settings use disclosure to reduce configuration density, retaining all controls and qualification previews.
- Match cards distinguish upcoming, completed, cancelled, and winning sides. Forms use local pending controls. Brackets retain readable card widths and emphasize the final.
- Standings show leaders after play begins and use the existing qualification preview for group qualification marks. No ranking or qualification rule is reimplemented.
- Public match center has section navigation, fixtures/results before stage configuration, standings, teams, brackets, and champion presentation with actual final scores.
- Homepage, lookup, authentication, team profile, loading, and error views share the visual system.

## Shared components

Added `PendingSubmit`, `ProgressMeter`, and `LoadingState`. Refactored `ManageShell`, `SiteHeader`, `PageFrame`, visual primitives, match cards, champion banner, standings, bracket, tournament forms, and existing management controls. Added a route error boundary using this Next.js version's `unstable_retry` API.

## Motion and accessibility

CSS-only 180–240ms feedback and entrances; no animation dependencies. Reduced motion disables animations and transitions. Added skip navigation, restored browser zoom, retained labeled native dialogs, improved alert announcements, and made wide standings/bracket regions keyboard focusable. Status and qualification use text/symbols in addition to color.

## Verification

- Existing suite: 259 tests passed across 20 files.
- TypeScript and production build passed.
- ESLint passes for application and UI components. Repository-wide lint has four existing `no-require-imports` errors in `public/icons/create-icons.js` and `public/icons/generate-icons.js`.
- Chromium: homepage, login, signup, lookup, and an existing public tournament checked at 320, 375, 390, 430, 768, 1024, 1280, and 1440px. No page overflow after fixing the 320px match grid. Tables and navigation retain intentional internal scrolling.
- Management shell, team/group/stage forms, result/scheduling controls, and standings checked at those widths using isolated server-rendered layout fixtures outside the application. These are layout checks, not authenticated integration tests.
- Reduced-motion check returned zero transition duration. No browser runtime errors on the checked public/auth routes.

## Preservation review and limits

No changes to `src/server`, `src/domain`, `supabase`, authentication middleware, dependency manifests, or lockfiles. No database writes were performed during verification. No commits were created.

| Functionality | Evidence / limitation |
| --- | --- |
| Authentication | Existing actions and fields retained; login/signup render checked. Live sign-in/sign-up not exercised. |
| Tournament creation/settings | Existing actions and payload names retained; lifecycle and access tests pass. Authenticated persistence not exercised. |
| Team CRUD/groups | Existing actions, constraints, identifiers, and move controls retained; domain tests pass; shared forms checked for layout. |
| Stage CRUD/order/participants | Existing actions and controls retained; stage and entry tests pass. |
| Standings/head-to-head | Existing domain calculation retained; standings and qualification tests pass. |
| Fixtures/scheduling/results/cancel/restore | Existing actions and form payloads retained; match/fixture tests pass; form layout verified. |
| Bracket/winner propagation | Existing projection and domain plans retained; bracket tests pass. Live result propagation not exercised. |
| Qualification preview/application | Existing preview builder and apply action retained; domain, action, and repository tests pass. |
| Champion/completed protection | Existing champion resolver and mutation gates unchanged; champion tests pass. |
| Public access/visibility | Existing visibility gate retained; public route checked against real data; access/search/lifecycle tests pass. |
| Audit logging | Existing repository writes and action calls unchanged; existing server tests pass. No live audit write exercised. |

Authenticated end-to-end mutation testing remains necessary before release. Existing actions that redirect continue to communicate success through refreshed data; a universal success-toast system was not introduced. External team-logo load failures still rely on the browser image fallback. These limitations should not be mistaken for verified end-to-end coverage.
