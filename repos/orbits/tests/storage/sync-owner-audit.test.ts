import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DECLARED_SYNC_DOMAINS, SYNC_OWNER_CHANGE_HANDLER_DEFINITIONS } from "../../features/sync/domain-registry";
import { auditOwnerWrites, setTargets, type OwnerWritePolicy, type ReassignCallPolicy } from "../support/sync-owner-audit";

// Sprint 0113 (offline design step 5, method two; decision 4): every statement
// in product code and scripts that sets a sync domain's owner or visibility
// column, and why it cannot make a row silently leave a device. A new writer,
// or a new statement in a listed file, fails this test until it is classified.
// Registered owner-change handlers: one first-owner handler, the 0114 owner
// backfill (it never re-owns a row), and one "reassign" handler, the 0117 demo
// seed's event owner reset (it rotates the previous owners' epochs).
export const OWNER_WRITE_MANIFEST: Readonly<Record<string, OwnerWritePolicy>> = {
  "shared/storage/postgres-live-record-store.ts": { policy: "owner-interface", statements: 2, how: "upsert keeps the stored owner (coalesce + conflict guard → LiveRecordOwnerConflictError); reassignRecordOwner is the explicit interface and calls assertRegisteredOwnerChange" },
  "features/appointments/notification-projector.ts": { policy: "preserves-owner", statements: 1, how: "reminder notifications: record id carries the actor; a foreign owner is refused" },
  "features/encounters/projection-repository.ts": { policy: "preserves-owner", statements: 1, how: "contact_detail_states: record id carries the actor; a foreign owner is refused" },
  "scripts/sync-cloud-records.ts": { policy: "preserves-owner", statements: 1, how: "cloud copy keeps local owners; conflicts are skipped and fail the run" },
  "features/connections/lifecycle/migration-repository.ts": { policy: "assigns-first-owner", statements: 1, how: "owner repair gives an unowned lifecycle row its actor (plan rejects an owned row with CONFLICT)" },
  "scripts/bootstrap-event-organizer-accounts.ts": { policy: "assigns-first-owner", statements: 1, how: "organizer bootstrap only claims accounts, contacts or profiles with user_id is null" },
  // Sprint 0117: events is a sync collection (dashboard graph domain).
  "features/events/organizer-accounts/owner-migration.ts": { policy: "assigns-first-owner", statements: 1, how: "the reviewed organizer owner plan sets an event's owner only where user_id is null or already the planned account (the plan refuses a drifted owner)" },
  "scripts/seed-demo-workspace.ts": { policy: "handler", statements: 1, handler: "demo-event-owner-reset" },
  "features/sync/owner-backfill.ts": { policy: "handler", statements: 1, handler: "owner-backfill-0114" },
};

// Callers of the explicit owner-change interface. A sync-domain owner change must be a
// registered handler (none exist); the rest move rows outside every sync domain.
export const REASSIGN_CALL_MANIFEST: Readonly<Record<string, ReassignCallPolicy>> = {
  "scripts/demo-organizer-projection.ts": { calls: 1, nonSyncCollections: "organizers (demo seed hands fixture organizers to their canonical login)" },
};

const ROOT = join(__dirname, "../..");

test("every statement that sets a sync owner/visibility column is classified, and no owner change is unregistered", () => {
  assert.deepEqual(
    SYNC_OWNER_CHANGE_HANDLER_DEFINITIONS.map(({ name, scope, collections }) => ({ name, scope, collections })),
    [
      { name: "owner-backfill-0114", scope: "first-owner", collections: ["contacts", "connections", "contact_detail_states", "evidence"] },
      { name: "demo-event-owner-reset", scope: "reassign", collections: ["events"] },
    ],
    "first owners for contact rows, and only the demo seed may re-own a sync row (events, with the epoch rotation)",
  );
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
    // Sprint 0115: the owner heads of the derived event domains (actor and identity columns).
    writeFileSync(join(root, "scripts/move-applications.ts"), "await client.query(`update event_ops_admission_application_heads set actor_id = $3 where workspace_id = $1 and event_id = $2`);");
    writeFileSync(join(root, "features/demo/move-membership-event.ts"), "await tx.query(\"update event_ops_membership_heads set event_id = $2, updated_at = now() where workspace_id = $1\");");
    // Sprint 0118: an AI session row moved to another personal sub-workspace, an inbox row re-owned.
    writeFileSync(join(root, "scripts/move-ai-sessions.ts"), "await client.query(`update orbit_records set workspace_id = $2 where workspace_id = $1 and collection_name = 'orbit_agent_chat_messages'`);");
    writeFileSync(join(root, "features/demo/hand-over-inbox.ts"), "await sql.query(\"update orbit_records set user_id = $2 where collection_name = 'inboxNotifications' and record_id = $1\");");
    // Sprint 0119: the relationship message tables (owner derived from the member row): moving a member to another account, a message to another conversation.
    writeFileSync(join(root, "scripts/move-member.ts"), "await client.query(`update relationship_conversation_members set account_id = $3 where workspace_id = $1 and conversation_id = $2`);");
    writeFileSync(join(root, "features/demo/move-message.ts"), "await tx.query(\"update relationship_messages set conversation_id = $2 where workspace_id = $1\");");
    // Leaving keeps the owner (the member row takes a new revision and the device deletes the conversation).
    writeFileSync(join(root, "features/demo/leave-conversation.ts"), "await tx.query(\"update relationship_conversation_members set state = 'left', updated_at = $3 where workspace_id = $1 and conversation_id = $2\");");
    // A status change keeps the owner: the device hears about it through the row's new revision.
    writeFileSync(join(root, "features/demo/cancel-membership.ts"), "await tx.query(\"update event_ops_membership_heads set status = 'cancelled' where workspace_id = $1 and actor_id = $2\");");
    // Payload-only writes filtered by owner are not owner changes.
    writeFileSync(join(root, "features/demo/payload-only.ts"), "await sql.query(\"update orbit_records set payload = $1 where user_id = $2 and collection_name = 'notes'\");");
    // Dishonest classifications.
    writeFileSync(join(root, "features/demo/claims-keep.ts"), "q(`insert into orbit_records (a) values (1) on conflict (a) do update set user_id = excluded.user_id`);");
    writeFileSync(join(root, "features/demo/claims-nonreg.ts"), "q(\"update orbit_records set user_id = null where collection_name = 'personal_schedule_items'\");");
    writeFileSync(join(root, "features/demo/claims-handler.ts"), "q(\"update orbit_records set user_id = $1 where collection_name = 'notes'\");");
    writeFileSync(join(root, "features/demo/claims-first.ts"), "q(\"update orbit_records set user_id = $1 where collection_name = 'notes' and record_id = $2\");");
    writeFileSync(join(root, "features/demo/reassign-caller.ts"), "await store.reassignRecordOwner({ collectionName: 'notes' });");
    // A first-owner handler that overwrites an owner instead of filling an empty one.
    writeFileSync(join(root, "scripts/backfill-overwrites.ts"), "q(\"update orbit_records set user_id = $1 where collection_name = 'notes' and record_id = any($2)\");");
    const problems = auditOwnerWrites(root, DECLARED_SYNC_DOMAINS, {
      "features/demo/claims-keep.ts": { policy: "preserves-owner", statements: 1, how: "says so" },
      "features/demo/claims-nonreg.ts": { policy: "non-registered", statements: 1, collections: "contacts" },
      "features/demo/claims-handler.ts": { policy: "handler", statements: 1, handler: "contact-handover" },
      "features/demo/claims-first.ts": { policy: "assigns-first-owner", statements: 1, how: "says so" },
      "features/demo/removed.ts": { policy: "non-registered", statements: 1, collections: "contacts" },
      "scripts/backfill-overwrites.ts": { policy: "handler", statements: 1, handler: "owner-backfill-0114" },
    });
    const has = (prefix: string) => problems.some((line) => line.startsWith(prefix));
    assert.ok(has("UNCLASSIFIED features/demo/transfer-note.ts"), "product code moving a note to another owner");
    assert.ok(has("UNCLASSIFIED scripts/batch-reassign-tasks.ts"), "a batch script re-owning tasks (a SQL comment does not hide it)");
    assert.ok(has("UNCLASSIFIED scripts/move-memberships.mjs"), "a script moving a dedicated-table domain row to another owner");
    assert.ok(!problems.some((line) => line.includes("payload-only.ts")), "an owner-filtered payload update is not an owner change");
    assert.ok(has("UNCLASSIFIED scripts/move-applications.ts"), "a script moving an admission application (derived event owner) to another actor");
    assert.ok(has("UNCLASSIFIED features/demo/move-membership-event.ts"), "moving a membership head to another event (identity column)");
    assert.ok(!problems.some((line) => line.includes("cancel-membership.ts")), "a status change keeps the owner and is not an owner change");
    assert.ok(has("OWNER_OVERWRITE features/demo/claims-keep.ts"), "preserves-owner that overwrites");
    assert.ok(has("SYNC_DOMAIN features/demo/claims-nonreg.ts"), "non-registered that touches a sync collection");
    assert.ok(has("UNREGISTERED features/demo/claims-handler.ts"), "a handler that is not registered");
    assert.ok(has("OWNER_OVERWRITE features/demo/claims-first.ts"), "assigns-first-owner without an owner guard");
    assert.ok(has("UNREGISTERED_REASSIGN features/demo/reassign-caller.ts"), "an explicit reassign outside a registered handler");
    assert.ok(has("STALE features/demo/removed.ts"), "a manifest entry without a writer");
    assert.ok(has("UNCLASSIFIED scripts/move-ai-sessions.ts"), "a script moving AI session rows to another personal sub-workspace");
    assert.ok(has("UNCLASSIFIED features/demo/hand-over-inbox.ts"), "product code re-owning an inbox notification");
    assert.ok(has("OWNER_OVERWRITE scripts/backfill-overwrites.ts"), "a first-owner handler statement without a user_id is null guard");
    assert.ok(has("UNCLASSIFIED scripts/move-member.ts"), "a script moving a conversation member row to another account");
    assert.ok(has("UNCLASSIFIED features/demo/move-message.ts"), "product code moving a message to another conversation");
    assert.ok(!problems.some((line) => line.includes("leave-conversation.ts")), "leaving a conversation keeps the member row's owner");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
