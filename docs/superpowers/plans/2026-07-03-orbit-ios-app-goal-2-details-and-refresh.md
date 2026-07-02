# Orbit iOS App Goal 2: Detail Navigation And Refresh Plan

**Goal:** Move `repos/orbit-app` from first-stage read-only tab lists to navigable, refreshable mobile views for events and contacts, while still consuming only `repos/orbits` HTTP APIs.

**Scope:**

- Events and Contacts list cards navigate to detail routes.
- Event and Contact detail screens fetch `/api/events/:id` and `/api/contacts/:id`.
- API resource hook exposes refresh state for pull-to-refresh.
- Detail mappers tolerate current mock, hybrid, and live payload shapes without importing web contracts.
- README documents this second-stage capability.

**Out of scope:**

- Auth, account switching, offline cache, push notifications, camera scanning, edit/create actions, and TestFlight.
- Any direct Postgres, Supabase, `orbit_records`, feature service, or Next.js source import.
- Any changes inside `repos/orbits`.

## Tasks

- [ ] Add detail endpoint helpers and mapper tests for event/contact detail payloads.
- [ ] Implement detail summary mappers.
- [ ] Extend `useApiResource` with `refresh`, `refreshing`, and controlled thrown-error fallback.
- [ ] Make Events and Contacts cards navigable and add pull-to-refresh to list/detail screens.
- [ ] Replace detail shell routes with API-backed detail views.
- [ ] Run `npm test`, `npm run typecheck`, `npx expo config --type public`, and screenshot verification.
- [ ] Commit the second-stage work in focused commits.
