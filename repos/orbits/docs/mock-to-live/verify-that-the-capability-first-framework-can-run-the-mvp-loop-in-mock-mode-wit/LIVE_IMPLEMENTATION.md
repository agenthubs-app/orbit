# Sprint 68 Mock-to-Live Handoff

This handoff covers the Sprint 68 acceptance loop that verifies Orbit can run the mock MVP relationship workflow without live services. The sprint does not replace mock services; it proves the framework boundary and documents how the same loop should move to live providers later.

## Live Service/Provider Files

Replace or wrap the current mock boundaries with live service/provider files in the existing capability folders:

- Bootstrap and shell aggregation: `features/bootstrap/service.ts`, `features/bootstrap/mock-service.ts`, and a future `features/bootstrap/live-service.ts`.
- OCR and contact acquisition: `features/acquisition/business-card-contract.ts`, `features/acquisition/mock-business-card-service.ts`, `features/acquisition/qr-contract.ts`, `features/acquisition/mock-qr-service.ts`, `features/acquisition/external-import-contract.ts`, `features/acquisition/mock-external-import-service.ts`, `features/acquisition/email-calendar-contract.ts`, and future provider adapters under `features/acquisition/providers/`.
- Recommendations and event workflow: `features/recommendations/service.ts`, `features/events/event-crud-and-import/service.ts`, and future event roster, recommendation, and opening-line provider adapters under `features/events/providers/` and `features/recommendations/providers/`.
- Connection and evidence: `features/connections/service.ts`, `features/connections/mock-service.ts`, `features/connections/mock-profile-service.ts`, and future live source/evidence stores under `features/connections/providers/`.
- Followups, AI draft, notifications, and chat summary: `features/followups/service.ts`, `features/followups/mock-message-draft-service.ts`, `shared/ai/provider.ts`, `shared/ai/mock-provider.ts`, `features/chat/service.ts`, `features/chat/mock-summary-service.ts`, `features/notifications/service.ts`, and future provider adapters under `features/followups/providers/`, `features/chat/providers/`, `features/notifications/providers/`, and `shared/ai/providers/`.
- Dashboard, audit, agent actions, and external action sandbox: `features/dashboard/service.ts`, `features/audit/mock-provenance-audit-service.ts`, `features/agent/service.ts`, `features/agent/mock-service.ts`, `features/agent/mock-external-action-sandbox.ts`, and future live services under `features/dashboard/providers/`, `features/audit/providers/`, and `features/agent/providers/`.

## Switch Mechanism

- Keep `ORBIT_FEATURE_MODE=mock` as the default for Milestone C.
- Add live routing through the existing service-factory pattern in `shared/services/module-mode.ts` and `shared/services/capability-registry.ts`.
- Each capability should expose the same contract interface used by the mock service. The app routes and API handlers should switch service implementations, not response shapes.
- Live mode should fail closed when required configuration is absent. Missing provider configuration must return the shared API envelope `{ success: false, error: { code, message } }`.
- `/dev/**` capability pages remain validation surfaces only. Product `/app/**` routes should continue consuming typed services and API envelopes.

## Required Env Vars Or Permissions

Live replacement will require explicit configuration and user permissions. Do not infer permission from stored mock state.

- `ORBIT_FEATURE_MODE=live` or `ORBIT_FEATURE_MODE=hybrid` to opt into non-mock services.
- OCR: `ORBIT_OCR_PROVIDER`, OCR API credentials, upload/storage configuration, and camera or upload permission.
- QR: camera permission or upload permission, QR decoder configuration, and validation key material if signed QR payloads are introduced.
- External contact import: Google Contacts or Microsoft Graph credentials and contact-read consent.
- Email-calendar signal: Gmail/Microsoft mail scopes, Google Calendar/Microsoft calendar scopes, and staged read consent.
- AI draft and chat summary: `ORBIT_AI_PROVIDER`, model credentials, prompt-template registry configuration, and per-workspace AI-processing consent.
- Notification: push/email/SMS provider credentials, notification delivery consent, quiet-hours policy, and unsubscribe controls.
- External action sandbox: message/calendar/notification provider credentials for future live sends, plus explicit confirmation records before any provider call.
- Dashboard and provenance audit: live database read permission, audit store configuration, and compliance reporting endpoint configuration.

## Privacy/Provenance Constraints

- Every Contact, Connection, Recommendation, Task, Chat update, Dashboard item, and AgentAction must keep a source or evidence link.
- The Milestone C success audit must remain a clean acceptance snapshot: `activeFindingCount: 0`, `findings: []`, and a user-visible zero-active-findings status. Live providers may expose nonzero findings only through replacement tests and review surfaces that preserve source and evidence links for each finding.
- Live providers must preserve `sourceRefs`, `evidenceIds`, provenance timestamps, generation methods, and privacy scope fields in the current DTOs.
- Sensitive actions require an explicit confirmation guard before any message send, calendar write, notification delivery, contact write, or profile mutation.
- The external action sandbox remains the required boundary for live external side effects. A confirmed action may enter live execution only after the sandbox records provider intent, actor, target, relationship context, and evidence.
- AI draft and chat summary providers must record prompt template id, source evidence ids, model/provider provenance, fallback behavior, and whether user-visible text was generated or extracted.
- Provenance audit results may identify stale or incomplete source references, but the acceptance loop must not allow records with no source and no evidence link.
- Harness evidence belongs under `harness-state/runs/<run-id>/sprint-68/iter-M/` or `harness-logs`, never under the app repo.

## Replacement Tests

When live providers are introduced, replace or extend the Sprint 68 checks with:

- Contract tests proving live services return the same typed payloads and shared API envelopes as the mock services.
- Provider-disabled tests proving missing env vars fail closed with no network, database write, notification, message send, calendar write, or device access.
- Permission tests for staged contacts, email, calendar, camera/upload, notifications, AI processing, and external message/calendar actions.
- End-to-end `/app/**` route tests for onboarding, business-card OCR or QR contact creation, event attendee recommendation, connection evidence, followup generation, chat summary extraction, dashboard update, and agent action confirmation.
- Provenance regression tests asserting no Contact, Connection, Recommendation, Task, Chat update, Dashboard item, or AgentAction is returned without a source or evidence link.
- External action sandbox tests proving no live provider call occurs before explicit confirmation and proving confirmed live sends create durable audit records.
- Harness acceptance tests that continue writing iteration artifacts only under `harness-state/runs` and logs only under `harness-logs`.

## Sprint 68 Evidence Mapping

- `tests/integration/mock-capability-loop.test.tsx` is the scripted acceptance run for the mock MVP loop.
- `scripts/manual-acceptance.md` is the operator script for browser/API evidence collection.
- `/app/contacts/new?action=confirm-manual-draft` must remain free of horizontal overflow at a 375 px viewport before this mock loop is considered accepted.
- `npm test`, `npm run lint`, and `npm run build` remain the release gates for this sprint.
