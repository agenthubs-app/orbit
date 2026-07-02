# Contacts List Search and Filter Live Implementation

## Live service and provider files

- Keep `features/contacts/contract.ts` as the DTO, filter, provenance, state, and error-code boundary for contact list, search, tag filters, source filters, value filters, and status filters.
- Keep `features/contacts/service.ts` as the `ContactsListSearchAndFilterService` interface and API failure mapping boundary.
- Keep `features/contacts/fixtures.ts` and `features/contacts/mock-service.ts` for Milestone C mock mode.
- Add `features/contacts/contacts-list-search-and-filter-mock/live-service.ts` only after the live implementation satisfies the same service interface.
- Add provider adapters under `features/contacts/contacts-list-search-and-filter-mock/providers/` for the approved search indexing service and contact database query layer.
- Keep `app/api/contacts/route.ts` and `app/api/contacts/search/route.ts` as thin route handlers that call the service interface and return the shared API envelope.

## Switch mechanism

- Continue resolving mock behavior through `ORBIT_FEATURE_MODE=mock` for Milestone C.
- `ORBIT_CONTACTS_PROVIDER` selects the future live contacts provider bundle.
- A future live switch should choose `createMockContactsListSearchAndFilterService` in mock mode and a `createLiveContactsListSearchAndFilterService` factory in live mode.
- Hybrid mode may expose fixture-backed contacts beside provider health metadata, but it must not read the live search indexing service or execute live database queries until replacement tests cover those paths.
- `/dev/capabilities/contacts-list-search-and-filter-mock` must continue rendering success, empty, pending, and failure states for whichever service mode is active.

## Required env vars and permissions

- `ORBIT_CONTACTS_PROVIDER` selects the live contacts service adapter.
- `ORBIT_CONTACTS_DATABASE_URL` or the equivalent managed secret identifies the live relationship data store.
- `ORBIT_CONTACTS_SEARCH_INDEX` identifies the approved search indexing service or index name.
- User authorization must prove the user can read the requested workspace contacts before any live list or search result is returned.
- Contact source permissions from acquisition, email, calendar, referral, and event import capabilities must already be staged and preserved before their evidence can appear in the live list.

## Privacy and provenance constraints

- Every live contact row must preserve source, evidence ids, relationship context, relationship value rationale, status, and next-action rationale.
- API failure envelopes must not expose raw database rows, search index internals, credentials, provider request ids, email bodies, calendar text, or private contact details outside the typed response contract.
- Search ranking must be explainable enough to show which local query and filters were applied; opaque provider scores cannot replace Orbit relationship value rationale.
- Tag, source, value, and status filters must be validated against `features/contacts/contract.ts` before reaching the provider layer.
- Live list/search providers should implement `readContactGraphForList` so route
  searches fetch contacts and only the evidence ids attached to listed contacts
  and their related connections. The full `readContactGraph` path remains a
  compatibility fallback, not the preferred live route read path.
- Empty, pending, unsupported filter, and provider failure paths must keep provenance that explains whether the response came from local rules, a live search index, or a live database query.

## Replacement tests

- Replace `tests/capabilities/contacts-list-search-and-filter-mock.test.ts` mock-only assertions with service-mode tests that prove live mode still returns the same envelope shape.
- Keep `tests/capabilities/contacts-live-store.test.ts` proving live list/search
  output matches the service contract and focused search reads do not fetch
  unrelated evidence rows.
- Add contract tests for future provider adapters covering list, text search, tag filters, source filters, value filters, status filters, empty state, pending state, unsupported filters, and provider failure.
- Add API tests for `app/api/contacts/route.ts` and `app/api/contacts/search/route.ts` proving status codes, runtime boundary headers, source/evidence provenance, privacy-safe errors, and stable API envelopes.
- Add privacy tests proving provider raw payloads, credentials, search-index internals, private message text, and database diagnostics never appear in success or failure envelopes.
- Add debug-route tests proving the dev capability surface still renders success, empty, pending, and failure states without owning business logic locally.

## Live handoff evidence excerpts

- Live provider files live under `features/contacts/contacts-list-search-and-filter-mock/`.
- `ORBIT_CONTACTS_PROVIDER` switches from mock to live.
- Live replacement wires a search indexing service and contact database queries behind `ContactsListSearchAndFilterService`.
- Contact list rows preserve source evidence, relationship context, value scoring, status, and follow-up rationale.
- Replacement tests cover list, search, tag/source/value/status filters, empty, pending, unsupported filter, and provider failure paths.
