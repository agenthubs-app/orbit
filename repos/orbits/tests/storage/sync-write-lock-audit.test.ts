import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { auditSyncWrites, type SyncWritePolicy } from "../support/sync-write-audit";

// Sprint 0108: every orbit_records writer in product code and scripts, and why
// it is safe under the strict sync_revision trigger. A new writer, or a new
// statement in a listed file, fails this test until it is classified.
export const SYNC_WRITE_MANIFEST: Readonly<Record<string, SyncWritePolicy>> = {
  "shared/storage/postgres-live-record-store.ts": { policy: "locked", statements: 4, how: "upsert/insertIfAbsent/updateIfCurrent/delete wrap sync collections in SYNC_COMMIT_ORDER_LOCK_CTE" },
  "features/connections/lifecycle/postgres-repository.ts": { policy: "locked", statements: 5, how: "acquireSyncCommitOrderLock before the first write when the plan touches tasks" },
  "features/connections/lifecycle/initialization.ts": { policy: "locked", statements: 2, how: "acquireSyncCommitOrderLock before the first write when a task is created" },
  "features/connections/lifecycle/migration-repository.ts": { policy: "locked", statements: 2, how: "acquireSyncCommitOrderLock when an owner repair touches a sync collection" },
  "features/sync/migrations.ts": { policy: "locked", statements: 1, how: "one-shot backfill joins sync_write_lock" },
  "features/sync/sync-revision-migration.ts": { policy: "locked", statements: 1, how: "each backfill batch joins sync_write_lock" },
  "scripts/sync-cloud-records.ts": { policy: "locked", statements: 1, how: "every copied row is inserted through SYNC_COMMIT_ORDER_LOCK_CTE" },
  "scripts/repair-lifecycle-task-metadata.mjs": { policy: "locked", statements: 1, how: "inline copy of SYNC_COMMIT_ORDER_LOCK_SQL (pinned below)" },
  "features/acquisition/storage/external-import-live-record-provider.ts": { policy: "guarded", statements: 1, how: "atomic contact-draft writer refuses sync collections" },
  "features/acquisition/storage/referral-live-record-provider.ts": { policy: "guarded", statements: 2, how: "atomic contact-draft writer refuses sync collections; second write is contactDrafts" },
  "features/acquisition/storage/contact-draft-live-record-provider.ts": { policy: "non-sync", statements: 1, collections: "contactDrafts" },
  "features/agent/storage/agent-runtime-live-record-provider.ts": { policy: "non-sync", statements: 2, collections: "orbit_agent_chat_requests and agent runtime collections" },
  "features/appointments/notification-projector.ts": { policy: "non-sync", statements: 2, collections: "notifications" },
  "features/auth/password-reset-store.ts": { policy: "non-sync", statements: 4, collections: "auth_users" },
  "features/auth/storage/mobile-auth-exchange-provider.ts": { policy: "non-sync", statements: 1, collections: "mobile_auth_exchanges" },
  "features/dashboard/storage/dashboard-snapshot.ts": { policy: "non-sync", statements: 1, collections: "dashboard analysis snapshots" },
  "features/encounters/projection-repository.ts": { policy: "non-sync", statements: 4, collections: "contact_detail_states, human_encounters" },
  "features/events/organizer-accounts/owner-migration.ts": { policy: "non-sync", statements: 2, collections: "event_organizer_owner_migrations, events" },
  "features/events/post-event-artifact/task-repository.ts": { policy: "non-sync", statements: 4, collections: "attendee post-event AI artifact jobs (not tasks)" },
  "features/integrations/oauth-state-store.ts": { policy: "non-sync", statements: 1, collections: "integrationOAuthStates" },
  "features/notifications/canonical-reminder-wake.ts": { policy: "non-sync", statements: 4, collections: "canonical_reminder_wakes" },
  "features/notifications/delivery-service.ts": { policy: "non-sync", statements: 3, collections: "notificationDeliveries" },
  "features/notifications/discovery/discovery-repository.ts": { policy: "non-sync", statements: 2, collections: "notification discovery work" },
  "features/notifications/notification-cutover-migration.ts": { policy: "non-sync", statements: 3, collections: "notification collections" },
  "scripts/backfill-event-display-fields.ts": { policy: "non-sync", statements: 1, collections: "events" },
  "scripts/backfill-test-secondary-industries.ts": { policy: "non-sync", statements: 1, collections: "contacts" },
  "scripts/bootstrap-event-organizer-accounts.ts": { policy: "non-sync", statements: 2, collections: "organizer accounts and events" },
  "scripts/diagnostics/notification-source-read-cost.ts": { policy: "non-sync", statements: 2, collections: "reminderPlans and notification fixtures" },
  "scripts/diagnostics/schedule-exception-window-cost.ts": { policy: "non-sync", statements: 1, collections: "personal_schedule_occurrence_exceptions (the series rows go through the store)" },
  "scripts/quarantine-legacy-notifications.ts": { policy: "non-sync", statements: 1, collections: "notifications" },
  "scripts/seed-demo-workspace.ts": { policy: "non-sync", statements: 2, collections: "event_organizer_owner_migrations, events" },
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
