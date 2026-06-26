# Capability Service Registry Live Implementation Notes

Sprint 7 creates the shared service switch for mock, hybrid, and live capability
implementations. The current registry intentionally registers mock and
mock-backed hybrid constructors only. Live mode returns a controlled
`NOT_IMPLEMENTED` failure until each capability has a reviewed live provider.

## Live service and provider files

Add live provider files beside each future capability service, not inside pages
or route handlers. The expected shape is:

- `shared/services/<capability>/mock-service.ts`
- `shared/services/<capability>/hybrid-service.ts`
- `shared/services/<capability>/live-service.ts`
- `shared/services/<capability>/provider.ts`
- `shared/services/<capability>/mappers.ts`
- `shared/services/<capability>/validators.ts`
- `app/api/<capability>/.../route.ts`

Route handlers and pages should call `createCapabilityService` or a
capability-specific wrapper that delegates to the registry. They should not
branch on provider environment variables directly and should not import raw
fixtures.

## Switch mechanism

`shared/services/module-mode.ts` defines `ModuleMode` as `mock`, `hybrid`, and
`live`. The default is `mock`.

Use `ORBIT_MODULE_MODE` for capability service mode selection. If it is missing
or invalid, the resolver falls back to `ORBIT_FEATURE_MODE`, then to `mock`.
Capability factories may also receive an explicit mode from tests or route
setup. A live constructor must be registered in
`shared/services/capability-registry.ts` before live mode can return a service.

Until a live constructor exists, requesting `live` must return:

```json
{
  "success": false,
  "error": {
    "code": "NOT_IMPLEMENTED"
  }
}
```

## Required env vars and permissions

Do not add real provider configuration during Milestone C. Future live services
must document and validate their own environment variables before use, such as:

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, or future database credentials.
- OAuth client ids, secrets, redirect URIs, and scopes for email, calendar, and
  contact providers.
- OCR, QR, AI, notification, or analytics provider keys.
- Explicit user permissions for contacts, email, calendar, notifications, and
  external message delivery.

Provider setup must fail visibly when required configuration or permission is
missing. It must not fall through to partial live behavior.

## Privacy and provenance constraints

Live providers must map provider payloads into Orbit DTOs that preserve source
type, source id, evidence ids, timestamps, confidence, and creator identity.
Sensitive actions such as sending messages, scheduling reminders, delivering
notifications, or confirming agent actions must stay behind the confirmation
guard before any external side effect.

Provider payloads, prompts, access tokens, private notes, and raw relationship
context must not appear in debug pages. Debug surfaces may show capability ids,
mode, route metadata, non-sensitive status, and replacement readiness.

## Replacement tests

Each live provider replacement must add tests before enabling live mode:

- Unit tests for provider mappers that preserve source and evidence provenance.
- Factory tests proving `mock`, `hybrid`, and `live` select the expected
  constructor and return controlled failures for missing configuration.
- Route handler tests proving API responses use the shared envelope and never
  expose raw provider errors or secrets.
- Confirmation-guard tests for every external or sensitive action path.
- Privacy tests proving debug pages omit raw provider payloads, prompts, tokens,
  and private relationship notes.

## Operator migration checklist

Use this sequence when replacing a mock-backed capability with a live provider:

- Create the capability's `live-service.ts`, `provider.ts`, `mappers.ts`, and
  `validators.ts` files beside the existing service boundary.
- Document and validate required env vars, provider permissions, OAuth scopes,
  and user consent before the live constructor can return a service.
- Register the live constructor in `shared/services/capability-registry.ts`;
  do not select a live provider directly from a page or route handler.
- Switch mode with `ORBIT_MODULE_MODE=live` or an explicit test setup only
  after the live provider has replacement tests.
- Keep debug surfaces free of raw provider payloads, prompts, access tokens,
  private notes, and raw relationship context.
- Replace the NOT_IMPLEMENTED expectation with factory, mapper,
  route-envelope, confirmation-guard, and privacy tests for that provider.
