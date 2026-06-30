# Hybrid Mockdata Handoff Design

## Goal

Make generated relationship mockdata usable by the existing Orbit hybrid local-remote database without adding a mock-only service path or runtime data loader.

## Architecture

`harness/relationship_data_goal_runner.py` remains the single deterministic generator for relationship demo data. In addition to the current `repos/mockdata` JSON exports, it must emit a TypeScript fixture file under `repos/orbits/shared/mock/` that exports a `MockRuntimeFixtures`-compatible object. `repos/orbits/shared/mock/fixtures.ts` remains the app's fixture boundary and exposes that generated object as `defaultMockFixtures`.

Feature services do not read `repos/mockdata` directly. They continue to use the current path:

```text
feature hybrid service
  -> createOrbitLocalRemoteDatabase()
  -> defaultMockFixtures
  -> MockRuntimeFixtures DTOs from shared/domain/contracts.ts
```

## Requirements

- No new runtime environment variable is required for normal hybrid usage.
- No feature service gains `repos/mockdata` file-path logic or snake_case mapping logic.
- The generated app fixture uses camelCase DTO fields and imports `MockRuntimeFixtures`.
- Generated contacts and events keep multilingual human-readable fields where the current DTO shape can preserve them, primarily in snippets, evidence summaries, and source labels.
- Semantic relationship records remain queryable through top-level DTO fields: event intent, recommendation score, business relevance, topics, actions, source, and evidence IDs.
- `npm run test:relationship-schema` must pass against the generated default fixture.
- Core hybrid service tests must continue to prove services read the same local-remote database.

## Non-Goals

- Do not implement a live remote provider in this change.
- Do not add database migrations.
- Do not make feature services parse `repos/mockdata/exports/local_seed.json`.
- Do not add a second mock runtime.

## Verification

- Harness tests must prove the generator emits the hybrid fixture file and that the file contains DTO-shaped collection names, not snake_case export names.
- App schema tests must prove the generated fixture satisfies the local-remote database relationship schema.
- TypeScript checks must include `shared/mock/fixtures.ts`; because it imports the generated fixture, DTO drift fails at compile time.
