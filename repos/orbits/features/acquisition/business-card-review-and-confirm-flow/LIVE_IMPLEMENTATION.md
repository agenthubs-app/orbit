# Business Card Review And Confirm Flow Live Implementation

## Live service and provider files

- Keep the public contract in `features/acquisition/business-card-review-contract.ts`.
- Keep the mock in `features/acquisition/mock-business-card-review-service.ts` for deterministic fixture coverage.
- The storage-backed live service is `features/acquisition/live-business-card-review-service.ts`.
- The live record mapper is `features/acquisition/storage/business-card-review-live-record-provider.ts`.
- Keep route ownership in `app/api/contact-drafts/[id]/route.ts` for review updates and `app/api/contact-drafts/[id]/confirm/route.ts` for confirmation.

## Switch mechanism

- `ORBIT_MODULE_MODE=live` or explicit factory mode selects the live service through `features/acquisition/service-factory.ts`.
- The default runtime stays mock-first. Live mode fails closed with `BUSINESS_CARD_REVIEW_LIVE_STORE_UNCONFIGURED` when shared live storage is absent.
- The switch must happen in the service factory layer, not inside the debug page.
- Human review stays between OCR extraction and contact creation.

## Required env vars and permissions

- Uses the same shared live storage configuration as other storage-backed capabilities: `ORBIT_EVENT_DATABASE_URL`, `ORBIT_LIVE_DATABASE_URL`, or `ORBIT_DATABASE_URL`, plus `ORBIT_WORKSPACE_ID`.
- The first live version reads `contacts` and `evidence` records where the contact source is `business_card_ocr`.
- It does not request device camera, OCR provider, user email, calendar, notification, AI provider, or external network permissions.

## Privacy and provenance constraints

- Every reviewed field keeps source and evidence provenance from the live business-card contact record.
- The live service must record who reviewed the fields, what changed, and which evidence ids supported the decision.
- Contact creation must stay behind explicit confirmation. Review updates and confirmation previews do not write `contacts` or `contactDrafts`.
- API envelopes must not expose raw provider errors, credentials, or unrelated relationship data.
- Field edits must preserve source and evidence provenance when the contact candidate is handed to downstream contact creation.

## Replacement tests

- `tests/capabilities/business-card-review-live-store.test.ts` covers storage mapping, review preview, confirmation preview, unconfigured live storage, factory registration, and API live-mode failure envelopes.
- `tests/capabilities/business-card-review-and-confirm-flow.test.ts` keeps the existing mock contract, API, and debug route behavior stable.
- Future provider-backed OCR tests should live with `business-card-scan-ocr`, not this review boundary.

## Live handoff evidence excerpts

- Provider adapters live under `features/acquisition/storage/business-card-review-live-record-provider.ts`.
- `ORBIT_MODULE_MODE=live` switches the review boundary from mock to live through the service factory.
- Human review stays between OCR extraction and contact creation.
- Replacement tests cover review, confirm, privacy, and debug states.
- Remote smoke against `workspace:orbit-dev` reviewed and confirmed `business-card-review:live:contact_012` for `山田 千尋` with `databaseWriteExecuted=false`; remote `contacts` stayed at 66 and `contactDrafts` stayed at 1.
