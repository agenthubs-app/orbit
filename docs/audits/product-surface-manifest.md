# iOrbit Product Surface Manifest

- Schema: 1
- Indexed commit: `1680e864849331872e787c094306abb46cdf9ffa`
- Deterministic generated timestamp (commit time): 2026-07-27T12:46:45+09:00
- Scope: All production Next.js page routes; API and /dev routes excluded
- Evidence level: Static source inventory. Runtime, API, database, permission, desktop, and mobile fields remain explicitly unverified until browser evidence is recorded.
- Routes: 38
- Actions/interactions: 1812
- Authenticated routes: 22
- Public-at-proxy routes: 16

## Route inventory

| Route | Purpose | Access | Data sources | Actions | Tests | Static risks |
| --- | --- | --- | --- | ---: | ---: | ---: |
| `/app/account/forgot-password` | Password recovery | public-auth-entry | Live, Mock, User Confirmed | 14 | 1 | 5 |
| `/app/account/login` | User sign in | public-auth-entry | Live, Mock, User Confirmed | 14 | 6 | 5 |
| `/app/account/mobile-google` | Mobile Google authentication completion | public-auth-entry | Live, Mock, User Confirmed | 2 | 2 | 0 |
| `/app/account/signup` | User account creation | public-auth-entry | Live, Mock, User Confirmed | 14 | 10 | 5 |
| `/app/admin/access` | Admin access entry | public-at-proxy | Live, Mock, Fixture, Derived, AI Generated, User Confirmed | 50 | 14 | 26 |
| `/app/admin/events` | Admin event operations | public-at-proxy | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 54 | 30 | 36 |
| `/app/admin` | Admin operations | public-at-proxy | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 54 | 30 | 36 |
| `/app/agent` | Relationship operations Agent | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 79 | 30 | 55 |
| `/app/chat` | Relationship inbox and conversations | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 79 | 30 | 55 |
| `/app/contacts/[id]` | Contact identity and relationship detail | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 92 | 30 | 44 |
| `/app/contacts/all-actions` | Cross-contact action ledger | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 52 | 10 | 21 |
| `/app/contacts/dashboard` | Relationship analytics dashboard | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed | 86 | 24 | 41 |
| `/app/contacts/graph` | Relationship graph | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 80 | 30 | 35 |
| `/app/contacts/intros` | Introduction workflow | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 80 | 4 | 35 |
| `/app/contacts/new` | Contact acquisition | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 57 | 3 | 32 |
| `/app/contacts` | Contact list and discovery | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 80 | 30 | 35 |
| `/app/contacts/pipeline` | Relationship pipeline | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 81 | 7 | 35 |
| `/app/dashboard` | Relationship dashboard | authenticated | Live | 0 | 24 | 2 |
| `/app/events/[id]` | Event detail and event operations | public-at-proxy | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 71 | 30 | 41 |
| `/app/events/[id]/register` | Event registration | public-at-proxy | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 18 | 30 | 16 |
| `/app/events` | Event discovery | public-at-proxy | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 35 | 30 | 23 |
| `/app/followups` | Follow-up workspace | authenticated | Unclassified | 0 | 30 | 2 |
| `/app/home/events` | Event discovery | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 57 | 30 | 30 |
| `/app/home` | Authenticated home | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 57 | 23 | 30 |
| `/app/login-admin` | Legacy admin sign in entry | public-at-proxy | Live, Mock, Fixture, Derived, AI Generated, User Confirmed | 50 | 1 | 26 |
| `/app/o/[slug]` | Organizer public profile | public-at-proxy | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 24 | 30 | 17 |
| `/app` | Public product entry | public-at-proxy | Live, Mock, Derived, User Confirmed | 40 | 30 | 0 |
| `/app/party/checkin` | Party attendee check-in | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 66 | 4 | 37 |
| `/app/party/graph` | Party relationship graph | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 66 | 30 | 37 |
| `/app/party` | Live event party workspace | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 66 | 8 | 37 |
| `/app/platform` | Platform entry | public-at-proxy | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 12 | 7 | 14 |
| `/app/profile` | User profile | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed | 53 | 30 | 23 |
| `/app/register` | Legacy registration entry | public-at-proxy | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 19 | 30 | 15 |
| `/app/schedule/events/[id]` | Event detail and event operations | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 40 | 30 | 23 |
| `/app/schedule` | Calendar and schedule | authenticated | Unclassified | 0 | 30 | 2 |
| `/app/settings` | User, Agent, memory, automation, and appearance settings | authenticated | Live, Mock, Fixture, AI Generated, User Confirmed | 64 | 15 | 37 |
| `/app/today` | Today timeline and action review | authenticated | Live, Mock, Fixture, Derived, AI Generated, User Confirmed, Externally Executed | 66 | 25 | 40 |
| `/` | Public landing and Agent entry | public-at-proxy | Live, Mock, Derived, User Confirmed | 40 | 2 | 0 |

## Verification semantics

This document is generated from the route tree, transitive local imports, JSX interactions, auth routing source, and test source. A `present-static` result proves source evidence only. `requires-browser-verification` and `open-needs-runtime-verification` are deliberate incomplete states, not successful verification.

The JSON manifest is authoritative for per-route source files, anonymous/authenticated behavior, data provenance signals, dependencies, loading/empty/partial/error/permission signals, desktop/mobile status, actions, tests, and risks.
