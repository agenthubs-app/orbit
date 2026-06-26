# Network Distribution Analytics Mock: Live Implementation Handoff

This sprint owns the mock-first boundary for industry distribution, value type distribution, relationship strength distribution, and network gap analysis.
The current implementation is deterministic and must remain the default until
live provider files and replacement tests exist.

## Live Service And Provider Files

- `features/dashboard/network-distribution-analytics-mock/service-factory.ts`
  will own provider selection after live mode exists. It must default to
  `features/dashboard/mock-distribution-service.ts` until the live path is
  covered by replacement tests.
- `features/dashboard/network-distribution-analytics-mock/live-service.ts`
  will implement `NetworkDistributionAnalyticsService` from
  `features/dashboard/distribution-contract.ts`.
- `features/dashboard/network-distribution-analytics-mock/providers/graph-analytics-provider.ts`
  will own approved graph algorithm execution.
- `features/dashboard/network-distribution-analytics-mock/providers/vector-index-provider.ts`
  will own embedding index lookup when that capability is approved.
- `features/dashboard/network-distribution-analytics-mock/providers/analytics-job-provider.ts`
  will own live analytics job reads and job-status mapping.
- `features/dashboard/network-distribution-analytics-mock/providers/relationship-warehouse-provider.ts`
  will own database reads from approved relationship analytics tables.

## Switch Mechanism

Keep `createMockNetworkDistributionAnalyticsService` as the safe default.
Introduce `ORBIT_NETWORK_DISTRIBUTION_ANALYTICS_PROVIDER` only after the live
service is implemented and covered by replacement tests:

- unset or `mock`: use `features/dashboard/mock-distribution-service.ts`.
- `live`: use `features/dashboard/network-distribution-analytics-mock/live-service.ts`.
- any other value: fail closed with `SERVICE_UNAVAILABLE`.

The API routes under `/api/dashboard/distributions` and
`/api/dashboard/network-gaps` must keep returning the shared API envelope:
`{ success: true, data }` or `{ success: false, error }`.

## Required Env Vars Or Permissions

- `ORBIT_NETWORK_DISTRIBUTION_ANALYTICS_PROVIDER=live`.
- `ORBIT_RELATIONSHIP_ANALYTICS_DATABASE_URL` for approved read-only
  relationship analytics tables.
- `ORBIT_ANALYTICS_JOB_QUEUE` for the live analytics job provider.
- `ORBIT_GRAPH_ANALYTICS_PROJECT_ID` for approved graph projections.
- `ORBIT_VECTOR_INDEX_NAME` only when embedding lookup has been approved for
  this boundary.
- Database read permission for approved relationship analytics tables.
- Analytics job read permission for the live job provider.
- Graph analytics permission for approved relationship graph projections.
- Embedding index permission only for approved vector indexes; raw contact
  notes must not be sent to a model provider from this boundary.
- No notification, email send, calendar write, or device permissions are
  required for this capability.

## Privacy And Provenance Constraints

- Every distribution bucket and gap recommendation must carry evidence ids and
  source/provenance metadata.
- Live graph algorithm, embedding, analytics job, and database outputs must
  expose whether they read relationship data and which approved source produced
  the metric.
- The API response must not expose private raw notes, full email bodies,
  calendar descriptions, or unapproved provider payloads.
- Empty, pending, and controlled failure states must remain explicit and
  visible to product and dev surfaces.
- Live code must never silently fall back to mock data when provider
  authentication, database access, analytics job execution, or provenance
  validation fails.

## Replacement Tests

Before switching to live mode, add replacement tests that cover:

- success envelopes for industry distribution, value type distribution,
  relationship strength distribution, and network gap analysis.
- empty envelopes when no approved sourced relationships are available.
- pending envelopes while the live analytics job is queued or stale.
- controlled failure envelopes for provider auth, database access, analytics
  job, graph algorithm, embedding index, and provenance validation failures.
- mock provider guards proving the mock implementation still performs no
  external network, device, database, AI provider, email, calendar, or
  notification calls.
