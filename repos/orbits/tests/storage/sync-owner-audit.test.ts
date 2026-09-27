import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DECLARED_SYNC_DOMAINS, SYNC_OWNER_CHANGE_HANDLERS } from "../../features/sync/domain-registry";
import { auditOwnerWrites, setTargets, type OwnerWritePolicy, type ReassignCallPolicy } from "../support/sync-owner-audit";

// Sprint 0113 (offline design step 5, method two; decision 4): every statement
// in product code and scripts that sets a sync domain's owner or visibility
// column, and why it cannot make a row silently leave a device. A new writer,
// or a new statement in a listed file, fails this test until it is classified.
// Registered owner-change handlers: none (SYNC_OWNER_CHANGE_HANDLERS is empty).
export const OWNER_WRITE_MANIFEST: Readonly<Record<string, OwnerWritePolicy>> = {
  "shared/storage/postgres-live-record-store.ts": { policy: "owner-interface", statements: 2, how: "upsert keeps the stored owner (coalesce + conflict guard → LiveRecordOwnerConflictError); reassignRecordOwner is the explicit interface and calls assertRegisteredOwnerChange" },
  "features/appointments/notification-projector.ts": { policy: "preserves-owner", statements: 1, how: "reminder notifications: record id carries the actor; a foreign owner is refused" },
  "features/encounters/projection-repository.ts": { policy: "preserves-owner", statements: 1, how: "contact_detail_states: record id carries the actor; a foreign owner is refused" },
  "scripts/sync-cloud-records.ts": { policy: "preserves-owner", statements: 1, how: "cloud copy keeps local owners; conflicts are skipped and fail the run" },
  "features/connections/lifecycle/migration-repository.ts": { policy: "assigns-first-owner", statements: 1, how: "owner repair gives an unowned lifecycle row its actor (plan rejects an owned row with CONFLICT)" },
  "scripts/bootstrap-event-organizer-accounts.ts": { policy: "assigns-first-owner", statements: 1, how: "organizer bootstrap only claims events with user_id is null" },
  "features/events/organizer-accounts/owner-migration.ts": { policy: "non-registered", statements: 1, collections: "events (orbit_records 'events' is not a sync domain)" },
  "scripts/seed-demo-workspace.ts": { policy: "non-registered", statements: 1, collections: "events (demo seed resets reviewed event owners before the owner plan)" },
};

// Callers of the explicit owner-change interface. A sync-domain owner change must be a
// registered handler (none exist); the rest move rows outside every sync domain.
export const REASSIGN_CALL_MANIFEST: Readonly<Record<string, ReassignCallPolicy>> = {
  "scripts/demo-organizer-projection.ts": { calls: 1, nonSyncCollections: "organizers (demo seed hands fixture organizers to their canonical login)" },
};

const ROOT = join(__dirname, "../..");

test("every statement that sets a sync owner/visibility column is classified, and no owner change is unregistered", () => {
  assert.deepEqual(SYNC_OWNER_CHANGE_HANDLERS, [], "the product has no registered owner-change handler yet");
  assert.deepEqual(auditOwnerWrites(ROOT, DECLARED_SYNC_DOMAINS, OWNER_WRITE_MANIFEST, REASSIGN_CALL_MANIFEST), []);
});

test("SET targets come from SET clauses only, qualified or not, never from WHERE", () => {
  assert.deepEqual(setTargets("update orbit_records set payload = $1 where user_id = $2"), ["payload"]);
  assert.deepEqual(setTargets("update orbit_records t set user_id=$1, t.collection_name = 'x' from y where t.user_id = $2"), ["user_id", "collection_name"]);
  assert.deepEqual(setTargets("insert into orbit_records (a) values (1) on conflict (a) do update set user_id = excluded.user_id, payload = excluded.payload where orbit_records.user_id = excluded.user_id"), ["user_id", "payload"]);
  assert.deepEqual(setTargets("select set_config('x', '1', true)"), []);
});

test("a product writer or a batch script that changes a registered owner, a dishonest classification, or an unregistered reassign fails the audit", () => {
  const root = mkdtempSync(join(tmpdir(), "sync-owner-audit-"));
  try {
    mkdirSync(join(root, "features/demo"), { recursive: true });
    mkdirSync(join(root, "scripts"), { recursive: true });
    // Deliberate owner changes (offline design acceptance item 5).
    writeFileSync(join(root, "features/demo/transfer-note.ts"), "await sql.query(\"update orbit_records set user_id = $2 where collection_name = 'notes' and record_id = $1\");");
    writeFileSync(join(root, "scripts/batch-reassign-tasks.ts"), "await client.query(`insert into orbit_records (workspace_id, collection_name, record_id, user_id) values ($1, 'tasks', $2, $3)\n on conflict (workspace_id, collection_name, record_id) do update set\n -- where the new owner comes from\n user_id = excluded.user_id`);");
    writeFileSync(join(root, "scripts/move-memberships.mjs"), "await client.query(`update event_ops_membership_heads set actor_id = $3, updated_at = now() where workspace_id = $1 and event_id = $2`);");
    // Payload-only writes filtered by owner are not owner changes.
    writeFileSync(join(root, "features/demo/payload-only.ts"), "await sql.query(\"update orbit_records set payload = $1 where user_id = $2 and collection_name = 'notes'\");");
    // Dishonest classifications.
    writeFileSync(join(root, "features/demo/claims-keep.ts"), "q(`insert into orbit_records (a) values (1) on conflict (a) do update set user_id = excluded.user_id`);");
    writeFileSync(join(root, "features/demo/claims-nonreg.ts"), "q(\"update orbit_records set user_id = null where collection_name = 'personal_schedule_items'\");");
    writeFileSync(join(root, "features/demo/claims-handler.ts"), "q(\"update orbit_records set user_id = $1 where collection_name = 'notes'\");");
    writeFileSync(join(root, "features/demo/claims-first.ts"), "q(\"update orbit_records set user_id = $1 where collection_name = 'notes' and record_id = $2\");");
    writeFileSync(join(root, "features/demo/reassign-caller.ts"), "await store.reassignRecordOwner({ collectionName: 'notes' });");
    const problems = auditOwnerWrites(root, DECLARED_SYNC_DOMAINS, {
      "features/demo/claims-keep.ts": { policy: "preserves-owner", statements: 1, how: "says so" },
      "features/demo/claims-nonreg.ts": { policy: "non-registered", statements: 1, collections: "contacts" },
      "features/demo/claims-handler.ts": { policy: "handler", statements: 1, handler: "contact-handover" },
      "features/demo/claims-first.ts": { policy: "assigns-first-owner", statements: 1, how: "says so" },
      "features/demo/removed.ts": { policy: "non-registered", statements: 1, collections: "contacts" },
    });
    const has = (prefix: string) => problems.some((line) => line.startsWith(prefix));
    assert.ok(has("UNCLASSIFIED features/demo/transfer-note.ts"), "product code moving a note to another owner");
    assert.ok(has("UNCLASSIFIED scripts/batch-reassign-tasks.ts"), "a batch script re-owning tasks (a SQL comment does not hide it)");
    assert.ok(has("UNCLASSIFIED scripts/move-memberships.mjs"), "a script moving a dedicated-table domain row to another owner");
    assert.ok(!problems.some((line) => line.includes("payload-only.ts")), "an owner-filtered payload update is not an owner change");
    assert.ok(has("OWNER_OVERWRITE features/demo/claims-keep.ts"), "preserves-owner that overwrites");
    assert.ok(has("SYNC_DOMAIN features/demo/claims-nonreg.ts"), "non-registered that touches a sync collection");
    assert.ok(has("UNREGISTERED features/demo/claims-handler.ts"), "a handler that is not registered");
    assert.ok(has("OWNER_OVERWRITE features/demo/claims-first.ts"), "assigns-first-owner without an owner guard");
    assert.ok(has("UNREGISTERED_REASSIGN features/demo/reassign-caller.ts"), "an explicit reassign outside a registered handler");
    assert.ok(has("STALE features/demo/removed.ts"), "a manifest entry without a writer");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
