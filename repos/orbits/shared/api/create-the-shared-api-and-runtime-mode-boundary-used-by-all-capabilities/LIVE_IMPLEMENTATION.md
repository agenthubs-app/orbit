# Live Implementation Notes

This sprint keeps the API envelope, app error mapping, feature mode resolver, and health routes mock-first. No live provider is called from these files.

## Current Boundary Files

- `shared/api/envelope.ts` owns the API response shape: `{ success: true, data }` and `{ success: false, error: { code, message, context? } }`. The optional context is route-supplied, non-sensitive runtime context for operational debugging only; empty context is omitted so callers do not serialize meaningless placeholders. It also exposes `runtimeBoundaryHeaders()` so route handlers use one shared developer/admin header boundary.
- `shared/errors/app-error.ts` owns typed application error codes and the HTTP status map used by route handlers.
- `shared/config/feature-mode.ts` owns runtime mode resolution for `mock`, `hybrid`, and `live`; `DEFAULT_FEATURE_MODE` codifies `mock` as the safe fallback.
- `app/api/health/route.ts` reports the resolved runtime mode and mock-to-live path through the success envelope.
- `app/api/health/error/route.ts` returns a deterministic failure envelope for error-path probes.

## Developer/Admin Boundary

The health routes are operational probes for developers and administrators. They do not replace a browser-facing Orbit relationship workflow and should not expose private relationship records, provider payloads, or next-action recommendations. Any future public status surface should consume a separate capability DTO that preserves source and evidence provenance.

The probes also set explicit runtime boundary headers through `runtimeBoundaryHeaders()` and the shared `RUNTIME_BOUNDARY_HEADER_VALUES` constants: `x-orbit-runtime-boundary: developer-admin`, `x-orbit-feature-mode`, `x-orbit-privacy: no-relationship-data`, `cache-control: no-store`, `cdn-cache-control: no-store`, and `vercel-cdn-cache-control: no-store`. These headers make the raw JSON API response survivable for debugging without pretending it is a participant or organizer relationship workflow. Failure probes may include matching non-sensitive runtime context, such as service, mode, boundary, privacy, provenance, and remediation guidance, but must not include provider payloads, prompts, contact data, credentials, or user identifiers.

The success probe also includes a `boundary.mockToLive` note and a structured `boundary.modeTransition` object so raw API consumers can find the switch mechanism without guessing from source code. `boundary.modeTransition.allowedModes` lists `mock, hybrid, or live`; the same object states the default fallback, the `ORBIT_MODULE_MODE` switch, the older `ORBIT_FEATURE_MODE` fallback, the provider factory rule, and live-mode guardrails. Those fields must stay operational and non-sensitive: they may name `ORBIT_MODULE_MODE`, `ORBIT_FEATURE_MODE`, capability factories, `resolveFeatureMode()`, and these live implementation notes, but capability code must not branch on raw environment strings and must not expose provider payloads, contact records, prompts, credentials, or user identifiers.

Both health route handlers also export `dynamic = "force-dynamic"` so the runtime mode boundary is evaluated per request instead of being captured by a static build artifact.

## Live Service And Provider Files

Future live capability providers should live outside page components and import this boundary instead of redefining response or error shapes. Expected provider families:

- `shared/services/<capability>/mock-*.ts` for deterministic mock providers.
- `shared/services/<capability>/live-*.ts` for Supabase, auth, OCR, email/calendar, notification, analytics, or AI-backed providers.
- `shared/services/<capability>/index.ts` or a capability-specific factory for choosing mock, hybrid, or live providers from `resolveFeatureMode()`.
- `app/api/<capability>/route.ts` files for HTTP entry points that serialize provider results with `success()`, provider errors with `failure()`, and operational probes with `runtimeBoundaryHeaders()`.

## Switch Mechanism

`ORBIT_MODULE_MODE` is the primary runtime switch for module and API provider selection. `ORBIT_FEATURE_MODE` remains a fallback for older scripts, and `DEFAULT_FEATURE_MODE` keeps the final fallback deterministic.

- Missing, empty, or unknown values resolve to `mock`; route-level probes cover invalid `ORBIT_FEATURE_MODE` input so bad deploy-time configuration cannot silently switch the runtime boundary away from deterministic mocks.
- `mock` uses deterministic local providers only.
- `hybrid` may combine live reads with mock-only external or sensitive actions.
- `live` may use real providers once each capability has explicit privacy, provenance, confirmation, and replacement-test coverage.

Pages and route handlers should call capability factories that use `resolveFeatureMode()`; they should not branch on raw environment strings. If both `ORBIT_MODULE_MODE` and `ORBIT_FEATURE_MODE` are set, `ORBIT_MODULE_MODE` wins so API headers and service factories report the same runtime mode.

## Required Environment Variables And Permissions

This sprint requires no secrets or platform permissions. Future live providers must document and validate their own variables before use. Expected variable names should stay Orbit-scoped and provider-specific, such as:

- `ORBIT_SUPABASE_URL` and `ORBIT_SUPABASE_SERVICE_ROLE_KEY` for Supabase URL and service keys used by live account, contact, and relationship storage.
- `ORBIT_AUTH_CLIENT_ID` plus the capability's documented auth provider settings for user identity and session validation.
- `ORBIT_OCR_PROVIDER_API_KEY` for OCR or QR provider credentials used by document and badge capture.
- `ORBIT_EMAIL_CALENDAR_OAUTH_SCOPES` for the Email and calendar OAuth scopes permitted for signal ingestion.
- `ORBIT_NOTIFICATION_PROVIDER_API_KEY` for notification or messaging provider credentials used by confirmed external actions.
- `ORBIT_AI_PROVIDER_API_KEY` for AI provider keys used by analysis, drafting, or summarization.

Live providers must fail with typed `AppError` values when required configuration or permissions are missing.

## Privacy And Provenance Constraints

- Every contact, connection, recommendation, task, chat update, dashboard item, and agent action returned through the API must include source or evidence provenance at the capability DTO level.
- Sensitive external actions must remain behind explicit confirmation and an external action sandbox before live delivery is enabled.
- Failure envelopes must expose stable application codes, safe messages, and only route-approved non-sensitive runtime context. Raw provider errors, credentials, prompts, and private user data must not be serialized; unexpected provider failures should be converted through `AppError`/`SAFE_INTERNAL_ERROR_MESSAGE` before calling `failure()`.
- Remediation guidance in failure probes must point operators toward configuration, shared envelope usage, privacy checks, or provider selection; it must not expose relationship records, provider payloads, prompts, tokens, or user identifiers.
- Hybrid mode must clearly mark which records came from live providers and which came from deterministic mocks.

## Replacement Tests

Before any capability switches from mock to live, add tests that prove:

- The route still returns the shared success and failure envelope shapes, including any explicit non-sensitive runtime context on failure probes.
- Missing provider configuration maps to a deterministic `AppError` and HTTP status.
- Mock, hybrid, and live modes choose the expected provider implementation.
- Live-provider DTOs preserve source/evidence provenance.
- Sensitive live actions require confirmation before any provider side effect.
- Route-level tests cover both successful provider output and provider failure output without leaking raw provider details.
- Shared boundary tests continue to assert `DEFAULT_FEATURE_MODE`, `RUNTIME_BOUNDARY_HEADER_VALUES`, and exact health-route failure envelopes so live changes cannot silently alter the runtime contract.
- Health route replacement tests cover `ORBIT_MODULE_MODE` precedence, invalid `ORBIT_FEATURE_MODE` fallback values, and all no-store cache headers before any live provider can depend on those probes.
