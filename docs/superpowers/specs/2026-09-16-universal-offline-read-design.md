# Universal Offline Read Design

**Date:** 2026-09-16

**Scope:** Native Orbit App, Sprints 0033–0036

**Status:** Proposed for written review after in-chat direction approval

## 1. Product outcome

After an authenticated account completes its first sync, the Orbit native App must be able to cold-launch without a network connection and read every authorized, user-visible structured record in that account's offline scope. This includes full historical AI conversations, contacts and relationship data, notes, tasks and follow-ups, messages, notifications, schedules, meetings, events, appointments, goals, profile/settings, and authorized role-specific views.

Cloud records remain canonical. Offline read access never grants online write authority, expands server permissions, or makes locally pending content visible to server-side AI. When connectivity returns, the App revalidates identity and authorization, removes records whose visibility was revoked, uploads only mutations explicitly supported by Sprint 0034, and resumes incremental synchronization.

This program targets the native App first. The Web remains the online canonical client; browser offline support requires a separate security and storage design and is not claimed by Sprints 0033–0036.

## 2. Meaning of “all data”

The required complete corpus is every authorized, user-visible, account-scoped structured record and historical record reachable by the App's read surfaces, including list, detail, child-resource, search, and aggregate consumers. A route-to-domain inventory is normative: an unregistered read consumer or an unverified projection means the all-data objective is incomplete.

The corpus is divided into three storage classes:

1. **Complete structured corpus.** Text, metadata, relationships, history, read state, visibility state, and user-visible generated output are downloaded incrementally and retained in the encrypted local mirror.
2. **Bounded public/shared browse corpus.** Potentially unbounded public catalogues use a server-issued offline manifest covering records saved, joined, pinned, recently used, or included by an explicit product window. The UI must show `not-downloaded` or `partial`; it must never present an incomplete local catalogue as an empty or complete result.
3. **Binary assets.** Images, recordings, scans, card originals, and attachments have encrypted local manifests and integrity metadata. Their bytes are downloaded on demand or when the user selects “keep offline.” Text and metadata remain offline-readable without the binary.

The following never enter the user data mirror: provider tokens, cookies, server secrets, hidden prompts, raw provider context, invitation secrets, internal-only audit text, or fields not included in a domain projection allowlist.

## 3. Domain coverage

The domain registry must cover every App reader in these families:

- account, profile, language, timezone, notification preferences, tags, connection status, and user-visible suggestions;
- notes, mentions, contact-linked notes, and note history exposed by the product;
- tasks, relationship follow-ups, activity history, reminders, confirmed items, and task suggestions as distinct entities;
- personal schedules, appointments, meetings, events, and user-visible meeting/event details;
- contacts, connections, detail state, relationship evidence summaries, needs, introductions, pipeline, graph, and relationship analysis;
- saved import/acquisition results, card drafts, deduplication decisions, and batch review state; scanning, OCR, and import commands remain online;
- conversations, relationship-communication bindings, messages, read cursors, summaries, user-visible extraction output, privacy state, and invitation status without invitation secrets;
- AI sessions, groups, pins, messages, user-visible run status, and user-visible output without hidden prompts or provider context;
- typed notifications, reminder deliveries, unread state, relationship signals, and dispositions without duplicating aggregate inbox rows as canonical domain facts;
- event catalogue/detail, organizer views, recommendations, registrations, user-visible questionnaire answers, membership, attendance visibility, encounters, goals, readiness, and party graph;
- event roles, admissions, operations, tasks, generations, check-in, analytics, and administrator views only when the current actor's role authorizes them;
- agent preferences, settings, signals, actions, ledger, proactive turns, and user-visible receipts; external actions remain online;
- home, today, dashboard, distributions, opportunities, provenance, and other aggregates, either recomputed deterministically from complete local dependencies or synchronized as versioned generated projections.

The registry is separate from the AI visibility manifest. Offline read eligibility does not automatically authorize AI access, and AI authorization does not grant client read access.

## 4. Architecture

### 4.1 Local-read identity

`AuthSessionProvider` exposes distinct states: `checking`, `online`, `local-read`, `locked`, and `revoked`. `local-read` allows only encrypted mirror reads for the last server-verified actor and authorization epoch. It never satisfies an online mutation guard.

SecureStore contains a versioned envelope bound to canonical base URL, canonical actor ID, authentication subject, session expiry, `offlineReadExpiresAt`, last verification time, authorized workspace/domain epoch, and the encrypted database key reference. A legacy cookie-only entry must be upgraded online before it can establish local-read identity.

The server issues `offlineReadExpiresAt`; it is no later than session expiry and no more than seven days after verification. A deployment may issue a shorter lease. When the lease expires offline, the App locks the mirror until online revalidation. Because a disconnected device cannot receive immediate remote revocation, the UI and security documentation describe this bounded lease honestly.

An authentication 401/403 revokes the local-read lease. A domain authorization 403 revokes or locks only the affected domain unless the server declares the whole account invalid. Offline logout immediately removes local eligibility and attempts cryptographic erasure; remote sign-out is best effort. A cleanup failure leaves the old scope locked and must not expose it to a new account.

### 4.2 Encrypted scope

The SQLCipher database and asset cache are isolated by canonical base URL and actor. Every row, cursor, asset, and index is additionally bound to workspace and authorization epoch. Client-supplied workspace values never grant authority.

Schema migration is transactional, idempotent, crash-recoverable, and tested against a real encrypted database. Changing a `CHECK` constraint or cursor key requires a new table/copy/verify/swap migration rather than `CREATE TABLE IF NOT EXISTS`. Resetting one domain clears only synchronized rows, indexes, cursors, and assets for that domain/workspace/epoch; device-only drafts and Sprint 0034 outbox/conflict state are preserved unless account revocation requires cryptographic erasure.

### 4.3 Domain registry and adapters

Each registered domain declares:

- stable `domainId` and schema version;
- canonical source adapter and server-side authorization function;
- field projection allowlist and stable entity identity;
- change source, grant, revoke, delete, and retention behavior;
- dependencies used by aggregates;
- App consumers, selectors, search indexes, and sort semantics;
- paging, size, history, and completeness limits;
- offline lease class and binary asset policy;
- whether a supported offline mutation adapter exists;
- separately declared AI read capability.

Every concrete endpoint/path family and UI write action is assigned three independent policies:

- `readPersistence`: `durable_normalized`, `encrypted_ttl_snapshot`, `device_only`, or `online_only_secret`;
- `mutationPolicy`: `offline_queue`, `local_only`, or `online_only`;
- `binaryPolicy`: `metadata_only`, `on_demand_encrypted`, `user_pinned_encrypted`, or `never_local`.

The encrypted compatibility snapshot store is policy-scoped and records schema version, expiry, authorization epoch, payload size, and integrity hash. It rejects unknown endpoints, secrets, unbounded payloads, and raw/base64 binary data. Binary bytes live only in the dedicated encrypted asset cache; SQLCipher protection of structured rows is not assumed to encrypt external files.

The default is deny. Unknown domains, versions, fields, or authorization epochs fail visibly. Adding a server field does not automatically place it in the mirror or an AI prompt.

The implementation must not widen the existing `orbit_records` SQL `IN` list and call that universal synchronization. Appointments, event operations, relationship communication, AI conversations, and other independent stores receive source-specific authorized read-model adapters and transactional change journals. Shared global storage and authentication primitives are changed only when an adapter cannot provide the contract safely.

### 4.4 Bootstrap, delta, deletion, and revocation

The server returns a versioned domain manifest followed by per-domain opaque cursors. A cursor binds actor, workspace, domain, schema version, registry version, authorization epoch, snapshot high-watermark, and issue time. Every page and cursor are applied atomically.

Bootstrap is resumable and budgeted. Hitting a page, byte, time, battery, or disk budget records `partial` and schedules later work; it never marks the domain complete. Historical AI messages and other large histories can therefore finish over multiple foreground runs without redownloading completed pages.

Each source journal preserves committed visibility transitions. A newly granted role emits or exposes the complete authorized historical projection. Revocation emits visibility deletes even when the underlying entity did not change. Physical deletion produces a durable tombstone. Cursors outside retention return reset-required for the affected domain only.

Cross-domain synchronization is not falsely described as atomic. A local aggregate carries the dependency versions used to build it. Derived collections replace a generation only after every page in that generation is present, preventing a partial download from deleting still-valid local members.

### 4.5 App read behavior

Each migrated list, detail, subresource, search, and aggregate reads from the encrypted mirror first. Network requests update the mirror; they are not the primary render source. The UI distinguishes `fresh`, `stale`, `partial`, `not-downloaded`, `not-authorized`, `locked`, and `failure`.

A stale mirror remains readable during network failure. An empty mirror plus a failed download is an error, not an empty state. Local search or “no results” is allowed only when the relevant domain manifest says the searchable scope is complete.

Online mutations retain their existing routes and must pass fresh online authentication and authorization. `local-read` must not permit a raw-fetch or background-upload bypass.

## 5. Sprint responsibilities

### Sprint 0033 — Universal incremental read

0033 owns local-read identity, encrypted scope migration, the domain registry and contracts, authorized server adapters/change journals, per-domain bootstrap/delta/tombstone/revocation, completeness states, asset manifests, and migration of every native read consumer to mirror-first behavior. The existing notes/tasks/personal-schedule implementation remains a verified subset, not the completion boundary.

Implementation is phased inside the Sprint: foundation and coverage inventory; identity/storage; protocol/registry; personal and relationship domains; shared communication/schedule/AI domains; role/event/agent/aggregate domains; assets/search and final consumer removal. A phase can be committed and merged only when its declared subset is complete, but Sprint 0033 is not reported complete until the route-to-domain coverage gate reaches zero unregistered readers.

### Sprint 0034 — Risk-based offline mutations

0034 consumes the 0033 registry but adds write adapters only for deterministic, reversible, actor-owned actions whose canonical transaction can provide idempotent receipts and conflict evidence. Notes, personal tasks/follow-ups, and personal schedules form the initial proven write set. Profile preferences and similarly safe domains may qualify only after their own strict patch, version, idempotency, rollback, and authorization review.

Invitations, sending messages, registrations, shared meeting changes, role/permission changes, account deletion, provider operations, scanning/import execution, and AI/external side effects remain online-only. Their records are still offline-readable. The outbox, alias, eligibility, receipt, and conflict layers become domain-adapter based; unsupported commands fail before enqueue.

Global mutation receipts are authoritative for batch replay. The server acquires the mutation receipt lock before the domain transaction/CAS and the shared sync-write lock, and stores the domain effect, sync revision, and terminal receipt atomically. Existing domain receipts remain validation or compatibility evidence rather than a competing transaction boundary.

### Sprint 0035 — Universal invalidation and recovery

0035 replaces fixed kinds with registry-driven domain watermarks and invalidation summaries. Polling is the provider-neutral correctness path; realtime, SSE, WebSocket, or push remain optional hints. Startup, foreground, network recovery, manual refresh, notification click, cursor expiry, permission epoch change, and account switching all converge on the 0033 per-domain recovery protocol.

High-frequency domains such as messages and notifications can use tighter hint cadence, while large histories use budgeted background/foreground paging. Hints never contain business content and never replace cursor truth. Repeated or out-of-order hints coalesce without hiding a required rerun.

### Sprint 0036 — AI coverage and end-to-end acceptance

0036 defines explicit AI read functions for every domain the user has authorized for AI access, including historical AI conversations, contacts and relationship evidence, messages, notifications, notes, tasks, follow-ups, schedules, meetings, events, goals, and user-visible agent records. Functions share an actor-scoped policy registry, strict field allowlists, bounded pagination, revision/freshness metadata, evidence references, and prompt-injection defenses.

The server-side AI reads cloud canonical records only. Pending local changes and device-only drafts remain excluded and are disclosed in the App UI by domain and count. An offline-readable domain whose AI capability is disabled must remain unavailable to AI. The Data Atlas and runtime acceptance matrix record offline read, offline write, AI read, authority, storage, sync state, and remaining limitations for every registered domain.

## 6. Dependencies on Sprints 0037–0041

0037 supplies contact-message identities, participants, history, and read cursors. 0038 supplies typed notification identities, lifecycle, and actions. 0039 supplies evidence discovery and source authorization. 0040 supplies device delivery and notification preference lifecycle. 0041 supplies Home consumer migration work. These Sprints provide domain sources and consumers; they do not independently satisfy offline-read requirements.

Their records enter 0033 adapters without duplicating canonical authorities. 0041 may merge only after its 0033 dependency is accepted or after its commits are rebased onto an accepted 0033 integration tree.

## 7. Safety invariants

- Server authorization is evaluated before every projection and after reconnection; a cached record never grants new authority.
- Actor, base URL, workspace, role, domain, schema, and authorization epoch are checked at every storage and cursor boundary.
- Revocation removes readable local projections and associated binary assets.
- Provider tokens, credentials, hidden prompts, and internal-only audit data never enter the mirror or AI response.
- Local-read cannot upload, mutate, invite, send, register, or perform an external side effect.
- A partial corpus never produces a misleading empty or complete result.
- No provider-specific SDK is required for correctness; PostgreSQL-compatible journals and HTTP polling remain the portable baseline.
- Every implementation change follows TDD, runs GitNexus impact before shared symbol edits, and runs change detection before commit.
- Each independently accepted phase is committed; integration is reviewed, merged to `chat-agent`, verified on the merged tree, and pushed only after green evidence.

## 8. Acceptance

The program is complete only when:

1. the route-to-domain inventory contains no unregistered native read consumer;
2. every registered domain proves authorized bootstrap, delta, physical delete, visibility revoke, cursor reset, and actor/role isolation;
3. every list, detail, subresource, search, and aggregate renders from the mirror during an offline cold launch after completed sync;
4. partial history, storage exhaustion, missing binary assets, and expired leases are represented truthfully;
5. account/base/workspace/role switches cannot read a previous scope;
6. supported offline mutations survive restart, replay exactly once, and expose conflicts without corrupting canonical reads;
7. invalidation loss, duplication, reordering, long background intervals, and process termination recover from cursor truth;
8. every AI-authorized domain has an explicit tested function and every non-authorized field remains inaccessible;
9. production Web/API is rebuilt and restarted after server changes, the Simulator uses the intended mainline Metro, and same-account cross-client runtime evidence verifies representative create/update/delete/revoke flows for every domain family;
10. Sprint reports, Bridge handoff, Data Atlas, commit SHAs, merged-tree test evidence, and remote `chat-agent` SHA agree.

## 9. Parallel execution boundaries

- **A / 0033:** owns shared read identity, registry, storage, sync contracts, domain adapters, and consumer migration.
- **B / 0034:** owns mutation classification, outbox/receipt/conflict adapters, and supported offline-write UI; it must not redefine 0033 read identity or cursors.
- **C / 0035:** owns status/invalidation transports and recovery orchestration; it consumes 0033 cursors and 0034 upload state without changing their semantics.
- **D / 0036:** owns AI policy/tool coverage, freshness, pending disclosure, Data Atlas, and cross-client acceptance; it must not use the AI manifest as client authorization.

B and C may prepare tests and adapters against the approved contracts while A builds the foundation. They may not merge code that depends on an unaccepted 0033 interface. D can add independent missing server query tools after the policy contract is accepted, then completes integrated acceptance after 0033–0035 land.
