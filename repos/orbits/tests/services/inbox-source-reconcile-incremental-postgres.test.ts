import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { Pool } from "pg";

import type { InboxNotificationUpsert } from "../../features/notifications/inbox-record-service";
import { createInboxRuntime } from "../../features/notifications/inbox-record-service-factory";
import { acquireSyncCommitOrderLock } from "../../features/sync/commit-order-lock";
import {
  INBOX_RECONCILE_AFFECTED_LIMIT,
  INBOX_RECONCILE_CHANGED_SOURCES,
  INBOX_RECONCILE_ROTATION_BATCH,
  reconcileInboxSourceStates,
} from "../../features/sync/inbox-domain-reader";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import type { PostgresReadMetric } from "../../shared/storage/postgres-read-metrics";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { STRICT_SYNC_REVISION_SQL } from "../support/sync-revision-fixture";

// Sprint 0119 (coordinator item from 0118): the manifest's inbox source check
// was a full scan — every active notification's sources, every manifest, with
// the complex sources checked one by one — so an account with many
// notifications paid more on every 15-second poll. It is now incremental:
//   - the notifications whose record sources changed since the last check (a
//     per-account source watermark over sync_revision), and
//   - one rotating window of INBOX_RECONCILE_ROTATION_BATCH notifications
//     (by time slot), which still catches what leaves no revision behind
//     (a hard-deleted row, a complex or external source).
// This local Postgres holds an account with 500 notifications; every statement
// the check runs is metered by the real read-metrics runner.

const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const options = { skip: databaseUrl ? false : "Explicit isolated PostgreSQL URL required", timeout: 300_000 };
const W = "workspace:inbox-reconcile";
const A = "actor:reconcile-a";
const NOW = "2026-09-28T09:00:00.000Z";
const SLOT_MS = 15_000;
/** The most any one poll may check or return, whatever the account holds: one window, one batch of changed sources and the notifications citing them. */
const MAX_CHECKED = INBOX_RECONCILE_ROTATION_BATCH + INBOX_RECONCILE_AFFECTED_LIMIT;
const MAX_ROWS = INBOX_RECONCILE_CHANGED_SOURCES + 2 * MAX_CHECKED + 4;

async function host(t: TestContext) {
  assert.ok(databaseUrl);
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname), "local Postgres only");
  const schema = `inbox_reconcile_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 6, options: `-c search_path=${schema} -c statement_timeout=20000` });
  const metrics: PostgresReadMetric[] = [];
  let metering = false;
  const client = createTransactionalPostgresClient({ connectionString: databaseUrl, pool, readMetrics: { observer: (metric) => { if (metering) metrics.push(metric); } } });
  t.after(async () => { try { await client.close(); } finally { try { await admin.query(`drop schema if exists ${schema} cascade`); } finally { await admin.end(); } } });
  await admin.query(`create schema ${schema}`);
  await client.query(ORBIT_RECORDS_SCHEMA_SQL);
  await client.query(STRICT_SYNC_REVISION_SQL);
  const store = createPostgresLiveRecordStore({ client });
  const inbox = createInboxRuntime({ client, workspaceId: W, now: () => NOW });
  const contact = (id: string, version: number, lifecycleState: "active" | "deleted" = "active") => store.upsertRecord({
    workspaceId: W, collectionName: "contacts", recordId: id, userId: A, sourceType: "manual", sourceId: id, evidenceIds: [], lifecycleState,
    createdAt: "2026-09-01T00:00:00.000Z", updatedAt: new Date(Date.parse("2026-09-02T00:00:00.000Z") + version).toISOString(), payload: { id, displayName: `Name ${id}`, version },
  });
  const notification = (key: string): InboxNotificationUpsert => ({
    actorId: A, semanticKey: `reconcile:${key}`, kind: "suggestion", origin: "automation", title: `提醒 ${key}`, reason: `原因 ${key}`,
    copy: { zh: { title: `提醒 ${key}`, reason: `原因 ${key}` }, en: { title: `Note ${key}`, reason: `Reason ${key}` }, ja: { title: `通知 ${key}`, reason: `理由 ${key}` } },
    object: { id: `contact:${key}`, name: `object ${key}` },
    sources: [{ sourceKind: "contact", sourceId: `contact:${key}`, sourceRevision: "1", occurredAt: "2026-09-27T00:00:00.000Z", readAt: "2026-09-27T00:00:00.000Z" }],
    target: { kind: "source", id: `contact:${key}`, href: `/contacts/contact:${key}`, status: "available" }, actions: ["read", "dismiss"],
    occurredAt: "2026-09-27T08:00:00.000Z",
  });
  const seed = async (from: number, to: number) => {
    for (let index = from; index < to; index += 1) {
      const key = String(index).padStart(4, "0");
      await contact(`contact:${key}`, 1);
      await inbox.service.upsert(notification(key));
    }
  };
  let slot = Math.floor(Date.parse(NOW) / SLOT_MS);
  /** One manifest's source check, metered; each call is the next 15-second poll. */
  const reconcile = async () => {
    const nowMs = (slot += 1) * SLOT_MS;
    metrics.length = 0;
    metering = true;
    try {
      const result = await reconcileInboxSourceStates({ client, workspaceId: W, actorId: A, access: inbox.sourceAccessBatch, nowMs: () => nowMs });
      const reads = metrics.filter((metric) => !["insert", "update", "delete", "merge"].includes(metric.queryKind));
      return { ...result, queries: reads.length, rows: reads.reduce((total, metric) => total + metric.returnedRows, 0), bytes: reads.reduce((total, metric) => total + metric.approximateSerializedRowBytes, 0) };
    } finally { metering = false; }
  };
  const state = async (key: string) => {
    const row = await client.query<{ state: string | null }>(`select payload->>'sourceState' as state from orbit_records where workspace_id = $1 and collection_name = 'inboxNotifications' and payload->'notification'->>'semanticKey' = $2`, [W, `reconcile:${key}`]);
    return row.rows[0]?.state ?? "available";
  };
  return { client, contact, seed, reconcile, state };
}

test("a steady poll reads a bounded amount that does not grow with the number of notifications (120 → 500)", options, async (t) => {
  const h = await host(t);
  await h.seed(0, 120);
  await h.reconcile(); // first check sets the account's source watermark
  // One full rotation of the 120-notification account (windows of 50, 50 and 20): its worst poll is the baseline.
  const smallPolls = [await h.reconcile(), await h.reconcile(), await h.reconcile()];
  const small = smallPolls.reduce((max, poll) => (poll.bytes > max.bytes ? poll : max));
  await h.seed(120, 500);
  // 380 new contacts moved the source watermark: the next polls work through them one batch at a time, each still bounded.
  const catchUp = [];
  for (let index = 0; index < Math.ceil(380 / INBOX_RECONCILE_CHANGED_SOURCES) + 1; index += 1) catchUp.push(await h.reconcile());
  for (const poll of catchUp) assert.ok(poll.checked <= MAX_CHECKED && poll.rows <= MAX_ROWS, `a catch-up poll stays bounded: ${JSON.stringify(poll)}`);
  const polls = [];
  for (let index = 0; index < 12; index += 1) polls.push(await h.reconcile());
  const worst = polls.reduce((max, poll) => ({ queries: Math.max(max.queries, poll.queries), rows: Math.max(max.rows, poll.rows), bytes: Math.max(max.bytes, poll.bytes), checked: Math.max(max.checked, poll.checked) }), { queries: 0, rows: 0, bytes: 0, checked: 0 });
  t.diagnostic(`120 notifications: ${JSON.stringify(small)}; 500 notifications, worst of 12 polls: ${JSON.stringify(worst)}`);
  assert.ok(worst.checked <= INBOX_RECONCILE_ROTATION_BATCH, `each poll checks at most one window (${worst.checked})`);
  assert.ok(worst.queries <= small.queries, `no more statements at 500 than at 120 (${worst.queries} vs ${small.queries})`);
  assert.ok(worst.rows <= 2 * INBOX_RECONCILE_ROTATION_BATCH + 4, `returned rows stay bounded (${worst.rows})`);
  assert.ok(worst.bytes <= small.bytes * 1.1, `returned bytes do not grow with the account (${worst.bytes} vs ${small.bytes})`);
  assert.deepEqual(polls.map((poll) => poll.changed), polls.map(() => 0), "nothing changed, nothing written");
});

test("still catches invalidations: a changed or deleted source is caught on the next poll; a hard-deleted row within one rotation", options, async (t) => {
  const h = await host(t);
  await h.seed(0, 500);
  await h.reconcile();
  await h.reconcile();
  // A soft delete and a version change move the source's sync_revision: the next poll writes them back.
  await h.contact("contact:0347", 2, "deleted");
  await h.contact("contact:0123", 2);
  const next = await h.reconcile();
  assert.equal(await h.state("0347"), "unavailable", "the deleted contact is caught on the next poll");
  assert.equal(await h.state("0123"), "changed", "the new contact version is caught on the next poll");
  assert.ok(next.checked <= MAX_CHECKED && next.rows <= MAX_ROWS, JSON.stringify(next));
  // Restoring the contact restores the notification on the next poll.
  await h.contact("contact:0347", 1);
  await h.reconcile();
  assert.equal(await h.state("0347"), "available");
  // A hard delete leaves no revision; the rotation reaches every notification within ceil(500 / batch) polls.
  await h.client.transaction(async (tx) => { await acquireSyncCommitOrderLock(tx); await tx.query("delete from orbit_records where workspace_id = $1 and collection_name = 'contacts' and record_id = 'contact:0421'", [W]); });
  const rotation = Math.ceil(500 / INBOX_RECONCILE_ROTATION_BATCH);
  let caughtAfter = 0;
  for (let poll = 1; poll <= rotation; poll += 1) {
    await h.reconcile();
    if (await h.state("0421") === "unavailable") { caughtAfter = poll; break; }
  }
  assert.ok(caughtAfter >= 1 && caughtAfter <= rotation, `caught within one rotation of ${rotation} polls (after ${caughtAfter})`);
});
