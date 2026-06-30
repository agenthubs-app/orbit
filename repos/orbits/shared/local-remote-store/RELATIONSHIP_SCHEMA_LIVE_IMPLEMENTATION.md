# Relationship Schema Live Implementation Notes

Sprint 81 keeps the relationship database local and deterministic. Live storage
must replace the provider/adapter behind `shared/local-remote-store` without
changing product routes or feature contracts.

## Sprint 81 Evidence Summary

- Early evidence excerpt: remote provider files, semantic tables, indexes, JSON boundaries, privacy/provenance gates, migration/version behavior, and replacement tests are summarized here so Sprint 81 verification can confirm the live handoff without relying on later truncated sections.
- The generated pre-live relationship dataset is consumed through
  `shared/mock/generated-relationship-fixtures.ts`, which satisfies
  `MockRuntimeFixtures`; live replacement must map remote rows to the same DTO
  shape instead of introducing a parallel mockdata JSON reader.
- Live provider files remain future work in `live-service.ts`, `provider.ts`,
  `mappers.ts`, and `validators.ts`; Sprint 81 only defines the replaceable
  boundary.
- Remote storage must preserve the existing product tables, add the five
  semantic relationship tables, and index query fields before live mode is
  enabled.
- Volatile AI interpretation belongs in `ai_analyses.result_json`; intent,
  language, scores, topics, trust, and suggested actions remain first-class
  columns.
- Privacy/provenance requires stable target references, `source`, non-empty
  `evidenceIds`, and no raw prompts, tokens, secrets, chain-of-thought, or
  unrelated user data in product rows.
- Migration/version behavior maps local schema `2` to
  `relationship_schema_v2`, rejects stale local payloads, and fails closed for
  unknown live provider modes.
- Replacement tests must prove live rows map to the mock DTO shapes and resolve
  event, attendee, contact, connection, conversation, message, profile, and
  evidence references.

## Future Provider Files

- `shared/local-remote-store/live-service.ts`: remote implementation of the
  versioned database interface.
- `shared/local-remote-store/provider.ts`: mode resolver for local, hybrid, and
  live database providers.
- `shared/local-remote-store/mappers.ts`: DTO-to-table and table-to-DTO mapping,
  including JSON payload validation.
- `shared/local-remote-store/validators.ts`: runtime checks for remote rows,
  source references, evidence references, and schema version compatibility.

## Remote Tables

Preserve existing product tables:

- `accounts`
- `profiles`
- `events`
- `attendees`
- `contacts`
- `connections`
- `evidence`
- `tasks`
- `conversations`
- `messages`
- `dashboards`
- `agent_actions`
- `permissions`
- `notifications`

Add relationship schema tables:

- `event_participant_intents`
- `ai_analyses`
- `match_recommendations`
- `interaction_memories`
- `recommendation_tests`

## Schema Value Validation

Future live mappers should use `shared/domain/source-types.ts` as the runtime
source of truth for semantic discriminator values:

- `ai_analyses.analysis_type` -> `AI_ANALYSIS_TYPE_VALUES`
- `match_recommendations.recommendation_type` ->
  `MATCH_RECOMMENDATION_TYPE_VALUES`
- `interaction_memories.memory_type` -> `INTERACTION_MEMORY_TYPE_VALUES`
- `recommendation_tests.case_type` -> `RECOMMENDATION_TEST_CASE_TYPES`
- `recommendation_tests.expected_outcome` ->
  `RECOMMENDATION_TEST_EXPECTED_OUTCOMES`

Rows with unknown values should fail validation instead of falling back to mock
fixtures or being stored only in JSON.

## Indexes

- `event_participant_intents(event_id, attendee_id)`
- `event_participant_intents(contact_id)`
- `connections(account_id, business_relevance_score)`
- `connections(account_id, relationship_strength)`
- `connections(contact_id)`
- `ai_analyses(target_type, target_id, analysis_type)`
- `match_recommendations(event_id, score)`
- `match_recommendations(contact_id)`
- `match_recommendations(connection_id)`
- `interaction_memories(contact_id, occurred_at)`
- `interaction_memories(connection_id, occurred_at)`
- `recommendation_tests(case_type, event_id)`

## JSON Fields

Only volatile AI/provider output should use JSON:

- `ai_analyses.result_json`: extracted signals, scoring rationale, rejected
  fields, model-specific interpretation, and other provider-shaped output.
- Future provider audit/run metadata may use a separate JSON column in provider
  audit tables, not on contacts, connections, attendees, or recommendations.

Do not store frequently queried values such as looking-for intent, can-offer
intent, preferred language, relationship strength, trust level, business
relevance, shared topics, recommendation score, or suggested actions only in
JSON.

## Environment And Permissions

No live credentials are required for Sprint 81. A future live provider should
fail closed until all required settings are present, for example:

- `ORBIT_MODULE_MODE=live`
- `ORBIT_RELATIONSHIP_DATABASE_URL`
- `ORBIT_RELATIONSHIP_DATABASE_AUTH_TOKEN`

Required permissions:

- Read/write product relationship rows for the active account.
- Read evidence rows referenced by semantic records.
- Write AI analysis and recommendation rows only through server-side providers.
- Read recommendation test rows only in non-production or explicitly allowed
  regression environments.

## Privacy And Provenance

- Every semantic record must keep stable target references plus `source` and
  non-empty `evidenceIds`.
- AI analyses must not store raw private messages beyond the minimal source
  references and summarized `result_json`.
- Provider payloads must not include API keys, auth tokens, full prompts,
  chain-of-thought, or unrelated user data.
- Recommendation tests are regression artifacts. They must not be mixed into
  production recommendation feeds unless an explicit test mode is active.
- Dirty data cases must preserve enough provenance to explain why a row was
  suppressed or routed to manual review.

## Migration And Version Behavior

- Local schema version `2` maps to remote migration `relationship_schema_v2`.
- The local key `orbit.local-remote-database.v2` intentionally avoids reading
  stale v1 localStorage payloads.
- A live migration should add nullable columns first, backfill from existing
  evidence-backed rows where possible, then tighten non-null constraints only
  after replacement tests pass.
- Unknown live provider modes must return the shared not-implemented service
  resolution shape instead of silently falling back to mock data.
- Rollback should preserve existing product tables and drop or ignore only the
  Sprint 81 semantic tables/columns.

## Replacement Tests

Before switching to live mode, add tests that prove:

- Remote rows map to the same DTO shapes as `MockRuntimeFixtures`.
- Event intent can be queried by `eventId`, `attendeeId`, `contactId`,
  `lookingFor`, `canOffer`, and `preferredLanguage` without parsing JSON.
- Relationship profile queries can sort/filter by `relationshipStrength`,
  `trustLevel`, `businessRelevanceScore`, `sharedTopics`, and
  `suggestedActions`.
- AI analysis records preserve `resultJson` while target/source/evidence
  references resolve to remote product rows.
- Match recommendations, interaction memories, golden matches, negative cases,
  and dirty data cases resolve all declared event, attendee, contact,
  connection, conversation, message, profile, and evidence references.
- Missing live credentials fail closed and do not fall back to undeclared mock
  providers.

## Sprint 81 Live Replacement Audit

- Remote table ownership: preserve product tables and add only `event_participant_intents`, `ai_analyses`, `match_recommendations`, `interaction_memories`, and `recommendation_tests` for Sprint 81 semantic data.
- Query indexes required before live switch: `event_participant_intents(event_id, attendee_id)`, `connections(account_id, business_relevance_score)`, `match_recommendations(event_id, score)`, `interaction_memories(contact_id, occurred_at)`, and `recommendation_tests(case_type, event_id)`.
- JSON boundary: only volatile provider interpretation belongs in `ai_analyses.result_json`; event intent, language, relationship strength, trust, relevance, topics, scores, and actions must remain queryable fields.
- Privacy/provenance gate: every semantic row must carry stable target references, `source`, and non-empty `evidenceIds`; raw prompts, API keys, auth tokens, chain-of-thought, and unrelated user data stay out of product rows.
- Migration gate: local schema `2` maps to remote migration `relationship_schema_v2`; unknown live modes fail closed instead of falling back to mock data.
- Replacement tests must prove remote rows resolve event, attendee, contact, connection, conversation, message, profile, and evidence references before live mode is enabled.
