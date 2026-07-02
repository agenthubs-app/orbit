# Event Recommendation And Opening-Line Mock: Live Replacement Notes

## Live Service And Provider Files

- Keep the public contract in `features/recommendations/contract.ts`.
- Keep reusable fixture parity examples in `features/recommendations/fixtures.ts`.
- The current live implementation is `features/recommendations/live-service.ts`.
- The current shared storage provider is `features/recommendations/storage/event-recommendation-live-record-provider.ts`.
- Do not add the legacy mock-folder service path `features/recommendations/event-recommendation-and-opening-line-mock/live-service.ts`; keep live code outside the mock folder.
- Do not add legacy mock-folder adapters under `features/recommendations/event-recommendation-and-opening-line-mock/providers/`; provider adapters belong to the feature live/storage boundary.
- `features/recommendations/service-factory.ts` registers live mode and fails closed when the live record store is not configured.
- Future ranking provider, opening-line generation provider, vector provider, and recommendation persistence adapters should stay outside the mock folder and plug into this feature boundary through provider interfaces.
- Keep route handlers at `app/api/recommendations/event/[id]/route.ts` and `app/api/recommendations/event/[id]/opening-line/route.ts` consuming the same service interface.

## Switch Mechanism

- `ORBIT_MODULE_MODE=live` selects the live recommendation service through `features/recommendations/service-factory.ts`.
- Live storage uses the shared live DB config (`ORBIT_EVENT_DATABASE_URL`, `ORBIT_DATABASE_URL`, or `ORBIT_LIVE_DATABASE_URL`) and `ORBIT_WORKSPACE_ID`.
- A future `ORBIT_EVENT_RECOMMENDATION_PROVIDER` can select an external ranker or model-backed opening-line provider.
- `mock` keeps using `createMockEventRecommendationService`.
- `live` resolves `createLiveEventRecommendationService` from `live-service.ts`.
- Unknown provider values must fail closed to mock mode in development and return a controlled configuration error in production.

## Required environment variables and permissions

This section lists the required environment variables and permissions.

The current live storage implementation requires:

- Shared live database configuration and workspace id.
- Least-privilege read access to `events`, `matchRecommendations`, `attendees`, `eventParticipantIntents`, `contacts`, `connections`, `networkPeople`, and `evidence`.
- No model, vector, calendar, email, notification, or external network permission.

Future provider-backed ranking or opening-line generation may require:

- `ORBIT_EVENT_RECOMMENDATION_PROVIDER`
- Ranking provider API key, endpoint, model or ranking profile id, timeout, and safe retry budget.
- Opening-line generation provider API key, model id, policy profile, timeout, and content safety configuration.
- Event attendee datastore connection string or service role with least-privilege read permissions.
- Optional vector or embedding provider credentials only after privacy review approves the fields sent to the provider.
- Permissions: read event metadata, read approved attendee roster fields, read source evidence already consented for the event, write recommendation audit records, and write opening-line draft records.

## Privacy And Provenance Constraints

- Do not send full contact records, private notes, unrelated calendar details, email bodies, or unapproved profile fields to ranking or opening-line generation.
- Ranking may use only event id, approved attendee fields, relationship context excerpts, and evidence ids that are already consented for the event.
- Opening-line generation must receive the minimum attendee context needed for a short draft and must not trigger external message sending.
- Every live recommendation, reason, match signal, and opening line must preserve source evidence ids, provider record ids, generation method, provider name, and collected-at timestamps.
- The current live storage implementation sets `databaseQueryExecuted=true`, `databaseWriteExecuted=false`, `aiProviderRequested=false`, `vectorSearchExecuted=false`, and `externalNetworkRequested=false`.
- Sensitive outreach remains outside this service and must continue through confirmation or external action sandbox boundaries.
- Failure envelopes must keep provider details out of user-visible messages while preserving safe provenance context for diagnostics.

## Replacement tests

The replacement tests are:

- Contract tests continue to assert typed event, attendee recommendation, reason, match signal, opening-line, error, privacy, and provenance fields.
- `tests/capabilities/event-recommendation-live-store.test.ts` covers live storage reads, opening-line derivation, and fail-closed unconfigured live mode.
- Service tests cover live ranking success, opening-line composition, empty attendee state, pending review, missing event, missing attendee, ranking provider timeout, opening-line provider failure, and provider access denied paths.
- Route tests verify `GET /api/recommendations/event/[id]` and `POST /api/recommendations/event/[id]/opening-line` return shared API envelopes and runtime boundary headers in mock and live modes.
- Privacy tests verify ranking and opening-line providers receive only approved event evidence and never receive private notes, email content, full calendars, or unrelated contacts.
- Migration tests compare mock fixture shape with live provider output so product routes can switch without component-level shape changes.
