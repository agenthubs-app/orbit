# Compose App Home Live Implementation Notes

`/app/home` and `/app/home/events` are Home composition routes. They do not own
event, contact, profile, search, or storage logic. The web root `/` and product
namespace root `/app` intentionally stay on the public landing experience so the
approved web entry UI does not change while Home becomes live-capable under its
own route.

## Switch Mechanism

The Home pages call `loadAppHomeRouteViewModel()`. That loader composes the
existing live-capable route loaders:

- `loadAppEventsRouteViewModel()` for source-backed events.
- `loadAppContactsRouteViewModel()` for relationship/contact counts.
- `loadAppProfileRouteViewModel()` for the account name and headline.

`ORBIT_MODULE_MODE=live` is resolved by those child route services through their
own module-mode factories. Home does not branch on provider env vars and does
not instantiate storage clients.

## Adapter Boundary

`home-route-view-model.tsx` maps child route payloads into the existing
`OrbitHomeViewModel` shape used by `OrbitRealHome`. This keeps the current UI
usable while removing the old `getOrbitHomeViewModel()` dependency from the
real Home routes.

The adapter is intentionally thin:

- Events are adapted from the events route `eventChoices`.
- Contact stats are adapted from the contacts route ledger.
- Account display fields are adapted from the profile route payload.
- Empty, pending, and failure child states become one shared Home route state.

The web root `/` and product namespace root `/app` render
`OrbitRealLandingPage` and must not call `loadAppHomeRouteViewModel()`. Home hub
entry cards use concrete `/app/profile`, `/app/contacts`, and `/app/followups`
hrefs; shared product href mapping must be idempotent for already-materialized
`/app/...` paths so client-side clicks cannot produce `/app/app/...` 404s.

## Web Layout Boundary

The desktop Home surface must keep events and the profile/contact/schedule hub
rail side by side for web users. Medium browser widths are still web layout, not
mobile layout. The grid therefore uses `grid-template-areas: "events rail"` and
`grid-template-columns: minmax(0, 1fr) clamp(220px, 30vw, 320px)` so the rail
can shrink without moving above events or forcing horizontal overflow.

## Privacy And Side Effects

Home is read-only. Page render must not create contacts, update events, save
profile fields, send messages, deliver notifications, call AI providers, or
contact outside networks. If any child route is unavailable, Home renders a
visible `StateView` failure with recovery links instead of falling back to mock
data.

## Replacement Tests

- `tests/pages/app-home-live-route-services.test.ts` proves `/` and `/app`
  stay on `OrbitRealLandingPage` and do not call `loadAppHomeRouteViewModel()`.
- The same test proves `/app/home` and `/app/home/events` no longer import
  `getOrbitHomeViewModel`, use `loadAppHomeRouteViewModel`, and render
  controlled live failures when storage is unconfigured.
- The same test locks the concrete app route href mapping so `/app/profile`,
  `/app/contacts`, `/app/followups`, and event detail paths stay unchanged when
  passed through `productHref()`.
- The same test locks the desktop Home grid classes and proves medium-width web
  screens preserve the `"events rail"` layout instead of applying a
  `"rail" "events"` collapse rule.
- Remote smoke verification should call `loadAppHomeRouteViewModel()` with
  `ORBIT_MODULE_MODE=live` and configured Postgres env vars. The loader should
  return `state: "success"` with source-backed event and contact counts.
- Browser screenshot verification should cover 641px, 760px, and 1440px widths
  and confirm `overflowX=false` with the hub rail still beside the event list.
