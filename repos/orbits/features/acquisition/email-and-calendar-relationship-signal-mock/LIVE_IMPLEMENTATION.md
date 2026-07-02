# Email And Calendar Relationship Signal Live Implementation

## Live service and provider files

- `features/acquisition/email-calendar-contract.ts` remains the typed DTO,
  error, provenance, permission, confirmation, and API envelope boundary.
- `features/acquisition/live-email-calendar-service.ts` is the live review
  service. It derives relationship signals from seeded live conversations and
  messages without calling Gmail, Google Calendar, or Microsoft Graph.
- `features/acquisition/storage/email-calendar-live-record-provider.ts` reads
  `contacts`, `conversations`, `messages`, and `evidence` from the shared
  `orbit_records` store.
- `features/acquisition/service-factory.ts` registers `email-calendar-signal`
  for `live` mode through the configured Postgres live record store.

## Switch mechanism

- `ORBIT_MODULE_MODE=mock` keeps the deterministic fixture service active.
- `ORBIT_MODULE_MODE=live` routes
  `/api/relationship-signals/email-calendar` and
  `/api/relationship-signals/[id]/confirm` through the live service.
- `ORBIT_MODULE_MODE=hybrid` still follows module-mode fallback policy and
  should not be treated as a partial Gmail or calendar provider sync path.
- The contacts-new workbench remains pinned to mock email/calendar signals
  because that page still composes acquisition cards synchronously.

## Live data boundary

- The live path treats seeded `conversations` and `messages` as already
  ingested metadata inside Orbit's live record store.
- `contacts` are read to attach display names, roles, and organizations.
- `evidence` records provide review excerpts and confidence; raw provider
  payloads are not stored in product state.
- Conversation channel maps to existing source kinds:
  - `email` -> `gmail`
  - `calendar` -> `google_calendar`
  - `chat` and `note` -> `microsoft_graph`
- The provider keeps `live-record-store.ts` generic. Field-specific validation
  and mapping live in the acquisition storage provider and service.

## Not implemented yet

- No Gmail API request is executed.
- No Google Calendar API request is executed.
- No Microsoft Graph request is executed.
- No background sync job is enqueued.
- No message body ingestion is executed by this service.
- No relationship, contact, contactDraft, notification, task, email, or external
  action write is executed from these routes.

## Privacy and provenance constraints

- Every signal preserves source references, source kind, permission state,
  confirmation state, evidence ids, collection time, and captured field
  provenance.
- Live payloads set `privacy="live-email-calendar-signals"`.
- List payloads set `generationMethod="live-store-query"`.
- Confirmation payloads set `generationMethod="live-store-confirmation"`.
- Empty, pending, blocked confirmation, missing signal, unconfigured storage,
  and live storage failure states fail visibly through API envelopes.

## Replacement tests

The replacement tests keep the live review path aligned with the existing mock
contract before any real Gmail, Google Calendar, or Microsoft Graph provider is
enabled.

- `tests/capabilities/email-calendar-signal-live-store.test.ts` proves live
  signal mapping, no relationship/contactDraft writes, confirmation preview,
  unconfigured fail-closed behavior, live factory registration, and API
  live-mode failure envelopes.
- `tests/capabilities/email-and-calendar-relationship-signal-mock.test.ts`
  remains regression coverage for deterministic fixture behavior and the debug
  handoff surface.
