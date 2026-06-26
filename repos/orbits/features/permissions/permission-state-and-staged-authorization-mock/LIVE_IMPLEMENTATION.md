# Permission State And Staged Authorization Mock Live Implementation

## Live service and provider files

- Keep `features/permissions/service.ts` as the stable service interface and failure mapping layer.
- Keep `features/permissions/mock-service.ts` as the deterministic mock implementation for development and tests.
- Add `features/permissions/live-service.ts` for the live implementation once provider adapters exist.
- Add provider adapters under `features/permissions/providers/` for contacts, calendar, email, notifications, camera, business-card scan, event data, and chat analysis.
- Keep `app/api/permissions/route.ts` and `app/api/permissions/calendar/request/route.ts` pointed at the service boundary rather than directly importing provider SDKs.

## Switch mechanism

The current sprint always resolves `createMockPermissionStateService()` from route handlers and the debug view. Live mode should introduce a small factory that selects the mock or live service from `ORBIT_FEATURE_MODE`, then update both permission route handlers to call that factory. The default stays mock, and live mode must fail closed with an API envelope if any required provider config is missing.

## Debug review surface

The debug view includes a `Run staged calendar review` form that posts to `/api/permissions/calendar/request` and renders the mock API envelope instead of starting OAuth, browser permission prompts, camera access, notifications, or provider authorization. In live mode, the form action must move behind the same explicit confirmation guard as the production calendar workflow before it can resolve to a provider adapter.

## Required env vars and permissions

- `ORBIT_FEATURE_MODE=live` to opt into live service selection.
- `ORBIT_PERMISSION_AUTH_PROVIDER` to identify the authorization broker used by the live service.
- `ORBIT_CONTACTS_PROVIDER`, `ORBIT_CALENDAR_PROVIDER`, `ORBIT_EMAIL_PROVIDER`, and `ORBIT_NOTIFICATION_DELIVERY_PROVIDER` for provider-specific adapters.
- Browser permission prompts for camera and notifications must be initiated only after explicit user confirmation in the product workflow.
- Provider authorization for contacts, calendar, email, event data, and chat analysis must request the narrowest scopes needed for the active workflow.

## Privacy and provenance constraints

- Preserve source and evidence provenance on every permission state, staged request, failure envelope, and downstream relationship action.
- Do not expose raw access tokens, provider refresh tokens, provider error bodies, contact payloads, email bodies, calendar bodies, chat bodies, image data, or notification payloads in dev routes or API errors.
- Store only the minimum authorization state required for the active workflow, with clear revocation and re-request behavior.
- Sensitive actions must continue to route through explicit confirmation before live service calls can mutate external state or deliver messages.

## Replacement tests

- Replace the mock-only API tests with factory tests that prove mock mode still returns the existing deterministic envelopes.
- Add live-mode tests for missing env vars, denied browser permission prompts, rejected provider authorization, revoked account access, and dependency-blocked business-card scan.
- Add contract tests proving live responses preserve source and evidence provenance for contacts, calendar, email, notifications, camera, business-card scan, event data, and chat analysis states.
- Add route tests for `app/api/permissions/route.ts` and `app/api/permissions/calendar/request/route.ts` that verify provider failures map to safe API envelopes without leaking raw provider details.
- Add UI tests for the permission review surface that prove users see success, empty, pending, failure, denied, and revoked states before any external action can continue.
