# Compose App Profile Live Implementation

## Live Service/Provider Files

- `features/profile/service.ts` remains the typed boundary for reading profile data, scoring completeness, and applying manual profile edits.
- `features/profile/service-factory.ts` resolves manual profile, document extraction, and profile signal review services in `mock`, `hybrid`, or `live` mode.
- `features/profile/live-service.ts` reads generated `profiles` and `accounts` records from shared live storage and upserts explicit manual profile edits.
- `features/profile/live-signal-service.ts` reads generated profile, contact, connection, message, interaction-memory, and evidence records to produce review-only profile update suggestions.
- `features/profile/live-extraction-service.ts` is an explicit live policy provider. It returns empty resume/business-card extraction payloads with `live-policy-no-op` provenance until an approved OCR, parser, or AI extraction provider exists.
- `app/(app)/app/profile/compose-app-profile-from-previously-approved-mock-first-capabilities/profile-service-factory.ts` composes the three profile child services into the `/app/profile` route bundle.
- `app/api/profile/route.ts` and `app/api/profile/update-suggestions/route.ts` are the API evidence surfaces that should keep returning the shared success/failure envelope.

## Switch Mechanism

The route now resolves profile services through a route-local bundle. The bundle
passes the requested module mode into `features/profile/service-factory.ts`;
`ORBIT_MODULE_MODE=live` selects live profile reads, live signal suggestions,
and the live document-extraction policy provider. `hybrid` continues to inherit
mock behavior for providers that have not opted into a hybrid implementation.

`app/(app)/app/profile/page.tsx` now awaits `loadAppProfileRouteViewModel()`
directly. Successful route models are adapted through
`profile-view-model-adapter.ts` and rendered by `OrbitRealProfile`; loading,
empty, and failure states stay at the route boundary through `StateView`. This
keeps the product profile editor on the real UI while preserving the
live-capable service bundle and controlled failure behavior.

The current route action is `action=complete-profile-field`. It previews the
manual profile editor patch for the profile completeness field reported by the
profile service before any persistence or provider call can occur. Live mode
should keep that action on the profile editor provider and keep profile signal
suggestions as a separate review queue until the operator explicitly confirms a
save.

The visible action is a preferred-intro task for Ari Lane, the profile owner
shared by onboarding, document extraction, and update review. The route submits
the selected `preferredIntroChannels` values back to
`/app/profile?action=complete-profile-field` and renders only a local preview
that reflects the submitted channels, says the review panel is ready for
confirmation, says the profile was not saved, and says no outside service was
contacted. Live mode can replace the preview with a confirmed save only after
the profile editor provider records the source evidence, profile owner identity,
and privacy scope for the saved field.

The product route also uses route-scoped focus styling to keep generic workspace
shell account labels out of the `/app/profile` first view while the shared app
shell still contains mock-first account copy. A live shell can remove this
route-specific focus rule once the workspace owner identity and profile owner
identity are resolved from the same authenticated account context.

The success route also exposes route state checks for
`/app/profile?scenario=empty`, `/app/profile?scenario=pending`, and
`/app/profile?scenario=failure`. Live mode should keep equivalent state probes
at the route boundary so loading, empty, and failure views still render through
`StateView` without adding mock-only branches inside nested UI components.

The local action result carries
`data-action-evidence="complete-profile-field-local-preview"` and
`data-task-result="preferred-intro-channels-preview"` with
`data-side-effects="none"`. Live providers should keep those semantics: a
preview can be rendered repeatedly or after reload, but it must not persist the
profile, accept a suggestion, call external providers, or send messages until a
separate confirmed save path exists.

The product route should avoid user-facing implementation language while it is
still mock-first. Keep mock/provider terminology in service files, API context,
and this replacement document, but present `/app/profile` as a sourced profile
review surface with profile-owner identity, confirmation-review actions, and
plain-language local/no-outside-service status. The route should keep the
readiness split explicit: sourced identity, market, and relationship goals can
guide relationship decisions now; preferred intro channels and queued profile
suggestions stay blocked until Ari Lane confirms the save.

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
- Add a route regression proving the primary `/app/profile` action follows
  `completeness.nextBestField` and records no external side effects before the
  operator confirms a live save.
- Assert the editable intro-channel controls keep the same operator identity
  across onboarding, document extraction, and update review before writing any
  live profile field.
- Assert the route presents Ari Lane as the profile owner, not as an internal
  implementation actor, and that no visible success-state copy contains
  mock/provider terminology.
- Assert the preferred-intro action result says the review panel is ready for
  confirmation, the profile still requires explicit confirmation, outside
  services contacted remain none, the submitted channel values appear in the
  local preview, and the `data-side-effects="none"` marker is stable after
  reload and duplicate action submissions.
- Assert the route-specific shell focus keeps generic workspace-owner labels out
  of the profile first view until a live authenticated shell resolves the same
  user identity as the profile owner.
- Keep route state checks for success, empty, loading, and failure states in the
  route test output, including the `StateView` boundary marker and the
  `data-route-state-url`, `data-action-evidence`, and `data-task-result` local
  preview markers.

## Current Verification

- Focused profile tests passed:
  `tests/capabilities/profile-live-store.test.ts`,
  `tests/capabilities/profile-signal-review-live-store.test.ts`,
  `tests/pages/app-profile-live-route-services.test.ts`, and
  `tests/pages/orbit-hybrid-route-view-models.test.ts`.
- `npm run lint` and `npm run build` passed for the current workspace.
- Browser verification for `/app/profile` showed `data-orbit-real-page="profile"`
  once, no `.app-profile-route` command-center DOM, and no profile failure
  state on desktop or mobile viewports.
- Remote API validation for `/api/profile` returned `200`,
  `x-orbit-feature-mode: live`, profile owner `結城 航太郎`, organization
  `Orbit Generated Relationship Workspace`, and completeness score 100.
