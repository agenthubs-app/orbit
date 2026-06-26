# Business Card Review And Confirm Flow Live Implementation

## Live service and provider files

- Keep the public contract in `features/acquisition/business-card-review-contract.ts`.
- Keep the mock in `features/acquisition/mock-business-card-review-service.ts` until live replacement tests pass.
- Add the live service at `features/acquisition/business-card-review-and-confirm-flow/live-service.ts`.
- Add provider adapters under `features/acquisition/business-card-review-and-confirm-flow/providers/`.
- Keep route ownership in `app/api/contact-drafts/[id]/route.ts` for review updates and `app/api/contact-drafts/[id]/confirm/route.ts` for confirmation.

## Switch mechanism

- `ORBIT_BUSINESS_CARD_REVIEW_PROVIDER` selects the provider-backed review service.
- The default runtime stays mock-first. Live mode must fail closed when the provider env var is absent.
- The switch must happen in the service factory layer, not inside the debug page.
- Human review stays between OCR extraction and contact creation.

## Required env vars and permissions

- `ORBIT_BUSINESS_CARD_REVIEW_PROVIDER` names the live provider adapter.
- `ORBIT_CONTACT_DRAFT_STORE_URL` or an equivalent internal draft store endpoint is required before live review state can persist.
- `ORBIT_CONTACT_DRAFT_STORE_TOKEN` or an equivalent scoped credential is required for server-side writes.
- Live review may require access to the OCR draft store, but it must not request device camera, user email, calendar, notification, or AI provider permissions.

## Privacy and provenance constraints

- Every reviewed field must keep the source and evidence provenance from the OCR draft.
- The live service must record who reviewed the fields, what changed, and which evidence ids supported the decision.
- Contact creation must stay behind explicit confirmation. Review updates cannot write contact records.
- API envelopes must not expose raw provider errors, credentials, or unrelated relationship data.
- Field edits must preserve source and evidence provenance when the contact candidate is handed to downstream contact creation.

## Replacement tests

- Add route tests for `PATCH /api/contact-drafts/[id]` covering success, empty, validation, missing draft, and provider failure.
- Add route tests for `POST /api/contact-drafts/[id]/confirm` covering reviewed confirmation, pending review conflict, blocked confirmation, and provider failure.
- Add service tests proving the live adapter does not call email, calendar, notification, AI, device, or unrelated external services.
- Add privacy tests proving source and evidence provenance survive review and confirmation.
- Add debug route tests proving success, empty, pending, and failure states still render from the selected service.

## Live handoff evidence excerpts

- Provider adapters live under `features/acquisition/business-card-review-and-confirm-flow/providers/`.
- `ORBIT_BUSINESS_CARD_REVIEW_PROVIDER` switches the review boundary from mock to live.
- Human review stays between OCR extraction and contact creation.
- Replacement tests cover review, confirm, privacy, and debug states.
