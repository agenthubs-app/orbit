# Orbit Relationship Mockdata Generation

This dataset was expanded deterministically from a compact MiniMax Claude SDK plan. The plan is stored in `generation/minimax_generation_plan.json`; API tokens and provider environment values are not written to this directory.

The same generator also writes `../orbits/shared/mock/generated-relationship-fixtures.ts`, which satisfies the app's `MockRuntimeFixtures` contract and is consumed by the existing hybrid local-remote database path. Feature services should read that DTO-shaped fixture through `createOrbitLocalRemoteDatabase()`, not parse these snake_case JSON exports directly.

The generator writes stable IDs, source/evidence references, conservative low-confidence AI analysis flags, negative cases, dirty data cases, and export bundles for future importers.
