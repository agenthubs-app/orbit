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
- `ORBIT_RELATIONSHIP_SEARCH_BACKEND=basic_rules` selects the current
  deterministic backend in `features/search/backends/basic-rules-backend.ts`.
- `ORBIT_RELATIONSHIP_SEARCH_STORE=fixture` selects the current fixture store in
  `features/search/stores/fixture-store.ts`.
- Future database, vector, full-text, or graph providers should register a new
  backend or store in `features/search/backend-factory.ts` without changing API
  routes or feature-owned callers.
- Live mode must still preserve the shared API envelope:
  `{ success: true, data }` and `{ success: false, error }`.

## Required env vars or permissions

- `ORBIT_RELATIONSHIP_SEARCH_PROVIDER` chooses `mock` or `live`.
- `ORBIT_RELATIONSHIP_SEARCH_INDEX_URL` points to the live relationship search
  index when live mode exists.
- `ORBIT_RELATIONSHIP_SEARCH_INDEX_KEY` authenticates the live index service.
- `ORBIT_RELATIONSHIP_SEARCH_BACKEND` chooses the retrieval backend. Current
  value: `basic_rules`.
- `ORBIT_RELATIONSHIP_SEARCH_STORE` chooses the data store. Current value:
  `fixture`.
- Any CRM, email, calendar, contact, or event provider permission must be staged
  through Orbit permission services before it contributes relationship evidence.

## Privacy and provenance constraints

- Every result must preserve source evidence ids, source type, captured time, and
  the reason a contact matched the query.
- Live semantic search, embeddings, and cross-provider indexing must record
  whether they executed and which evidence ids were used.
- Structured filters and permission constraints must be applied before broad
  semantic expansion. Vector search may improve recall, but it must not return
  records outside the current user/account permission scope or without
  source-backed relationship evidence.
- Query text may contain sensitive relationship context. Do not log raw query
  text to production audit logs without redaction and user-account scoping.
- Live ranking may not hide provenance. If a provider result lacks evidence,
  return a controlled failure or omit the result rather than fabricating context.
- Sensitive follow-up actions suggested by search remain separate from delivery
  and must route through the confirmation guard before any external action.

## Hybrid retrieval shape

Live relationship search should combine semantic query, keyword query, metadata
filters, graph constraints, and feature-owned reranking. The search provider may
own vector/full-text/graph retrieval mechanics, but Contacts, Events, Followups,
Chat, Agent, and Orbit AI still own their product policy.

Do not add product-specific methods such as `recommendPeopleForEvent` or
`prioritizeFollowups` to the Search service. Those belong to the calling feature,
which can build a `RelationshipNaturalSearchInput`, call Search, and then apply
its own ranking, explanation, action, and artifact mapping.

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
- Hybrid retrieval tests must assert filters and permissions constrain candidate
  scope before semantic/vector retrieval results are surfaced.
- Regression tests must compare mock and live DTO shapes before enabling the
  live switch in product routes.
