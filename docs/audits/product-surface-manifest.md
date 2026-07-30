# iOrbit Product Surface Manifest

- Schema: 2
- Indexed commit: `317dc83222edb7ff3ea68f62c7ec525d57b4c67b`
- Deterministic generated timestamp (commit time): 2026-07-30T14:44:35+09:00
- Scope: All production Next.js page routes; API and /dev routes excluded
- Evidence level: Static source inventory. Runtime, API, database, permission, desktop, and mobile fields remain explicitly unverified until browser evidence is recorded.
- Routes: 38
- Actions/interactions: 1492
- Authenticated routes: 26
- Public-at-proxy routes: 12

## Route inventory

| Route | Purpose | Access | Data sources | Actions | Tests | Static risks |
| --- | --- | --- | --- | ---: | ---: | ---: |
| `/app/account/forgot-password` | Password recovery | public-auth-entry | Live, Mock, Fixture, Derived, User Confirmed | 13 | 2 | 0 |
| `/app/account/login` | User sign in | public-auth-entry | Live, Mock, Fixture, Derived, User Confirmed | 13 | 25 | 0 |
| `/app/account/mobile-google` | Mobile Google authentication completion | public-auth-entry | Live, Mock, Fixture, Derived, User Confirmed | 2 | 3 | 0 |
| `/app/account/signup` | User account creation | public-auth-entry | Live, Mock, Fixture, Derived, User Confirmed | 13 | 14 | 0 |
| `/app/admin/access` | Admin access entry | authenticated | Live, Derived | 2 | 30 | 0 |
| `/app/admin/events` | Admin event operations | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 7 | 30 | 0 |
| `/app/admin` | Admin operations | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 7 | 30 | 0 |
| `/app/agent` | Relationship operations Agent | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 84 | 30 | 0 |
| `/app/chat` | Relationship inbox and conversations | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 45 | 30 | 0 |
| `/app/contacts/[id]` | Contact identity and relationship detail | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 80 | 30 | 0 |
| `/app/contacts/all-actions` | Cross-contact action ledger | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 51 | 11 | 0 |
| `/app/contacts/dashboard` | Relationship analytics dashboard | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 46 | 28 | 0 |
| `/app/contacts/graph` | Relationship graph | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 73 | 30 | 0 |
| `/app/contacts/intros` | Introduction workflow | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 73 | 5 | 0 |
| `/app/contacts/new` | Contact acquisition | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed | 52 | 5 | 0 |
| `/app/contacts` | Contact list and discovery | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 73 | 30 | 0 |
| `/app/contacts/pipeline` | Relationship pipeline | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 74 | 10 | 0 |
| `/app/dashboard` | Relationship dashboard | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed | 41 | 28 | 0 |
| `/app/events/[id]` | Event detail and event operations | public-at-proxy | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 67 | 30 | 0 |
| `/app/events/[id]/register` | Event registration | public-at-proxy | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 22 | 30 | 0 |
| `/app/events` | Event discovery | public-at-proxy | Live, Mock, Fixture, Derived, User Confirmed | 32 | 30 | 0 |
| `/app/followups` | Follow-up workspace | authenticated | Unclassified | 0 | 30 | 0 |
| `/app/home/events` | Event discovery | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 55 | 30 | 0 |
| `/app/home` | Authenticated home | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 55 | 26 | 0 |
| `/app/login-admin` | Legacy admin sign in entry | public-at-proxy | Live, Derived | 2 | 2 | 0 |
| `/app/o/[slug]` | Organizer public profile | public-at-proxy | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 23 | 30 | 0 |
| `/app` | Public product entry | public-at-proxy | Live, Mock, Fixture, Derived, User Confirmed | 40 | 30 | 0 |
| `/app/party/checkin` | Party attendee check-in | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 61 | 5 | 0 |
| `/app/party/graph` | Party relationship graph | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 61 | 30 | 0 |
| `/app/party` | Live event party workspace | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 61 | 10 | 0 |
| `/app/platform` | Platform entry | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 3 | 8 | 0 |
| `/app/profile` | User profile | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed | 53 | 30 | 0 |
| `/app/register` | Legacy registration entry | public-at-proxy | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 3 | 30 | 0 |
| `/app/schedule/events/[id]` | Event detail and event operations | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 39 | 30 | 0 |
| `/app/schedule` | Calendar and schedule | authenticated | Unclassified | 0 | 30 | 0 |
| `/app/settings` | User, Agent, memory, automation, and appearance settings | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed | 63 | 18 | 0 |
| `/app/today` | Today timeline and action review | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 63 | 27 | 0 |
| `/` | Public landing and Agent entry | public-at-proxy | Live, Mock, Fixture, Derived, User Confirmed | 40 | 2 | 0 |

## Verification semantics

This document is generated from the route tree, transitive local imports, JSX interactions, auth routing source, and test source. A `present-static` result proves source evidence only. `requires-browser-verification` and `open-needs-runtime-verification` are deliberate incomplete states, not successful verification.

The JSON manifest is authoritative for per-route source files, anonymous/authenticated behavior, data provenance signals, dependencies, loading/empty/partial/error/permission signals, desktop/mobile status, actions, tests, and risks.
