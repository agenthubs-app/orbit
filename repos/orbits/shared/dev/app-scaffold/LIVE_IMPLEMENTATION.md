# App Scaffold Dev Harness Live Implementation Notes

Sprint 8 keeps the capability demo harness mock-first. The route at
`app/dev/capabilities/[slug]/page.tsx` may exercise registry metadata and local
debug actions, but it must not call live providers, mutate product state, or
write screenshots, traces, reports, or verification files.

## Live service and provider files

The current dev harness uses these mock-first files:

- `app/dev/capabilities/[slug]/page.tsx` as the Next.js route wrapper.
- `shared/dev/app-scaffold/capability-demo-view.tsx` as the deterministic route
  renderer for known and unknown demo slugs.
- `shared/dev/debug-action-runner.ts` as the local runtime-memory debug action
  recorder.
- `shared/services/capability-registry.ts` as the source of capability metadata
  and service factory resolution.

When a capability later moves from this dev harness to live execution, add the
live service and provider files beside that capability's real service boundary.
Do not place provider clients or credentials in `shared/dev/app-scaffold`.

## Switch mechanism

The harness should continue to read the shared capability registry. Live
replacement happens by registering a real provider implementation behind the
capability service factory and selecting live mode through the established
runtime switch, such as `ORBIT_MODULE_MODE=live` or an explicit test setup. The
dev harness itself should keep rendering controlled mock states for
`app-scaffold` until replacement tests prove the live provider boundary.

## Required env vars and permissions

The mock harness requires no environment variables, browser permissions, OAuth
grants, Supabase credentials, AI keys, email/calendar scopes, notification
permissions, or external messaging access. Future live providers must document
their exact env vars and permission scopes in the owning capability's live
implementation notes before the registry switch can point at them.

## Privacy and provenance constraints

Debug results recorded by `shared/dev/debug-action-runner.ts` stay in process
memory and are cloned on read. They must not contain raw provider payloads,
access tokens, private chat content, email bodies, calendar descriptions, or
contact imports that lack source evidence. Every Contact, Connection,
Recommendation, Task, Chat update, Dashboard item, and AgentAction path must
preserve source or evidence provenance before a product route consumes it.

Sensitive actions must still require explicit confirmation through the owning
capability guard. The dev harness may report that a confirmation-aware
capability exists, but it must not send messages, schedule notifications, write
calendar events, or call live AI providers.

## Replacement tests

Before replacing this mock harness with a live provider path, add or update
tests that prove:

- Known and unknown `/dev/capabilities/[slug]` routes still render controlled,
  deterministic output.
- The capability service factory resolves the live provider only when the live
  mode switch is explicit.
- API route handlers preserve the `{ success: true, data }` and
  `{ success: false, error }` envelope.
- Provider mappers preserve source and evidence ids and redact raw provider
  payloads from dev surfaces.
- Confirmation-aware capabilities cannot execute external actions without the
  confirmation guard.
- `shared/dev/debug-action-runner.ts` remains memory-only or is removed from the
  live path with replacement assertions proving no artifact writes occur.
