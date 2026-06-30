# Local Remote Database Boundary

Orbit uses `hybrid` mode for local data that should behave like a future remote
database while still staying inside the developer machine.

## Shape

```text
Feature service
  -> provider / repository interface
  -> shared/local-remote-store
  -> browser localStorage adapter, or memory adapter outside the browser
```

The storage payload is versioned and table-shaped. Sprint 81 advances the schema
to version `2` and the localStorage key to `orbit.local-remote-database.v2`.
The envelope still rejects stale payloads by `schemaVersion` and `storageKind`.

## Collections

The database keeps the existing product collections:

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
- `agentActions`
- `permissions`
- `notifications`

Sprint 81 adds relationship-aware semantic collections:

- `eventParticipantIntents`
- `aiAnalyses`
- `matchRecommendations`
- `interactionMemories`
- `recommendationTests`

Semantic discriminator fields are centralized in `shared/domain/source-types.ts`
so tests, mock fixtures, and future live mappers validate the same allowed
values. This includes `analysisType`, `recommendationType`, `memoryType`,
`caseType`, and `expectedOutcome` in addition to existing source, language,
stage, value, target, trust, and permission values.

## Field Decisions

| Area | Schema decision | Reason |
| --- | --- | --- |
| Event intent | Add `eventParticipantIntents` records with top-level `eventId`, `attendeeId`, optional `contactId`, `lookingFor`, `canOffer`, `preferredLanguage`, `confidence`, `source`, and `evidenceIds`. | Intent is event-specific and repeatedly queried by roster/recommendation flows. Keeping it separate avoids overwriting the attendee import record while remaining queryable without parsing AI JSON. |
| AI analyses | Add `aiAnalyses` with stable `id`, `analysisType`, `target`, `confidence`, `source`, `evidenceIds`, and volatile `resultJson`. | AI explanations and extracted signals change often. Only target/provenance/confidence are promoted; model-shaped details stay in JSON. |
| Relationship profiles | Keep `contacts` and `connections`; promote `relationshipStrength`, `trustLevel`, `businessRelevanceScore`, `sharedTopics`, and `suggestedActions` onto connection records. | These values support sorting, filtering, and action planning across the relationship graph. They belong on the relationship, not on contact identity. |
| Interaction memory | Add `interactionMemories` with contact/connection/conversation/message references, `memoryType`, summary, occurrence time, confidence, source, and evidence. | Memories are durable relationship facts derived from interactions, separate from raw messages and AI analysis payloads. |
| Recommendations | Add `matchRecommendations` with event/contact/attendee/connection references, top-level score, business relevance, shared topics, suggested actions, reason, source, and evidence. | Recommendation lists need deterministic ranking and filtering without reading analysis JSON. |
| Golden matches | Store as `recommendationTests` with `caseType: "golden_match"`, `expectedOutcome: "recommend"`, target references, confidence, source, and evidence. | Golden cases are regression artifacts, not production recommendations. Keeping them in test records prevents demo fixtures from pretending to be product data. |
| Negative cases | Store as `recommendationTests` with `caseType: "negative_case"`, `expectedOutcome: "suppress"`, and the same provenance/reference fields. | Suppression behavior is test data; it should not pollute contacts, connections, or live recommendation tables. |
| Dirty cases | Store as `recommendationTests` with `caseType: "dirty_data"`, `expectedOutcome: "manual_review"`, and source/evidence for the bad input. | Dirty data belongs to regression coverage and later mockdata exports, not core domain rows. |

Rejected fields:

- Global contact `lookingFor` and `canOffer`: rejected because intent changes per
  event and would become stale or misleading on the identity record.
- Raw prompt text, chain-of-thought, model name, and provider token usage on
  product rows: rejected because these are volatile provider details. Store
  future run metadata beside provider audit records, not in contacts or
  connections.
- Free-form personality, chemistry, or likability labels: rejected as
  low-value and high-risk for relationship decisions.
- Embedding vectors and vector index metadata: rejected for this schema sprint;
  vector search and live AI are out of scope.

## Sprint 81 Decision Audit

- Event intent: promote event-specific `lookingFor`, `canOffer`, and `preferredLanguage` on `eventParticipantIntents`; keep attendee import facts on `attendees`; reject global contact intent fields because intent changes by event.
- AI analyses: promote `analysisType`, `target`, `confidence`, `source`, and `evidenceIds`; keep volatile interpretation, rejected fields, and scoring rationale in `resultJson`; reject raw prompts, chain-of-thought, model names, and provider token usage on product rows.
- Relationship profiles: keep identity on `contacts` and relationship state on `connections`; promote `relationshipStrength`, `trustLevel`, `businessRelevanceScore`, `sharedTopics`, and `suggestedActions` on `connections`; reject personality, chemistry, and likability labels.
- Interaction memory: keep raw interaction history in `conversations` and `messages`; add `interactionMemories` for durable contact/connection/conversation/message summaries; reject storing memories only inside AI analysis JSON.
- Recommendations: add `matchRecommendations` with top-level event/contact/attendee/connection references, `score`, `businessRelevanceScore`, `sharedTopics`, and `suggestedActions`; reject recommendation ranking that requires parsing AI JSON.
- Golden matches, negative cases, and dirty cases: keep these regression artifacts in `recommendationTests` with `caseType`, `expectedOutcome`, confidence, source, and evidence; reject mixing them into production contacts, connections, or recommendation feeds.

## Mode

Use `hybrid` for this path. `mock` remains static fixture mode. `live` remains
reserved for a real remote database or provider.

Recommended local command:

```bash
ORBIT_MODULE_MODE=hybrid ORBIT_FEATURE_MODE=hybrid npm run dev
```

## Generated Relationship Seed

The large pre-live relationship dataset is generated by
`harness/relationship_data_goal_runner.py` and enters the app as
`shared/mock/generated-relationship-fixtures.ts`. `shared/mock/fixtures.ts`
exports that generated `MockRuntimeFixtures` object as `defaultMockFixtures`.

Feature services must not read `repos/mockdata` JSON directly. The JSON exports
remain data-generation artifacts; the app-facing handoff is the same DTO shape
that future live providers must produce. This keeps mock, hybrid, and live
replacement tests focused on one contract:

```text
remote rows or generated mockdata
  -> MockRuntimeFixtures / shared domain DTOs
  -> createOrbitLocalRemoteDatabase()
  -> feature hybrid services
```

## Browser And Server Boundary

`window.localStorage` only exists in the browser. Server-side API routes and
agent services cannot directly read a user's browser localStorage. The shared
store therefore accepts a `StorageLike` adapter:

- Browser runtime: uses `window.localStorage` when available.
- Tests and server runtime: use the same database interface with an in-memory
  adapter unless a future remote adapter is registered.
- Future live runtime: replace the adapter/provider with a remote database
  provider without changing feature services.

If the agent must read data authored in browser localStorage, add an explicit
sync/import endpoint later. Do not let pages, API routes, or agent code read raw
localStorage keys directly.

## Contacts

Contacts list/search has a `hybrid` service. It reads from the local remote
database through a provider, maps contact, connection, and evidence records into
the existing contacts contract, and marks provenance with:

```text
source: local-remote-store:orbit.local-remote-database.v2
generationMethod: local-remote-store-query
databaseQueryExecuted: true
searchIndexReadExecuted: false
```

## Core Agent-Facing Services

The following services also have `hybrid` implementations backed by the same
local remote database:

- `event-crud-import`: reads `events` and `evidence`; manual event creation
  writes back to `events` and `evidence`.
- `followup-task-generation`: reads `tasks`, `contacts`, `connections`, and
  `evidence`.
- `dashboard-aggregate`: reads `contacts`, `connections`, `events`, `tasks`,
  and `evidence` to compute the dashboard read model.
- `agent-action-queue`: reads `agentActions`, `contacts`, and `connections`;
  accept/dismiss updates only the local `agentActions` status.
- `chat-conversation-message`: reads `conversations`, `messages`, `contacts`,
  and `connections`; sending a message appends only to local `messages`.
- `app-bootstrap`: reads the same account, profile, relationship, event, task,
  permission, notification, and agent action tables for the first-screen
  aggregate.

These services use the same source marker:

```text
source: local-remote-store:orbit.local-remote-database.v2
generationMethod: local-remote-store-query
```

They still keep external side-effect flags false. `hybrid` means “local
database-shaped store,” not live calendar/email/AI/network execution.

## Hybrid Fallback

All service factories must resolve in `hybrid` mode. Capabilities listed above
use local-remote-store implementations. Capabilities that do not yet have a
table-backed hybrid mapper intentionally fall back to their mock implementation
when `hybrid` is requested.

This fallback exists to keep the app and agent test harness running in hybrid
mode while migrations happen capability by capability. It does not make those
fallback services live, and `live` mode still fails closed unless a real live
provider is registered.
