# Relationship Stage And Profile Mock Live Implementation

This sprint ships a mock-first boundary for relationship stage and profile fields. The live replacement must keep the same contract from `features/connections/profile-contract.ts` and the same API envelopes from:

- `app/api/connections/[id]/stage/route.ts`
- `app/api/connections/[id]/profile/route.ts`

## Live Service And Provider Files

- `features/connections/live-profile-service.ts` is the current live read implementation. It implements `RelationshipStageAndProfileService`, reads generated `connections`, `contacts`, and `evidence` through `features/connections/storage/connection-live-record-provider.ts`, and returns stage/profile preview payloads with source-backed provenance.
- Current live `PATCH` behavior is preview-only. It validates requested relationship stages, derives or applies relationship type/context/mutual value/next-action fields in the response, and explicitly reports `databaseWriteExecuted: false` and `productionAuditLogWriteExecuted: false`.
- `features/connections/relationship-stage-and-profile-mock/providers/stage-automation-provider.ts` is reserved for future persisted stage automation.
- `features/connections/relationship-stage-and-profile-mock/providers/relationship-profiling-provider.ts` is reserved for future live relationship profiling.
- `features/connections/relationship-stage-and-profile-mock/providers/profile-provenance-store.ts` is reserved for persisting source references, evidence ids, provider run ids, and user-visible explanations when writes are in scope.

## Switch Mechanism

- `ORBIT_FEATURE_MODE=mock` keeps route handlers on `createMockRelationshipStageAndProfileService`.
- `ORBIT_MODULE_MODE=live` or `ORBIT_FEATURE_MODE=live` routes `relationship-stage-profile` through `createLiveRelationshipStageAndProfileService`.
- `RELATIONSHIP_PROFILE_LIVE_STORE_UNCONFIGURED` fails closed when live storage is not configured.
- The switch belongs in a service factory, not in the dev page. `/dev/capabilities/relationship-stage-and-profile-mock` remains a probe surface that imports the service boundary.

## Required Env Vars And Permissions

- `ORBIT_EVENT_DATABASE_URL`, `ORBIT_LIVE_DATABASE_URL`, or `ORBIT_DATABASE_URL` identifies the shared live record store used by the current live read implementation.
- `ORBIT_RELATIONSHIP_PROFILE_STORE_URL`, `ORBIT_RELATIONSHIP_PROFILE_STORE_SERVICE_ROLE`, and `ORBIT_RELATIONSHIP_PROFILE_MODEL` are reserved for future persisted automation and provider-backed profiling.
- User permission for relationship profile automation before any live stage automation or relationship profiling run.
- Workspace permission for reading connection evidence, source links, and relationship notes.

## Privacy And Provenance Constraints

- These privacy and provenance constraints apply before replacing the mock.
- Every returned `RelationshipProfileRecord` must preserve relationship type, stage, context, mutual value, latest summary, and next action with evidence ids.
- Current live stage/profile previews must record which source references influenced each field and must not report persistence.
- Future live stage automation and relationship profiling must record which source references influenced each persisted field.
- The profile summary must expose whether it came from fixture, deterministic rules, live storage preview, or a live provider.
- Do not send private contact notes, email/calendar excerpts, or event attendee context to a live provider unless the user has granted the required permission.
- Sensitive next actions must stay behind a confirmation guard before any external action can run.
- Failure envelopes must identify the boundary error code without leaking private source text.

## Replacement Tests

- `tests/capabilities/relationship-stage-profile-live-store.test.ts` proves current live mode reads generated relationship records from shared live storage and returns stage/profile preview payloads without database writes, audit writes, AI calls, or external provider calls.
- Stage update success returns `{ success: true, data }` with stable relationship type, stage, context, mutual value, latest summary, next action, and provenance fields.
- Future persisted profile update success returns `{ success: true, data }` and accounts for provenance for every field that live automation changes.
- Declared body-less PATCH probes for the stage and profile routes continue to return 200 success envelopes with stable demo payloads.
- Empty-state route coverage proves no selected connection returns a success envelope with `state: "empty"`.
- Pending-state coverage proves live stage automation can pause without side effects.
- Invalid body and invalid stage tests continue to return shared `VALIDATION_ERROR` envelopes.
- Not-found coverage proves unknown connection ids return shared `NOT_FOUND` envelopes.
- Provider failure coverage proves live relationship profiling failures return shared `SERVICE_UNAVAILABLE` envelopes.
- Dev route rendering coverage continues to show success, empty, pending, and failure states plus the mock-to-live handoff.
