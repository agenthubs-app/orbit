# Mock data mutation reset and scenario switcher live handoff

## Live service and provider files

- Keep the stable DTOs and mock contract in `shared/mock/scenarios.ts`.
- Keep reset DTOs and reset result envelopes in `shared/mock/reset.ts`.
- Add live orchestration in `shared/mock/mock-data-mutation-reset-and-scenario-switcher/live-service.ts`.
- Add provider adapters under `shared/mock/mock-data-mutation-reset-and-scenario-switcher/providers/`, including a Supabase-backed scenario preference provider and a production seed reset provider.
- Keep route ownership in `app/api/mock/scenarios/route.ts`, `app/api/mock/scenarios/[id]/activate/route.ts`, and `app/api/mock/reset/route.ts`; only swap the service factory they call.

## Switch mechanism

- Introduce `ORBIT_MOCK_SCENARIO_PROVIDER=mock|live`.
- `mock` keeps the deterministic fixtures for new user, active event, post-event, dormant network, empty account, and controlled failure paths.
- `live` resolves the live service, writes the selected scenario to durable user scenario storage, and runs the production seed reset provider.
- Unknown values must fall back to `mock` until live replacement tests prove the provider boundary.

## Required env vars and permissions

- `ORBIT_MOCK_SCENARIO_PROVIDER` selects mock or live behavior.
- Supabase project URL, service role key, and scenario storage table names are required for live seed and scenario persistence.
- Admin-only operator permission is required before live reset can mutate seeded demo data.
- OAuth-authenticated user identity is required before a live user scenario preference is stored.

## Privacy and provenance constraints

- Every scenario activation and reset must retain source provenance, selected scenario id, actor label, and reset reason.
- Live reset must never expose raw provider credentials, access tokens, private email/calendar content, or notification payloads in API envelopes.
- Scenario selection must record whether it came from deterministic fixtures, stored user preference, or production seed management.
- Reset events must fail visibly when a production seed mutation is skipped, partially rolled back, or blocked by permission.

## Replacement tests

- Keep mock tests for provider-free deterministic behavior.
- Add live service tests that cover new user, active event, post-event, dormant network, empty account, and controlled failure scenarios.
- Add route tests for `GET /api/mock/scenarios`, `POST /api/mock/scenarios/post-event-demo/activate`, and `POST /api/mock/reset` in both mock and live provider modes.
- Add permission tests proving live reset refuses non-admin actors before mutating production seed data.
- Add provenance tests proving selected scenario storage, reset events, and failure envelopes preserve privacy-safe evidence.
