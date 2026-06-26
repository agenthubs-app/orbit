# External Contacts Import Mock Live Implementation

## Live service and provider files

- Keep `features/acquisition/external-import-contract.ts` as the typed DTO and error boundary for candidates, drafts, provenance, and API envelopes.
- Replace `features/acquisition/mock-external-import-service.ts` with `features/acquisition/external-contacts-import-mock/live-service.ts` once live providers are enabled.
- Add provider adapters under `features/acquisition/external-contacts-import-mock/providers/`:
  - `phone-address-book-provider.ts` for phone address book reads after explicit user permission.
  - `google-contacts-provider.ts` for Google Contacts reads after delegated contact permission.
  - `csv-import-provider.ts` for bounded CSV validation, sampling, and parser errors.
  - `existing-customer-list-provider.ts` for existing customer-list candidate imports from an approved customer source.

## Switch mechanism

- `ORBIT_EXTERNAL_CONTACTS_IMPORT_PROVIDER=mock` keeps the current deterministic fixture service active.
- `ORBIT_EXTERNAL_CONTACTS_IMPORT_PROVIDER=live` should route API handlers through `live-service.ts`.
- `hybrid` mode may use live candidate reads while contact writes, notifications, and production import jobs remain disabled until confirmation and provenance checks pass.
- The API routes at `/api/contact-drafts/external/import` and `/api/contact-drafts/external/candidates` should keep returning `{ success: true, data }` and `{ success: false, error }` envelopes.

## Required env vars or permissions

- `ORBIT_EXTERNAL_CONTACTS_IMPORT_PROVIDER` chooses mock, hybrid, or live behavior.
- `ORBIT_GOOGLE_CONTACTS_CLIENT_ID`, `ORBIT_GOOGLE_CONTACTS_CLIENT_SECRET`, and `ORBIT_GOOGLE_CONTACTS_REDIRECT_URI` are required before Google Contacts reads can run.
- Phone address book reads require explicit device/contact permission in the client surface before any provider adapter is called.
- CSV imports require file size, MIME type, row count, encoding, and header validation before parsing beyond a bounded preview.
- Existing customer-list imports require an approved customer source identifier and a read-only service credential scoped to candidate lookup.

## Privacy and provenance constraints

- Every candidate and draft must preserve `source`, `sourceKind`, evidence ids, collection time, and captured field provenance from the live provider payload.
- Phone address book, Google Contacts, CSV, and existing customer-list payloads cannot be stored as raw provider blobs in product state.
- Contact writes, follow-up creation, notifications, and production import jobs stay disabled until the user reviews the candidate and confirms the action.
- Empty, pending, unsupported source, and provider failure states must fail visibly through API envelopes instead of silently dropping records.
- Live services must never mix candidates from unapproved accounts or workspaces into the current user relationship graph.

## Replacement tests

The replacement tests must prove the live path preserves this mock boundary's
shape before any provider is enabled.

- Add contract tests for `features/acquisition/external-contacts-import-mock/live-service.ts` covering phone address book, Google Contacts, CSV, and existing customer-list candidate mapping.
- Add API route tests proving the live switch preserves envelope shapes, runtime boundary headers, empty state, pending state, unsupported source validation, and controlled provider failure mapping.
- Add privacy tests proving raw provider payloads are not exposed and every candidate carries source and evidence provenance.
- Add confirmation tests proving live contact writes, notifications, and production import jobs cannot execute from import routes without explicit review and confirmation.
- Keep the current mock tests as regression coverage for deterministic fixture behavior in mock mode.
