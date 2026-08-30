# iOS API Contract And Mobile Dashboard Design

## Goal

Make the iOS contacts analysis screen depend on one actor-scoped API response whose payload is validated from the same runtime schema on the server and in the App.

## Current Problem

The App already copies type-only contracts from `repos/orbits/shared/contract`, but many screens still receive `unknown` data and parse it permissively. Compile-time contract sync therefore does not catch malformed runtime JSON. The contacts dashboard also loads aggregate, summary, opportunities, gaps, distributions, profile, and contacts through seven separate HTTP requests.

## Decision

Use an incremental contract-first migration instead of rewriting every API at once.

1. Keep `shared/contract` type-only and self-contained.
2. Add `shared/api-schema` as the canonical runtime-schema directory. Runtime schemas may depend on Zod and `shared/contract` only.
3. Copy schemas into `orbit-app/src/api/schema` alongside the existing contract sync. Tests continue to reject drift.
4. Add `GET /api/mobile/contacts-dashboard` as a mobile BFF endpoint.
5. Migrate `ContactsDashboardScreen` to that endpoint and validate cached and network payloads before rendering.
6. Preserve all existing dashboard, profile, and contacts APIs for Web and compatibility.

## API Shape

The endpoint returns the standard Orbit envelope. Its `data` is versioned:

```ts
interface MobileContactsDashboardPayload {
  schemaVersion: 1;
  generatedAt: string;
  aggregate: DashboardAggregateContract;
  summary: DashboardSummaryContract | null;
  opportunities: DashboardOpportunitiesContract | null;
  gaps: DashboardGapsContract | null;
  distributions: DashboardDistributionsContract | null;
  profile: ProfilePayloadContract | null;
  contacts: ContactsListPayloadContract | null;
  unavailableSections: readonly MobileContactsDashboardOptionalSection[];
}
```

`aggregate` is required because it controls the screen's principal state. Optional sections degrade independently to `null` and are listed in `unavailableSections`, preserving the current screen's partial-render behavior.

## Server Data Flow

The route resolves the authenticated actor once, then calls the existing feature services in parallel. It never calls its own HTTP endpoints. Live services continue to enforce `actorId` and PostgreSQL ownership boundaries. The completed payload is parsed with the canonical Zod schema before serialization; a contract mismatch fails visibly instead of sending malformed data.

## iOS Data Flow

`useValidatedApiResource` wraps the existing snapshot-first `useApiResource`. It validates both SQLite snapshots and network responses with the copied Zod schema. Invalid cached or network payloads become a normal failure state and are never handed to the UI. `ContactsDashboardScreen` uses one resource and passes its validated sections to the existing view-model and visual components.

Mutations remain on their existing endpoints. After profile edits or opportunity recomputation, the screen refreshes the single mobile dashboard resource.

## Compatibility And Rollout

- Existing API routes remain unchanged.
- Existing App screens remain on `useApiResource` until migrated.
- The schema copy remains build-time independent from the server repository.
- `schemaVersion` starts at `1`; incompatible future changes require a new version or an additive transition period.

## Error Handling

- Missing authentication returns `401` before any feature service runs.
- Required aggregate failure returns the mapped API failure.
- Optional section failure returns `200`, a `null` section, and its identifier in `unavailableSections`.
- Server-side schema mismatch returns `500 SERVICE_UNAVAILABLE` with no malformed payload.
- iOS runtime schema mismatch returns an App failure state and does not cache invalid data.

## Testing

- Contract tests prove server and App schema directories are synchronized.
- Schema tests prove valid payloads parse and malformed nested data is rejected.
- Service tests prove actor propagation, concurrent section loading, required failure, and optional degradation.
- Route tests prove authentication, standard envelope, and runtime validation.
- iOS source and view-model tests prove the screen issues one dashboard request and refreshes it after mutations.
- Full server and iOS typechecks/tests remain the final gate.

## Non-Goals

- Migrating every Orbit API in one change.
- Removing existing endpoints.
- Adding WebSocket synchronization.
- Changing PostgreSQL storage shape.
- Moving UI copy or chart presentation into the server.
