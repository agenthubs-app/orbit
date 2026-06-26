# Source Consistency And Provenance Audit Live Implementation

## Live service and provider files

- `features/audit/source-consistency-and-provenance-audit/live-service.ts` will implement the `SourceConsistencyProvenanceAuditService` interface from `features/audit/provenance-contract.ts`.
- `features/audit/source-consistency-and-provenance-audit/service-factory.ts` will choose the mock or live service without changing `app/api/audit/provenance/route.ts`, `app/api/audit/provenance/run/route.ts`, or the dev capability page.
- `features/audit/source-consistency-and-provenance-audit/providers/` will hold approved readers for contacts, connections, evidence, recommendations, tasks, chat summaries, and agent actions plus a compliance report writer when that provider is allowed.

## Switch mechanism

Keep `createMockSourceConsistencyProvenanceAuditService()` as the default for Milestone C. A future factory may switch on `ORBIT_SOURCE_PROVENANCE_AUDIT_PROVIDER=live`; any other value must keep the deterministic mock service active. The API envelope and route signatures must not change when the switch happens.

## Required env vars and permissions

- `ORBIT_SOURCE_PROVENANCE_AUDIT_PROVIDER`: `mock` or `live`.
- `ORBIT_AUDIT_DATABASE_URL`: live audit read and storage target for approved deployments.
- `ORBIT_COMPLIANCE_REPORTING_ENDPOINT`: controlled compliance reporting destination.
- Database read permission is required before the live service may inspect relationship records.
- Compliance reporting permission is required before any report leaves the Orbit runtime.
- Production audit storage write permission is required before a live run can persist audit results.

## Privacy and provenance constraints

The live service must preserve source references and evidence ids for contacts, connections, evidence, recommendations, tasks, chat summaries, and agent actions. No record can be reported or stored without a source reference, evidence provenance, privacy label, and audit run id. Controlled failures must stay visible through the API envelope instead of silently dropping skipped records.

The mock service currently proves the boundary by keeping `complianceReportingExecuted`, `productionAuditStorageWriteExecuted`, provider calls, device access, AI calls, database reads, database writes, and external network access set to `false`. The live implementation must update those flags truthfully and must never imply that a compliance report or production audit write happened unless the provider confirms it.

## Replacement tests

Replacement tests must cover:

- Success snapshots and audit runs for source-backed contacts, connections, evidence, recommendations, tasks, chat summaries, and agent actions.
- Empty state when no source-backed Orbit records exist.
- Pending state when source fixture refresh or provider reads are not complete.
- Controlled failure when the audit provider, storage provider, or compliance reporting provider fails.
- Provider guard tests proving mock mode does not call databases, compliance reporting, AI, email, calendar, notification, device APIs, or external networks.
- Privacy and provenance assertions that every finding keeps source references, evidence ids, and audit run provenance.
