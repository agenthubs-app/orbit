# Shared Domain Contract Live Implementation Notes

## Live Service And Provider Files

- Keep the shared DTO skeletons in `shared/domain/contracts.ts`.
- Keep stable enum and source reference values in `shared/domain/source-types.ts`.
- Keep boundary validation helpers in `shared/domain/validators.ts`.
- Keep the read-only contract summary in `app/dev/foundation/domain/page.tsx` so developer/admin review can confirm which DTOs and provenance boundaries are active before mocks are integrated.
- Keep the route's current mode and provider status panel aligned with the active runtime mode so operators can see whether the domain contract is mock-only, hybrid, or live-backed.
- Future live capability providers should map provider payloads into these DTOs before page or route code consumes them. Candidate provider modules include account/profile providers, contact import providers, event providers, email/calendar signal providers, notification providers, and external action providers under their own future capability roots.

## Switch From Mock To Live

- Mock and live services must share these DTOs without changing page contracts.
- Capability factories should select mock, hybrid, or live providers through the existing `ORBIT_FEATURE_MODE` runtime mode boundary.
- Live providers should return the same DTO field names and must run contract validation before exposing records to route handlers or UI code.
- When a capability switches to hybrid or live mode, update its provider status copy on `/dev/foundation/domain` or a future capability-specific status surface before removing the mock-only warning.

## Required Environment Variables Or Permissions

- Real account/auth providers will require auth configuration and user identity permissions.
- Real contact imports will require contact-provider credentials and explicit user-granted import scope.
- Real OCR, QR, email, calendar, notification, external action, and AI providers will require provider-specific API keys, webhook secrets, and least-privilege OAuth scopes.
- No live secret is required for this mock-first sprint.

## Privacy And Provenance Constraints

- Every `RelationshipEvidenceDTO` must include `sourceType`, `sourceId`, `summary`, `occurredAt`, `confidence`, and `createdBy`.
- Every `ContactDTO` and `ConnectionDTO` must carry `source` and at least one `evidenceIds` reference.
- Live providers must preserve provider provenance without storing raw secrets, provider tokens, or unrelated message bodies in domain DTOs.
- Sensitive external actions must remain behind a confirmation guard and carry an evidence reference that explains why the action exists.

## Replacement Tests

- Add live-provider contract tests that feed redacted provider fixtures through mapper functions and assert these DTO validators pass.
- Add negative tests for missing evidence, missing source references, unknown enum values, and out-of-range evidence confidence.
- Add mode-switch tests proving mock and live providers return the same DTO envelope shape.
- Add developer-route tests proving `/dev/foundation/domain` continues to document the shared contract, current mode, provider status, source/provenance boundaries, and next integration step.
- Add privacy tests proving provider tokens, raw OAuth responses, and unrelated personal data are not emitted in DTOs or API envelopes.
