# Permission State And Staged Authorization Mock Live Implementation

## Live service and provider files

- Keep `features/permissions/service.ts` as the stable service interface and failure mapping layer.
- Keep `features/permissions/mock-service.ts` as the deterministic mock implementation for development and tests.
- `features/permissions/live-service.ts` now provides a remote live storage backed staged authorization implementation.
- `features/permissions/storage/permission-live-record-provider.ts` reads the `permissions` collection from shared live record storage and maps records into `PermissionStateDTO`.
- Future provider adapters should still live under `features/permissions/providers/` or a similarly explicit boundary for contacts, calendar, email, notifications, camera, business-card scan, event data, and chat analysis.
- Keep `app/api/permissions/route.ts` and `app/api/permissions/calendar/request/route.ts` pointed at the service boundary rather than directly importing provider SDKs.

## Switch mechanism

The switch is centralized in `features/permissions/service-factory.ts`. Mock mode resolves `createMockPermissionStateService()`. Live mode resolves `createLivePermissionStateService()` with a configured live record store provider. The default stays mock, and live mode fails closed with a `PERMISSION_STATE_LIVE_STORE_UNCONFIGURED` API envelope when storage configuration is absent.

## Debug review surface

The debug view includes a `Run staged calendar review` form that posts to `/api/permissions/calendar/request` and renders the mock API envelope instead of starting OAuth, browser permission prompts, camera access, notifications, or provider authorization. In live mode, the form action must move behind the same explicit confirmation guard as the production calendar workflow before it can resolve to a provider adapter.

## Required env vars and permissions

- `ORBIT_MODULE_MODE=live` or `ORBIT_FEATURE_MODE=live` to opt into live service selection.
- `ORBIT_EVENT_DATABASE_URL`, `ORBIT_LIVE_DATABASE_URL`, or `ORBIT_DATABASE_URL`, plus optional `ORBIT_WORKSPACE_ID`, for the current remote live storage backed implementation.
- `ORBIT_PERMISSION_AUTH_PROVIDER` to identify the authorization broker used by a future provider-backed live service.
- `ORBIT_CONTACTS_PROVIDER`, `ORBIT_CALENDAR_PROVIDER`, `ORBIT_EMAIL_PROVIDER`, and `ORBIT_NOTIFICATION_DELIVERY_PROVIDER` for provider-specific adapters.
- Browser permission prompts for camera and notifications must be initiated only after explicit user confirmation in the product workflow.
- Provider authorization for contacts, calendar, email, event data, and chat analysis must request the narrowest scopes needed for the active workflow.

## Privacy and provenance constraints

- Preserve source and evidence provenance on every permission state, staged request, failure envelope, and downstream relationship action.
- Do not expose raw access tokens, provider refresh tokens, provider error bodies, contact payloads, email bodies, calendar bodies, chat bodies, image data, or notification payloads in dev routes or API errors.
- Store only the minimum authorization state required for the active workflow, with clear revocation and re-request behavior.
- Sensitive actions must continue to route through explicit confirmation before live service calls can mutate external state or deliver messages.
- The current live storage provider may map lower-level capability strings such as `relationship_local_remote_database` into product UI capabilities such as `event-data`; this mapping belongs in the permission feature, not in the generic storage envelope.

## Replacement tests

- `tests/capabilities/permission-state-live-store.test.ts` proves live storage mapping, unconfigured fail-closed behavior, live factory registration, and `/api/permissions` live-mode failure envelopes.
- Keep mock API tests proving mock mode still returns the existing deterministic envelopes.
- Future provider-backed live tests should cover denied browser permission prompts, rejected provider authorization, revoked account access, and dependency-blocked business-card scan.
- Add contract tests proving live responses preserve source and evidence provenance for contacts, calendar, email, notifications, camera, business-card scan, event data, and chat analysis states.
- Add route tests for `app/api/permissions/route.ts` and `app/api/permissions/calendar/request/route.ts` that verify provider failures map to safe API envelopes without leaking raw provider details.
- Add UI tests for the permission review surface that prove users see success, empty, pending, failure, denied, and revoked states before any external action can continue.
