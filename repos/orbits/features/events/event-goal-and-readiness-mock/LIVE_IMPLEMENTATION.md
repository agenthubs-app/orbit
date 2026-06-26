# Event Goal And Readiness Mock: Live Replacement Notes

## Live Service And Provider Files

- Keep the public contract in `features/events/goal-contract.ts`.
- Replace the mock service with `features/events/event-goal-and-readiness-mock/live-service.ts`.
- Put provider adapters under `features/events/event-goal-and-readiness-mock/providers/`, including an AI goal generation provider, a live calendar conflict provider, and an event readiness persistence provider.
- Keep route handlers at `app/api/events/[id]/goal/route.ts` and `app/api/events/[id]/readiness/route.ts` consuming the same service interface.

## Switch Mechanism

- Add `ORBIT_EVENT_GOAL_READINESS_PROVIDER`.
- `mock` keeps using `createMockEventGoalAndReadinessService`.
- `live` resolves `createLiveEventGoalAndReadinessService` from `live-service.ts`.
- Unknown provider values must fail closed to mock mode in development and return a controlled configuration error in production.

## Required environment variables and permissions

The required environment variables and permissions are:

- `ORBIT_EVENT_GOAL_READINESS_PROVIDER`
- AI goal generation provider API key and model identifier.
- Live calendar conflict provider client id, client secret, tenant or workspace id, and redirect configuration.
- Event datastore connection string or service role with least-privilege read/write permissions for event goals and readiness rows.
- Permissions: read event metadata, read calendar availability windows, write event goal state, write readiness checklist state, and read evidence records already consented for the event.

## Privacy And Provenance Constraints

- Do not send full contact records, private notes, or unrelated calendar details to goal generation.
- Calendar conflict checks may use only event time windows and availability status, not meeting titles or guest lists unless explicitly consented.
- Every live suggested goal, selected goal, checklist item, and preparation state must preserve source evidence ids, provider record ids, generation method, and collected-at timestamps.
- Sensitive follow-up or notification actions remain outside this service and must continue through confirmation or sandbox boundaries.
- Failure envelopes must keep provider details out of user-visible messages while preserving safe provenance context for diagnostics.

## Replacement tests

The replacement tests are:

- Contract tests continue to assert typed event goal, suggested goal, readiness checklist, preparation state, error, privacy, and provenance fields.
- Service tests cover live goal suggestions, goal setting, readiness read, empty state, pending preparation, missing event, blank goal validation, calendar access denied, provider timeout, and provider failure paths.
- Route tests verify `PUT /api/events/[id]/goal` and `GET /api/events/[id]/readiness` return shared API envelopes and runtime boundary headers in mock and live modes.
- Privacy tests verify goal generation receives only approved event evidence and calendar conflict checks receive only allowed availability fields.
- Migration tests compare mock fixture shape with live provider output so product routes can switch without component-level shape changes.
