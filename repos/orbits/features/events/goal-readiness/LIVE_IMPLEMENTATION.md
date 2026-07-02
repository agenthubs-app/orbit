# Event Goal And Readiness Mock: Live Replacement Notes

## Live Service And Provider Files

- Keep the public contract in `features/events/goal-readiness/contract.ts`.
- Current live service entry: `features/events/goal-readiness/live-service.ts`.
- Current generated live provider: `features/events/goal-readiness/storage/generated-goal-readiness-live-record-provider.ts`.
- The current provider reuses `features/events/attendee-roster/storage/generated-attendee-roster-live-record-provider.ts` and maps generated attendee roster context into goal suggestions, a primary goal, readiness checklist, and preparation state.
- Do not add legacy adapters under `features/events/goal-readiness/providers/`; reserve that path for a future AI goal generation provider, live calendar conflict provider, or external readiness persistence provider after privacy review.
- Keep route handlers at `app/api/events/[id]/goal/route.ts` and `app/api/events/[id]/readiness/route.ts` consuming the same service interface.

## Switch Mechanism

- `ORBIT_MODULE_MODE=live` or `ORBIT_FEATURE_MODE=live` selects the current generated live provider through `features/events/service-factory.ts`.
- `ORBIT_EVENT_GOAL_READINESS_PROVIDER` is reserved for a future provider selector and is not required by the current generated live implementation.
- `mock` keeps using `createMockEventGoalAndReadinessService`.
- `live` resolves `createLiveEventGoalAndReadinessService` from `live-service.ts`.
- `hybrid` still reads the event work-record provider for goal readiness payloads.
- Unknown provider values must fail closed to mock mode in development and return a controlled configuration error in production.

## Required environment variables and permissions

The required environment variables and permissions are:

- `ORBIT_EVENT_DATABASE_URL`, `ORBIT_LIVE_DATABASE_URL`, or `ORBIT_DATABASE_URL`, plus `ORBIT_WORKSPACE_ID`.
- Least-privilege read access to generated event, attendee, contact, connection, recommendation, and evidence records.
- Write access only to the `event_goal_readiness` work collection when the operator sets a goal.
- No AI goal generation provider, live calendar conflict provider, external network, email, notification, or calendar permission is required by the current generated live implementation.

## Privacy And Provenance Constraints

- Do not send full contact records, private notes, or unrelated calendar details to goal generation.
- Calendar conflict checks may use only event time windows and availability status, not meeting titles or guest lists unless explicitly consented.
- Every live suggested goal, selected goal, checklist item, and preparation state must preserve source evidence ids, provider record ids, generation method, and collected-at timestamps.
- The current generated live provider sets `aiProviderRequested=false`, `calendarProviderRequested=false`, `liveCalendarRequested=false`, and `externalNetworkRequested=false`.
- Sensitive follow-up or notification actions remain outside this service and must continue through confirmation or sandbox boundaries.
- Failure envelopes must keep provider details out of user-visible messages while preserving safe provenance context for diagnostics.

## Replacement tests

The replacement tests are:

- Contract tests continue to assert typed event goal, suggested goal, readiness checklist, preparation state, error, privacy, and provenance fields.
- `tests/capabilities/event-goal-readiness-live-generated-store.test.ts` covers generated live goal suggestions, readiness read, goal setting, work-record persistence, and no AI/calendar side effects.
- Service tests cover live goal suggestions, goal setting, readiness read, empty state, pending preparation, missing event, blank goal validation, calendar access denied, provider timeout, and provider failure paths.
- Route tests verify `PUT /api/events/[id]/goal` and `GET /api/events/[id]/readiness` return shared API envelopes and runtime boundary headers in mock and live modes.
- Privacy tests verify goal generation receives only approved event evidence and calendar conflict checks receive only allowed availability fields.
- Migration tests compare mock fixture shape with live provider output so product routes can switch without component-level shape changes.
