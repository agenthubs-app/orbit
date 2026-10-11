# iOrbit Product Surface Manifest

- Schema: 2
- Indexed commit: `a91fecae3303d716d4b40464b1f171f3192364c0`
- Deterministic generated timestamp (commit time): 2026-10-11T09:36:36+09:00
- Scope: All production Next.js page routes; API, /dev and /showcase routes excluded
- Evidence level: Static source inventory. Runtime, API, database, permission, desktop, and mobile fields remain explicitly unverified until browser evidence is recorded.
- Routes: 53
- Actions/interactions: 1810
- Authenticated routes: 31
- Public-at-proxy routes: 22
- Ungated routes (no prefix-list entry and no page-level auth gate): 3

## Route inventory

| Route | Purpose | Access | Data sources | Actions | Tests | Static risks |
| --- | --- | --- | --- | ---: | ---: | ---: |
| `/app/account/forgot-password` | Password recovery | public-auth-entry | Live, Mock, Fixture, Derived, User Confirmed | 49 | 7 | 1 |
| `/app/account/login` | User sign in | public-auth-entry | Live, Mock, Fixture, Derived, User Confirmed | 49 | 30 | 1 |
| `/app/account/mobile-google` | Mobile Google authentication completion | public-auth-entry | Live, Mock, Fixture, Derived, User Confirmed | 2 | 3 | 0 |
| `/app/account/reset-password` | Production application surface; purpose requires product review | public-auth-entry | Live, Derived, User Confirmed | 46 | 5 | 1 |
| `/app/account/signup` | User account creation | public-auth-entry | Live, Mock, Fixture, Derived, User Confirmed | 49 | 30 | 1 |
| `/app/admin/access` | Admin access entry | authenticated | Live, Derived | 2 | 30 | 0 |
| `/app/admin/events` | Admin event operations | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 7 | 30 | 0 |
| `/app/admin` | Admin operations | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 7 | 30 | 0 |
| `/app/admin/read-cost` | Production application surface; purpose requires product review | authenticated | Live, Mock, Derived, User Confirmed | 2 | 19 | 0 |
| `/app/agent/actions` | Production application surface; purpose requires product review | authenticated | Live, Mock, Fixture, Derived, User Confirmed, Externally Executed | 11 | 30 | 0 |
| `/app/agent` | Relationship operations Agent | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 165 | 30 | 0 |
| `/app/contacts/[id]` | Contact identity and relationship detail | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 78 | 30 | 0 |
| `/app/contacts/analysis/[dimension]/[bucketId]` | Production application surface; purpose requires product review | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 11 | 4 | 0 |
| `/app/contacts/dashboard` | Relationship analytics dashboard | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 84 | 30 | 0 |
| `/app/contacts/new` | Contact acquisition | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed | 55 | 16 | 0 |
| `/app/contacts` | Contact list and discovery | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 47 | 30 | 0 |
| `/app/contacts/pipeline` | Relationship pipeline | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 42 | 30 | 0 |
| `/app/events/[id]/analytics` | Production application surface; purpose requires product review | public-at-proxy | Live, Mock, Fixture, Derived, User Confirmed | 11 | 23 | 0 |
| `/app/events/[id]/live` | Production application surface; purpose requires product review | public-at-proxy | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 67 | 30 | 0 |
| `/app/events/[id]/operations/admission` | Production application surface; purpose requires product review | public-at-proxy | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 28 | 30 | 0 |
| `/app/events/[id]/operations/check-in` | Production application surface; purpose requires product review | public-at-proxy | Live, Mock, Fixture, Derived, User Confirmed | 16 | 30 | 0 |
| `/app/events/[id]/operations/experience` | Production application surface; purpose requires product review | public-at-proxy | Live, Mock, Fixture, Derived, User Confirmed | 19 | 30 | 0 |
| `/app/events/[id]/operations` | Production application surface; purpose requires product review | public-at-proxy | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 47 | 30 | 0 |
| `/app/events/[id]` | Event detail and event operations | public-at-proxy | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 108 | 30 | 0 |
| `/app/events/[id]/register` | Event registration | public-at-proxy | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 51 | 30 | 0 |
| `/app/events/center` | Production application surface; purpose requires product review | public-at-proxy | Live, Mock, Fixture, Derived, User Confirmed | 13 | 21 | 0 |
| `/app/events` | Event discovery | public-at-proxy | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 36 | 30 | 0 |
| `/app/home/events` | Event discovery | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 48 | 30 | 0 |
| `/app/home` | Authenticated home | authenticated | Live, Mock, Fixture, Derived, User Confirmed, Externally Executed | 2 | 30 | 0 |
| `/app/inbox` | Production application surface; purpose requires product review | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 33 | 30 | 0 |
| `/app/inbox/sources/[id]` | Production application surface; purpose requires product review | authenticated | Live, Mock, Fixture, Derived, User Confirmed | 1 | 30 | 0 |
| `/app/invitations/[token]` | Production application surface; purpose requires product review | public-at-proxy | Live, Mock, Fixture, Derived, User Confirmed | 24 | 4 | 0 |
| `/app/login-admin` | Legacy admin sign in entry | ungated | Live, Derived | 2 | 5 | 0 |
| `/app/o/[slug]` | Organizer public profile | ungated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 27 | 30 | 0 |
| `/app` | Public product entry | public-at-proxy | Live, Mock, Fixture, Derived, User Confirmed | 28 | 30 | 0 |
| `/app/plans/[planId]/done` | Production application surface; purpose requires product review | authenticated | Live, Mock, Fixture, Derived, User Confirmed | 7 | 30 | 0 |
| `/app/plans/[planId]/review` | Production application surface; purpose requires product review | authenticated | Live, Mock, Fixture, Derived, User Confirmed | 18 | 30 | 0 |
| `/app/plans/[planId]/types/[itemId]` | Production application surface; purpose requires product review | authenticated | Live, Mock, Fixture, Derived, User Confirmed | 26 | 6 | 0 |
| `/app/plans/drafts/[draftId]/edit` | Production application surface; purpose requires product review | authenticated | Live, Mock, Fixture, Derived, User Confirmed | 18 | 30 | 0 |
| `/app/plans/flow/[intakeId]` | Production application surface; purpose requires product review | authenticated | Live, Mock, Fixture, Derived, User Confirmed | 27 | 4 | 0 |
| `/app/plans/legacy/[planId]` | Production application surface; purpose requires product review | authenticated | Live, Mock, Fixture, Derived, User Confirmed | 5 | 4 | 0 |
| `/app/platform` | Platform entry | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 3 | 30 | 0 |
| `/app/profile/continue` | Production application surface; purpose requires product review | authenticated | Live, Mock, Fixture, Derived, User Confirmed | 0 | 30 | 0 |
| `/app/profile/onboarding` | Production application surface; purpose requires product review | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed | 69 | 30 | 6 |
| `/app/profile` | User profile | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed | 57 | 30 | 0 |
| `/app/register` | Legacy registration entry | ungated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 3 | 30 | 0 |
| `/app/settings` | User, Agent, memory, automation, and appearance settings | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed | 57 | 30 | 0 |
| `/app/start` | Production application surface; purpose requires product review | public-at-proxy | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 48 | 30 | 0 |
| `/app/tasks/[id]` | Production application surface; purpose requires product review | authenticated | Live, Mock, Fixture, Derived, User Confirmed, Externally Executed | 32 | 30 | 0 |
| `/app/tasks` | Production application surface; purpose requires product review | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 106 | 30 | 0 |
| `/app/tasks/personal` | Production application surface; purpose requires product review | authenticated | Live, Mock, Fixture, Derived, User Confirmed | 34 | 30 | 0 |
| `/app/tasks/relationship/[id]` | Production application surface; purpose requires product review | authenticated | Unclassified | 5 | 30 | 0 |
| `/` | Public landing and Agent entry | public-at-proxy | Live, Mock, Fixture, Derived, User Confirmed | 28 | 4 | 0 |

## Verification semantics

This document is generated from the route tree, transitive local imports, JSX interactions, auth routing source, and test source. A `present-static` result proves source evidence only. `requires-browser-verification` and `open-needs-runtime-verification` are deliberate incomplete states, not successful verification.

The JSON manifest is authoritative for per-route source files, anonymous/authenticated behavior, data provenance signals, dependencies, loading/empty/partial/error/permission signals, desktop/mobile status, actions, tests, and risks.
