# Compose App Profile Live Implementation

## Live Service/Provider Files

- `features/profile/service.ts` remains the typed boundary for reading profile data, scoring completeness, and applying manual profile edits.
- `features/profile/service-factory.ts` is the current mock provider used by `/app/profile`; replace it with a live provider such as `features/profile/live-service.ts` when real account storage exists.
- `features/profile/service-factory.ts` is the current document extraction provider; replace it with a live provider such as `features/profile/live-extraction-service.ts` when OCR, parsing, or AI extraction is approved.
- `features/profile/service-factory.ts` is the current profile update review provider; replace it with a live provider such as `features/profile/live-signal-service.ts` when chat, activity, contact, email, or calendar signals are live.
- `app/api/profile/route.ts` and `app/api/profile/update-suggestions/route.ts` are the API evidence surfaces that should keep returning the shared success/failure envelope.

## Switch Mechanism

The route currently imports mock service factories directly so Sprint 58 stays mock-first and deterministic. The live switch should move provider selection into profile service factories that call `resolveFeatureMode()`, default to mock mode, and choose mock, hybrid, or live providers without branching inside nested UI components.

`app/(app)/app/profile/page.tsx` should continue to render the route adapter. Only the adapter or a route-local factory should change from mock factories to feature-mode-aware providers.

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

- Replace the route test's mock service assertions with factory-mode assertions that prove `/app/profile` composes the same profile, extraction, and update review contracts in mock, hybrid, and live modes.
- Add provider tests for live profile reads, current-field manual profile saves, document extraction, and suggestion acceptance with provenance preserved.
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
