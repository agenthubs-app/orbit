# Relationship Natural Search Mock To Live Handoff

This sprint implements the mock-first Relationship natural search boundary only.
It uses deterministic fixtures and rule-based filtering in `features/search` and
must not call live search, storage, AI, calendar, email, notification, device, or
provider services.

## Live service/provider files

- Keep the public service interface in `features/search/service.ts`.
- Add a future live adapter under
  `features/search/relationship-natural-search-mock/live-service.ts`.
- Add provider-specific clients under
  `features/search/relationship-natural-search-mock/providers/`.
- Keep route handlers in `app/api/search/relationships/route.ts` and
  `app/api/search/suggestions/route.ts` consuming the service interface, not raw
  provider clients.

## Switch mechanism

- `ORBIT_RELATIONSHIP_SEARCH_PROVIDER=mock` keeps using
  `createMockRelationshipNaturalSearchService`.
- `ORBIT_RELATIONSHIP_SEARCH_PROVIDER=live` may select the future live adapter
  only after replacement tests cover the same API envelope, empty, pending, and
  failure paths.
- Live mode must still preserve the shared API envelope:
  `{ success: true, data }` and `{ success: false, error }`.

## Required env vars or permissions

- `ORBIT_RELATIONSHIP_SEARCH_PROVIDER` chooses `mock` or `live`.
- `ORBIT_RELATIONSHIP_SEARCH_INDEX_URL` points to the live relationship search
  index when live mode exists.
- `ORBIT_RELATIONSHIP_SEARCH_INDEX_KEY` authenticates the live index service.
- Any CRM, email, calendar, contact, or event provider permission must be staged
  through Orbit permission services before it contributes relationship evidence.

## Privacy and provenance constraints

- Every result must preserve source evidence ids, source type, captured time, and
  the reason a contact matched the query.
- Live semantic search, embeddings, and cross-provider indexing must record
  whether they executed and which evidence ids were used.
- Query text may contain sensitive relationship context. Do not log raw query
  text to production audit logs without redaction and user-account scoping.
- Live ranking may not hide provenance. If a provider result lacks evidence,
  return a controlled failure or omit the result rather than fabricating context.
- Sensitive follow-up actions suggested by search remain separate from delivery
  and must route through the confirmation guard before any external action.

## Replacement tests

- Contract tests must cover business intent, industry, source, value type, and
  follow-up status filters.
- API route tests must cover `POST /api/search/relationships` and
  `GET /api/search/suggestions` with success, empty, pending, invalid body, and
  provider failure envelopes.
- Provider tests must assert no result is returned without evidence ids and
  source references.
- Privacy tests must assert raw provider payloads and sensitive query text are
  not logged or exposed beyond the response contract.
- Regression tests must compare mock and live DTO shapes before enabling the
  live switch in product routes.
