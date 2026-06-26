# Duplicate Detection and Merge Mock Live Implementation

Replace the mock behind `features/acquisition/duplicate-detection-and-merge-mock/live-service.ts`.
Provider adapters should live under
`features/acquisition/duplicate-detection-and-merge-mock/providers/` and implement
the service interface exported from `features/acquisition/merge-contract.ts`.

## Switch Mechanism

- `ORBIT_DUPLICATE_MERGE_PROVIDER=mock` keeps route handlers on
  `features/acquisition/mock-merge-service.ts`.
- `ORBIT_DUPLICATE_MERGE_PROVIDER=live` should route the same API handlers to
  `live-service.ts` through a small factory.
- Route envelopes must stay `{ success: true, data }` or
  `{ success: false, error }` with the same typed error codes.

## Required Environment And Permissions

- Supabase URL, service role, and row-level security policies for reading
  imported contacts, existing contacts, source evidence, and merge audit rows.
- Permission to read imported contacts from acquisition draft tables without
  expanding provider scopes.
- Permission to write a merge audit record and then update contact records only
  after explicit confirmation.
- Optional background job credentials only for reviewed merge execution; never
  for the detection preview path.

## privacy and provenance constraints

- Preserve imported contact evidence, existing contact evidence, match reasons,
  field-level merge decisions, reviewer identity, and confirmation timestamp.
- Do not merge, delete, or overwrite source evidence without an audit trail.
- Keep duplicate scoring explainable; every suggested merge needs source-backed
  reasons such as email, name/organization, event context, or referral context.
- Treat destructive merge writes as sensitive actions. They must remain behind
  confirmation and must return visible failure envelopes for blocked, missing,
  pending, and provider-failure paths.

## replacement tests

- Contract tests for live duplicate candidates, merge suggestions, confirmation
  payloads, and error mappings.
- API route tests for success, empty, pending, controlled failure, missing
  suggestion, blocked confirmation, and provider-failure envelopes.
- Privacy tests proving imported contacts and source evidence are not exposed
  beyond the requested user/workspace boundary.
- Provenance tests proving merged records retain source references, evidence
  ids, field decisions, reviewer confirmation, and merge audit ids.
- Regression tests proving live provider failures do not perform partial writes
  and do not send notifications or external actions.
