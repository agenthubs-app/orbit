# External Contacts Import Live Implementation

## Live service and provider files

- `features/acquisition/external-import-contract.ts` remains the typed DTO,
  error, provenance, and API envelope boundary.
- `features/acquisition/live-external-import-service.ts` is the live review
  service. It derives external contact candidates and review drafts from seeded
  live storage and does not execute real external-provider sync.
- `features/acquisition/storage/external-import-live-record-provider.ts` reads
  `networkPeople`, `contacts`, and `evidence` from the shared `orbit_records`
  store.
- `features/acquisition/service-factory.ts` registers
  `external-contacts-import` for `live` mode through the configured Postgres
  live record store.

## Switch mechanism

- `ORBIT_MODULE_MODE=mock` keeps the deterministic fixture service active.
- `ORBIT_MODULE_MODE=live` routes
  `/api/contact-drafts/external/candidates` and
  `/api/contact-drafts/external/import` through the live service.
- `ORBIT_MODULE_MODE=hybrid` still falls back through the module-mode policy and
  should not be treated as a partial provider sync path.
- The contacts-new workbench remains pinned to mock external contacts import
  because that page still composes its acquisition cards synchronously.

## Live data boundary

- The live path treats seeded `networkPeople` records with
  `personKind="external_contact"` as the source-backed external candidate pool.
- Existing `contacts` are read only for duplicate hints.
- `evidence` records are mapped into draft evidence and provenance.
- The service maps candidates into the existing source kinds
  `phone`, `google_contacts`, `csv`, and `existing_customer_list` with stable,
  deterministic assignment so the current contract can be exercised against
  generated relationship data.
- This keeps the same phone address book, Google Contacts, CSV, and existing customer-list review vocabulary as the mock capability.
- The provider keeps `live-record-store.ts` generic. Field-specific validation
  and mapping live in the acquisition storage provider and service.

## Not implemented yet

- No phone address book read is executed.
- No Google Contacts sync is executed.
- No CSV file is parsed.
- No customer-list job is executed.
- No contact, contactDraft, notification, task, email, or production import job
  write is executed from these routes.

## Privacy and provenance constraints

- Every candidate and draft preserves source references, source kind, evidence
  ids, collection time, and captured field provenance.
- Raw provider payloads are not stored in product state.
- Empty, pending, unsupported source, unconfigured storage, and live storage
  failure states fail visibly through API envelopes.
- All live payloads set `privacy="live-external-contacts-import"` and
  `generationMethod="live-store-query"`.

## Replacement tests

The replacement tests keep the live review path aligned with the existing mock
contract before any real phone, Google, CSV, or customer-list provider is
enabled.

- `tests/capabilities/external-contacts-import-live-store.test.ts` proves live
  candidate and draft mapping, no contact/contactDraft writes, unconfigured
  fail-closed behavior, live factory registration, and API live-mode failure
  envelopes.
- `tests/capabilities/external-contacts-import-mock.test.ts` remains regression
  coverage for deterministic fixture behavior and the debug handoff surface.
