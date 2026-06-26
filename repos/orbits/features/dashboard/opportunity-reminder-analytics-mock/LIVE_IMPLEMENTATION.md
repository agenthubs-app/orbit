# Opportunity Reminder Analytics Mock: Live Implementation Handoff

This sprint owns the mock-first boundary for high-priority opportunities, dormant high-value contacts, current-goal matching, and suggested contact reasons.
The current implementation is deterministic and must remain the default until
live provider files and replacement tests exist.

## Live Service And Provider Files

- `features/dashboard/opportunity-reminder-analytics-mock/service-factory.ts`
  will own provider selection after live mode exists. It must default to
  `features/dashboard/mock-opportunity-service.ts` until the live path is
  covered by replacement tests.
- `features/dashboard/opportunity-reminder-analytics-mock/live-service.ts`
  will implement `OpportunityReminderAnalyticsService` from
  `features/dashboard/opportunity-contract.ts`.
- `features/dashboard/opportunity-reminder-analytics-mock/providers/relationship-analytics-provider.ts`
  will own approved relationship analytics database reads.
- `features/dashboard/opportunity-reminder-analytics-mock/providers/goal-context-provider.ts`
  will own approved current-goal context reads.
- `features/dashboard/opportunity-reminder-analytics-mock/providers/signal-provider.ts`
  will own approved email, calendar, event, referral, and chat-summary signal
  reads.
- `features/dashboard/opportunity-reminder-analytics-mock/providers/opportunity-job-provider.ts`
  will own live analytics job status for recompute and pending states.

## Switch Mechanism

Keep `createMockOpportunityReminderAnalyticsService` as the safe default.
Introduce `ORBIT_OPPORTUNITY_REMINDER_ANALYTICS_PROVIDER` only after the live
service is implemented and covered by replacement tests:

- unset or `mock`: use `features/dashboard/mock-opportunity-service.ts`.
- `live`: use `features/dashboard/opportunity-reminder-analytics-mock/live-service.ts`.
- any other value: fail closed with `SERVICE_UNAVAILABLE`.

The API routes under `/api/dashboard/opportunities` and
`/api/dashboard/opportunities/recompute` must keep returning the shared API
envelope: `{ success: true, data }` or `{ success: false, error }`.

## Required Env Vars Or Permissions

- `ORBIT_OPPORTUNITY_REMINDER_ANALYTICS_PROVIDER=live`.
- `ORBIT_RELATIONSHIP_ANALYTICS_DATABASE_URL` for approved read-only
  relationship analytics tables.
- `ORBIT_GOAL_CONTEXT_SOURCE` for approved current-goal context.
- `ORBIT_OPPORTUNITY_ANALYTICS_JOB_QUEUE` for recompute and pending-state job
  status.
- Email read permission for approved relationship-signal summaries; raw email
  bodies must not be exposed by this boundary.
- Calendar read permission for approved event and meeting signal summaries; raw
  calendar descriptions must not be exposed by this boundary.
- Database read permission for approved contact, relationship, evidence, goal,
  and follow-up tables.
- No notification send, email send, calendar write, device, or AI provider
  permission is required for this capability.

## Privacy And Provenance Constraints

- Every high-priority opportunity, dormant high-value contact, current-goal
  match, and suggested contact reason must carry evidence ids and
  source/provenance metadata.
- Live predictive scoring and background opportunity mining may be introduced
  only after they expose model, query, source, and evidence provenance and pass
  replacement tests. Until then, live code must use deterministic or auditable
  rule-based outputs.
- The API response must not expose private raw notes, full email bodies,
  calendar descriptions, or unapproved provider payloads.
- Empty, pending, and controlled failure states must remain explicit and
  visible to product and dev surfaces.
- Live code must never silently fall back to mock data when provider
  authentication, relationship analytics reads, current-goal reads, signal
  reads, recompute jobs, or provenance validation fails.

## Replacement Tests

Before switching to live mode, add replacement tests that cover:

- success envelopes for high-priority opportunities, dormant high-value
  contacts, current-goal matching, and suggested contact reasons.
- success envelopes for `/api/dashboard/opportunities/recompute` with changed
  opportunity ids and no notification delivery.
- empty envelopes when no approved evidence-backed contacts or goals are
  available.
- pending envelopes while live recompute jobs or relationship signal refreshes
  are queued or stale.
- controlled failure envelopes for provider auth, database access, goal context
  reads, email read permission, calendar read permission, analytics job status,
  predictive scoring, background opportunity mining, and provenance validation
  failures.
- mock provider guards proving the mock implementation still performs no
  external network, device, database, AI provider, email, calendar, or
  notification calls.
