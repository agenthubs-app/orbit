# Relationship Value Scoring Mock Live Implementation Handoff

This capability now supports deterministic mock mode and remote live mode for
relationship value type, priority score, rationale, and suggested next action.
The current live implementation is still rule-based; it reads generated
relationship records from shared live storage and does not call a live ranking
model or production ranking model.

The live contract must preserve relationship value type, priority score, rationale, and suggested next action.

## Live Service And Provider Files

- Keep `features/analysis/value-contract.ts` as the stable DTO and service
  contract unless the product contract itself changes.
- Keep `features/analysis/mock-value-service.ts` as the local mock
  implementation used by harness and development surfaces.
- Keep live scoring in `features/analysis/live-value-service.ts`. It implements
  the same async-compatible `RelationshipValueScoringService` interface.
- Keep the live storage adapter in
  `features/analysis/storage/relationship-value-live-record-provider.ts`. It
  reads generated `connections`, `contacts`, and `evidence` records through the
  existing connection graph parser.
- Future ranking model adapters can still be added under
  `features/analysis/relationship-value-scoring-mock/providers/`, but the
  current live path is deterministic and provider-free.
- Route handlers under `app/api/analysis/relationship-value/**` should select a
  service through a factory and keep returning the shared API envelope:
  `{ success: true, data }` or `{ success: false, error }`.

## Switch Mechanism

Use the shared feature-mode switch.

- `mock`: use `createMockRelationshipValueScoringService()`.
- `live`: use `createLiveRelationshipValueScoringService()` with the configured
  shared live record store.
- `hybrid`: currently keeps the deterministic mock output unless a caller
  explicitly asks for live mode.

The switch should live in a small service factory, not in product pages or dev
UI. `/dev/capabilities/relationship-value-scoring-mock` should keep importing
the capability boundary rather than owning business logic.

## Required Env Vars And Permissions

- Current shared live storage uses `ORBIT_EVENT_DATABASE_URL`,
  `ORBIT_LIVE_DATABASE_URL`, or `ORBIT_DATABASE_URL`.
- `ORBIT_WORKSPACE_ID` selects the workspace partition, defaulting to
  `orbit-dev` for local development.
- `ORBIT_RELATIONSHIP_VALUE_PROVIDER` is reserved for a future ranking provider
  selector.
- Live model credentials: required only when the live ranking model is enabled.
- calendar permission: required before calendar-derived relationship signals may
  contribute to scoring.
- email permission: required before email-derived relationship signals may
  contribute to scoring.
- Notification or external-action permission: required only if a suggested next
  action becomes an executable action. Scoring itself must not send anything.

## Privacy And Provenance Constraints

- privacy and provenance must stay attached to every relationship value score.
- Every score must keep source evidence ids, collection time, generation method,
  and source label.
- The rationale must explain which evidence contributed to the relationship
  value type and priority score.
- The suggested next action must remain a suggestion until a separate
  confirmation guard approves any sensitive external action.
- Current live scoring must not silently use email, calendar, chat, or event data
  without the matching permission.
- Failure envelopes must preserve the relationship value error code in context
  so evaluators can tell validation, pending, not-found, and service failures
  apart.

## Replacement Tests

Keep `tests/capabilities/relationship-value-scoring-mock.test.ts` as the mock
boundary test and `tests/capabilities/relationship-value-live-store.test.ts` as
the live replacement test.

Coverage must include:

- Mock mode still returns the deterministic fixture payload.
- Live mode returns the same relationship value type, priority score, rationale,
  and suggested next action shape.
- The declared no-body recompute probe returns the deterministic recompute
  payload.
- Recompute success with a JSON body uses selected evidence and preserves
  provenance.
- Empty, pending, invalid recompute bodies, not-found, and controlled failure
  paths keep stable API envelopes.
- Permission-denied calendar and email inputs are excluded from scoring and are
  visible in rationale limitations.
- Live ranking model failures map to `SERVICE_UNAVAILABLE` without retry loops
  in route handlers.
- Suggested next action execution stays outside the scoring service and remains
  covered by confirmation-guard tests.

Current evidence:

- `tests/capabilities/relationship-value-live-store.test.ts` proves live scoring
  reads generated `connections`, `contacts`, and `evidence`, recomputes from
  selected evidence, and leaves the source connection record unchanged.
- Remote validation for `connection_0007` returned `x-orbit-feature-mode:
  live` for both detail and recompute routes, with score `62` and recompute
  score `57`.
