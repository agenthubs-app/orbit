# Compose App Home Live Implementation Notes

`/`, `/app`, `/app/home`, and `/app/home/events` are Home composition routes.
They do not own event, contact, profile, search, or storage logic. The web root
`/` delegates to the product namespace root `/app`, and `/app` shares the same
live-capable Home route model as `/app/home` so the web entry keeps the approved
personal hub with events and the profile/contact/schedule entry rail.

## Switch Mechanism

The Home pages call `loadAppHomeRouteViewModel()`. That loader composes the
existing live-capable route loaders:

- `loadAppEventsRouteViewModel()` for source-backed events.
- `loadAppContactsRouteViewModel()` for relationship/contact counts.
- `loadAppProfileRouteViewModel()` for the account name and headline.
- `readConfiguredCanonicalParticipantEventJourneys()` for published canonical
  events where the authenticated raw subject has an active `rsvped` membership.

`ORBIT_MODULE_MODE=live` is resolved by those child route services through their
own module-mode factories. Home does not branch on provider env vars and does
not instantiate storage clients.

## Adapter Boundary

`home-route-view-model.tsx` maps child route payloads into the existing
`OrbitHomeViewModel` shape used by `OrbitRealHome`. This keeps the current UI
usable while removing the old `getOrbitHomeViewModel()` dependency from the
real Home routes.

The adapter is intentionally thin:

- Owner events are adapted from the events route `eventChoices`; participant
  journeys are adapted through the existing canonical Event Core landing view
  adapter and merged with owner records first.
- Home keeps the canonical account id (`actor.id`) for owner/private legacy
  event reads and passes the raw Auth.js subject (`rawSubject`) only to the
  canonical membership reader. A cancelled membership or another subject's
  membership is not a journey.
- De-duplication uses the route id, route code, and canonical Event Core id,
  so an owned legacy alias wins over the same canonical participant event.
- Contact stats are adapted from the contacts route ledger.
- Account display fields are adapted from the profile route payload.
- Empty, pending, and failure child states become one shared Home route state.

The product namespace root `/app` calls `loadAppHomeRouteViewModel()` and marks
its route boundary with `app-root-home-route`. The web root `/` imports that
route adapter instead of rendering `OrbitRealLandingPage`. Home hub entry cards
use concrete `/app/profile`, `/app/contacts`, and `/app/schedule` hrefs; shared
product href mapping must be idempotent for already-materialized `/app/...`
paths so client-side clicks cannot produce `/app/app/...` 404s.

## Web Layout Boundary

The desktop Home surface must keep events and the profile/contact/schedule hub
rail side by side for web users. Medium browser widths are still web layout, not
mobile layout. The grid therefore uses `grid-template-areas: "events rail"` and
`grid-template-columns: minmax(0, 1fr) clamp(220px, 30vw, 320px)` so the rail
can shrink without moving above events or forcing horizontal overflow.
The 641-820px web breakpoint keeps the same `"events rail"` areas and narrows
the rail to `clamp(180px, 28vw, 220px)` instead of switching to a stacked
`"rail" "events"` layout.

## Privacy And Side Effects

Home is read-only. Page render must not create contacts, update events, save
profile fields, send messages, deliver notifications, call AI providers, or
contact outside networks. Participant membership read failures propagate from
the Home loader instead of becoming a false zero-event state. Only an
unconfigured canonical runtime returns an explicit empty participant set; the
existing owner-scoped Events Live Store query is never widened.

## Replacement Tests

- `tests/pages/app-home-live-route-services.test.ts` proves `/` delegates to the
  `/app` Home route adapter, and `/app`, `/app/home`, and `/app/home/events`
  call `loadAppHomeRouteViewModel()`.
- The same test proves Home routes no longer import
  `getOrbitHomeViewModel`, use `loadAppHomeRouteViewModel`, and render
  controlled live failures when storage is unconfigured.
- The same test locks the concrete app route href mapping so `/app/profile`,
  `/app/contacts`, `/app/schedule`, and event detail paths stay unchanged when
  passed through `productHref()`.
- The same test locks the desktop Home grid classes and proves medium-width web
  screens preserve the `"events rail"` layout instead of applying a
  `"rail" "events"` collapse rule.
- Remote smoke verification should call `loadAppHomeRouteViewModel()` with
  `ORBIT_MODULE_MODE=live` and configured Postgres env vars. The loader should
  return `state: "success"` with source-backed owner and canonical participant
  journeys plus contact counts.
- Regression coverage should keep a current subject's `rsvped` membership
  visible, while excluding `cancelled` and other-subject memberships and
  preserving owner events. A membership/Core read error must remain visible as
  an error rather than an empty activity list.
- Browser screenshot verification should cover 641px, 760px, and 1440px widths
  and confirm `overflowX=false` with the hub rail still beside the event list.
