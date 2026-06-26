# Relationship Value Scoring Mock Live Implementation Handoff

This sprint owns the mock-first boundary for relationship value type, priority
score, rationale, and suggested next action. The current implementation is
deterministic and fixture-backed so the product can compose a stable contract
before any live ranking model or production ranking model exists.

The live contract must preserve relationship value type, priority score, rationale, and suggested next action.

## Live Service And Provider Files

- Keep `features/analysis/value-contract.ts` as the stable DTO and service
  contract unless the product contract itself changes.
- Keep `features/analysis/mock-value-service.ts` as the local mock
  implementation used by harness and development surfaces.
- Add `features/analysis/relationship-value-scoring-mock/live-service.ts` for
  the live service implementation. It should implement the same
  `RelationshipValueScoringService` interface.
- Add live adapters under
  `features/analysis/relationship-value-scoring-mock/providers/` for scoring
  input retrieval, ranking model execution, and source evidence normalization.
- Route handlers under `app/api/analysis/relationship-value/**` should select a
  service through a factory and keep returning the shared API envelope:
  `{ success: true, data }` or `{ success: false, error }`.

## Switch Mechanism

Use an environment switch named `ORBIT_RELATIONSHIP_VALUE_PROVIDER`.

- `mock`: use `createMockRelationshipValueScoringService()`.
- `live`: use the live implementation in
  `features/analysis/relationship-value-scoring-mock/live-service.ts`.
- `hybrid`: read live source material only where permissions exist, but fall
  back to deterministic mock output for missing sources.

The switch should live in a small service factory, not in product pages or dev
UI. `/dev/capabilities/relationship-value-scoring-mock` should keep importing
the capability boundary rather than owning business logic.

## Required Env Vars And Permissions

- `ORBIT_RELATIONSHIP_VALUE_PROVIDER`: selects `mock`, `hybrid`, or `live`.
- Live model credentials: required only when the live ranking model is enabled.
- Relationship data store credentials: required only for live connection and
  evidence retrieval.
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
- Live ranking must not silently use email, calendar, chat, or event data
  without the matching permission.
- Failure envelopes must preserve the relationship value error code in context
  so evaluators can tell validation, pending, not-found, and service failures
  apart.

## Replacement Tests

Replace or extend `tests/capabilities/relationship-value-scoring-mock.test.ts`
when the live implementation lands.

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
