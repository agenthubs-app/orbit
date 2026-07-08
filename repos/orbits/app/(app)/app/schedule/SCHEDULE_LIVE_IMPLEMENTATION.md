# /app/schedule Live Replacement Boundary

`/app/schedule` is composed in `schedule-route-view-model.ts`. The page reads a
route view model only; it does not import contact, event, follow-up fixtures, raw
provider payloads, or mock services. Schedule-owned event display text lives in
`schedule-event-display.ts`, and the temporary event recovery route lives at
`/app/schedule/events/<id>` through
`events/[id]/event-preview-route-view-model.ts`.

## Arrangement Contract

Each arrangement is a UI-ready record with:

- `target.kind`: `contact` or `event`
- `target.id`: the detail id used by the product route
- `href`: `/app/contacts/<id>`, `/app/events/<id>` when a composed detail route
  is ready, or `/app/schedule/events/<id>` while event detail composition cannot
  show the selected event
- `primaryName`: localized person or event name
- `secondaryName`: localized role, organization, venue, or other display context
- `reason`: schedule-owned Chinese summary derived from contact, event, and
  follow-up fields; it must not echo raw provider excerpts or English fixture
  prose as visible copy
- `timing`: human-readable follow-up or event timing
- `sourceContext`: localized source summary and evidence count
- `targetState`: `ready` or `detail-unavailable`
- `targetNote`: optional localized warning shown before navigation when a
  composed detail route is not fully live-backed yet; event arrangements must
  point to the schedule preview instead of a known failed detail route
- `evidenceIds`: provenance ids retained for audit and tests

The page must not render raw contact ids, event ids, provider ids, task ids, or
placeholder titles as primary copy. It also must not expose raw source excerpts
such as unlocalized relationship notes, AI recommendation evidence sentences, or
provider action text in the arrangement reason. The route view model may use
those typed fields to decide the localized summary, but visible copy stays owned
by `/app/schedule`. Proper nouns can stay as source names, while role, venue,
and event-type context should be localized for Chinese users.

## Live Service Files

The current route boundary uses the shared factories:

- `features/contacts/service-factory.ts`
- `features/events/service-factory.ts`
- `features/followups/service-factory.ts`

Future live replacement stays behind these files:

- `features/contacts/live-detail-service.ts`
- `features/contacts/live-service.ts`
- `features/events/event-crud-and-import/live-service.ts`
- `features/events/event-crud-and-import/providers/storage-event-provider.ts`
- `features/followups/live-service.ts`
- `features/followups/storage/followup-live-record-provider.ts`

## Switch From Mock To Live

Use `ORBIT_MODULE_MODE=live` or an explicit route-service test setup to resolve
live implementations through the factories. The default `/app/schedule` route
keeps a schedule-owned mock probe fallback for the sprint demonstration IDs
`demo-contact-1` and `event_001`: when live services return a controlled failure
because providers or seeded rows are unavailable, the route retries through the
same typed contact, event, and follow-up contracts in mock mode so the right-side
arrangement workflow remains inspectable. Explicit `?scenario=empty`,
`?scenario=pending`, and `?scenario=failure` requests still render the Chinese
schedule recovery states and do not fall back.

The live replacement removes this probe fallback only after the live providers
seed compatible contact, event, and follow-up records for the arrangement ids.
Until the composed contact and event detail routes have live records for
`demo-contact-1` and `event_001`, probe-backed contact arrangements keep their
detail hrefs and warning copy. Probe-backed event arrangements use
`/app/schedule/events/<id>` so the user can still see the localized event name,
time, source, and next action instead of navigating into a failed event detail
workspace. The preview route uses the same event CRUD/import factory, falls back
to the mock probe only for the default demonstration path, and performs no
calendar, reminder, message, notification, organizer sync, AI, or external
provider writes. The page must not branch on provider names or raw provider
payloads.

## Required Env Vars And Permissions

Live contact, event, and follow-up providers require the configured live record
store, using `ORBIT_EVENT_DATABASE_URL`, `ORBIT_LIVE_DATABASE_URL`, or
`ORBIT_DATABASE_URL` depending on deployment. This sprint does not add calendar
write permissions, notification permissions, email permissions, organizer sync,
or external scheduler sync.

## Privacy And Provenance

Schedule arrangements can show relationship context, event context, timing, and
source counts. They must keep raw provider payloads, private provider ids, and
unreviewed records out of visible primary copy. Every live arrangement must keep
provenance or 来源 evidence so users can understand why the item appears before
taking action.

## Replacement Tests

Replacement tests should cover:

- `schedule-route-view-model.ts` resolving contact, event, and follow-up live
  services through `ORBIT_MODULE_MODE=live`, including the default route's
  typed probe fallback while live records are absent.
- `events/[id]/event-preview-route-view-model.ts` resolving the same event id
  through the event CRUD/import factory and preserving event name, time, source,
  next action, provenance, and no-write guardrails.
- The live replacement test that seeds `demo-contact-1`, `event_001`, and at
  least one follow-up task, then verifies the fallback can be removed without
  changing the page component.
- Empty, pending, and failure live states rendering Chinese recovery controls.
- Every arrangement `href` resolving to a contact detail, event detail, or
  schedule-owned event preview route id, depending on the target state.
- Event arrangements with unavailable composed detail sources rendering the
  `detail-unavailable` target state and linking to `/app/schedule/events/<id>`.
- No live arrangement displaying raw ids such as `contact_021`, task ids, source
  ids, or provider record ids as primary copy.
- No external calendar write, scheduler sync, message send, or notification
  delivery triggered by `/app/schedule`.
