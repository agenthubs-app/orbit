import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { EVENT_SYNC_REVISION_TABLES } from "../../features/events/event-operations/storage/sync-revision";
import { DECLARED_SYNC_DOMAINS, EVENT_SYNC_DOMAINS, type SyncDomainDefinition } from "../../features/sync/domain-registry";
import { auditDerivedDomainSources, auditEventTableWrites, auditMessageTableWrites, auditSyncWrites, type MessageTableWritePolicy, type SyncWritePolicy } from "../support/sync-write-audit";

// Sprint 0108: every orbit_records writer in product code and scripts, and why
// it is safe under the strict sync_revision trigger. A new writer, or a new
// statement in a listed file, fails this test until it is classified.
export const SYNC_WRITE_MANIFEST: Readonly<Record<string, SyncWritePolicy>> = {
  "shared/storage/postgres-live-record-store.ts": { policy: "locked", statements: 5, how: "upsert/insertIfAbsent/updateIfCurrent/delete/reassignRecordOwner wrap sync collections in SYNC_COMMIT_ORDER_LOCK_CTE" },
  "features/connections/lifecycle/postgres-repository.ts": { policy: "locked", statements: 5, how: "acquireSyncCommitOrderLock before the first write of every command (connections, evidence and tasks are sync collections)" },
  "features/connections/lifecycle/initialization.ts": { policy: "locked", statements: 2, how: "acquireSyncCommitOrderLock before the first write when a task is created" },
  "features/connections/lifecycle/migration-repository.ts": { policy: "locked", statements: 2, how: "acquireSyncCommitOrderLock when an owner repair touches a sync collection" },
  "features/sync/migrations.ts": { policy: "locked", statements: 1, how: "one-shot backfill joins sync_write_lock" },
  "features/sync/sync-revision-migration.ts": { policy: "locked", statements: 1, how: "each backfill batch joins sync_write_lock" },
  "features/sync/owner-backfill.ts": { policy: "locked", statements: 3, how: "0114 owner backfill: acquireSyncCommitOrderLock at the start of its one transaction; it refuses to write a sync collection" },
  "scripts/sync-cloud-records.ts": { policy: "locked", statements: 1, how: "every copied row is inserted through SYNC_COMMIT_ORDER_LOCK_CTE" },
  "scripts/repair-lifecycle-task-metadata.mjs": { policy: "locked", statements: 1, how: "inline copy of SYNC_COMMIT_ORDER_LOCK_SQL (pinned below)" },
  "features/acquisition/storage/external-import-live-record-provider.ts": { policy: "guarded", statements: 1, how: "atomic contact-draft writer refuses sync collections" },
  "features/acquisition/storage/referral-live-record-provider.ts": { policy: "guarded", statements: 2, how: "atomic contact-draft writer refuses sync collections; second write is contactDrafts" },
  "features/acquisition/storage/contact-draft-live-record-provider.ts": { policy: "non-sync", statements: 1, collections: "contactDrafts" },
  "features/agent/retention/legacy-trace-cleanup.ts": { policy: "non-sync", statements: 1, collections: "agentAnalyticsEvents, agentRuns, agentRunSteps deleted; orbit_agent_chat_requests link cleared (0111)" },
  "features/agent/retention/run-retention.ts": { policy: "non-sync", statements: 1, collections: "agent run sets deleted; orbit_agent_chat_requests link cleared (0111)" },
  "features/agent/storage/agent-runtime-live-record-provider.ts": { policy: "non-sync", statements: 2, collections: "orbit_agent_chat_requests and agent runtime collections" },
  "features/appointments/notification-projector.ts": { policy: "non-sync", statements: 2, collections: "notifications" },
  "features/auth/password-reset-store.ts": { policy: "non-sync", statements: 4, collections: "auth_users" },
  "features/auth/storage/mobile-auth-exchange-provider.ts": { policy: "non-sync", statements: 1, collections: "mobile_auth_exchanges" },
  "features/dashboard/storage/dashboard-snapshot.ts": { policy: "non-sync", statements: 1, collections: "dashboard analysis snapshots" },
  "features/encounters/projection-repository.ts": { policy: "locked", statements: 4, how: "complete() takes acquireSyncCommitOrderLock first; writeContactDetailState takes it again before writing contact_detail_states (0116)" },
  "features/events/organizer-accounts/owner-migration.ts": { policy: "locked", statements: 2, how: "applyEventOrganizerOwnerPlan takes acquireSyncCommitOrderLock first in its transaction (events is a sync collection since 0117; the audit row is event_organizer_owner_migrations)" },
  "features/events/post-event-artifact/task-repository.ts": { policy: "non-sync", statements: 4, collections: "attendee post-event AI artifact jobs (not tasks)" },
  "features/integrations/oauth-state-store.ts": { policy: "non-sync", statements: 1, collections: "integrationOAuthStates" },
  "features/notifications/canonical-reminder-wake.ts": { policy: "non-sync", statements: 4, collections: "canonical_reminder_wakes" },
  "features/notifications/delivery-service.ts": { policy: "non-sync", statements: 3, collections: "notificationDeliveries" },
  "features/notifications/discovery/discovery-repository.ts": { policy: "non-sync", statements: 2, collections: "notification discovery work" },
  "features/notifications/notification-cutover-migration.ts": { policy: "non-sync", statements: 3, collections: "notification collections" },
  "features/notifications/event-contact-request-inbox-migration.ts": { policy: "non-sync", statements: 1, collections: "notifications (archives migrated legacy exchange rows; inbox writes go through the live-record store)" },
  "scripts/backfill-event-display-fields.ts": { policy: "locked", statements: 1, how: "its transaction takes acquireSyncCommitOrderLock first (events, 0117)" },
  "scripts/backfill-test-secondary-industries.ts": { policy: "locked", statements: 1, how: "applyTestIndustryBackfillPlan takes acquireSyncCommitOrderLock at the start of its transaction (contacts, 0116)" },
  "scripts/bootstrap-event-organizer-accounts.ts": { policy: "locked", statements: 2, how: "setOwnerIfAbsent (accounts, contacts, profiles — contacts is a sync collection) takes SYNC_COMMIT_ORDER_LOCK_CTE in its statement (0117); insertIfAbsent writes organizer memberships (profiles/accounts)" },
  "scripts/diagnostics/notification-source-read-cost.ts": { policy: "non-sync", statements: 2, collections: "reminderPlans and notification fixtures" },
  "scripts/diagnostics/schedule-exception-window-cost.ts": { policy: "non-sync", statements: 1, collections: "personal_schedule_occurrence_exceptions (the series rows go through the store)" },
  "scripts/quarantine-legacy-notifications.ts": { policy: "non-sync", statements: 1, collections: "notifications" },
  "scripts/measure-plan-read-traffic.ts": { policy: "locked", statements: 2, how: "W0017/W0021 traffic measurement in a temporary schema: lockedWrite takes acquireSyncCommitOrderLock in the same transaction (contacts)" },
  "scripts/seed-demo-workspace.ts": { policy: "locked", statements: 2, how: "the demo event owner reset (events, 0117) runs in a transaction that takes acquireSyncCommitOrderLock first; the other statement updates event_organizer_owner_migrations" },
  "features/sync/owner-guard.ts": { policy: "non-sync", statements: 1, collections: "accounts (ROTATE_AUTHORIZATION_EPOCH_SQL moves a previous owner's account updated_at)" },
};

// Sprint 0109: every writer of the relationship message tables (all rows are sync rows).
export const MESSAGE_TABLE_WRITE_MANIFEST: Readonly<Record<string, MessageTableWritePolicy>> = {
  "features/relationship-communication/message-store.ts": { statements: 8, how: "every write runs in a read-committed transaction that calls acquireSyncCommitOrderLock first" },
  "features/relationship-communication/message-migration.ts": { statements: 9, how: "each legacy conversation is planned and applied inside one transaction after acquireSyncCommitOrderLock" },
};

// Sprint 0113: every writer of the event tables that carry sync_revision (strict trigger, same lock).
export const EVENT_TABLE_WRITE_MANIFEST: Readonly<Record<string, MessageTableWritePolicy>> = {
  "features/events/admission/storage/postgres-repository.ts": { statements: 1, how: "runTransaction takes the lock first for every admission write" },
  "features/events/core/backfill.ts": { statements: 1, how: "applyEventCoreBackfillPlan takes the lock first" },
  "features/events/event-operations/storage/canonical-membership-writer.ts": { statements: 1, how: "appendCanonicalMembershipVersion takes it again (callers take it first)" },
  "features/events/event-operations/storage/canonical-registration-repository.ts": { statements: 2, how: "activation, register, cancel and seed transactions take the lock first" },
  "features/events/event-operations/storage/postgres-repository.ts": { statements: 3, how: "saveConfiguration and publishGenerationAtomically take the lock first" },
  "features/events/registration/phoneweb-registration-window-repair.ts": { statements: 3, how: "withRepairTransaction takes the lock before its row and table locks" },
  "features/events/registration/profile-contract-repair/apply-repository.ts": { statements: 1, how: "applyTransaction takes the lock first" },
  "scripts/measure-plan-read-traffic.ts": { statements: 3, how: "lockedWrite takes the lock first in each write transaction (temporary schema)" },
  "scripts/seed-verify-accounts.ts": { statements: 1, how: "the verify event seed transaction takes the lock first" },
  "scripts/demo-canonical-memberships.ts": { statements: 1, how: "the demo transaction takes the lock first" },
};

const ROOT = join(__dirname, "../..");

test("every orbit_records writer is classified and every sync-collection writer takes the commit-order lock", () => {
  assert.deepEqual(auditSyncWrites(ROOT, SYNC_WRITE_MANIFEST), []);
});

test("a new unlocked writer, a new statement in a listed file, or a missing lock fails the audit", () => {
  const root = mkdtempSync(join(tmpdir(), "sync-write-audit-"));
  try {
    mkdirSync(join(root, "features/demo"), { recursive: true });
    mkdirSync(join(root, "scripts"), { recursive: true });
    writeFileSync(join(root, "features/demo/new-writer.ts"), "await sql.query(\"insert into orbit_records (workspace_id, collection_name) values ($1, 'tasks')\");");
    writeFileSync(join(root, "features/demo/claims-lock.ts"), "await sql.query(\"update orbit_records set payload = $1 where collection_name = 'notes'\");");
    writeFileSync(join(root, "features/demo/non-sync.ts"), "await sql.query(\"update orbit_records set payload = $1 where collection_name = 'tasks'\");");
    writeFileSync(join(root, "scripts/grew.ts"), "q('update orbit_records set a = 1'); q('insert into orbit_records values (1)');");
    const problems = auditSyncWrites(root, {
      "features/demo/claims-lock.ts": { policy: "locked", statements: 1, how: "says so" },
      "features/demo/non-sync.ts": { policy: "non-sync", statements: 1, collections: "contacts" },
      "scripts/grew.ts": { policy: "non-sync", statements: 1, collections: "contacts" },
      "features/demo/removed.ts": { policy: "non-sync", statements: 1, collections: "contacts" },
    });
    assert.ok(problems.some((line) => line.startsWith("UNCLASSIFIED features/demo/new-writer.ts")), "an unknown writer");
    assert.ok(problems.some((line) => line.startsWith("UNLOCKED features/demo/claims-lock.ts")), "a locked claim without a lock");
    assert.ok(problems.some((line) => line.startsWith("SYNC_LITERAL features/demo/non-sync.ts")), "a non-sync claim that writes tasks");
    assert.ok(problems.some((line) => line.startsWith("CHANGED scripts/grew.ts")), "a second statement in a listed file");
    assert.ok(problems.some((line) => line.startsWith("STALE features/demo/removed.ts")), "a manifest entry without a writer");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("every relationship message table writer is listed and takes the commit-order lock", () => {
  assert.deepEqual(auditMessageTableWrites(ROOT, MESSAGE_TABLE_WRITE_MANIFEST), []);
});

test("an unlisted, unlocked, grown or removed relationship message table writer fails the audit", () => {
  const root = mkdtempSync(join(tmpdir(), "message-write-audit-"));
  try {
    mkdirSync(join(root, "features/demo"), { recursive: true });
    writeFileSync(join(root, "features/demo/new-writer.ts"), "await tx.query(\"insert into relationship_messages (seq) values (1)\"); await acquireSyncCommitOrderLock(tx);");
    writeFileSync(join(root, "features/demo/unlocked.ts"), "await sql.query(\"update relationship_conversation_members set unread_count = 0\");");
    writeFileSync(join(root, "features/demo/grew.ts"), "acquireSyncCommitOrderLock(tx); q('update relationship_conversations set status = 1'); q('insert into relationship_messages values (1)');");
    const problems = auditMessageTableWrites(root, {
      "features/demo/unlocked.ts": { statements: 1, how: "claims" },
      "features/demo/grew.ts": { statements: 1, how: "one" },
      "features/demo/removed.ts": { statements: 1, how: "gone" },
    });
    assert.ok(problems.some((line) => line.startsWith("UNCLASSIFIED features/demo/new-writer.ts")), "an unknown writer");
    assert.ok(problems.some((line) => line.startsWith("UNLOCKED features/demo/unlocked.ts")), "a writer without the lock");
    assert.ok(problems.some((line) => line.startsWith("CHANGED features/demo/grew.ts")), "a second statement in a listed file");
    assert.ok(problems.some((line) => line.startsWith("STALE features/demo/removed.ts")), "a manifest entry without a writer");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("every writer of the event tables that carry sync_revision takes the commit-order lock", () => {
  assert.deepEqual(auditEventTableWrites(ROOT, EVENT_SYNC_REVISION_TABLES, EVENT_TABLE_WRITE_MANIFEST), []);
});

test("an unlisted, unlocked, grown or removed event table writer fails the audit", () => {
  const root = mkdtempSync(join(tmpdir(), "event-write-audit-"));
  try {
    mkdirSync(join(root, "features/demo"), { recursive: true });
    mkdirSync(join(root, "scripts"), { recursive: true });
    writeFileSync(join(root, "scripts/new-writer.ts"), "await client.query(\"update event_ops_membership_heads set status = 'cancelled'\"); await acquireSyncCommitOrderLock(client);");
    writeFileSync(join(root, "features/demo/unlocked.ts"), "await sql.query(\"insert into event_ops_publication_heads (event_id) values ($1)\");");
    writeFileSync(join(root, "features/demo/grew.ts"), "acquireSyncCommitOrderLock(tx); q('update event_ops_events set title = 1'); q('insert into event_ops_configuration_heads values (1)');");
    const problems = auditEventTableWrites(root, EVENT_SYNC_REVISION_TABLES, {
      "features/demo/unlocked.ts": { statements: 1, how: "claims" },
      "features/demo/grew.ts": { statements: 1, how: "one" },
      "features/demo/removed.ts": { statements: 1, how: "gone" },
    });
    assert.ok(problems.some((line) => line.startsWith("UNCLASSIFIED scripts/new-writer.ts")), "an unknown writer (scripts too)");
    assert.ok(problems.some((line) => line.startsWith("UNLOCKED features/demo/unlocked.ts")), "a writer without the lock");
    assert.ok(problems.some((line) => line.startsWith("CHANGED features/demo/grew.ts")), "a second statement in a listed file");
    assert.ok(problems.some((line) => line.startsWith("STALE features/demo/removed.ts")), "a manifest entry without a writer");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// Sprint 0115: a derived event domain moves a row only when one of its source
// rows takes a new sync_revision, so every table it reads a revision from (and
// every owner table) must carry sync_revision under the commit-order lock, and
// every table it joins without a revision must never be updated in place.
test("every table a derived device domain reads carries sync_revision under the lock or is immutable", () => {
  assert.deepEqual(auditDerivedDomainSources(ROOT, DECLARED_SYNC_DOMAINS, EVENT_SYNC_REVISION_TABLES), []);
});

test("a derived domain reading a table without sync_revision, or an in-place update of an immutable joined table, fails the audit", () => {
  const root = mkdtempSync(join(tmpdir(), "derived-source-audit-"));
  try {
    mkdirSync(join(root, "features/demo"), { recursive: true });
    mkdirSync(join(root, "scripts"), { recursive: true });
    writeFileSync(join(root, "scripts/fix-publication.ts"), "await client.query(`update event_ops_publications set published_dto = $2 where publication_id = $1`);");
    writeFileSync(join(root, "features/demo/edit-config.ts"), "await tx.query(\"update event_ops_configurations set round_one_starts_at = $1\");");
    const base = EVENT_SYNC_DOMAINS[1]!;
    const checkIns: SyncDomainDefinition = { ...base, domainId: "demo-check-ins", source: { ...(base.source as Extract<SyncDomainDefinition["source"], { kind: "event_derived" }>), revisionTables: ["event_ops_membership_heads", "event_ops_checkins"] } };
    const problems = auditDerivedDomainSources(root, [...EVENT_SYNC_DOMAINS, checkIns], EVENT_SYNC_REVISION_TABLES);
    assert.ok(problems.some((line) => line.startsWith("NO_REVISION demo-check-ins: event_ops_checkins")), "a revision table without sync_revision");
    assert.ok(problems.some((line) => line.startsWith("MUTATED scripts/fix-publication.ts")), "a script updating a publication in place");
    assert.ok(problems.some((line) => line.startsWith("MUTATED features/demo/edit-config.ts")), "product code updating a configuration version in place");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
