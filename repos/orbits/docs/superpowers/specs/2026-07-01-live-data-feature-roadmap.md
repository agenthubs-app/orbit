# Orbit Live Data Feature Roadmap

## Context

Orbit is moving from mock-first and hybrid-local data toward remote live storage backed by the shared `orbit_records` table. The remote store must remain a generic record envelope. Domain shape stays in feature contracts, DTOs, mappers, and providers.

The generated relationship dataset lives in `shared/mock/generated-relationship-fixtures.ts` and is exposed as `defaultMockFixtures` from `shared/mock/fixtures.ts`. It contains the full relationship graph used by hybrid/local-remote services: accounts, profiles, events, attendees, contacts, connections, evidence, tasks, conversations, messages, dashboard records, agent actions, permissions, notifications, event participant intents, AI analyses, match recommendations, interaction memories, and recommendation tests.

## Current State

Live remote storage is available through:

- `shared/storage/live-record-store.ts`
- `shared/storage/postgres-live-record-store.ts`
- `shared/storage/configured-live-record-store.ts`
- `shared/storage/live-database-config.ts`
- `shared/storage/migrations.ts`

The following feature families are now wired to explicit remote live providers:

- Generated fixture seed: every `defaultMockFixtures` collection can be seeded and verified in Postgres live record storage.
- `contacts-list-search-filter`: live reads generated `contacts`, `connections`, and `evidence`.
- `contact-detail-tag-status`: live reads generated `contacts`, `connections`, and `evidence`, then previews tag/status/note/last-interaction changes without contact persistence or audit writes.
- `connection-evidence`: live reads generated `connections`, `contacts`, and `evidence`.
- `relationship-stage-profile`: live reads generated `connections`, `contacts`, and `evidence`, then previews stage/profile updates without relationship persistence, audit writes, AI calls, or provider automation.
- `relationship-natural-search`: live searches source-backed relationship records.
- `dashboard-aggregate`: live reads generated dashboard graph records.
- `network-distribution-analytics`: live reads generated `contacts`, `connections`, and `evidence` to produce industry, value type, relationship strength, and network gap analytics without graph algorithms, embedding search, analytics jobs, AI, notifications, or writes.
- `opportunity-reminder-analytics`: live reads generated `tasks`, `contacts`, `connections`, and `evidence` to produce top follow-up opportunities, dormant high-value contacts, current goal matches, and recompute previews without writes, reminders, notifications, external messages, AI, or ranking providers.
- `source-consistency-provenance-audit`: live reads source/evidence metadata from generated relationship records and returns a read-only provenance audit snapshot/run preview without production audit writes, compliance reports, notifications, AI, devices, or external network access.
- `followup-task-generation`: live reads generated `tasks`, `contacts`, `connections`, and `evidence`.
- `message-draft-generator`: live uses source-backed relationship context passed by callers to produce deterministic review-only drafts without AI writing providers, external send, network access, notification delivery, or persistence.
- `event-crud-import`: live reads `events` from Postgres live record storage.
- `event-attendee-roster`: live reads generated `events`, `attendees`, `eventParticipantIntents`, `contacts`, `connections`, `matchRecommendations`, `networkPeople`, and `evidence`, then stages imports to the `event_attendee_rosters` work collection.
- `event-goal-readiness`: live derives goal suggestions, a primary goal, readiness checklist, and preparation state from generated attendee roster context, then stages goal updates to the `event_goal_readiness` work collection.
- `event-encounter-note`: live derives encounter-note capture context from generated attendee roster data, then stages typed notes and evidence to the `event_encounter_notes` work collection.
- `want-to-connect`: live derives on-site match context from generated attendee roster data, then stages operator intent to the `event_want_connect` work collection.
- `post-event-contact-review`: live derives post-event contact review drafts from generated attendee roster data, then stages confirmation provenance to the `event_post_event_reviews` work collection.
- `event-attendee-import`: live reads generated `events`, `attendees`, `eventParticipantIntents`, `networkPeople`, `contacts`, and `evidence` to produce attendee rosters and review-only contact drafts.
- `event-recommendation`: live reads generated `events`, `matchRecommendations`, `attendees`, `eventParticipantIntents`, `contacts`, `connections`, `networkPeople`, and `evidence` to produce ranked event attendee recommendations and rule-based opening-line drafts.
- `event-value-recommendation`: live reads generated `events`, `attendees`, and `matchRecommendations` to rank which source-backed events deserve attention. Accepting a recommendation remains an in-app decision preview with no database writes, calendar changes, notifications, AI calls, event feed access, or external network side effects.
- `orbit-ai`: live artifact tasks can use live contact recommendations, live event recommendations, live follow-up queues, and source-backed chat conversation context through feature/service boundaries.
- `profile`: live reads generated `profiles` and `accounts`, maps them through the profile contract, and upserts manual profile edits back to the shared `profiles` live record.
- `profile-signal-review-queue`: live reads generated `profiles`, `contacts`, `connections`, `messages`, `interactionMemories`, and `evidence` to produce review-only profile update suggestions and accepted patches without profile writes.
- `relationship-value-scoring`: live reads generated `connections`, `contacts`, and `evidence` to produce rule-based relationship value scores and recomputes without writes, ranking models, AI, email, calendar, notification, or external action side effects.
- `agent-action-queue`: live reads generated `agentActions`, `contacts`, `connections`, `evidence`, `matchRecommendations`, and `networkPeople` to produce the review-before-action queue; accept/dismiss only updates the live queue record status and does not execute external actions, messages, calendar writes, notifications, AI calls, devices, or network side effects.
- `agent-autonomy-settings`: live exposes a deterministic safety-policy configuration for low/medium/high autonomy. It remains policy-only: no autonomous execution, scheduled jobs, AI calls, provider calls, database writes, notifications, devices, or external network access.
- `sensitive-action-confirmation`: live exposes deterministic confirmation requirements and decision records for sensitive actions. It records policy decisions only and does not execute messages, contact writes, calendar writes, profile writes, AI calls, devices, or external network access.
- `external-action-sandbox`: live exposes a deterministic no-op sandbox for message/calendar/notification external actions. It never requests real providers, never writes production audit logs, and never performs external side effects.
- `reminder-schedule-notification`: live reads generated `notifications`, `tasks`, `contacts`, `connections`, and `evidence` to produce Orbit in-app reminder schedules and review queue entries without push delivery, email delivery, SMS delivery, cron jobs, device permissions, external networks, or writes.
- `chat-conversation-message`: live reads generated `conversations`, `messages`, `contacts`, and `connections` to power chat conversation lists and threads; `sendMessage` records only a storage-backed outbound message and does not open real-time transport, WebSocket subscriptions, AI, email, calendar, notification, device, external network, or external delivery providers.
- `chat-summary-extraction`: live reads generated `conversations`, `messages`, `contacts`, and `connections` to produce deterministic summary, extracted needs, extracted tasks, relationship profile update proposals, and confirmation-required suggestions without AI, profile writes, task creation, notifications, email, calendar, device access, or external networks.
- `chat-writing-assist`: live reads generated `conversations`, `messages`, `contacts`, and `connections` to produce deterministic polite rewrite, follow-up draft, appointment suggestion, and quick greeting assists without AI writing providers, external send, message persistence, audit-log writes, email, calendar, notification, device access, or external networks.
- `chat-privacy-controls`: live reads generated `conversations`, `messages`, `contacts`, and `connections` to produce deterministic analysis opt-in, deletion preview, hidden private-note, and sensitive-share confirmation controls without AI providers, deletion workers, external share, privacy audit-log writes, database writes, email, calendar, notification, device access, or external networks.
- `app-chat-route-services`: the `/app/chat` page-level service bundle can now resolve the four chat child services in live mode and await async live service results while preserving controlled failure states when live storage is unconfigured.
- `app-contacts-route-services`: the `/app/contacts` page now mounts the capability-first contacts command center, resolves live contacts search, and awaits async live contacts service results while preserving controlled failure states when live storage is unconfigured.
- `app-contact-detail-route-services`: the contact detail route service can resolve live contact detail, connection evidence, and relationship value scoring, await async live results, and map generated contact ids to live connection ids before composing the page model.
- `app-contact-detail-page`: the real `/app/contacts/[id]` route adapter now calls the contact detail live route service, maps the live route model into the existing detail UI view model, and renders a shared controlled failure boundary when live storage is unconfigured.
- `app-contacts-subroutes`: the real `/app/contacts/pipeline`, `/app/contacts/graph`, and `/app/contacts/intros` routes now call the live-capable contacts route service, map its payload into the existing contacts UI view model through a shared adapter, and render shared controlled failure boundaries when live storage is unconfigured.
- `app-contacts-new-route-services`: the real `/app/contacts/new` route adapter now resolves the acquisition and permission child services through module mode, awaits async live results, renders a capability-first acquisition workspace, and preserves a controlled failure boundary when live storage is unconfigured. The live first screen is read-only: it lists or derives acquisition context without creating a manual contact draft unless an explicit action is requested.
- `app-home-route-services`: the real `/`, `/app`, `/app/home`, and `/app/home/events` routes now compose the live-capable events, contacts, and profile route payloads into the existing `OrbitHomeViewModel` UI shape. Home does not read storage directly, does not call the legacy `getOrbitHomeViewModel`, and renders a shared controlled failure boundary when any child route payload is unavailable. The web root and product namespace root now share the live personal Home hub instead of the public landing experience.
- `app-followups-route-services`: the `/app/followups` page now mounts the capability-first followups command center, resolves live follow-up tasks, live message drafts, and live reminders, and awaits async live task/reminder results while preserving controlled failure states when live storage is unconfigured.
- `app-dashboard-route-services`: the `/app/dashboard` page now calls the live-capable dashboard route loader, maps dashboard aggregate, network distribution, opportunity reminder, and provenance audit payloads into `OrbitRealDashboard`, and awaits async live service results while preserving controlled failure states when live storage is unconfigured. The retained dashboard command center is no longer the default web page entry.
- `app-agent-route-services`: the `/app/agent` page now mounts the capability-first agent command center, resolves live agent actions, live autonomy policy, live confirmation policy, live no-op sandbox, and live reminders, and awaits async live action/reminder results while preserving controlled failure states when live storage is unconfigured.
- `app-events-route-services`: the `/app/events` page now mounts the capability-first events command center, resolves live event CRUD/import, live attendee recommendations, live event value recommendations, and live readiness, and awaits async live service results while preserving controlled failure states when live storage is unconfigured.
- `app-event-detail-route-services`: the event detail route service can resolve live event detail, attendee roster, event recommendations/opening lines, readiness, want-to-connect, encounter notes, and post-event review for generated event ids while preserving controlled failure states when live storage is unconfigured.
- `app-event-detail-page`: the real `/app/events/[id]` route adapter now calls the event detail live route service, maps the live route model into the existing event detail UI view model, and renders a shared controlled failure boundary when live storage is unconfigured.
- `api-runtime-mode-boundary`: shared API routes now resolve runtime mode from `ORBIT_MODULE_MODE` before the older `ORBIT_FEATURE_MODE` fallback, so response headers, health probes, and service factories agree on mock/hybrid/live mode.
- `web-home-entry-layout`: the product Home routes keep the approved desktop entry layout across medium and wide browser widths. The Home event list stays beside the profile/contact/schedule entry rail, and the rail width now uses responsive constraints rather than moving above events in web view.

Configured Postgres live providers that participate in composed app pages should reuse `createConfiguredPostgresLiveRecordStore(...)` instead of opening independent pools for the same connection/workspace. This avoids exhausting Supabase session-mode pool limits when one page composes several live child services.

Implementation evidence:

- `features/connections/storage/connection-live-record-provider.ts`,
  `features/acquisition/storage/event-attendee-live-record-provider.ts`,
  `features/chat/storage/chat-conversation-live-record-provider.ts`, and
  `features/agent/storage/agent-action-live-record-provider.ts` now reuse the
  shared configured Postgres live record store instead of opening independent
  `createPgLiveRecordSqlClient` / `createPostgresLiveRecordStore` pools.
- `tests/storage/live-provider-pool-reuse.test.ts` locks this boundary so new
  composed live providers cannot accidentally reintroduce per-feature Postgres
  pools.

Hybrid local-remote services remain available for backwards-compatible local
development and comparison flows:

- Contacts list/search/filter
- App bootstrap aggregate
- Dashboard aggregate
- Followup task generation
- Chat conversation/message
- Agent action queue
- Events CRUD/import

At this point every registered feature-level service factory has an explicit
live branch. Remaining mock-only surfaces should be treated as new capability
gaps, not as the default state of the registered feature inventory. Live
providers still fail visibly when required storage/configuration is missing, and
write-like or external-provider behavior remains staged or confirmation-gated
until a later goal intentionally enables it.

The capability registry is a developer inventory surface, not a business
service. It now reports registered capability groups as `live-ready` in live
mode after their feature-level service boundaries have live providers and
replacement tests. Future capability groups that lack live providers should
still fail closed through `NOT_IMPLEMENTED` until their provider files and tests
exist.

## Roadmap

### Goal 1: Seed All Generated Relationship Fixtures Into Remote Live DB

Create a generic seed and verify path for every `defaultMockFixtures` collection. Store every DTO as payload in `orbit_records`, with stable `collectionName` matching `MOCK_FIXTURE_COLLECTION_NAMES` and stable `recordId` from the DTO `id`. This goal does not change feature runtime behavior; it makes the remote DB a complete test substrate.

Success evidence:

- Local test proves every fixture collection is represented, idempotently.
- Remote seed writes every collection to Supabase.
- Remote verify checks counts and key records.
- Existing events live seed remains valid.

Implementation evidence:

- `tests/services/live-generated-fixture-seed.test.ts` proves all 21
  `MOCK_FIXTURE_COLLECTION_NAMES` collections are seeded idempotently from
  `defaultMockFixtures`, using DTO `id` values as stable live `recordId`s and
  preserving the original DTO payload.
- The same test now corrupts the `participant_001` attendee payload and proves
  `verifyGeneratedRelationshipFixturesInLiveStore` fails when a key relationship
  field no longer matches the generated fixture contract.
- Remote seed for `workspace:orbit-dev` wrote 8267 generated fixture live
  records across accounts, profiles, events, networkPeople,
  personRelationshipEdges, attendees, contacts, connections, evidence, tasks,
  conversations, messages, dashboards, agentActions, permissions,
  notifications, eventParticipantIntents, aiAnalyses, matchRecommendations,
  interactionMemories, and recommendationTests.
- Remote verify passed with 8267 records and validates collection counts, stable
  record IDs, and key record payload/relationship checks for `event_01`,
  `event_signup_01`, `contact_001`, `evidence:event:01`, `participant_001`,
  `intent_001`, `task_001`, `conversation_001`, `message_0001`, and
  `agent_action_001`.

### Goal 2: Contacts Live Provider

Implement a live provider for `features/contacts` that reads the remote `contacts`, `connections`, and `evidence` collections. Live contacts list/search/filter should return generated relationship contacts instead of local mock/hybrid fixtures.

Success evidence:

- `createContactsListSearchAndFilterService("live")` succeeds.
- `/api/contacts` in live mode returns generated contacts.
- Search/filter behavior works against remote records and preserves source/evidence provenance.

Implementation evidence:

- `tests/capabilities/contacts-live-store.test.ts` proves the live contacts
  service reads generated `contacts`, `connections`, and `evidence` records from
  shared live storage, returns all seeded contacts, preserves source/evidence
  provenance, and filters generated contacts by query/source/value.
- `features/contacts/live-service.ts` reuses the existing contacts graph query
  rules with live provenance and fail-closed unconfigured storage behavior.
- `features/contacts/storage/contact-live-record-provider.ts` maps generic
  `orbit_records` rows into contact, connection, and evidence DTOs while leaving
  `shared/storage/live-record-store.ts` generic.
- `features/contacts/service-factory.ts` registers live mode through
  `createConfiguredStorageContactGraphProvider()` and keeps hybrid/mock behavior
  available.

### Goal 3: Connections And Evidence Live Provider

Implement live providers for connection evidence and relationship stage/profile using remote `connections`, `evidence`, `contacts`, and `networkPeople`. This enables contact detail and Orbit AI relationship context to query source-backed remote rows.

Success evidence:

- `connection-evidence` and `relationship-stage-profile` resolve in live mode.
- A generated contact's evidence timeline can be loaded from remote DB.
- Missing records fail visibly instead of falling back to mock.

Implementation evidence:

- `tests/capabilities/contact-detail-live-store.test.ts` proves contact detail live mode reads generated contact, connection, and evidence records from shared live storage and returns source-backed provenance.
- Contact detail `PATCH` is currently a read-backed preview only: tag/status/note/last-interaction changes are reflected in the response, while contact persistence and production audit logging remain explicitly false.
- `tests/capabilities/relationship-stage-profile-live-store.test.ts` proves relationship stage/profile live mode reads generated connection, contact, and evidence records from shared live storage and returns stage/profile previews with writes, audit logs, AI, and external providers explicitly false.

### Goal 4: Attendees And Acquisition Live Provider

Use remote `attendees`, `eventParticipantIntents`, `networkPeople`, `contacts`, and `events` to power event attendee roster/import flows. Keep write-like acquisition actions behind existing confirmation/draft boundaries.

Success evidence:

- Event detail for generated event IDs can show real generated attendees.
- Event attendee import reads remote participant records.
- No automatic contact creation or external provider side effects occur.

Implementation evidence:

- `tests/capabilities/event-attendee-import-live-store.test.ts` proves the live service maps generated attendees and intents into acquisition roster/draft contracts.
- Remote validation for `event_01` returned 50 attendees and 17 known-contact review drafts with no contact writes.
- `tests/capabilities/event-attendee-roster-live-generated-store.test.ts` proves the events attendee-roster live provider maps generated attendee, intent, contact, connection, recommendation, and evidence records into the roster contract.
- Remote validation for the events attendee-roster live provider returned `event_01`, 50 attendees, 17 known contacts, import writes staged to the event work collection, and `x-orbit-feature-mode: live` on the import route.
- `tests/capabilities/event-goal-readiness-live-generated-store.test.ts` proves the events goal-readiness live provider maps generated attendee roster context into three goal suggestions, a primary goal, checklist items, and readiness state without AI/calendar side effects.
- `tests/capabilities/event-encounter-note-live-generated-store.test.ts` proves the events encounter-note live provider maps generated attendee context into capture-ready encounter-note state, stores typed notes in live record storage, and creates relationship evidence without speech-to-text, audio upload, AI, notification, or external network side effects.
- `tests/capabilities/want-connect-live-generated-store.test.ts` proves the events want-connect live provider maps generated attendee context into on-site match state and records operator intent without real-time presence, peer notification, external messaging, notification provider, or model side effects.
- `tests/capabilities/post-event-review-live-generated-store.test.ts` proves the events post-event-review live provider maps generated attendee recommendations into contact review drafts and records confirmation provenance without AI, network, calendar, email, notification, or external message side effects.
- `tests/pages/app-event-detail-live-route-services.test.ts` proves the event detail route reaches live child services instead of failing at the page factory and that the route-level want-to-connect action selects the live match target while allowing storage-only intent writes.
- Remote validation for `event_01` loaded `東京インバウンド飲食店成長会 / Tokyo Inbound Restaurant Growth Forum` with 50 attendees, three recommendations, two post-event contact drafts, one want-connect match, and a storage-only want-connect action for `曾伟`.
- `tests/pages/app-contacts-new-live-route-services.test.ts` proves `/app/contacts/new` no longer bypasses the acquisition service bundle through the legacy contacts view model, returns a controlled live failure when storage is unconfigured, and renders the capability-first route boundary.
- Remote validation for `/app/contacts/new?mode=live` resolved the acquisition workspace from Postgres live storage with ten successful child states and no first-screen manual contact write.

### Goal 5: Search Live Backend

Add a live search backend over remote `contacts`, `events`, `connections`, and `evidence`. Keep Search responsible for retrieval mechanics only; feature adapters remain responsible for query policy and result shaping.

Success evidence:

- Relationship natural search resolves in live mode.
- Structured and fuzzy search work against remote `searchText` and payload fields.
- The design leaves room for later vector/semantic search without changing feature contracts.

Implementation evidence:

- `tests/capabilities/relationship-natural-search-live-store.test.ts` proves live
  relationship search reads generated `contacts`, `connections`, and `evidence`
  through shared live storage, applies query and structured filters, returns
  evidence-backed candidates, and fails closed when live database configuration is
  absent.
- `features/search/live-service.ts` maps live relationship graph records into the
  Search contract, marks database reads explicitly, keeps semantic/vector search
  disabled for this rules-based implementation, and performs no writes, AI calls,
  device access, or external network requests.
- `features/search/service-factory.ts` registers the live relationship natural
  search service while preserving the mock fixture backend.
- The current live backend is structured/fuzzy retrieval over sourced records;
  future vector search should be added behind the same Search contract as an
  additional retrieval engine, not by moving feature-specific search policy into
  Search.
- Runtime API smoke on the local web server verified
  `POST /api/search/relationships` returns `status=200` with
  `x-orbit-feature-mode: live`. `GET /api/search/relationships` is intentionally
  not the search execution path.

### Goal 6: Orbit AI Tool Integration

Point Orbit AI's relationship and event context tools at the live feature providers. Orbit AI remains the planner and chat surface, not the direct database writer. Mutating actions remain behind confirmation boundaries.

Success evidence:

- Orbit AI live trace can retrieve generated contacts/events from remote DB.
- Tool traces show feature/service boundaries, not direct fixture imports.
- Proactive messages can be composed for the Orbit AI chat window without bypassing confirmation.

Implementation evidence:

- `tests/capabilities/event-recommendation-live-store.test.ts` proves the live recommendation service maps generated match recommendations and attendee context into the recommendation/opening-line contracts.
- Live recommendations remain read-only: no AI provider, vector search, external network, contact write, calendar write, message send, or notification delivery is executed.
- `tests/capabilities/orbit-ai-live-trace-store.test.ts` proves the Orbit AI live trace database stage can read selected tool collections from a live record store, marks the interaction as a remote `orbit_records` read, and keeps `liveDatabaseWriteExecuted` false.
- A remote trace smoke with a fake Gemini planner and `maxLoopSteps: 1` read configured Postgres live storage without calling real AI providers or artifact tools. It reported `events: 17`, `contacts: 66`, `connections: 510`, `evidence: 4411`, and `recommendationTests: 235` for the selected `events.recommend` collections.
- The trace database snapshot is read-only diagnostic context. Runtime artifacts still get business data through feature/service boundaries; Orbit AI does not write contacts, events, messages, calendar records, notifications, or external side effects.

### Goal 7: Dashboard, Followups, And Tasks Live Provider

Make dashboard, task generation, and followup surfaces read remote `dashboards`, `tasks`, `agentActions`, `notifications`, `conversations`, and `messages`.

Success evidence:

- `/api/dashboard` and `/api/tasks` can run in live mode.
- App pages show generated relationship data from remote DB.
- Notification/reminder delivery remains staged; no external delivery occurs.

Implementation evidence:

- `tests/capabilities/network-distribution-live-store.test.ts` proves live
  network distribution analytics reads generated contact/connection/evidence
  graph records, creates deterministic industry/value/strength buckets, returns
  network gap recommendations, and leaves source records unchanged.
- Remote validation for `/api/dashboard/distributions` and
  `/api/dashboard/network-gaps` returned `x-orbit-feature-mode: live`, industry
  buckets `Foods=18`, `Technologies=18`, `Partners=12`, `Community=10`,
  `Capital=8`, value buckets `commercial=192`, `strategic=192`,
  `referral=192`, `investor_access=14`, and coverage score `78`.
- `tests/capabilities/opportunity-reminder-live-store.test.ts` proves live
  opportunity reminder analytics reads generated task/contact/connection/evidence
  graph records, ranks pending follow-up opportunities, finds dormant high-value
  contacts, matches them to current goals, and recomputes a read-only preview.
- Remote validation for `/api/dashboard/opportunities` and
  `/api/dashboard/opportunities/recompute` returned `x-orbit-feature-mode: live`,
  source `postgres-live-record-store:opportunity-reminder:workspace:orbit-dev`,
  top opportunities `opportunity:task_007`, `opportunity:task_033`, and
  `opportunity:task_006`, dormant contacts `contact_039`, `contact_114`, and
  `contact_078`, and recompute `generatedOpportunityCount=3`.
- Runtime API smoke on the local web server verified `/api/dashboard`,
  `/api/tasks`, and `/api/notifications?limit=3` return `status=200` with
  `x-orbit-feature-mode: live`.

### Goal 8: Profile Live Provider

Use remote generated `profiles` and `accounts` records to power profile onboarding
and manual profile editing. Keep the profile feature responsible for domain
shape and validation; shared storage remains a generic record envelope.

Success evidence:

- `/api/profile` can run in live mode.
- Profile reads preserve source/evidence provenance from the live records.
- Profile updates upsert manual profile fields to the `profiles` collection
  without adding profile-specific columns to `live-record-store.ts`.

Implementation evidence:

- `tests/capabilities/profile-live-store.test.ts` proves the live service reads
  generated profile/account records and upserts profile edits through shared
  live storage.
- `tests/pages/app-profile-live-route-services.test.ts` proves `/app/profile`
  keeps the live route service bundle and now renders `OrbitRealProfile` instead
  of the old command-center route.
- Browser verification for `/app/profile` showed the real profile editor on
  desktop and mobile with `data-orbit-real-page="profile"` and no
  `.app-profile-route` command-center DOM.
- Remote validation for `profile_orbit_generated_operator` returned
  `x-orbit-feature-mode: live` for both profile GET and PUT.

### Goal 9: Profile Signal Review Live Provider

Use remote generated chat, activity, contact, and evidence records to derive
profile update suggestions. Keep the queue review-only: accepted suggestions
return a patch for the operator-confirmed profile save flow, and never write
profile fields directly.

Success evidence:

- `/api/profile/update-suggestions` can run in live mode.
- `/api/profile/update-suggestions/[id]/accept` can run in live mode.
- Live suggestions preserve source/evidence provenance and expose chat,
  activity, and contact source kinds.
- Accepting a suggestion returns a profile patch and leaves the profile record
  unchanged.

Implementation evidence:

- `tests/capabilities/profile-signal-review-live-store.test.ts` proves the live
  service derives sourced suggestions from generated records and does not mutate
  the `profiles` collection.
- Remote validation returned three live suggestions and `x-orbit-feature-mode:
  live` for both list and accept routes.

### Goal 10: Relationship Value Scoring Live Provider

Use remote generated relationship graph records to score relationship value from
source-backed connections, contacts, and evidence. Keep scoring deterministic
until a dedicated ranking provider is introduced.

Success evidence:

- `/api/analysis/relationship-value/[id]` can run in live mode.
- `/api/analysis/relationship-value/recompute` can run in live mode.
- Live scoring preserves relationship value type, priority score, rationale,
  suggested next action, and source/evidence provenance.
- Recompute uses selected evidence and leaves source records unchanged.

Implementation evidence:

- `tests/capabilities/relationship-value-live-store.test.ts` proves live scoring
  reads generated graph records, recomputes from selected evidence, and does not
  mutate `connections`.
- Remote validation for `connection_0007` returned `community_bridge`, score
  `62`, recompute score `57`, and `x-orbit-feature-mode: live` for detail and
  recompute routes.

### Goal 11: Agent Action Queue Live Provider

Use remote generated `agentActions` plus recommendation/person context to power
the review-before-action queue. Keep live decisions staged: accepting or
dismissing a queue item updates only the action status in shared live storage.
Actual sending, calendar changes, notification delivery, AI provider calls,
device access, and external action execution remain outside this goal.

Success evidence:

- `/api/agent/actions` can run in live mode and return generated action queue
  records.
- `/api/agent/actions/[id]/accept` and `/api/agent/actions/[id]/dismiss` can
  run in live mode and update only the live queue status.
- Live action payloads preserve source references, evidence ids, provenance
  flags, and confirmation boundaries.

Implementation evidence:

- `tests/capabilities/agent-action-queue-live-store.test.ts` proves live action
  queue reads generated action/recommendation/person context, filters by action
  type, writes accept/dismiss decisions to shared live storage, and keeps all
  external side-effect flags false.
- Remote validation for `/api/agent/actions` returned `x-orbit-feature-mode:
  live`, 60 generated actions, first action `agent_action_001`, contact
  `鈴木 真理`, and source
  `postgres-live-record-store:agent-action-queue:workspace:orbit-dev`.
- Remote validation for accept/dismiss returned `x-orbit-feature-mode: live`,
  `liveDatabaseWriteExecuted=true`, and `externalSideEffectExecuted=false`; the
  generated fixture seed was then rerun and verified back to 8267 records.

### Goal 12: Reminder Schedule Notification Live Provider

Use remote generated `notifications` plus task/contact/connection/evidence
context to power the reminder schedule and notification review queue. Keep this
goal read-only: reminders are Orbit in-app review records, not push/email/SMS
delivery jobs and not cron scheduler registrations.

Success evidence:

- `/api/notifications` can run in live mode and return generated notification
  queue records.
- `/api/notifications/reminders/generate` can run in live mode and derive a
  filtered reminder schedule from the same live records.
- Live reminder payloads preserve source references, evidence ids, contact/task
  enrichment, provenance flags, and the no-delivery boundary.

Implementation evidence:

- `tests/capabilities/reminder-schedule-notification-live-store.test.ts` proves
  the live service reads generated notification/task/contact/connection/evidence
  records, filters by priority/frequency/time window, fails closed without DB
  config, and keeps all delivery/write flags false.
- Remote validation for `/api/notifications` returned
  `x-orbit-feature-mode: live`, 40 reminders, 40 queue entries, first reminder
  `notification_001`, follow-up task `task_001`, contact `山崎 美穂`, and source
  `postgres-live-record-store:reminder-schedule-notification:workspace:orbit-dev`.
- Remote validation for `/api/notifications/reminders/generate` with
  `dueWithinDays=2` returned `x-orbit-feature-mode: live`, five reminders,
  generation method `live-reminder-schedule`, `liveDatabaseReadExecuted=true`,
  `liveDatabaseWriteExecuted=false`, and `notificationProviderRequested=false`.

### Goal 13: Capability Registry Live Inventory Alignment

Align the developer capability registry with the current live implementation
state. The registry should continue to default to mock mode, but live mode
should show `live-ready` metadata for registered capability groups whose
feature/service factories now have live boundaries.

Success evidence:

- `createCapabilityService("agent-actions", { mode: "live" })` returns a
  metadata service with `status: "live-ready"` and
  `source: "live-service-factory"` instead of a stale `NOT_IMPLEMENTED` result.
- `listCapabilitySummaries({ mode: "live" })` reports all 11 registered
  capability groups as `live-ready`.
- `/dev/capabilities` copy describes live inventory status instead of implying
  all live services are blocked.

Implementation evidence:

- `tests/services/capability-registry.test.ts` proves live registry metadata
  resolves for all registered capability groups while default mode remains mock.
- `app/dev/capabilities/page.tsx` now shows live-ready and not-implemented
  counts separately, so future gaps remain visible without hiding current live
  progress.
- This goal does not change feature business behavior; concrete live
  implementations remain in `features/*/service-factory.ts` and their providers.

### Goal 14: Chat Conversation Message Live Provider

Use remote generated `conversations`, `messages`, `contacts`, and `connections`
to power the legacy chat conversation list and message thread routes. Keep
`sendMessage` storage-only: it writes a new outbound message row to shared live
storage and updates the conversation timestamp, but does not execute real-time
transport, WebSocket subscriptions, Orbit AI replies, external message delivery,
email, calendar, notification, device, or external network side effects.

Success evidence:

- `/api/chat/conversations` can run in live mode and return generated
  conversation summaries.
- `/api/chat/conversations/[id]` can run in live mode and return generated
  message threads with one-to-one context.
- `/api/chat/conversations/[id]/messages` can run in live mode and record a
  storage-only outbound message while preserving confirmation and side-effect
  boundaries.
- Live payloads preserve source references, evidence ids, contact/connection
  enrichment, provenance flags, and fail-closed configuration behavior.

Implementation evidence:

- `tests/capabilities/chat-conversation-message-live-store.test.ts` proves the
  live service reads generated conversation/message/contact/connection records,
  records a storage-only outbound message, re-reads the updated thread, fails
  closed without DB config, and keeps all transport/provider side-effect flags
  false.
- The live provider is split across `features/chat/live-service.ts` and
  `features/chat/storage/chat-conversation-live-record-provider.ts`, leaving
  `shared/storage/live-record-store.ts` generic and keeping field-specific
  mapping in the feature provider.
- Remote validation for `/api/chat/conversations` returned
  `x-orbit-feature-mode: live`, six conversations, first conversation
  `conversation_001`, participant `山田 千尋`, source
  `postgres-live-record-store:chat-conversation-message:workspace:orbit-dev`,
  `liveDatabaseReadExecuted=true`, `liveDatabaseWriteExecuted=false`, and
  `realtimeTransportRequested=false`.
- Remote validation for `/api/chat/conversations/conversation_001` returned
  14 messages, first message `message_0001`, source
  `postgres-live-record-store:chat-conversation-message:workspace:orbit-dev`,
  `generationMethod=live-store-query`, `liveDatabaseReadExecuted=true`, and
  `liveDatabaseWriteExecuted=false`.
- Focused chat tests and `npm run lint` pass with the widened async-compatible
  chat service interface.

### Goal 15: Chat Summary Extraction Live Provider

Use remote generated `conversations`, `messages`, `contacts`, and `connections`
to power chat summary and relationship-signal extraction. Keep this goal
deterministic and read-only: no AI summarization provider, prompt builder,
profile mutation, task creation, reminder creation, notification delivery,
email, calendar, device, or external network side effects.

Success evidence:

- `POST /api/chat/conversations/[id]/summary` can run in live mode and return a
  source-backed deterministic summary plus review-only extracted signals.
- `GET /api/chat/conversations/[id]/extractions` can run in live mode and return
  extracted needs, tasks, relationship profile update proposals, and
  confirmation-required suggestions.
- Live payloads preserve source references, evidence ids, contact/connection
  enrichment, provenance flags, and fail-closed configuration behavior.

Implementation evidence:

- `tests/capabilities/chat-summary-extraction-live-store.test.ts` proves the
  live service reads generated chat graph records, produces deterministic
  summary/extraction payloads, handles empty/pending/validation/not-found paths,
  fails closed without DB config, and keeps AI/write/profile mutation/provider
  side-effect flags false.
- The live implementation is split across `features/chat/live-summary-service.ts`
  and `features/chat/storage/chat-summary-live-record-provider.ts`; the storage
  adapter reuses the chat conversation live-record mapper while giving summary
  extraction its own provenance source.
- Remote validation for `/api/chat/conversations/conversation_001/summary`
  returned `x-orbit-feature-mode: live`, summary
  `summary:live:conversation_001`, participant `山田 千尋`,
  `generationMethod=live-store-summary`,
  `liveDatabaseReadExecuted=true`, `liveDatabaseWriteExecuted=false`, and
  `aiProviderRequested=false`.
- Remote validation for `/api/chat/conversations/conversation_001/extractions`
  returned one need, one task, one profile update proposal, one confirmation
  suggestion, source
  `postgres-live-record-store:chat-summary-extraction:workspace:orbit-dev`,
  `generationMethod=live-store-extraction`,
  `liveDatabaseReadExecuted=true`, `liveDatabaseWriteExecuted=false`,
  `aiProviderRequested=false`, and `automaticProfileMutationExecuted=false`.

### Goal 16: Chat Writing Assist Live Provider

Use remote generated `conversations`, `messages`, `contacts`, and `connections`
to power chat writing assistance. Keep this goal deterministic and review-only:
no AI writing provider, prompt provider, external send, message persistence,
production audit-log write, email, calendar, notification delivery, device
access, or external network side effects.

Success evidence:

- `POST /api/chat/assist/followup-draft` can run in live mode and return a
  source-backed follow-up draft for generated conversation context.
- `POST /api/chat/assist/rewrite` can run in live mode and return a
  source-backed polite rewrite preview.
- Service methods for appointment suggestion and quick greeting can use the same
  live chat graph.
- Live payloads preserve source references, evidence ids, contact/connection
  enrichment, provenance flags, confirmation requirements, and fail-closed
  configuration behavior.

Implementation evidence:

- `tests/capabilities/chat-writing-assist-live-store.test.ts` proves the live
  service reads generated chat graph records, produces deterministic writing
  assists for `conversation_001`, handles empty/pending/validation/not-found
  paths, fails closed without DB config, and keeps AI/send/write/provider
  side-effect flags false.
- The live implementation is split across `features/chat/live-assist-service.ts`
  and `features/chat/storage/chat-writing-assist-live-record-provider.ts`; the
  storage adapter reuses the chat conversation live-record mapper while giving
  writing assist its own provenance source.
- Remote validation for `/api/chat/assist/followup-draft` returned
  `x-orbit-feature-mode: live`, participant `山田 千尋`, organization
  `Morning Light Foods`, source
  `postgres-live-record-store:chat-writing-assist:workspace:orbit-dev`,
  `generationMethod=rule-based-follow-up-draft`,
  `liveDatabaseReadExecuted=true`, `liveDatabaseWriteExecuted=false`, and
  `externalSendRequested=false`.
- Remote validation for `/api/chat/assist/rewrite` returned
  `x-orbit-feature-mode: live`, participant `山田 千尋`, organization
  `Morning Light Foods`, `generationMethod=rule-based-politeness-rewrite`,
  `liveDatabaseReadExecuted=true`, `liveDatabaseWriteExecuted=false`, and
  `aiProviderRequested=false`.
- The implementation is intentionally not an AI writing provider integration.
  Future AI writing can be added behind the same service contract only after
  separate provider, retention, confirmation, and safety review.

### Goal 17: Chat Privacy Controls Live Provider

Use remote generated `conversations`, `messages`, `contacts`, and `connections`
to power chat privacy controls. Keep this goal deterministic and preview-only:
no AI provider, deletion worker, external share action, privacy audit-log write,
live database write, email, calendar, notification delivery, device access, or
external network side effects.

Success evidence:

- `GET /api/chat/privacy` can run in live mode and return source-backed
  analysis opt-in, deletion preview, hidden private-note, and sensitive-share
  confirmation controls.
- `POST /api/chat/privacy/analysis-toggle` can run in live mode and return a
  reviewable opt-in/opt-out preview without persisting settings.
- Service methods for deletion request and sensitive-share preparation preserve
  confirmation and no-side-effect boundaries.
- Live payloads preserve source references, evidence ids, contact enrichment,
  provenance flags, redaction semantics, confirmation requirements, and
  fail-closed configuration behavior.

Implementation evidence:

- `tests/capabilities/chat-privacy-controls-live-store.test.ts` proves the live
  service reads generated chat graph records, produces deterministic privacy
  control payloads for `conversation_001`, handles empty/pending/not-found/
  validation/confirmation-required paths, fails closed without DB config, and
  keeps AI/deletion/share/write/audit/provider side-effect flags false.
- The live implementation is split across `features/chat/live-privacy-service.ts`
  and `features/chat/storage/chat-privacy-controls-live-record-provider.ts`;
  the storage adapter reuses the chat conversation live-record mapper while
  giving privacy controls its own provenance source.
- Remote validation for `/api/chat/privacy?conversationId=conversation_001`
  returned `x-orbit-feature-mode: live`, participant `山田 千尋`,
  organization `Morning Light Foods`, source
  `postgres-live-record-store:chat-privacy-controls:workspace:orbit-dev`,
  `analysisOptIn.status=opted_in`, `liveDatabaseReadExecuted=true`,
  `liveDatabaseWriteExecuted=false`, `productionDataDeletionExecuted=false`,
  and `productionPrivacyAuditLogWritten=false`.
- Remote validation for `/api/chat/privacy/analysis-toggle?conversationId=conversation_001`
  returned `x-orbit-feature-mode: live`, `analysisOptIn.status=opted_out`,
  `generationMethod=rule-based-analysis-toggle`,
  `liveDatabaseReadExecuted=true`, `liveDatabaseWriteExecuted=false`, and
  `aiProviderRequested=false`.
- The implementation is intentionally not a deletion worker, privacy audit log,
  or external share integration. Future provider integrations require separate
  provider, retention, confirmation, and safety review.

### Goal 18: App Chat Page Live Service Bundle

Wire the `/app/chat` route-level service bundle to the live chat child
services now that conversation/message, summary/extraction, writing assist, and
privacy controls all have explicit live providers. Keep the page as a
composition layer only: it chooses service mode, awaits service results, and
maps contract payloads into UI view models, but it does not implement chat
retrieval, writing, privacy, summary, storage, AI, or transport logic.

Success evidence:

- `resolveAppChatRouteServices("live")` resolves all four child services.
- `loadAppChatRouteViewModel()` can run under `ORBIT_MODULE_MODE=live` and
  return a controlled route-state failure when live storage is not configured.
- `loadAppChatRouteStateViewModel()` can await live child services and preserve
  failure evidence instead of throwing on async service results.
- The page bundle still leaves external send, AI, privacy mutation, notification,
  email, calendar, device, and network side effects to the child service
  contracts and future explicit providers.

Implementation evidence:

- `tests/pages/app-chat-live-route-services.test.ts` proves the app chat bundle
  resolves live services and renders controlled unconfigured-live failures.
- `app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-service-factory.ts`
  now passes the requested module mode through to the feature-level chat service
  factories instead of re-resolving from ambient environment defaults.
- `app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-route-view-model.ts`
  now awaits the existing `T | Promise<T>` chat service results, allowing the
  same page loader to consume mock and live service implementations.
- `app/(app)/app/chat/page.tsx` now mounts the capability-first
  `AppChatCommandCenter` instead of the older static Agent page view model, so
  visiting `/app/chat` uses the live-capable chat route loader.
- `features/chat/storage/chat-conversation-live-record-provider.ts` exposes a
  shared configured chat record store; writing assist, summary/extraction, and
  privacy adapters reuse it instead of opening independent Postgres pools. This
  avoids exhausting Supabase session-mode connection limits when `/app/chat`
  composes all four live child services.
- Remote view-model validation with `ORBIT_MODULE_MODE=live` loaded
  `conversation_001`, participant `山田 千尋`, organization
  `Morning Light Foods`, 14 source-backed chat messages, a follow-up assist,
  a summary narrative, and privacy controls from the seeded live database.
- Remote page-component validation with `ORBIT_MODULE_MODE=live` rendered
  `app-chat-route` with `山田 千尋`, `Morning Light Foods`, and
  `Follow-up draft`.
- Verification: focused app chat/service tests pass, `npm run lint` passes,
  `npm test` passes with 456 tests, and `npm run build` passes with only the
  existing Next.js multiple-lockfile workspace-root warning.

### Goal 19: App Contacts Page Live Service Bundle

Wire the `/app/contacts` route-level service bundle to the live
`contacts-list-search-filter` provider and mount the capability-first contacts
command center from the actual page entry. Keep the page as a composition layer:
it chooses module mode, awaits contacts service results, and maps the contacts
contract into UI view models; contacts retrieval, filtering, provenance, and
storage mapping remain inside the contacts feature.

Success evidence:

- `resolveAppContactsListSearchAndFilterService("live")` resolves the live
  contacts search service.
- `loadAppContactsRouteViewModel()` can run under `ORBIT_MODULE_MODE=live` and
  return a controlled failure when live storage is not configured.
- `/app/contacts/page.tsx` mounts `AppContactsCommandCenter` instead of the
  older static cards list view model.
- The page leaves contact writes, merges, OCR, external imports, messaging,
  email, calendar, notification, device, network, and AI side effects to their
  separate feature contracts and future explicit providers.

Implementation evidence:

- `tests/pages/app-contacts-live-route-services.test.ts` proves the app contacts
  service resolves live mode, the route loader fails closed when storage is
  unconfigured, and the actual `/app/contacts` page renders the
  capability-first command center.
- `app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-service-factory.ts`
  now passes the requested module mode through to the contacts feature factory.
- `app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-route-view-model.ts`
  and `contacts-command-center.tsx` now await the existing `T | Promise<T>`
  contacts service result type.
- `app/(app)/app/contacts/page.tsx` now mounts `AppContactsCommandCenter`.
- Remote page-component validation with `ORBIT_MODULE_MODE=live` rendered
  `app-contacts-route` with source-backed contacts including `山田 千尋` and
  `Morning Light Foods`.
- Verification: focused contacts tests pass, `npm run lint` passes, `npm test`
  passes with 459 tests, and `npm run build` passes with only the existing
  Next.js multiple-lockfile workspace-root warning.

### Goal 20: Message Draft Generator Live Rules

Add an explicit live implementation for `message-draft-generator` so follow-up
composition no longer has to use mock drafts when the surrounding task and
reminder context is live. This provider is intentionally deterministic and
review-only: it consumes source-backed relationship context supplied by callers,
prepares a draft for user review, and keeps AI writing, external send,
notification delivery, database writes, audit-log writes, device access, and
external network access disabled.

Success evidence:

- `createMessageDraftGeneratorService("live")` resolves without falling back to
  mock.
- `createLiveMessageDraftGeneratorService().createDraft(...)` produces a
  source-backed draft with `generatedBy=live-rule-based-draft-generation`.
- Empty live input returns an `empty` payload instead of fabricating fixture
  drafts.
- Draft update remains review-only and does not persist or send anything.

Implementation evidence:

- `tests/capabilities/message-draft-generator-live-rules.test.ts` proves live
  draft generation from sourced relationship context, fail-closed empty state,
  and live factory registration.
- `features/followups/live-message-draft-service.ts` implements the deterministic
  review-only live rules.
- `features/followups/message-draft-contract.ts` now distinguishes live rule
  provenance from mock fixture provenance without changing the storage layer.
- `features/followups/service-factory.ts` registers live mode for
  `message-draft-generator`.
- Verification: the RED test failed first because the live service file did not
  exist; after implementation, the focused command ran the full suite and passed
  with 462 tests.

### Goal 21: App Followups Page Live Service Bundle

Wire the `/app/followups` route-level service bundle to live follow-up task
generation, live message draft generation, and live reminder/notification
preview. Keep the page as a composition layer only: it chooses module mode,
awaits service results, maps feature contracts into UI view models, and never
implements task storage, draft writing, reminder scheduling, message delivery,
calendar writes, email, notification provider calls, AI, device access, or
external network behavior itself.

Success evidence:

- `resolveAppFollowupsRouteServices("live")` resolves all three child services.
- `loadAppFollowupsRouteViewModel()` can run under `ORBIT_MODULE_MODE=live` and
  return a controlled route-state failure when live storage is unconfigured.
- `/app/followups/page.tsx` mounts `AppFollowupsCommandCenter` instead of the
  older static schedule view model.
- The route loader can await live task/reminder service results while continuing
  to consume synchronous draft generation.

Implementation evidence:

- `tests/pages/app-followups-live-route-services.test.ts` proves the app
  followups service bundle resolves live mode, fails closed without storage, and
  renders the actual page through the capability-first command center.
- `app/(app)/app/followups/compose-app-followups-from-previously-approved-mock-first-capabilities/followups-service-factory.ts`
  now passes the requested module mode through to follow-up task, message draft,
  and reminder feature factories.
- `app/(app)/app/followups/compose-app-followups-from-previously-approved-mock-first-capabilities/followups-route-view-model.ts`
  now awaits the existing `T | Promise<T>` task and reminder service result
  types.
- `app/(app)/app/followups/compose-app-followups-from-previously-approved-mock-first-capabilities/followups-command-center.tsx`
  is now an async server component.
- `app/(app)/app/followups/page.tsx` now mounts `AppFollowupsCommandCenter`.
- Remote page/view-model validation with `ORBIT_MODULE_MODE=live` loaded a
  success state from the seeded remote database: 80 follow-up tasks, one live
  draft, four reminders, priority relationship `刘雨薇` at
  `Morning Light Foods`, and page markup containing source-backed seeded
  relationship records including `山崎 美穂` and `Aoba Technologies`.
- Verification: focused followups tests pass, `npm run lint` passes, the latest
  full test run passes with 465 tests, and `npm run build` passes with only the
  existing Next.js multiple-lockfile workspace-root warning.

### Goal 22: Source Consistency Provenance Audit Live Store

Add an explicit live implementation for `source-consistency-provenance-audit`
so dashboard and future quality surfaces can inspect whether live records carry
source/evidence metadata. This remains a read-only capability: it summarizes the
live record envelopes and can preview an audit run, but it does not write
production audit records, compliance reports, notifications, messages, AI calls,
device access, or external network requests.

Success evidence:

- `createSourceConsistencyProvenanceAuditService("live")` resolves without
  falling back to mock.
- Live snapshot reads generated `contacts`, `connections`, `evidence`,
  `matchRecommendations`, `tasks`, `conversations`, and `agentActions`.
- Live audit run reports evaluated record counts and finding IDs without
  writing audit records.
- Unconfigured live storage fails closed with
  `SOURCE_CONSISTENCY_PROVENANCE_AUDIT_LIVE_STORE_UNCONFIGURED`.

Implementation evidence:

- `tests/capabilities/source-consistency-provenance-audit-live-store.test.ts`
  proves seeded live records can be audited read-only, with seven audited
  collections, zero findings for the generated dataset, live provenance flags,
  and no writes.
- `features/audit/live-provenance-audit-service.ts` implements the deterministic
  live snapshot/run provider.
- `features/audit/storage/source-consistency-provenance-audit-live-record-provider.ts`
  maps the generic live record collections into audit entity kinds.
- `features/audit/service-factory.ts` registers live mode.
- The existing mock audit tests still pass, preserving the fixture/debug/API
  behavior.

### Goal 23: App Dashboard Page Live Service Bundle

Wire the `/app/dashboard` route-level service bundle to live dashboard
aggregate, network distribution analytics, opportunity reminder analytics, and
source-consistency provenance audit. Keep the page as a composition layer only:
it selects module mode, awaits service results, maps feature contracts into UI
view models, and leaves analytics/storage/audit logic inside feature providers.

Success evidence:

- `resolveAppDashboardRouteServices("live")` resolves all four child services.
- `loadAppDashboardRouteViewModel()` can run under `ORBIT_MODULE_MODE=live` and
  return a controlled route-state failure when live storage is unconfigured.
- `/app/dashboard/page.tsx` mounts the real dashboard route adapter instead of
  the older static party/dashboard view model or command-center evidence UI.
- The route loader can await live dashboard, distribution, opportunity, and
  audit service results.

Implementation evidence:

- `tests/pages/app-dashboard-live-route-services.test.ts` proves the app
  dashboard service bundle resolves live mode, fails closed without storage,
  renders the actual page through `OrbitRealDashboard`, and keeps command-center
  evidence/provenance accordions out of the default success UI.
- `app/(app)/app/dashboard/compose-app-dashboard-from-previously-approved-mock-first-capabilities/dashboard-service-factory.ts`
  now passes the requested module mode through to dashboard aggregate, network
  distribution, opportunity reminder, and provenance audit feature factories.
- `app/(app)/app/dashboard/compose-app-dashboard-from-previously-approved-mock-first-capabilities/dashboard-route-view-model.ts`
  now awaits existing `T | Promise<T>` service result types.
- `app/(app)/app/dashboard/compose-app-dashboard-from-previously-approved-mock-first-capabilities/dashboard-view-model-adapter.ts`
  maps route success payloads into the product dashboard view model.
- `app/(app)/app/dashboard/orbit-real-dashboard.tsx` renders the product
  dashboard shell, localized metric chrome, priority card, coverage gaps,
  industry concentration, source readiness counts, and recent activity without
  raw evidence accordions.
- `app/(app)/app/dashboard/page.tsx` now mounts `OrbitRealDashboard`.
- `shared/storage/configured-live-record-store.ts` provides a shared configured
  Postgres live record store/cache. Dashboard and audit configured providers now
  reuse it so a composed live dashboard request does not open independent pools
  for the same remote database.
- Remote page/view-model validation with `ORBIT_MODULE_MODE=live` returned a
  success state from the remote database: five summary metrics, four recent
  activity rows, three high-priority opportunities, three dormant high-value
  contacts, three network gaps, seven audited collections, zero active audit
  findings, and rendered `data-orbit-real-page="dashboard"` with zero
  command-center `details` elements on desktop and mobile screenshots.
- Verification: focused storage/dashboard/audit tests pass; remote validation no
  longer hits Supabase `max clients reached in session mode`.

### Goal 24: App Agent Page Live Service Bundle

Wire the `/app/agent` route-level service bundle to live agent action queue,
live reminder queue, and explicit live safety-policy services for autonomy
settings, sensitive-action confirmation, and external-action sandboxing. The
page remains a review surface: it selects module mode, awaits live reads, maps
feature contracts into UI view models, and does not execute external actions.

Success evidence:

- `resolveAppAgentRouteServices("live")` resolves all five child services.
- `createAgentAutonomySettingsService("live")`,
  `createSensitiveActionConfirmationService("live")`, and
  `createExternalActionSandboxService("live")` resolve explicit live policy
  providers rather than mock fallback.
- `loadAppAgentRouteViewModel()` can run under `ORBIT_MODULE_MODE=live` and
  return a controlled route-state failure when live storage is unconfigured.
- `/app/agent/page.tsx` mounts `AppAgentCommandCenter` instead of the older
  static agent view model.

Implementation evidence:

- `tests/capabilities/agent-live-policy-services.test.ts` proves the live
  autonomy settings, confirmation guard, and external action sandbox services
  return live-policy provenance and keep autonomous execution, provider calls,
  external side effects, and scheduled jobs disabled.
- `tests/pages/app-agent-live-route-services.test.ts` proves the app agent
  service bundle resolves live mode, fails closed without storage, and renders
  the actual page through the capability-first command center.
- `features/agent/live-settings-service.ts`,
  `features/permissions/live-confirmation-service.ts`, and
  `features/agent/live-external-action-sandbox.ts` implement deterministic
  live policy/no-op providers.
- `app/(app)/app/agent/compose-app-agent-from-previously-approved-mock-first-capabilities/agent-route-view-model.ts`
  now awaits existing `T | Promise<T>` agent action and reminder service result
  types.
- `app/(app)/app/agent/compose-app-agent-from-previously-approved-mock-first-capabilities/agent-command-center.tsx`
  is now an async server component.
- `app/(app)/app/agent/page.tsx` now mounts `AppAgentCommandCenter`.
- Remote page/view-model validation with `ORBIT_MODULE_MODE=live` returned a
  success state from the remote database: 60 live agent actions, 40 live
  notification queue entries, four live confirmation policy requirements,
  medium autonomy policy, and rendered `app-agent-route` markup.

### Goal 25: App Events Page Live Service Bundle

Wire the `/app/events` route-level service bundle to live event CRUD/import,
live attendee recommendations, live event value recommendations, and live event
readiness. Keep event value ranking inside `features/recommendations`; the page
only selects module mode, awaits service results, maps feature contracts into UI
view models, and renders controlled route states.

Success evidence:

- `resolveAppEventsRouteServices("live")` resolves all four child services.
- `createEventValueRecommendationService("live")` resolves an explicit live
  store provider rather than mock fallback.
- `loadAppEventsRouteViewModel()` can run under `ORBIT_MODULE_MODE=live` and
  return a controlled route-state failure when live storage is unconfigured.
- `/app/events/page.tsx` mounts `AppEventsCommandCenter` instead of the older
  landing/explore view model.

Implementation evidence:

- `tests/capabilities/event-value-recommendation-live-store.test.ts` proves
  live event value recommendations rank seeded generated events from shared
  storage, prefer the Japanese/AI PoC event for an AI workflow query, mark
  database reads explicitly, and keep accept actions write-free.
- `tests/pages/app-events-live-route-services.test.ts` proves the app events
  service bundle resolves live mode, fails closed without storage, and renders
  the actual page through the capability-first command center.
- `features/recommendations/live-event-value-service.ts` implements deterministic
  live event value ranking from sourced event, attendee, and match
  recommendation records without event discovery feeds, calendar providers, AI,
  notifications, external networks, or writes.
- `features/recommendations/storage/event-value-live-record-provider.ts` maps
  generic `orbit_records` rows from `events`, `attendees`, and
  `matchRecommendations` into the event value provider model.
- `app/(app)/app/events/compose-app-events-from-previously-approved-mock-first-capabilities/events-service-factory.ts`
  now passes requested module mode through to child feature factories and
  exposes `resolveAppEventsRouteServices`.
- `app/(app)/app/events/compose-app-events-from-previously-approved-mock-first-capabilities/events-route-view-model.ts`
  now awaits event value service results and action previews.
- `app/(app)/app/events/page.tsx` now mounts `AppEventsCommandCenter`.
- Events/recommendations configured live providers now reuse
  `createConfiguredPostgresLiveRecordStore(...)` so the composed live events page
  does not open independent Postgres pools for the same connection/workspace.
- Remote page/view-model validation with `ORBIT_MODULE_MODE=live` returned a
  success state from the remote database: 17 events, primary/top event
  `名刺プロフィール生成ワークショップ / Business Card Profile Generation
  Workshop`, top attendee recommendation `Daniel Ahmed`, readiness score 87,
  and no action side effects.
- Verification: focused event value, event recommendation, event CRUD, event
  readiness, event live seed, and app events page tests pass.

### Goal 26: App Profile Page Live Service Bundle

Wire the `/app/profile` route-level service bundle to live manual profile reads,
live profile signal review suggestions, and an explicit live policy provider for
document extraction. Keep document extraction fail-closed/policy-only until an
approved OCR, parser, or AI extraction provider exists. Keep `/app/profile` page
rendering read-only: preferred intro channel actions are local previews and must
not write the remote profile record during GET rendering.

Success evidence:

- `resolveAppProfileRouteServices("live")` resolves profile, document
  extraction, and profile signal review services.
- `createProfileDocumentExtractionService("live")` resolves an explicit
  policy-only provider rather than mock fallback.
- `loadAppProfileRouteViewModel()` can run under `ORBIT_MODULE_MODE=live` and
  return a controlled route-state failure with `PROFILE_LIVE_STORE_UNCONFIGURED`
  when live storage is unconfigured.
- `/app/profile/page.tsx` mounts `AppProfileCommandCenter` instead of the older
  static `OrbitRealProfile` view model.

Implementation evidence:

- `tests/capabilities/profile-document-extraction-live-policy.test.ts` proves
  live document extraction returns empty policy-only resume/business-card
  payloads with `live-policy-no-op` provenance.
- `tests/pages/app-profile-live-route-services.test.ts` proves the app profile
  service bundle resolves live mode, fails closed without storage, and renders
  the actual page through the capability-first command center.
- `features/profile/live-extraction-service.ts` implements the policy-only live
  document extraction boundary without OCR, parsing, AI, file storage, external
  networks, writes, or provider calls.
- `app/(app)/app/profile/compose-app-profile-from-previously-approved-mock-first-capabilities/profile-service-factory.ts`
  composes the profile, extraction, and signal review feature services through a
  page-level live/mock service bundle.
- `app/(app)/app/profile/compose-app-profile-from-previously-approved-mock-first-capabilities/profile-route-view-model.ts`
  now awaits async live profile/signal services and renders live failures through
  route-state `StateView` data with `errorCode`.
- `app/(app)/app/profile/page.tsx` now mounts `AppProfileCommandCenter`.
- Remote page/view-model validation with `ORBIT_MODULE_MODE=live` returned a
  success state from the remote database: profile owner `結城 航太郎`,
  completeness score 100, three profile update suggestions, and document
  extraction evidence `evidence:profile-document-live-policy:resume`.
- Verification: focused profile live/policy/page tests, `npm run lint`,
  `npm test` with 487 tests, and `npm run build` pass.

### Goal 27: Orbit AI Command And Proactive Live Policy Providers

Register explicit live implementations for the remaining core Orbit AI command
and proactive agent boundaries. Keep `orbit-agent-conversation` as the provider
runtime for natural-language model calls. The old `orbit-ai-command` service is
a read-only command surface: in live mode it should await live Events, Contacts,
Followups, Dashboard, and Agent queue services, then summarize their sourced
records into command-center stage items without executing external actions.
The proactive agent live implementation remains policy-only: it turns structured
signals into Orbit AI chat-window assistant turns and never delivers push
notifications, sends email, writes calendar records, writes live storage, or
calls an AI provider.

Success evidence:

- `resolveOrbitAiCommandService("live")` resolves a live command service instead
  of returning `NOT_IMPLEMENTED`.
- `resolveOrbitAiProactiveAgentService("live")` resolves an explicit live
  policy provider instead of mock fallback.
- `OrbitAiCommandService.getCommandCenter()` is async-compatible, so sync mock
  and async live child service reads share the same service interface.
- The old `OrbitAiCommandCenter` route adapter awaits the view model and remains
  no-side-effect.

Implementation evidence:

- `features/orbit-ai/live-command-service.ts` reads live event, contact,
  followup, dashboard, and agent queue services sequentially, catches individual
  child-service failures, keeps evidence visible, and returns
  `sideEffectsExecuted=false`.
- `features/orbit-ai/live-proactive-service.ts` creates in-chat proactive
  assistant turns with `live-policy-proactive-turn` provenance and an explicit
  safety ledger showing no push, notification, email, calendar, storage write,
  provider, or network side effects.
- `features/orbit-ai/service.ts`,
  `features/orbit-ai/service-factory.ts`, and
  `features/orbit-ai/proactive-service-factory.ts` now expose these live
  implementations through the existing module-mode factory boundary.
- `tests/capabilities/orbit-ai-live-command-and-proactive.test.ts` proves live
  command/proactive service registration, async live child-service composition,
  sourced evidence, and no-side-effect proactive chat turns.
- `tests/services/core-service-factories.test.ts` now proves
  `orbit-ai-command` live mode resolves successfully and still reports no side
  effects.
- Remote command smoke with `ORBIT_MODULE_MODE=live` returned live stage items
  from the remote database, including
  `日中投資家・創業者申込サロン / Japan-China Investor Founder Signup Salon`,
  `東京AI実装パートナー申込会 / Tokyo AI Implementation Partner Registration Meetup`,
  `佐藤 健一`, `高橋 智子`, and `Review follow-up for contact_102`, with
  `sideEffectsExecuted=false`.
- Verification: focused Orbit AI tests, `npm run lint`, `npm test` with 490
  tests, and `npm run build` pass.

### Goal 28: Account Live Storage Session Boundary

Register an explicit live account session implementation backed by remote
`orbit_records` `accounts` and `profiles` collections. This is not real auth:
it does not read or write tokens, cookies, OAuth callbacks, Supabase Auth state,
or identity-provider sessions. It gives app/API code a remote-backed
operator/workspace context so live-mode feature testing no longer has to depend
on the local mock account fixture.

Success evidence:

- `resolveAccountSessionService("live")` resolves a live service instead of
  `NOT_IMPLEMENTED`.
- `createLiveAccountSessionService()` fails closed with
  `ACCOUNT_LIVE_STORE_UNCONFIGURED` when no live database is configured.
- A memory live record store seeded with `account_orbit_generated` and
  `profile_orbit_generated_operator` maps into an `AccountSessionPayload` with
  `privacy="live-account-session"`.
- `/api/account/me` now aligns its runtime header and service selection by
  resolving mode from `ORBIT_MODULE_MODE ?? ORBIT_FEATURE_MODE`, passing that
  mode into the account service factory, and awaiting async service reads.

Implementation evidence:

- `features/account/storage/account-live-record-provider.ts` reads `accounts`
  and `profiles` from shared live record storage and maps only field-specific
  account/profile DTOs. The generic storage envelope remains unchanged.
- `features/account/live-service.ts` maps remote account/profile records into
  the existing Account session contract, including signed-in, signed-out,
  pending, require-account, and unconfigured live-storage outcomes.
- `features/account/service.ts` now allows account session methods to return
  sync or async results, so sync mock and async live providers share the same
  interface.
- `features/account/service-factory.ts` registers the live implementation via
  the configured storage provider.
- `tests/capabilities/account-live-store.test.ts` proves live storage mapping,
  unconfigured fail-closed behavior, live factory registration, and account API
  live-mode failure envelopes.
- Remote live smoke with `ORBIT_MODULE_MODE=live` returned
  `account_orbit_generated`, workspace `Orbit Generated Relationship
  Workspace`, user `profile_orbit_generated_operator`, display name
  `結城 航太郎`, and `privacy="live-account-session"`.
- Verification: focused account live/mock tests, `npm run lint`, `npm test`
  with 494 tests, and `npm run build` pass.

### Goal 29: Permissions Live Storage Staged Authorization Boundary

Register an explicit live implementation for `permission-state` backed by the
remote `permissions` collection. Keep this as a staged authorization/read-model
boundary: it reads remote permission records and creates in-app review payloads,
but does not open browser permission prompts, OAuth/SSO redirects, calendar or
email provider flows, notification delivery, camera access, device APIs, or
external network calls.

Success evidence:

- `resolvePermissionStateService("live")` resolves a live service instead of
  `NOT_IMPLEMENTED`.
- `createLivePermissionStateService()` fails closed with
  `PERMISSION_STATE_LIVE_STORE_UNCONFIGURED` when no live store is configured.
- A memory live record store seeded with
  `permission_relationship_local_remote` maps
  `relationship_local_remote_database` to the product UI capability
  `event-data`, preserving evidence and `privacy="live-permission-state"`.
- `/api/permissions` now aligns its runtime header and service selection by
  resolving mode from `ORBIT_MODULE_MODE ?? ORBIT_FEATURE_MODE`, passing that
  mode into the permission service factory, and awaiting async service reads.

Implementation evidence:

- `features/permissions/storage/permission-live-record-provider.ts` reads the
  `permissions` live record collection and maps provider payloads into shared
  `PermissionStateDTO` records. Generic storage remains unchanged.
- `features/permissions/live-service.ts` maps remote permission DTOs into the
  staged authorization UI contract and keeps `requestPermission()` review-only.
- `features/permissions/service.ts` now allows sync mock and async live
  permission state services to share the same interface.
- `features/permissions/service-factory.ts` registers the live implementation.
- `tests/capabilities/permission-state-live-store.test.ts` proves live storage
  mapping, unconfigured fail-closed behavior, live factory registration, and
  API live-mode failure envelopes.
- Remote live smoke with `ORBIT_MODULE_MODE=live` returned one live permission
  record mapped as `event-data:pending`, with
  `privacy="live-permission-state"`.
- Verification: focused permission live/mock tests, `npm run lint`, `npm test`
  with 498 tests, and `npm run build` pass.

### Goal 30: App Bootstrap Live Storage First-Screen Aggregate

Register an explicit live implementation for `app-bootstrap` backed by remote
`orbit_records`. This turns the main app shell bootstrap from mock/hybrid-only
into a source-backed remote read model for account, profile, events, contacts,
connections, tasks, agent actions, permissions, notifications, and evidence.

Success evidence:

- `createAppBootstrapService("live")` resolves a live service instead of
  `NOT_IMPLEMENTED`.
- `createLiveAppBootstrapService()` fails closed with
  `APP_BOOTSTRAP_LIVE_STORE_UNCONFIGURED` when no live storage is configured.
- A memory live record store seeded with bootstrap graph records aggregates a
  successful `AppBootstrapPayload` with `privacy="live-app-bootstrap"`,
  `databaseReadExecuted=true`, `databaseWriteExecuted=false`, and
  `liveDatabaseAggregationExecuted=true`.
- `/api/app/bootstrap` now aligns runtime header and service selection by
  resolving mode from `ORBIT_MODULE_MODE ?? ORBIT_FEATURE_MODE`, passing that
  mode into the bootstrap service factory, and awaiting async service reads.

Implementation evidence:

- `features/bootstrap/storage/bootstrap-live-record-provider.ts` reads
  `accounts`, `profiles`, `contacts`, `connections`, `events`, `tasks`,
  `agentActions`, `permissions`, `notifications`, and `evidence` collections
  from shared live record storage. The generic storage envelope remains
  unchanged.
- `features/bootstrap/live-service.ts` maps remote DTOs into the existing app
  bootstrap contract, including success, empty, pending, controlled failure,
  task-limit, and unconfigured live-storage outcomes.
- `features/bootstrap/service.ts` now allows sync mock and async live bootstrap
  services to share one interface.
- `features/bootstrap/service-factory.ts` registers the live implementation
  through the configured storage provider.
- `app/(app)/compose-app-from-previously-approved-mock-first-capabilities/app-workbench.tsx`
  now awaits bootstrap reads so the legacy app shell can run against live
  storage.
- `features/orbit-ai/mock-service.ts` pins its mock bootstrap dependency to
  `"mock"` so the mock Orbit AI command service remains synchronous even when
  process-level module mode is live.
- `tests/capabilities/app-bootstrap-live-store.test.ts` proves live storage
  mapping, unconfigured fail-closed behavior, live factory registration, and
  API live-mode failure envelopes.
- Remote live smoke with `ORBIT_MODULE_MODE=live` returned workspace
  `Orbit Generated Relationship Workspace`, profile `結城 航太郎`, 13 events,
  66 contacts, 510 connections, 3 task-limit results, 3 agent actions, staged
  permission `relationship_local_remote_database`, 40 pending notifications,
  and first event
  `日中投資家・創業者申込サロン / Japan-China Investor Founder Signup Salon`.
- Verification: focused bootstrap live/mock tests, service factory/hybrid/page
  tests, `npm run lint`, `npm test` with 502 tests, and `npm run build` pass.

### Goal 31: Contact Acquisition Draft Live Storage Boundary

Register an explicit live implementation for `contact-acquisition-draft-pipeline`
backed by remote `orbit_records`. This turns acquisition drafts from a
mock-only review queue into a storage-backed boundary that can list explicit
`contactDrafts` records and derive event-import drafts from live attendees.

Success evidence:

- `createContactAcquisitionDraftService("live")` resolves a live service
  instead of `NOT_IMPLEMENTED`.
- `createLiveContactAcquisitionDraftService()` fails closed with
  `CONTACT_DRAFT_LIVE_STORE_UNCONFIGURED` when no live storage is configured.
- A memory live record store seeded with event, attendee, intent, person, and
  evidence records derives an `event_import` contact draft with
  `privacy="live-contact-acquisition-drafts"`,
  `liveDatabaseReadExecuted=true`, and no contact write.
- `confirmContactDraft()` writes only a confirmed draft record back to the
  `contactDrafts` live collection and returns a downstream contact candidate;
  the `contacts` collection remains untouched.
- `/api/contact-drafts` and `/api/contact-drafts/[id]/confirm` now align
  runtime header and service selection by resolving mode from
  `ORBIT_MODULE_MODE ?? ORBIT_FEATURE_MODE`, passing that mode into the
  acquisition draft service factory, and awaiting async service reads.

Implementation evidence:

- `features/acquisition/storage/contact-draft-live-record-provider.ts` reads
  `contactDrafts`, `events`, `attendees`, `eventParticipantIntents`,
  `networkPeople`, and `evidence` collections from shared live record storage.
  Generic storage remains unchanged.
- `features/acquisition/live-service.ts` maps stored drafts and derived
  attendee drafts into the existing contact acquisition draft contract,
  including success, empty, pending, controlled failure, confirmation, and
  unconfigured live-storage outcomes.
- `features/acquisition/service.ts` now allows sync mock and async live
  acquisition draft services to share one interface.
- `features/acquisition/service-factory.ts` registers the live implementation
  through the configured storage provider.
- `app/(app)/app/contacts/new/compose-app-contacts-new-from-previously-approved-mock-first-capabilities/contacts-new-route-services.ts`
  pins the legacy contacts-new workbench to mock acquisition drafts so it
  remains synchronous until that page is migrated.
- `tests/capabilities/contact-acquisition-draft-live-store.test.ts` proves
  live storage mapping, no direct contact writes, unconfigured fail-closed
  behavior, live factory registration, and API live-mode failure envelopes.
- Remote live smoke with `ORBIT_MODULE_MODE=live` returned 500 live-derived
  draft candidates from workspace `workspace:orbit-dev`; first draft
  `event-draft:live:event_01:participant_001` is `event_import`,
  `pending_confirmation`, and has `contactWriteExecuted=false`.
- Verification: focused acquisition live/mock tests, `npm run lint`,
  `npm test` with 507 tests, and `npm run build` pass.

### Goal 32: Manual Contact Creation Live Draft Writes

Register an explicit live implementation for `manual-contact-creation` backed by
the existing contact draft live storage provider. This turns manual contact
intake from a mock-only fixture into a remote draft write path while preserving
the rule that acquisition never writes final `contacts` records directly.

Success evidence:

- `createManualContactCreationService("live")` resolves a live service instead
  of `NOT_IMPLEMENTED`.
- `createLiveManualContactCreationService()` fails closed with
  `MANUAL_CONTACT_LIVE_STORE_UNCONFIGURED` when no live storage is configured.
- A memory live record store can stage a manual draft into the central
  `contactDrafts` collection with `privacy="live-manual-contact-creation"`,
  `contactDraftWriteExecuted=true`, and `contactWriteExecuted=false`.
- The central contact acquisition draft live service can read the manual draft
  from `contactDrafts`, proving manual intake joins the unified review queue.
- `confirmManualContactDraft()` writes only the confirmed draft back to
  `contactDrafts`, returns a downstream contact candidate with manual note,
  tags, and follow-up hint, and leaves the `contacts` collection untouched.
- `/api/contact-drafts/manual` and manual draft confirmation now resolve mode
  from `ORBIT_MODULE_MODE ?? ORBIT_FEATURE_MODE`, pass that mode into the manual
  service factory, and await async live service reads/writes.

Implementation evidence:

- `features/acquisition/live-manual-service.ts` maps manual input into a central
  `ContactAcquisitionDraft` payload with manual-specific note, tags, and
  follow-up hint metadata preserved in the stored record.
- `features/acquisition/manual-contract.ts` now supports live manual provenance,
  live storage failure codes, async-compatible service results, and optional
  display-name, role, and organization input fields.
- `features/acquisition/mock-manual-service.ts` exports a sync mock service
  type so deterministic debug/page surfaces are not forced async by the live
  interface.
- `features/acquisition/service-factory.ts` registers live manual creation
  through `createConfiguredStorageContactAcquisitionDraftProvider()`.
- `tests/capabilities/manual-contact-creation-live-store.test.ts` proves live
  storage mapping, central draft queue visibility, no direct contact writes,
  unconfigured fail-closed behavior, live factory registration, and API
  live-mode failure envelopes.
- Remote live smoke with `ORBIT_MODULE_MODE=live` wrote and confirmed
  `manual-draft:live:sato-robotics-2026-07-02t08-30-00-000z` in workspace
  `workspace:orbit-dev`; the central draft queue returned it as
  `source.type="manual"`, `status="confirmed"`, and `contactWriteExecuted=false`
  while remote `contacts` remained at 66 records.
- Verification: focused manual/acquisition live/mock tests, `npm run lint`,
  `npm test` with 512 tests, and `npm run build` pass.

### Goal 33: Duplicate Detection And Merge Live Review Boundary

Register an explicit live implementation for `duplicate-detection-merge` backed
by the shared live record store. This turns duplicate merge from a mock-only
fixture into a source-backed review flow that compares imported contact drafts
against existing contacts without executing a final merge write.

Success evidence:

- `createDuplicateMergeService("live")` resolves a live service instead of
  `NOT_IMPLEMENTED`.
- `createLiveDuplicateMergeService()` fails closed with
  `DUPLICATE_MERGE_LIVE_STORE_UNCONFIGURED` when no live storage is configured.
- A memory live record store seeded with a pending `contactDrafts` record and an
  existing `contacts` record generates a duplicate candidate using email and
  name+organization match reasons.
- `applyMergeSuggestion()` returns a confirmation preview, field decisions, and
  confirmation evidence while leaving the `contacts` collection unchanged.
- `/api/contact-drafts/merge-suggestions` and
  `/api/contact-drafts/merge-suggestions/[id]/apply` resolve mode from
  `ORBIT_MODULE_MODE ?? ORBIT_FEATURE_MODE` and await async live service reads.

Implementation evidence:

- `features/acquisition/storage/duplicate-merge-live-record-provider.ts` reads
  live `contactDrafts`, `contacts`, and `evidence` through shared
  `orbit_records` storage and composes the existing contact draft and contact
  graph providers on one configured store.
- `features/acquisition/live-merge-service.ts` maps live records into the
  existing duplicate merge contract, including success, empty, pending,
  controlled failure, apply preview, missing suggestion, and unconfigured
  live-storage outcomes.
- `features/acquisition/merge-contract.ts` now supports live duplicate merge
  provenance, live storage failure codes, async-compatible service results, and
  live-created confirmation evidence.
- `features/acquisition/mock-merge-service.ts` exports a sync mock service type
  so deterministic debug/page surfaces are not forced async by the live
  interface.
- `features/acquisition/service-factory.ts` registers live duplicate merge
  through `createConfiguredStorageDuplicateMergeProvider()`.
- `app/(app)/app/contacts/new/compose-app-contacts-new-from-previously-approved-mock-first-capabilities/contacts-new-route-services.ts`
  pins the legacy contacts-new workbench to mock duplicate merge so it remains
  synchronous until that page is migrated.
- `tests/capabilities/duplicate-detection-merge-live-store.test.ts` proves live
  storage mapping, no direct contact writes, unconfigured fail-closed behavior,
  live factory registration, and API live-mode failure envelopes.
- Remote live smoke with `ORBIT_MODULE_MODE=live` returned 250 duplicate merge
  suggestions from workspace `workspace:orbit-dev`; first suggestion
  `live-merge:event-draft:live:event_02:participant_002:contact_015` matched
  on `name_organization`. Applying the first suggestion returned a review
  preview with `mergeWriteExecuted=false`, `databaseWriteExecuted=false`, and
  `contactWriteExecuted=false`; remote `contacts` stayed at 66 records before
  and after the preview.
- Verification: focused duplicate merge live/mock tests, `npm run lint`,
  `npm test` with 517 tests, and `npm run build` pass.

### Goal 34: Referral Recommendation Live Review Boundary

Register an explicit live implementation for `referral-recommendation` backed by
the shared live record store. This turns recommended contacts from a mock-only
fixture into a source-backed review flow derived from live match
recommendations and network people, without executing contact writes or
outbound introductions.

Success evidence:

- `createReferralRecommendationService("live")` resolves a live service instead
  of `NOT_IMPLEMENTED`.
- `createLiveReferralRecommendationService()` fails closed with
  `REFERRAL_RECOMMENDATION_LIVE_STORE_UNCONFIGURED` when no live storage is
  configured.
- A memory live record store seeded with `matchRecommendations`,
  `networkPeople`, and `evidence` derives a recommended contact and a referral
  contact draft with `privacy="live-referral-recommendations"`.
- `confirmRecommendedContact()` returns a confirmation preview and created
  evidence while leaving `contacts` and `contactDrafts` unchanged.
- `/api/contact-drafts/referral` and
  `/api/contact-drafts/recommended/[id]/confirm` resolve mode from
  `ORBIT_MODULE_MODE ?? ORBIT_FEATURE_MODE` and await async live service reads.

Implementation evidence:

- `features/acquisition/storage/referral-live-record-provider.ts` reads live
  `matchRecommendations`, `networkPeople`, `contacts`, and `evidence` through
  shared `orbit_records` storage.
- `features/acquisition/live-referral-service.ts` maps live match
  recommendations into the existing referral recommendation contract,
  including source filtering, success, empty, pending, controlled failure,
  confirmation preview, missing recommendation, and unconfigured live-storage
  outcomes.
- `features/acquisition/referral-contract.ts` now supports live referral
  provenance, live storage failure codes, async-compatible service results, and
  live-created confirmation evidence.
- `features/acquisition/mock-referral-service.ts` exports a sync mock service
  type so deterministic debug/page surfaces are not forced async by the live
  interface.
- `features/acquisition/service-factory.ts` registers live referral
  recommendations through `createConfiguredStorageReferralRecommendationProvider()`.
- `app/(app)/app/contacts/new/compose-app-contacts-new-from-previously-approved-mock-first-capabilities/contacts-new-route-services.ts`
  pins the legacy contacts-new workbench to mock referral recommendations so it
  remains synchronous until that page is migrated.
- `tests/capabilities/referral-recommendation-live-store.test.ts` proves live
  storage mapping, no contact/contactDraft writes, unconfigured fail-closed
  behavior, live factory registration, and API live-mode failure envelopes.
- Remote live smoke with `ORBIT_MODULE_MODE=live` returned 350 referral
  recommendations and 350 referral drafts from workspace `workspace:orbit-dev`;
  first recommendation `recommendation_0167` was `community_referral` for
  `Sofia Martinez`. Confirming it returned a review preview with
  `contactWriteExecuted=false`, `externalActionExecuted=false`, and
  `databaseWriteExecuted=false`; remote `contacts` stayed at 66 records and
  remote `contactDrafts` stayed at 1 record before and after the preview.
- Verification: focused referral recommendation live/mock tests,
  `npm run lint`, `npm test` with 522 tests, and `npm run build` pass.

### Goal 35: External Contacts Import Live Review Boundary

Register an explicit live implementation for `external-contacts-import` backed
by the shared live record store. This turns the external import capability from
a mock-only fixture into a source-backed review flow derived from generated
external `networkPeople`, without executing phone address book reads, Google
Contacts sync, CSV parsing, customer-list jobs, contact writes, or contactDraft
writes.

Success evidence:

- `createExternalContactsImportService("live")` resolves a live service instead
  of `NOT_IMPLEMENTED`.
- `createLiveExternalContactsImportService()` fails closed with
  `EXTERNAL_CONTACTS_IMPORT_LIVE_STORE_UNCONFIGURED` when no live storage is
  configured.
- A memory live record store seeded with `networkPeople`, `contacts`, and
  `evidence` derives external contact candidates with
  `privacy="live-external-contacts-import"` and duplicate hints from existing
  live contacts.
- `importExternalContacts()` returns review drafts while leaving `contacts` and
  `contactDrafts` unchanged.
- `/api/contact-drafts/external/candidates` and
  `/api/contact-drafts/external/import` resolve mode from
  `ORBIT_MODULE_MODE ?? ORBIT_FEATURE_MODE` and await async live service reads.

Implementation evidence:

- `features/acquisition/storage/external-import-live-record-provider.ts` reads
  live `networkPeople`, `contacts`, and `evidence` through shared
  `orbit_records` storage.
- `features/acquisition/live-external-import-service.ts` maps live
  `external_contact` people into the existing external contacts import
  contract, including source filtering, success, empty, pending, controlled
  failure, unconfigured live-storage outcomes, duplicate hints, candidates, and
  review drafts.
- `features/acquisition/external-import-contract.ts` now supports live external
  import provenance, live storage failure codes, async-compatible service
  results, live source-summary permission states, and live-created draft
  evidence.
- `features/acquisition/service-factory.ts` registers live external contacts
  import through `createConfiguredStorageExternalContactsImportProvider()`.
- `app/(app)/app/contacts/new/compose-app-contacts-new-from-previously-approved-mock-first-capabilities/contacts-new-route-services.ts`
  pins the legacy contacts-new workbench to mock external contacts import so it
  remains synchronous until that page is migrated.
- `tests/capabilities/external-contacts-import-live-store.test.ts` proves live
  storage mapping, no contact/contactDraft writes, unconfigured fail-closed
  behavior, live factory registration, and API live-mode failure envelopes.
- Remote live smoke with `ORBIT_MODULE_MODE=live` returned 44 external contact
  candidates from workspace `workspace:orbit-dev`; first candidate
  `external-candidate:live:person_012` was `existing_customer_list` for
  `山田 千尋`. Importing the `phone` source returned 11 review drafts, with
  first draft `external-draft:live:person_009`; remote `contacts` stayed at 66
  records and remote `contactDrafts` stayed at 1 record before and after the
  preview.
- Verification: focused external contacts import live/mock tests,
  `npm run lint`, `npm test` with 527 tests, and `npm run build` pass.

### Goal 36: Email Calendar Signal Live Review Boundary

Register an explicit live implementation for `email-calendar-signal` backed by
the shared live record store. This turns the email/calendar signal capability
from a mock-only fixture into a source-backed review flow derived from live
conversations, messages, contacts, and evidence, without executing Gmail,
Google Calendar, Microsoft Graph, background sync, message body ingestion,
relationship writes, notifications, or external actions.

Success evidence:

- `createEmailCalendarSignalService("live")` resolves a live service instead of
  `NOT_IMPLEMENTED`.
- `createLiveEmailCalendarSignalService()` fails closed with
  `EMAIL_CALENDAR_SIGNAL_LIVE_STORE_UNCONFIGURED` when no live storage is
  configured.
- A memory live record store seeded with `conversations`, `messages`,
  `contacts`, and `evidence` derives a relationship signal with
  `privacy="live-email-calendar-signals"` and `permission.state="live-granted"`.
- `confirmEmailCalendarSignal()` returns a confirmation preview and created
  evidence while leaving contacts and contactDrafts unchanged.
- `/api/relationship-signals/email-calendar` and
  `/api/relationship-signals/[id]/confirm` resolve mode from
  `ORBIT_MODULE_MODE ?? ORBIT_FEATURE_MODE` and await async live service reads.

Implementation evidence:

- `features/acquisition/storage/email-calendar-live-record-provider.ts` reads
  live `contacts`, `conversations`, `messages`, and `evidence` through shared
  `orbit_records` storage.
- `features/acquisition/live-email-calendar-service.ts` maps live messages and
  conversations into the existing email/calendar signal contract, including
  source filtering, success, empty, pending, controlled failure, confirmation
  preview, missing signal, and unconfigured live-storage outcomes.
- `features/acquisition/email-calendar-contract.ts` now supports live signal
  provenance, live storage failure codes, async-compatible service results,
  live permission states, and live-created confirmation evidence.
- `features/acquisition/service-factory.ts` registers live email/calendar
  signals through `createConfiguredStorageEmailCalendarSignalProvider()`.
- `app/(app)/app/contacts/new/compose-app-contacts-new-from-previously-approved-mock-first-capabilities/contacts-new-route-services.ts`
  pins the legacy contacts-new workbench to mock email/calendar signals so it
  remains synchronous until that page is migrated.
- `tests/capabilities/email-calendar-signal-live-store.test.ts` proves live
  storage mapping, no contact/contactDraft writes, unconfigured fail-closed
  behavior, live factory registration, and API live-mode failure envelopes.
- Remote live smoke with `ORBIT_MODULE_MODE=live` returned 80 relationship
  signals from workspace `workspace:orbit-dev`; first signal
  `email-calendar-signal:live:message_0139` was `microsoft_graph` /
  `email_calendar_overlap` for `曾伟`. Confirming it returned a review preview
  with `relationshipWriteExecuted=false`, `externalActionExecuted=false`, and
  `databaseWriteExecuted=false`; remote `contacts` stayed at 66 records and
  remote `contactDrafts` stayed at 1 record before and after the preview.
- Verification: focused email/calendar signal live/mock tests,
  `npm run lint`, `npm test` with 532 tests, and `npm run build` pass.

### Goal 37: Business Card Review Live Review Boundary

Register an explicit live implementation for `business-card-review` backed by
the shared live record store. This turns the business-card review capability
from a mock-only fixture into a source-backed review flow derived from live
`business_card_ocr` contact records and evidence, without executing OCR,
camera capture, upload storage, AI extraction, contact writes, contactDraft
writes, notifications, or external actions.

Success evidence:

- `createBusinessCardReviewService("live")` resolves a live service instead of
  `NOT_IMPLEMENTED`.
- `createLiveBusinessCardReviewService()` fails closed with
  `BUSINESS_CARD_REVIEW_LIVE_STORE_UNCONFIGURED` when no live storage is
  configured.
- A memory live record store seeded with generated relationship fixtures derives
  `business-card-review:live:contact_012` for `山田 千尋` with
  `privacy="live-business-card-review"`.
- `updateReviewDraft()` returns reviewed fields and review evidence while
  leaving contacts and contactDrafts unchanged.
- `confirmReviewedDraft()` returns a confirmation preview and downstream contact
  candidate while leaving contacts and contactDrafts unchanged.
- `/api/contact-drafts/[id]` and `/api/contact-drafts/[id]/confirm` resolve
  mode from `ORBIT_MODULE_MODE ?? ORBIT_FEATURE_MODE` and await async live
  service reads for live business-card review draft ids.

Implementation evidence:

- `features/acquisition/storage/business-card-review-live-record-provider.ts`
  reads live `contacts` and `evidence` through shared `orbit_records` storage.
- `features/acquisition/live-business-card-review-service.ts` maps
  `source.type="business_card_ocr"` contacts into the existing business-card
  review contract, including success, empty, pending, controlled failure,
  missing draft, unconfigured live-storage, review preview, and confirmation
  preview outcomes.
- `features/acquisition/business-card-review-contract.ts` now supports live
  provenance, live storage failure codes, async-compatible service results, and
  live-created review/confirmation evidence.
- `features/acquisition/service-factory.ts` registers live business-card review
  through `createConfiguredStorageBusinessCardReviewProvider()`.
- `tests/capabilities/business-card-review-live-store.test.ts` proves live
  storage mapping, no contact/contactDraft writes, unconfigured fail-closed
  behavior, live factory registration, and API live-mode failure envelopes.
- Remote live smoke with `ORBIT_MODULE_MODE=live` reviewed
  `business-card-review:live:contact_012` for `山田 千尋`; review and
  confirmation returned `databaseWriteExecuted=false` and
  `contactWriteExecuted=false`; remote `contacts` stayed at 66 records and
  remote `contactDrafts` stayed at 1 record before and after the preview.
- Verification: focused business-card review live/mock tests,
  `npm run lint`, `npm test` with 536 tests, and `npm run build` pass.

### Goal 38: QR Scan Connect Live Review Boundary

Register an explicit live implementation for `qr-scan-connect` backed by the
shared live record store. This turns the QR scan connect capability from a
mock-only fixture into a source-backed review flow derived from live `qr_scan`
contact records and evidence, without requesting camera permission, invoking a
QR decoder, verifying signatures, performing external relationship graph
lookup, writing contacts, writing connections, writing contactDrafts, calling
AI providers, or delivering notifications.

Success evidence:

- `createQrScanConnectService("live")` resolves a live service instead of
  `NOT_IMPLEMENTED`.
- `createLiveQrScanConnectService()` fails closed with
  `QR_SCAN_CONNECT_LIVE_STORE_UNCONFIGURED` when no live storage is configured.
- A memory live record store seeded with generated relationship fixtures derives
  `qr-draft:live:contact_001` for `佐藤 健一` with
  `privacy="live-qr-scan-connect"`.
- `scanQrCode()` returns a source-backed QR scan result and connection draft
  while leaving contacts and contactDrafts unchanged.
- `confirmQrConnectionDraft()` returns a confirmation preview, contact
  candidate, connection candidate, and created evidence while leaving contacts
  and contactDrafts unchanged.
- `/api/contact-drafts/qr/scan` and `/api/contact-drafts/[id]/confirm` resolve
  mode from `ORBIT_MODULE_MODE ?? ORBIT_FEATURE_MODE` and await async live
  service reads for live QR draft ids.

Implementation evidence:

- `features/acquisition/storage/qr-live-record-provider.ts` reads live
  `contacts` and `evidence` through shared `orbit_records` storage.
- `features/acquisition/live-qr-service.ts` maps `source.type="qr_scan"`
  contacts into the existing QR scan connect contract, including success,
  empty, pending, controlled failure, missing draft, unconfigured live-storage,
  and confirmation preview outcomes.
- `features/acquisition/qr-contract.ts` now supports live QR provenance, live
  storage failure codes, async-compatible service results, and live-created
  confirmation evidence.
- `features/acquisition/mock-qr-service.ts` exports a sync mock service type so
  deterministic debug/page surfaces are not forced async by the live interface.
- `features/acquisition/service-factory.ts` registers live QR scan connect
  through `createConfiguredStorageQrScanConnectProvider()`.
- `app/(app)/app/contacts/new/compose-app-contacts-new-from-previously-approved-mock-first-capabilities/contacts-new-route-services.ts`
  pins the legacy contacts-new workbench to mock QR scan connect so it remains
  synchronous until that page is migrated.
- `tests/capabilities/qr-scan-connect-live-store.test.ts` proves live storage
  mapping, no contact/contactDraft writes, unconfigured fail-closed behavior,
  live factory registration, and API live-mode failure envelopes.
- Remote live smoke with `ORBIT_MODULE_MODE=live` staged
  `qr-draft:live:contact_001` for `佐藤 健一`; scan and confirmation returned
  `databaseWriteExecuted=false`, `contactWriteExecuted=false`, and
  `connectionWriteExecuted=false`; remote `contacts` stayed at 66 records and
  remote `contactDrafts` stayed at 1 record before and after the preview.
- Verification: focused QR scan connect live/mock tests, `npm run lint`,
  `npm test` with 540 tests, and `npm run build` pass.

### Goal 39: Business Card Scan OCR Live Preview Boundary

Register an explicit live implementation for `business-card-scan-ocr` backed by
the shared live record store. This turns the business-card scan capability from
a mock-only fixture into a source-backed OCR preview flow derived from live
`business_card_ocr` contact records and evidence, without requesting camera
permission, invoking an OCR provider, uploading images, performing AI
extraction, writing contacts, writing contactDrafts, or delivering
notifications.

Success evidence:

- `createBusinessCardScanOcrService("live")` resolves a live service instead of
  `NOT_IMPLEMENTED`.
- `createLiveBusinessCardScanOcrService()` fails closed with
  `BUSINESS_CARD_SCAN_OCR_LIVE_STORE_UNCONFIGURED` when no live storage is
  configured.
- A memory live record store seeded with generated relationship fixtures derives
  `business-card-review:live:contact_012` for `山田 千尋` with
  `privacy="live-business-card-scan-ocr"`.
- `scanBusinessCard()` returns capture metadata, OCR extraction, and an
  extracted contact draft while leaving contacts and contactDrafts unchanged.
- `getBusinessCardDraft()` returns the same source-backed live draft shape while
  leaving contacts and contactDrafts unchanged.
- `/api/contact-drafts/business-card/scan` resolves mode from
  `ORBIT_MODULE_MODE ?? ORBIT_FEATURE_MODE` and awaits async live service reads.

Implementation evidence:

- `features/acquisition/storage/business-card-scan-live-record-provider.ts`
  reads live `contacts` and `evidence` through shared `orbit_records` storage.
- `features/acquisition/live-business-card-scan-service.ts` maps
  `source.type="business_card_ocr"` contacts into the existing business-card
  scan OCR contract, including success, empty, pending, controlled failure,
  missing draft, unconfigured live-storage, and draft lookup outcomes.
- `features/acquisition/business-card-contract.ts` now supports live
  provenance, live storage failure codes, async-compatible service results, live
  capture metadata, and live-created evidence.
- `features/acquisition/service-factory.ts` registers live business-card scan
  OCR through `createConfiguredStorageBusinessCardScanOcrProvider()`.
- `app/(app)/app/contacts/new/compose-app-contacts-new-from-previously-approved-mock-first-capabilities/contacts-new-route-services.ts`
  pins the legacy contacts-new workbench to mock business-card scan OCR so it
  remains synchronous until that page is migrated.
- `tests/capabilities/business-card-scan-ocr-live-store.test.ts` proves live
  storage mapping, no contact/contactDraft writes, unconfigured fail-closed
  behavior, live factory registration, and API live-mode failure envelopes.
- Remote live smoke with `ORBIT_MODULE_MODE=live` staged
  `business-card-review:live:contact_012` for `山田 千尋`; scan and draft
  lookup returned `databaseWriteExecuted=false`,
  `contactWriteExecuted=false`, `captureMethod="live-store-business-card-record"`,
  and `ocrProviderCalled=false`; remote `contacts` stayed at 66 records and
  remote `contactDrafts` stayed at 1 record before and after the preview.
- Verification: focused business-card scan OCR live/mock tests,
  `npm run lint`, `npm test` with 544 tests, and `npm run build` pass.

### Goal 40: App Event Detail Route Live Service Bundle

Wire the event detail route-level service bundle to the live event child
services now that event CRUD/import, attendee roster, recommendations,
goal/readiness, encounter notes, want-connect, and post-event review all have
explicit live providers. Keep the route as a composition layer: it chooses
service mode, awaits service results, reconciles source summaries, selects a
safe want-connect target, and maps contract payloads into the page model.

Success evidence:

- `loadAppEventDetailRoute({ mode: "live" })` reaches live child services
  instead of failing at the page factory with `NOT_IMPLEMENTED`.
- Unconfigured live storage returns a controlled event detail route failure
  carrying live-store evidence.
- Generated event ids such as `event_01` can load source-backed event detail,
  attendees, recommendations, readiness, want-connect matches, encounter-note
  preview, and post-event review data.
- The route-level want-connect action selects the current live match target
  when no target is supplied and allows storage-only intent writes while still
  blocking presence, peer notifications, external messages, notifications, and
  external networks.

Implementation evidence:

- `event-detail-route-service.ts` now registers `hybrid` and `live` page-level
  factories and passes the requested mode through to feature-level service
  factories.
- `features/events/encounter-note/live-service.ts` returns a read-only live
  encounter-note preview when no `noteText` is provided; it only writes to the
  event work collection when typed note text is present.
- `buildWantConnectActionResult()` treats `liveDatabaseWriteExecuted=true` as
  the allowed storage-only side effect for recording intent, while external
  message, presence, peer notification, notification-provider, and external
  network flags still suppress the action result.
- `selectWantConnectTargetContactId()` derives the default route action target
  from the live match payload before falling back to the legacy demo contact.
- Focused tests prove the route live failure boundary, live action target
  selection, live storage write policy, encounter-note preview behavior, and
  live want-connect provider behavior.
- Remote smoke with `ORBIT_MODULE_MODE=live` loaded `event_01` successfully and
  returned a storage-only want-connect action result for `曾伟` with
  `databaseWriteExecuted=true`, `externalMessageSent=false`,
  `notificationDelivered=false`, `peerNotificationDelivered=false`, and
  `realtimePresenceRequested=false`.

### Goal 41: App Contact Detail Route Live Service Bundle

Wire the contact detail route-level service bundle to live contact detail,
connection evidence, and relationship value child services. Keep the route as
a composition layer: it chooses service mode, awaits service results, resolves
the live connection for the requested contact, and maps contract payloads into
the page model. It must not implement contact storage, evidence retrieval, or
scoring logic itself.

Success evidence:

- `loadAppContactDetailRoute({ mode: "live" })` reaches live child services
  instead of failing at the page factory with `NOT_IMPLEMENTED`.
- Unconfigured live storage returns a controlled contact detail route failure
  carrying live-store evidence.
- Generated contact ids such as `contact_078` can load source-backed contact
  detail, connection evidence, and relationship value data.
- The route derives the connection id from live connection records by
  `contactId` before requesting connection detail and relationship value.
- Prepare-follow-up remains a local/mock action; live connection evidence
  rejects unconfirmed add-evidence with a controlled pending failure, so no
  external message, audit log, contact write, or database evidence write is
  executed from the route.

Implementation evidence:

- `contact-detail-route-service.ts` now registers `hybrid` and `live`
  page-level factories and passes the requested mode through to feature-level
  service factories.
- `loadAppContactDetailRoute()` is async-compatible and awaits the existing
  `T | Promise<T>` contact, connection, and relationship value service results.
- The route lists live connections, selects the first connection whose
  `contactId` matches the requested contact, and then uses that connection id
  for both connection detail and relationship value scoring.
- `tests/pages/app-contact-detail-live-route-services.test.ts` proves the live
  route reaches child services and fails closed with live-store evidence when
  storage is unconfigured.
- Remote smoke with `ORBIT_MODULE_MODE=live` loaded `contact_078` (`曾伟`),
  selected `connection_0031`, returned relationship value score `86` with
  `relationshipValueType="strategic_intro"`, and rendered one evidence timeline
  item.

### Goal 42: App Contact Detail Page Live Adapter

Wire the actual Next route `/app/contacts/[id]` to the contact detail route
service. The page remains a thin adapter: it reads route/search params, calls
`loadAppContactDetailRoute`, maps a successful route model into the existing
`OrbitRealCardDetail` view-model shape, and renders `StateView` for empty,
pending, or failure states. It must not read fixtures, live record stores, or
feature providers directly.

Success evidence:

- `/app/contacts/[id]/page.tsx` no longer imports
  `getOrbitContactsViewModel`.
- In live mode with storage unconfigured, the page renders a controlled shared
  state boundary with live-store evidence instead of silently falling back to
  old demo contacts.
- In live mode with remote storage configured, rendering
  `/app/contacts/contact_078?mode=live` shows the remote contact `曾伟`, does
  not show the old demo contact `Kenji`, and does not show a failure boundary.

Implementation evidence:

- `contact-detail-view-model-adapter.ts` maps the contact detail success route
  model into the existing `OrbitContactsViewModel`/`OrbitContactView` shape
  consumed by `OrbitRealCardDetail`.
- `AppContactDetailPage` passes `mode`, `scenario`, and `action` search params
  through to `loadAppContactDetailRoute`.
- The page uses a local test-only fallback for the server language lookup when
  rendered outside a Next request scope; the shared `getOrbitServerLanguage`
  function is unchanged because its GitNexus impact is critical.
- `tests/pages/app-contact-detail-live-route-services.test.ts` proves the page
  uses the live route service instead of the legacy contacts view model.
- Remote smoke rendered `contact_078` with `hasRemoteName=true`,
  `hasStaticDemoName=false`, `hasFailure=false`, and `hasDetailPage=true`.

### Goal 43: App Event Detail Page Live Adapter

Wire the actual Next route `/app/events/[id]` to the event detail route
service. The page remains a thin adapter: it reads route/search params, calls
`loadAppEventDetailRoute`, maps a successful route model into the existing
`OrbitRealEventDetail` view-model shape, and renders `StateView` for empty,
pending, or failure states. It must not read fixtures, live record stores, or
feature providers directly.

Success evidence:

- `/app/events/[id]/page.tsx` no longer imports
  `getOrbitEventDetailViewModel`.
- In live mode with storage unconfigured, the page renders a controlled shared
  state boundary with live-store evidence instead of silently falling back to
  old demo events.
- In live mode with remote storage configured, rendering
  `/app/events/event_01?mode=live` shows the remote Japanese event
  `東京インバウンド飲食店成長会`, does not show old demo titles, and does not
  show a failure boundary.

Implementation evidence:

- `event-detail-view-model-adapter.ts` maps the event detail success route
  model into the existing `OrbitLandingEventView` shape consumed by
  `OrbitRealEventDetail`.
- `AppEventDetailPage` passes `mode`, `scenario`, `action`, and
  `targetContactId` search params through to `loadAppEventDetailRoute`.
- The page uses a local test-only fallback for the server language lookup when
  rendered outside a Next request scope; the shared `getOrbitServerLanguage`
  function is unchanged because its GitNexus impact is critical.
- `tests/pages/app-event-detail-live-route-services.test.ts` proves the page
  uses the live route service instead of the legacy event view model.
- Remote smoke rendered `event_01` with `hasRemoteTitle=true`,
  `hasOldDemoTitle=false`, `hasFailure=false`, and `hasDetailPage=true`.

### Goal 44: API Runtime Mode Boundary Alignment

Align API runtime mode resolution with the module-mode service boundary. The
primary switch is `ORBIT_MODULE_MODE`; `ORBIT_FEATURE_MODE` remains only a
fallback for older scripts and probes. This goal prevents a web/API process from
showing `x-orbit-feature-mode: hybrid` while service factories are expected to
run in live mode.

Success evidence:

- `resolveFeatureMode()` reads `ORBIT_MODULE_MODE` before
  `ORBIT_FEATURE_MODE`.
- Health route response headers and JSON body report the same mode chosen by
  the shared resolver.
- Invalid runtime mode values still fall back to deterministic mock mode.
- The runtime boundary docs name the precedence rule and warn routes not to
  branch on raw environment strings.

Implementation evidence:

- `shared/config/feature-mode.ts` centralizes
  `ORBIT_MODULE_MODE ?? ORBIT_FEATURE_MODE` mode resolution.
- `app/api/health/route.ts` and `app/api/health/error/route.ts` report the
  resolved runtime mode through the shared envelope and runtime headers.
- `tests/api/envelope.test.ts` proves `ORBIT_MODULE_MODE` precedence, health
  route mode reporting, invalid fallback behavior, and force-dynamic health
  routes.
- Runtime curl smoke with `ORBIT_MODULE_MODE=live` returned
  `x-orbit-feature-mode: live` from `/api/health`, `/api/events`, and
  `/api/contacts`.
- `shared/api/create-the-shared-api-and-runtime-mode-boundary-used-by-all-capabilities/LIVE_IMPLEMENTATION.md`
  documents the switch and fallback rule.

### Goal 45: Product Home Entry Layout Hardening

Keep the approved product Home layout and make the web root consistent with the
logged-in product surface. The root `/`, `/app`, and `/app/home` render the
personal Home hub with events and the profile/contact/schedule entry rail side
by side on web widths. The desktop layout should shrink with responsive
constraints instead of collapsing the rail above events.

Success evidence:

- `/`, `/app`, `/app/home`, and `/app/home/events` compose live route payloads through
  `loadAppHomeRouteViewModel()`.
- Home hub cards still link to concrete app routes:
  `/app/profile`, `/app/contacts`, and `/app/followups`.
- Medium-width web screens keep `grid-template-areas: "events rail"` and do
  not use an `@media (max-width: 880px)` rule that moves `"rail"` above
  `"events"`.
- Browser screenshots for 641px, 760px, and 1440px widths show no horizontal
  overflow and preserve the entry rail beside the event list.

Implementation evidence:

- `OrbitRealHome` uses explicit `orbit-home-main-grid`,
  `orbit-home-events-pane`, and `orbit-home-hub-rail` classes instead of an
  anonymous inline grid.
- `orbit-reference-styles.tsx` constrains the Home desktop grid with
  `grid-template-columns: minmax(0, 1fr) clamp(220px, 30vw, 320px)` and keeps
  `grid-template-areas: "events rail"`.
- `tests/pages/app-home-live-route-services.test.ts` proves the public web root
  delegates to the live app Home route, the product Home grid keeps the rail
  beside events on medium-width screens, and the concrete hub entry hrefs stay
  on `/app/*` routes.
- Browser verification confirmed `/` and `/app` render
  `data-orbit-route="app-root-home-route"` and `data-orbit-real-page="home"`
  on desktop and mobile widths, with no public landing hero text and no
  horizontal overflow.
- Browser verification also confirmed `/app/events`, `/app/schedule`, and
  `/app/contacts` remain reachable from the web nav after the root route change.

## Execution Rules

- Keep `live-record-store.ts` generic.
- Put field-specific mapping in feature/provider modules.
- Use TDD for each goal.
- Verify each goal locally and against remote DB where applicable.
- Do not leak connection strings or passwords.
- Do not revert unrelated dirty worktree changes.
