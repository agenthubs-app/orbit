# iOrbit Product Surface Manifest

- Schema: 2
- Indexed commit: `c599360f0e3a3763ade1a94cb08c878816e5fff3`
- Deterministic generated timestamp (commit time): 2026-07-27T18:40:54+09:00
- Scope: All production Next.js page routes; API and /dev routes excluded
- Evidence level: Static source inventory. Runtime, API, database, permission, desktop, and mobile fields remain explicitly unverified until browser evidence is recorded.
- Routes: 38
- Actions/interactions: 1447
- Authenticated routes: 22
- Public-at-proxy routes: 16

## Route inventory

| Route | Purpose | Access | Data sources | Actions | Tests | Static risks |
| --- | --- | --- | --- | ---: | ---: | ---: |
| `/app/account/forgot-password` | Password recovery | public-auth-entry | Live, Mock, User Confirmed | 13 | 1 | 0 |
| `/app/account/login` | User sign in | public-auth-entry | Live, Mock, User Confirmed | 13 | 16 | 0 |
| `/app/account/mobile-google` | Mobile Google authentication completion | public-auth-entry | Live, Mock, User Confirmed | 2 | 2 | 0 |
| `/app/account/signup` | User account creation | public-auth-entry | Live, Mock, User Confirmed | 13 | 10 | 0 |
| `/app/admin/access` | Admin access entry | public-at-proxy | Live, Mock, Fixture, Derived, User Confirmed | 5 | 27 | 0 |
| `/app/admin/events` | Admin event operations | public-at-proxy | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 8 | 30 | 0 |
| `/app/admin` | Admin operations | public-at-proxy | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 8 | 30 | 0 |
| `/app/agent` | Relationship operations Agent | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 76 | 30 | 0 |
| `/app/chat` | Relationship inbox and conversations | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 42 | 30 | 0 |
| `/app/contacts/[id]` | Contact identity and relationship detail | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 75 | 30 | 0 |
| `/app/contacts/all-actions` | Cross-contact action ledger | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 50 | 10 | 0 |
| `/app/contacts/dashboard` | Relationship analytics dashboard | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed | 75 | 24 | 0 |
| `/app/contacts/graph` | Relationship graph | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 68 | 30 | 0 |
| `/app/contacts/intros` | Introduction workflow | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 68 | 4 | 0 |
| `/app/contacts/new` | Contact acquisition | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 54 | 3 | 0 |
| `/app/contacts` | Contact list and discovery | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 68 | 30 | 0 |
| `/app/contacts/pipeline` | Relationship pipeline | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 69 | 8 | 0 |
| `/app/dashboard` | Relationship dashboard | authenticated | Live | 0 | 24 | 0 |
| `/app/events/[id]` | Event detail and event operations | public-at-proxy | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 68 | 30 | 0 |
| `/app/events/[id]/register` | Event registration | public-at-proxy | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 17 | 30 | 0 |
| `/app/events` | Event discovery | public-at-proxy | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 34 | 30 | 0 |
| `/app/followups` | Follow-up workspace | authenticated | Unclassified | 0 | 30 | 0 |
| `/app/home/events` | Event discovery | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 54 | 30 | 0 |
| `/app/home` | Authenticated home | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 54 | 21 | 0 |
| `/app/login-admin` | Legacy admin sign in entry | public-at-proxy | Live, Mock, Fixture, Derived, User Confirmed | 5 | 1 | 0 |
| `/app/o/[slug]` | Organizer public profile | public-at-proxy | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 23 | 30 | 0 |
| `/app` | Public product entry | public-at-proxy | Live, Mock, Derived, User Confirmed | 40 | 30 | 0 |
| `/app/party/checkin` | Party attendee check-in | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 60 | 4 | 0 |
| `/app/party/graph` | Party relationship graph | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 60 | 30 | 0 |
| `/app/party` | Live event party workspace | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 60 | 8 | 0 |
| `/app/platform` | Platform entry | public-at-proxy | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 9 | 7 | 0 |
| `/app/profile` | User profile | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed | 49 | 30 | 0 |
| `/app/register` | Legacy registration entry | public-at-proxy | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 3 | 30 | 0 |
| `/app/schedule/events/[id]` | Event detail and event operations | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 38 | 30 | 0 |
| `/app/schedule` | Calendar and schedule | authenticated | Unclassified | 0 | 30 | 0 |
| `/app/settings` | User, Agent, memory, automation, and appearance settings | authenticated | Live, Mock, Fixture, AI Generated, User Confirmed | 62 | 16 | 0 |
| `/app/today` | Today timeline and action review | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 64 | 25 | 0 |
| `/` | Public landing and Agent entry | public-at-proxy | Live, Mock, Derived, User Confirmed | 40 | 2 | 0 |

## Verification semantics

This document is generated from the route tree, transitive local imports, JSX interactions, auth routing source, and test source. A `present-static` result proves source evidence only. `requires-browser-verification` and `open-needs-runtime-verification` are deliberate incomplete states, not successful verification.

The JSON manifest is authoritative for per-route source files, anonymous/authenticated behavior, data provenance signals, dependencies, loading/empty/partial/error/permission signals, desktop/mobile status, actions, tests, and risks.
