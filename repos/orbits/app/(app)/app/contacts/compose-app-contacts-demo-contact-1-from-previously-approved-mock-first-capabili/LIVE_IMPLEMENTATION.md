# Live Implementation Notes

Sprint 61 composes `/app/contacts/demo-contact-1` from approved mock-first capability boundaries. The route adapter is `contact-detail-route-service.ts`; the page is `app/(app)/app/contacts/[id]/page.tsx`.

## Evaluator Evidence Summary

- Route state checks: `/app/contacts/demo-contact-1`, `/app/contacts/demo-contact-1?scenario=empty`, `/app/contacts/demo-contact-1?scenario=pending`, and `/app/contacts/demo-contact-1?scenario=failure`.
- API probes: `GET /api/contacts/demo-contact-1`, `GET /api/connections/demo-connection-1`, and `GET /api/analysis/relationship-value/demo-connection-1`.
- Follow-up action evidence: `data-action-result="contact-detail-follow-up-prepared"`, `data-action-evidence="evidence:connection-added-manual-note"`, and `data-side-effects="none"`.

## Live files:

- Contact detail live service/provider files should replace `features/contacts/service-factory.ts` behind the `ContactDetailTagStatusService` contract in `features/contacts/detail-contract.ts`.
- Connection and evidence live service/provider files should replace `features/connections/service-factory.ts` behind `ConnectionEvidenceService` in `features/connections/service.ts` and the DTOs in `features/connections/contract.ts`.
- Relationship value live service/provider files should replace `features/analysis/service-factory.ts` behind `RelationshipValueScoringService` in `features/analysis/value-contract.ts`.
- API routes remain the provider boundary: `app/api/contacts/[id]/route.ts`, `app/api/connections/[id]/route.ts`, and `app/api/analysis/relationship-value/[id]/route.ts`.
- Product composition remains in `app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-route-service.ts`; nested UI should not import fixtures directly.

## Switch:

- The switch mechanism is the shared module factory in `shared/services/module-mode.ts`.
- Add `hybrid` or `live` constructors to the three route-owned service factories in `contact-detail-route-service.ts`.
- Keep `ORBIT_MODULE_MODE=mock` or `ORBIT_FEATURE_MODE=mock` as the default until live contact, evidence, and scoring providers are available together.
- A live switch must preserve the same API envelope shape: `{ success: true, data }` and `{ success: false, error: { code, message } }`.

## Env and permissions:

- Required env vars or permissions for live contact detail: authenticated contact-store read/write scope, tag/status update scope, and user-level audit metadata.
- Required env vars or permissions for live connection evidence: evidence-store read/write scope, source-link read scope, and event/email/calendar evidence read scopes only after explicit user authorization.
- Required env vars or permissions for live relationship value: scoring service credentials or internal ranking job access, with no AI provider call unless the provider is explicitly enabled and provenance is recorded.
- The route action must remain confirmation-gated before any live email, calendar, notification, CRM, database write, or external message delivery side effect is allowed.

## Privacy and provenance:

- Privacy/provenance constraints:
- Every rendered contact, status, tag, connection reason, evidence timeline item, value score, and suggested next action must keep source labels and evidence ids.
- Privacy and provenance constraints require the page to show relationship context without exposing unrelated contacts, hidden email bodies, calendar attendees, or provider credentials.
- The prepare-follow-up action currently records `data-action-evidence` and `data-side-effects="none"`; a live action must replace that with a confirmation record, user id, target provider, and durable audit evidence.
- Failure and pending states must not retry provider calls automatically or hide partial provenance.

## Replacement tests:

- Keep `tests/pages/app-contacts-demo-contact-1-page.test.tsx` and replace only the service factory mode under test when live providers exist.
- Add contract tests for live contact detail, connection evidence, and relationship value providers using the same DTO shapes as the mock services.
- Add route state checks for success, empty, pending, and failure using the shared `StateView` boundary.
- Add replacement tests proving a live confirmed follow-up action writes exactly one audit record and that unconfirmed route actions still report `data-side-effects="none"`.
- Keep API envelope replacement tests for `GET /api/contacts/demo-contact-1`, `GET /api/connections/demo-connection-1`, and `GET /api/analysis/relationship-value/demo-connection-1`.
