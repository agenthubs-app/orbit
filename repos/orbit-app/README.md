# Orbit App

Orbit App is the iOS-first mobile client for Orbit. It is an independent Expo
app that talks to the existing `repos/orbits` HTTP API.

## Run Locally

Start the web/API server:

```bash
cd ../orbits
ORBIT_MODULE_MODE=live npm run dev
```

Start the iOS app:

```bash
cd ../orbit-app
EXPO_PUBLIC_ORBIT_API_BASE_URL=http://localhost:3000 npm run ios
```

For a physical iPhone, use the Mac LAN address instead of `localhost`.

The local default is `http://localhost:3000`, which works for the iOS
simulator. Set `EXPO_PUBLIC_ORBIT_API_BASE_URL` whenever the app should point
at a different Orbit server.

## Scripts

- `npm run ios`: start Expo and open iOS simulator.
- `npm run start`: start Expo without choosing a target.
- `npm run typecheck`: run TypeScript.
- `npm test`: run Node tests through `tsx`.

## Boundaries

- The app consumes `/api/**` routes from `repos/orbits`.
- The app does not import Next.js pages or feature services.
- The app does not read Postgres, Supabase, `orbit_records`, or web localStorage.
- Orbit AI remains the single assistant inbox, including proactive turns.

## First Screens

- Orbit AI: reads `/api/ai/conversations`, opens conversation detail pages,
  and can continue a selected thread through `/api/ai/conversations/:id`.
- Relationship inbox: reads `/api/chat/relationship-inbox`,
  `/api/notifications`, and `/api/ai/proactive-turns`; opens relationship
  threads, shows reminders, stages review-only replies, and can create a
  reviewed draft thread from a contact.
- Relationship chat: reads `/api/chat/conversations` and
  `/api/chat/conversations/:id`, shows one-to-one relationship thread context
  and message history, can save reply drafts through
  `/api/chat/conversations/:id/messages`, and keeps outbound delivery behind
  review.
- Followups: reads `/api/tasks` and `/api/notifications`, shows due
  relationship work, source counts, trigger labels, and reminder review cards
  without generating tasks, creating reminders, or sending notifications.
- Dashboard: reads `/api/dashboard`, `/api/dashboard/summary`,
  `/api/dashboard/opportunities`, `/api/dashboard/network-gaps`, and
  `/api/dashboard/distributions`; shows relationship coverage, priority
  follow-up, network gaps, distributions, and recent activity without running
  recompute actions.
- Platform: supports `/platform`, reads `/api/events`, `/api/profile`, and
  `/api/dashboard`; shows platform stats, activities needing review, and
  organizer account status without approving, rejecting, or modifying accounts
  from mobile.
- Admin: supports `/login-admin`, `/admin`, `/admin/events`, and
  `/admin/access`; reads `/api/events`, `/api/profile`, and `/api/dashboard`
  to show an organizer admin entry, dashboard, event list, and access boundary
  without sending login email, creating sessions, writing events, running
  matching, or changing member roles from mobile.
- Home: legacy `/home` now redirects to the single Orbit AI home at `/ai`.
  `/home/events` stays available for the native personal event list and filters.
- Agent actions: reads `/api/agent/actions` and `/api/agent/settings`, shows
  suggestions that need review and the current action boundary, and can confirm
  or dismiss a suggested action through `/api/agent/actions/:id/accept` and
  `/api/agent/actions/:id/dismiss`. It can also update the Agent boundary
  through `PUT /api/agent/settings` without sending messages, scheduling, or
  running external writes from mobile.
- Account: reads `/api/account/me`, shows the current account, workspace,
  identity, and relationship goal. It also supports native
  `/account/login`, `/account/signup`, and `/account/forgot-password` entry
  screens. Email/password login now follows the web NextAuth credentials flow,
  signup calls `/api/auth/register`, and sign-out clears the saved device
  session.
- Events: reads `/api/events`, shows events as an image-first activity list,
  opens detail pages, manages event-specific registration answers, shows
  attendee/match context for selected events, can build a local activity
  persona through the web registration interview routes, can accept review-safe
  event recommendations, can import event attendees into review-only contact
  drafts, and opens a mobile party surface for the selected event.
- Register invite: supports `/register` and `/register/:code`, reads
  `/api/events/:id` plus `/api/profile`, and prepares the attendee profile
  before sending the user into event-specific questions.
- Public organizer: supports `/o/:slug`, reads `/api/events`, derives the
  organizer from reviewed event records, and shows public event navigation
  without reading attendee rosters or admin data.
- Party: reads `/api/events/:id`, `/api/events/:id/attendees`, and
  `/api/events/:id/matches`; shows a venue-ready access code, priority people,
  relationship groups, and mutual-interest matches without recording check-ins
  from mobile.
- Contacts: reads `/api/contacts`, supports search and status filters through
  query params, shows avatar-led contact cards with next action, status, and
  value context, loads Chinese relationship search suggestions from
  `/api/search/suggestions`, can submit `/api/search/relationships` and render
  source-backed relationship result cards, links to source acquisition, and lets
  contact detail update supported statuses through `PATCH /api/contacts/:id`
  and recompute its relationship value card through
  `/api/analysis/relationship-value/recompute`.
- Contacts dashboard: reads dashboard analytics routes and maps the web
  contacts dashboard into relationship asset counts, a compact relationship
  map, coverage gaps, distribution, value types, and recent activity.
- Contacts graph: reads `/api/connections` and `/api/connections/:id`, shows
  connection counts, stage distribution, evidence status, priority
  relationships, and evidence chains. It can also post reviewed manual evidence
  through `/api/connections/:id/evidence`.
- Contacts pipeline: reads `/api/contacts` and `/api/connections`, groups
  contacts into follow-up stages, opens contact detail, and can move supported
  connection stages through `/api/connections/:id/stage`.
- Introductions: reads the same contact and connection evidence to show people
  worth preparing for an introduction; saved intro records and external sends
  stay out of the mobile client.
- Schedule: reads `/api/tasks` and shows actionable follow-up context. It also
  supports `/schedule/events/:id` as a read-only activity preview backed by
  `/api/events/:id`.
- Profile: reads `/api/profile`, supports manual public-profile edits, and can
  turn accepted suggestions or extracted profile fields into pending editor
  changes before saving.

Each screen renders loading, empty, offline, failure, and success states through
the shared Orbit API envelope client.

## Navigation

Orbit AI at `/ai` is the only home. There is no bottom tab bar: every other
surface — events, contacts, schedule, relationship inbox, dashboard, followups,
relationship chat, party, agent actions, profile, and settings — opens from the
drawer behind the top-left button (or a left-edge swipe). The four highest
traffic destinations sit in a tile grid, the rest as icon rows, and the
relationship inbox keeps its unread badge through
`useRelationshipInboxBadgeCount`.

The chat home pins its composer to the bottom of the screen. The top-right
button opens conversation history (web sessions plus app conversations,
searchable, web sessions deletable), and the composer `+` menu carries card
scanning and a new chat. Manual proactive check-ins live in the relationship
inbox, which already reads `/api/ai/proactive-turns`.

Screens that render through `AppScreen` get a back control automatically; when a
screen is opened without history it returns to Orbit AI instead.

`app/(app)/` is a plain stack group, so its routes keep their public paths
(`/ai`, `/inbox`, `/events`, `/contacts`, `/schedule`, `/profile`).

Orbit AI links to a mobile relationship dashboard. The dashboard maps the web
analytics payloads into Chinese mobile cards, hides backend provenance wording,
and stays read-only on mobile.

Web Home links like `/app/home` and `/app/home/events` now open native iOS
screens. They reuse the profile, event, and contact APIs, keep the same
profile/events/contacts/schedule entry points, and do not write profile,
contact, event, schedule, or sign-out state from mobile.

Public organizer links like `/app/o/:slug` now open natively. The mobile screen
derives the host page from the event list, groups events by organizer, and
links back into event detail pages. It does not read private attendee lists,
admin records, organizer feeds, or registration data.

Platform links like `/app/platform` now open natively. The mobile screen derives
the platform overview from public events, the current profile, and dashboard
counts; review decisions and account operations stay outside the mobile client
until those flows have dedicated safe contracts.

Admin links like `/app/login-admin`, `/app/admin`, `/app/admin/events`, and
`/app/admin/access` now open natively. The mobile admin slice keeps the web
magic-link entry and organizer admin views available for review, but treats all
admin writes as future backend-confirmed actions.

Orbit AI links to a mobile relationship inbox. The inbox reads
`/api/chat/relationship-inbox`, `/api/notifications`, and
`/api/ai/proactive-turns`, maps the web relationship correspondence workspace
into Chinese mobile cards, and posts reviewed draft threads back to the inbox
endpoint. It does not send external messages, deliver notifications, or create
calendar items.

Orbit AI links to a mobile relationship chat workspace. The screen reads the
legacy `/api/chat/conversations` relationship threads, opens thread details,
can save reply drafts through the web messages boundary, and labels message
delivery as review-only rather than live external chat.

Orbit AI links to a mobile follow-up queue. The screen reads `/api/tasks` and
`/api/notifications`, highlights the next relationship action, and keeps task
generation, reminder scheduling, message draft creation, and external delivery
behind future confirmation flows.

Orbit AI links to a mobile Agent action center. The screen reads the Agent
action queue and action boundary settings, maps them into Chinese review cards,
lets the user choose the Agent boundary level, and keeps every action behind
human confirmation.

Orbit AI conversation cards navigate to API-backed thread detail screens. The
detail screen reads `/api/ai/conversations/:id` and posts follow-up messages to
the same conversation endpoint.

Events and Contacts cards navigate to API-backed detail screens. List and
detail screens support pull-to-refresh through the same envelope client.

Event detail screens link to an event registration workspace. The workspace
reads generated event questions from `/api/events/:id/registration`, posts
answers back to the same endpoint, and cancels through
`/api/events/:id/registration/cancel`. It can also ask adaptive follow-up
questions through `/api/events/:id/registration/interview` and generate a local
activity persona through `/api/events/:id/registration/persona`; that preview
does not write the profile or send messages.

Register invite links like `/register/:code` open natively. The screen prepares
the event invite and current profile preview, then links into the event
registration workspace. It does not create accounts, write attendees, send
pass-code emails, upload cards or resumes, or run extraction from mobile yet.

Event detail screens also link to an attendee workspace. It reads
`/api/events/:id/attendees` and `/api/events/:id/matches`, can record an
on-site want-to-connect intent through `/api/events/:id/want-to-connect`, and
can import the roster into review-only contact drafts through
`/api/contact-drafts/event-attendees/import`.

Event detail screens link to the mobile party surface. It keeps `/app/party`,
`/app/party/checkin`, and `/app/party/graph` available as native screens for
simulator review while keeping real check-in writes behind a future staff
confirmation API.

Schedule links to the follow-up queue for relationship-first review of the same
work. The Schedule tab remains the time view; Followups is the source and
review view.

Schedule event preview routes keep web links like `/app/schedule/events/:id`
usable in the native app. They show the activity source, time, venue, and
guardrail copy without writing calendar records, registering, creating
reminders, or sending messages.

Contacts also has an iPhone-first source acquisition route for manual notes, QR
text, native QR camera scans, business-card text, and external contact
candidates. It posts to contact draft APIs, reads
`/api/contact-drafts/external/candidates`, can stage external sources through
`/api/contact-drafts/external/import`, can stage referral recommendations
through `/api/contact-drafts/referral`, can confirm recommended people through
`/api/contact-drafts/recommended/:id/confirm`, can confirm the candidate it just
created, and still keeps the final contact write outside the mobile client.

Contacts link to a mobile contacts dashboard. It reuses the dashboard analytics
payloads but presents them as an asset check for the address book: total
contacts, high-value relationships, follow-up load, dormant relationships,
coverage gaps, and value type distribution. Export, recompute, and bulk
drill-down actions stay out of mobile until those contracts are explicit.

Contacts link to a mobile relationship graph. The graph reads connection
evidence, hides backend provenance wording, opens the related contact detail,
can show the selected relationship's evidence chain, and can add a reviewed
manual evidence item through the web connection evidence route.

Contacts link to a mobile follow-up pipeline and an introduction preparation
screen. These views combine contact status, value labels, and connection
evidence into Chinese mobile cards. The pipeline can move supported
connections between 待联系 and 在推进 through the backend stage endpoint; outbound
introductions and evidence edit/delete flows stay behind future confirmation
contracts.

Contact detail screens link into the relationship inbox with the selected
contact prefilled for a draft follow-up. They can also move supported contact
statuses between 待联系 and 在推进 while leaving tag, note, and interaction edits
out of the mobile client for now.

Profile links to a mobile account and workspace screen. The screen reads
`/api/account/me`, maps demo account payloads to 小雨's Chinese Orbit founder
identity, and opens native account entry screens for login, signup, and
password reset. Email/password login and signup now use the same web auth
routes. Password reset delivery and OAuth callback handling are still web-side
flows.

The account screen also links to a native permissions center at
`/account/permissions`. It reads `/api/permissions`, shows the current staged
permission state in Chinese, and can request calendar review through
`/api/permissions/calendar/request` without opening a live provider flow.

The Server screen can save a runtime Orbit server address on device. This is
useful when moving from the iOS simulator to a physical iPhone or a remote API
server.
The Server screen can check `/api/health` before saving a local, LAN, or remote
API address.

Orbit AI includes a message composer that posts to `/api/ai/conversations` and
renders the latest assistant reply or a controlled error state.
