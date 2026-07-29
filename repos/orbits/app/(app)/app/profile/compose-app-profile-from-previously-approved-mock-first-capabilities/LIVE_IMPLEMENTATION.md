# Compose App Profile Live Implementation

## Live Service/Provider Files

- `features/profile/service.ts` remains the typed boundary for reading profile data, scoring completeness, and applying manual profile edits.
- `features/profile/service-factory.ts` resolves manual profile, document extraction, and profile signal review services in `mock`, `hybrid`, or `live` mode.
- `features/profile/live-service.ts` reads generated `profiles` and `accounts` records from shared live storage and upserts explicit manual profile edits.
- `features/profile/live-signal-service.ts` reads generated profile, contact, connection, message, interaction-memory, and evidence records to produce review-only profile update suggestions.
- `features/profile/live-extraction-service.ts` extracts only explicitly labelled profile text and returns field-level evidence for review. Image OCR remains unavailable in this form and is routed to the contact Import hub; image-only API requests return an honest `live-policy-no-op`.
- `app/(app)/app/profile/compose-app-profile-from-previously-approved-mock-first-capabilities/profile-service-factory.ts` composes the three profile child services into the `/app/profile` route bundle.
- `app/api/profile/route.ts` and `app/api/profile/update-suggestions/route.ts` are the API evidence surfaces that should keep returning the shared success/failure envelope.

## Switch Mechanism

The route now resolves profile services through a route-local bundle. The bundle
passes the requested module mode into `features/profile/service-factory.ts`;
`ORBIT_MODULE_MODE=live` selects live profile reads, live signal suggestions,
and the live document-extraction policy provider. `hybrid` continues to inherit
mock behavior for providers that have not opted into a hybrid implementation.

`app/(app)/app/profile/page.tsx` resolves the authenticated actor and passes
only that actor to `loadAppProfileRouteViewModel()`. Successful route models are
adapted through
`profile-view-model-adapter.ts` and rendered by `OrbitRealProfile`; loading,
empty, and failure states stay at the route boundary through `StateView`. This
keeps the product profile editor on the real UI while preserving the
live-capable service bundle and controlled failure behavior.

The profile route has no query-driven action contract. Editing and persistence
belong to the explicit profile API path used by `OrbitRealProfile`; the page GET
only reads the authenticated actor's sourced profile, extraction state, and
review queue. Preferred intro channels come from the stored profile and cannot
be replaced by URL parameters. Profile signal suggestions remain a separate
review queue until the operator explicitly confirms a save.

The product route also uses route-scoped focus styling to keep generic workspace
shell account labels out of the `/app/profile` first view while the shared app
shell still contains mock-first account copy. A live shell can remove this
route-specific focus rule once the workspace owner identity and profile owner
identity are resolved from the same authenticated account context.

Controlled empty, pending, and failure states remain available through the
loader's explicit internal `controls.scenario` argument for tests and service
verification. The production page does not map public query parameters into
that control. This keeps `StateView` coverage without placing fixture selectors
or action-like behavior on a user-facing GET route.

The product route should avoid user-facing implementation language while it is
still mock-first. Keep mock/provider terminology in service files, API context,
and this replacement document, but present `/app/profile` as a sourced profile
review surface with profile-owner identity, confirmation-review actions, and
plain-language local/no-outside-service status. The route should keep the
readiness split explicit: sourced identity, market, and relationship goals can
guide relationship decisions now; preferred intro channels and queued profile
suggestions stay blocked until the authenticated profile owner confirms the
save.

## Required Env Vars Or Permissions

- Profile storage: database URL, service role or scoped user token, and authenticated operator identity.
- Document extraction: approved OCR/parser or AI provider credentials, file upload permission, file size/type limits, and retention controls.
- Signal review: permissioned access to chat summaries, activity events, contacts, email, and calendar sources.
- Live mode must fail closed when required credentials or user permissions are missing.

## Privacy/Provenance Constraints

- Every profile field, document draft, suggestion, and accepted patch must preserve source labels, evidence IDs, collection time, and privacy scope.
- Document contents and signal excerpts must be minimized before display and must not expose provider tokens, raw prompts, unrelated contacts, or unsourced profile mutations.
- Accepting an update suggestion must return an operator-reviewable patch first. It must not silently mutate the profile, send messages, deliver notifications, call external providers, or write unrelated records.
- External provider errors must use the shared API envelope and safe error context.

## Replacement Tests

- `tests/pages/app-profile-live-route-services.test.ts` proves `/app/profile` composes profile, extraction, and update review services in live mode, fails closed when storage is unconfigured, renders the real Orbit profile editor, and preserves editable identity fields needed by the product UI.
- `tests/capabilities/profile-document-extraction-live-policy.test.ts` proves the live document extraction provider is policy-only and never falls back to mock extraction.
- `tests/capabilities/profile-live-store.test.ts` proves live profile reads and manual profile saves preserve provenance.
- `tests/capabilities/profile-signal-review-live-store.test.ts` proves live profile signal suggestions return review-only patches without profile writes.
- Add API route tests for `GET /api/profile`, `PUT /api/profile`, `GET /api/profile/update-suggestions`, and suggestion acceptance failure paths.
- Add privacy regression tests for missing permissions, unsupported document types, redacted provider failures, and accepted-patch review before persistence.
- Keep the route regression proving public query parameters cannot select
  fixture states or change preferred intro channels, while explicit internal
  controls still cover empty, pending, and failure boundaries.
- Assert editable intro-channel controls use the authenticated actor identity
  across onboarding, document extraction, update review, and API readback before
  writing any live profile field.
- Assert the route presents the authenticated actor as the profile owner, not a
  fixture identity, and that no visible success-state copy contains
  mock/provider terminology.
- Assert the explicit API save path returns actor-scoped readback and repeated
  submissions remain idempotent; GET query parameters must never create a local
  preview or claim a save.
- Assert the route-specific shell focus keeps generic workspace-owner labels out
  of the profile first view until a live authenticated shell resolves the same
  user identity as the profile owner.
- Keep route state checks for success, empty, loading, and failure states in the
  route test output, including the `StateView` boundary and the explicit
  internal controls used to reach non-success states.

## Current Verification

- Profile-focused tests pass 10/10. The combined Profile, Home, Party, and
  Admin/Platform route regression passes 49/49.
- The complete Web suite passes 1355/1355 and the exact production build
  succeeds.
- The current query-isolation repair has source/build/full-suite evidence.
  Authenticated browser traversal and explicit profile API save/readback remain
  pending.
