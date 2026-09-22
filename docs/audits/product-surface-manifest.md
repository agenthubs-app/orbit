# iOrbit Product Surface Manifest

- Schema: 2
- Indexed commit: `3e7fb7263a4a79dbc982cd4d13a47a37f654f2f5`
- Deterministic generated timestamp (commit time): 2026-09-23T02:56:38+08:00
- Scope: All production Next.js page routes; API and /dev routes excluded
- Evidence level: Static source inventory. Runtime, API, database, permission, desktop, and mobile fields remain explicitly unverified until browser evidence is recorded.
- Routes: 45
- Actions/interactions: 2614
- Authenticated routes: 19
- Public-at-proxy routes: 26

## Route inventory

| Route | Purpose | Access | Data sources | Actions | Tests | Static risks |
| --- | --- | --- | --- | ---: | ---: | ---: |
| `/app/account/forgot-password` | Password recovery | public-auth-entry | Live, Mock, Fixture, Derived, User Confirmed | 49 | 7 | 3 |
| `/app/account/login` | User sign in | public-auth-entry | Live, Mock, Fixture, Derived, User Confirmed | 49 | 30 | 3 |
| `/app/account/mobile-google` | Mobile Google authentication completion | public-auth-entry | Live, Mock, Fixture, Derived, User Confirmed | 2 | 3 | 0 |
| `/app/account/reset-password` | Production application surface; purpose requires product review | public-auth-entry | Live, Derived, User Confirmed | 46 | 5 | 3 |
| `/app/account/signup` | User account creation | public-auth-entry | Live, Mock, Fixture, Derived, User Confirmed | 49 | 30 | 3 |
| `/app/admin/access` | Admin access entry | authenticated | Live, Derived | 2 | 30 | 0 |
| `/app/admin/events` | Admin event operations | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 7 | 30 | 0 |
| `/app/admin` | Admin operations | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 7 | 30 | 0 |
| `/app/agent/actions` | Production application surface; purpose requires product review | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 67 | 30 | 0 |
| `/app/agent` | Relationship operations Agent | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 151 | 30 | 11 |
| `/app/agent/plan` | Production application surface; purpose requires product review | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 64 | 30 | 0 |
| `/app/agent/strategy` | Production application surface; purpose requires product review | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 72 | 10 | 0 |
| `/app/contacts/[id]` | Contact identity and relationship detail | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 91 | 30 | 0 |
| `/app/contacts/analysis/[dimension]/[bucketId]` | Production application surface; purpose requires product review | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed | 63 | 3 | 0 |
| `/app/contacts/dashboard` | Relationship analytics dashboard | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 88 | 30 | 0 |
| `/app/contacts/new` | Contact acquisition | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed | 113 | 11 | 0 |
| `/app/contacts` | Contact list and discovery | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 81 | 30 | 0 |
| `/app/contacts/pipeline` | Relationship pipeline | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 68 | 30 | 0 |
| `/app/events/[id]/analytics` | Production application surface; purpose requires product review | public-at-proxy | Live, Mock, Fixture, Derived, AI Generated, User Confirmed | 68 | 19 | 0 |
| `/app/events/[id]/live` | Production application surface; purpose requires product review | public-at-proxy | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 124 | 30 | 2 |
| `/app/events/[id]/operations/admission` | Production application surface; purpose requires product review | public-at-proxy | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 85 | 30 | 0 |
| `/app/events/[id]/operations/check-in` | Production application surface; purpose requires product review | public-at-proxy | Live, Mock, Fixture, Derived, AI Generated, User Confirmed | 73 | 27 | 0 |
| `/app/events/[id]/operations/experience` | Production application surface; purpose requires product review | public-at-proxy | Live, Mock, Fixture, Derived, AI Generated, User Confirmed | 76 | 30 | 0 |
| `/app/events/[id]/operations` | Production application surface; purpose requires product review | public-at-proxy | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 104 | 30 | 0 |
| `/app/events/[id]` | Event detail and event operations | public-at-proxy | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 144 | 30 | 1 |
| `/app/events/[id]/register` | Event registration | public-at-proxy | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 51 | 30 | 0 |
| `/app/events/center` | Production application surface; purpose requires product review | public-at-proxy | Live, Mock, Fixture, Derived, AI Generated, User Confirmed | 69 | 20 | 0 |
| `/app/events` | Event discovery | public-at-proxy | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 68 | 30 | 0 |
| `/app/home/events` | Event discovery | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 80 | 30 | 0 |
| `/app/home` | Authenticated home | authenticated | Unclassified | 0 | 30 | 0 |
| `/app/inbox/sources/[id]` | Production application surface; purpose requires product review | public-at-proxy | Live, Mock, Fixture, Derived, AI Generated, User Confirmed | 8 | 30 | 0 |
| `/app/invitations/[token]` | Production application surface; purpose requires product review | public-at-proxy | Live, Mock, Fixture, Derived, User Confirmed | 24 | 3 | 0 |
| `/app/login-admin` | Legacy admin sign in entry | public-at-proxy | Live, Derived | 2 | 4 | 0 |
| `/app/o/[slug]` | Organizer public profile | public-at-proxy | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 27 | 30 | 0 |
| `/app` | Public product entry | public-at-proxy | Live, Mock, Fixture, Derived, User Confirmed | 28 | 30 | 0 |
| `/app/platform` | Platform entry | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 3 | 24 | 0 |
| `/app/profile/continue` | Production application surface; purpose requires product review | authenticated | Live, Mock, Fixture, Derived, User Confirmed | 0 | 30 | 0 |
| `/app/profile` | User profile | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed | 108 | 30 | 1 |
| `/app/register` | Legacy registration entry | public-at-proxy | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 3 | 30 | 0 |
| `/app/settings` | User, Agent, memory, automation, and appearance settings | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed | 108 | 27 | 1 |
| `/app/tasks/[id]` | Production application surface; purpose requires product review | public-at-proxy | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 84 | 30 | 0 |
| `/app/tasks` | Production application surface; purpose requires product review | public-at-proxy | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 84 | 30 | 0 |
| `/app/tasks/personal` | Production application surface; purpose requires product review | public-at-proxy | Live, Mock, Fixture, Derived, AI Generated, User Confirmed | 91 | 30 | 0 |
| `/app/tasks/relationship/[id]` | Production application surface; purpose requires product review | public-at-proxy | Unclassified | 5 | 30 | 0 |
| `/` | Public landing and Agent entry | public-at-proxy | Live, Mock, Fixture, Derived, User Confirmed | 28 | 2 | 0 |

## Verification semantics

This document is generated from the route tree, transitive local imports, JSX interactions, auth routing source, and test source. A `present-static` result proves source evidence only. `requires-browser-verification` and `open-needs-runtime-verification` are deliberate incomplete states, not successful verification.

The JSON manifest is authoritative for per-route source files, anonymous/authenticated behavior, data provenance signals, dependencies, loading/empty/partial/error/permission signals, desktop/mobile status, actions, tests, and risks.
