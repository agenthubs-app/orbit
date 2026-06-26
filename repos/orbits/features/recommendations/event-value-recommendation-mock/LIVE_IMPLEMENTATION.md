# Event Value Recommendation Mock: Live Implementation Handoff

## Live service and provider files

- `features/recommendations/event-value-recommendation-mock/live-service.ts` will implement the same `EventValueRecommendationService` interface exported by `features/recommendations/event-value-contract.ts`.
- `features/recommendations/event-value-recommendation-mock/providers/calendar-availability-provider.ts` will be the calendar availability provider. It will read consented calendar availability and return normalized busy/free windows.
- `features/recommendations/event-value-recommendation-mock/providers/event-discovery-feed-provider.ts` will be the event discovery feed provider. It will read approved live event discovery feeds and normalize event metadata, attendee density, venue, industry, and source identifiers.
- `features/recommendations/event-value-recommendation-mock/providers/event-value-scorer.ts` will rank events from profile goal, location, industry preference, attendee density, and calendar fit without changing the route envelope shape.

## Switch mechanism

Keep `createMockEventValueRecommendationService()` as the default for Milestone C. A future service factory can switch on `ORBIT_EVENT_VALUE_RECOMMENDATION_PROVIDER`:

- `mock`: use `features/recommendations/mock-event-value-service.ts`.
- `live-calendar-feed`: use `live-service.ts` after provider files, consent checks, and replacement tests exist.
- unset or unknown values must resolve to mock mode or return an explicit guarded live-not-implemented error.

## Required environment variables and permissions

The live replacement must document required environment variables before any provider switch leaves mock mode.

- `ORBIT_EVENT_VALUE_RECOMMENDATION_PROVIDER` selects mock or live provider mode.
- `ORBIT_EVENT_DISCOVERY_FEED_URL` points to the approved event discovery feed.
- `ORBIT_EVENT_DISCOVERY_FEED_TOKEN` authorizes event feed reads.
- `ORBIT_CALENDAR_AVAILABILITY_CLIENT_ID` and `ORBIT_CALENDAR_AVAILABILITY_CLIENT_SECRET` identify the calendar availability integration.
- Calendar permissions must be read-only availability scopes. The live service must not request event write, invite, notification, email, or contact scopes for this capability.

## Privacy and provenance constraints

The live path must preserve privacy and provenance constraints in service payloads, API envelopes, and dev evidence.

- Preserve source evidence for every profile signal, event fixture, attendee-density signal, calendar-fit signal, and acceptance action.
- Store provider record ids and collected-at timestamps in provenance, not in UI-only state.
- Do not expose raw calendar event titles, attendee private notes, email content, or notification payloads in recommendations.
- Accepting a recommendation must remain a local Orbit action until an external action sandbox and confirmation guard are explicitly wired.
- Live failures must return API envelopes through the same error mapping used by `eventValueRecommendationFailureToAppError`.

## Replacement tests

The replacement tests must cover every mock state before the live provider becomes selectable.

- Service tests for live ranking success using profile goal, location, industry preference, attendee density, and calendar fit.
- API tests for `GET /api/recommendations/events` success, empty, pending, and controlled provider failure envelopes.
- API tests for `POST /api/recommendations/events/[id]/accept` success, missing event, pending calendar-fit review, and provider failure envelopes.
- Privacy tests proving no raw calendar details, email content, notification payloads, or provider credentials appear in response envelopes.
- Provider isolation tests proving event discovery feed and calendar availability calls are mocked at the provider boundary during tests and never leak into dev capability pages.
