# Compose /app/contacts/new From Approved Capabilities

## Evaluator Evidence Summary

Live files: manual contact, business card scan, QR scan, event attendee import,
external contacts, email-calendar signals, referral recommendations, duplicate
merge suggestions, staged authorization, and contact draft queue APIs must move
from the listed `features/acquisition/*` and `features/permissions/*` mock
files to live providers behind their existing contract files.

Switch: keep `/app/contacts/new` consuming typed service factories and API
envelopes, then select mock or live through `shared/services/module-mode.ts`,
`shared/services/capability-registry.ts`, and the feature-mode boundary instead
of raw source records or page-local fixtures.

Env and permissions: live mode requires explicit address book, Google Contacts,
CSV upload, customer-list import, Gmail, Google Calendar, Microsoft Graph,
camera, upload, event roster, organizer/import authorization, referral consent,
and destructive merge confirmation permissions before those sources are read or
written.

Privacy and provenance: every candidate keeps source type, source label,
evidence ids, captured fields, and confirmation state; local previews keep
`data-action-evidence` and `data-side-effects="none"` until a confirmation guard
records explicit approval.

Replacement tests: preserve the production route test for authentication,
business-card availability, the action workspace, disabled unavailable sources,
and absence of page-load acquisition calls. Exercise live-mode service
contracts and mock/live API envelopes at their authenticated API boundaries,
and keep privacy regressions that fail when provider reads, writes, AI,
messages, notifications, merges, or contact persistence run without permission
and confirmation.

## Live Service/Provider Files

- Manual contact creation: replace `features/acquisition/service-factory.ts` behind `features/acquisition/manual-contract.ts`.
- Business card scan: replace `features/acquisition/service-factory.ts` behind `features/acquisition/business-card-contract.ts`.
- QR scan connect: replace `features/acquisition/service-factory.ts` behind `features/acquisition/qr-contract.ts`.
- Event attendee import: replace `features/acquisition/service-factory.ts` behind `features/acquisition/event-attendee-contract.ts`.
- External contacts import: replace `features/acquisition/service-factory.ts` behind `features/acquisition/external-import-contract.ts`.
- Email and calendar signals: replace `features/acquisition/service-factory.ts` behind `features/acquisition/email-calendar-contract.ts`.
- Referral recommendations: replace `features/acquisition/service-factory.ts` behind `features/acquisition/referral-contract.ts`.
- Duplicate detection and merge suggestions: replace `features/acquisition/service-factory.ts` behind `features/acquisition/merge-contract.ts`.
- Staged authorization: replace `features/permissions/service-factory.ts` behind `features/permissions/contract.ts`.
- Contact draft queue envelope: keep `app/api/contact-drafts/route.ts` and `app/api/permissions/route.ts` as API envelopes while their service factories switch.

## Switch Mechanism

The page renders the acquisition shell after authentication without accepting
search parameters or preflighting every child capability. Loading
`/app/contacts/new` must not run OCR, QR, attendee import, external contact
import, email/calendar reads, referral generation, merge analysis, or draft
confirmation. Each available source invokes its authenticated API only after an
explicit user action and owns its own error state.

The former `loadAppContactsNewRouteViewModel()` capability aggregator is
retired. It had no production caller, but retained URL-selected mock mode and
fixture scenarios, parallel page-load capability calls, and a
`action=confirm-manual-draft` GET confirmation branch. The historical module
path now exports nothing because the typed lint manifest still names it.
Sources without a connected and actor-scoped live provider are visibly disabled
rather than behaving like successful buttons.

Verification:

- `tests/pages/app-contacts-new-live-route-services.test.ts` proves the page
  requires authentication, does not accept search parameters, performs no
  acquisition preflight, and cannot regain the retired query-driven aggregator.

## Required Env Vars Or Permissions

- Contact imports require explicit address book, Google Contacts, CSV upload, or customer-list job permission before live reads.
- Email and calendar signals require user-approved Gmail, Google Calendar, or Microsoft Graph scopes before any message or event metadata is read.
- Business card scan requires camera or upload permission before image capture.
- QR scan requires camera permission before scan input.
- Event attendee import requires event roster access and organizer/import authorization.
- Referral recommendations require explicit consent before social graph, recommender context, or outreach data is used.
- Merge suggestions require explicit user confirmation before any destructive or persistent merge write.

## Privacy/Provenance Constraints

Every contact candidate must retain source type, source label, evidence ids, captured fields, and confirmation state. Live services must not ingest message bodies, device contacts, calendars, camera frames, uploads, external graphs, or customer lists unless the matching permission and confirmation state is present. Sensitive actions must stay preview-only until a confirmation guard records explicit user approval. The page's `data-action-evidence` and `data-side-effects="none"` attributes must remain true for local preview actions.

## Replacement Tests

- Keep `tests/pages/app-contacts-new-live-route-services.test.ts` asserting the authenticated route shell, business-card availability boundary, disabled unavailable sources, and absence of query-driven or page-load acquisition composition.
- Add live-mode service contract tests for each provider file proving envelope parity with the current contracts.
- Add API tests for `GET /api/contact-drafts` and `GET /api/permissions` in mock and live modes.
- Add source-specific UI state checks at the explicit action boundary rather than one aggregate route scenario switch.
- Add privacy tests that fail if live scans, imports, email/calendar reads, referral discovery, merge writes, messages, notifications, AI calls, or contact persistence run without permission and confirmation.
