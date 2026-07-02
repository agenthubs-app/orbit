# Goal 3: Connections Evidence Live Store

## Goal

Move the connection/evidence read model from mock-only to a live storage-backed mode using `orbit_records` collections `connections`, `contacts`, and `evidence`.

## Scope

- Add a live connection evidence service behind `ConnectionEvidenceService`.
- Add a connection-owned storage provider that reads relationship graph records from `LiveRecordStoreLike`.
- Support live `listConnections` and `getConnection`.
- Register `live` mode in `features/connections/service-factory.ts`.
- Make connection API routes await async-capable services.
- Keep `addEvidence` fail-closed in live mode until a write/audit policy is designed.

## Acceptance

- A memory live-record-store test seeds `defaultMockFixtures` and reads 510 connections through the live connection service.
- Live connection detail resolves contact display fields and evidence timeline entries from live storage.
- `ORBIT_MODULE_MODE=live` can resolve the connection factory; without database config it fails closed through the service result.
- Remote `/api/connections` returns generated relationship connections from Postgres in live mode.
