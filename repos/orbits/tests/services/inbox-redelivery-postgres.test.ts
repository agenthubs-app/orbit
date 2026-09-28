import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { Pool } from "pg";

import { eventContactRequestNotification } from "../../features/notifications/event-contact-request-inbox";
import {
  appointmentChangeNotification,
  batchResultNotification,
  integrationExpiryNotification,
  reminderPlanNotification,
} from "../../features/notifications/inbox-business-projections";
import type { InboxNotificationUpsert } from "../../features/notifications/inbox-record-service";
import { createInboxRuntime } from "../../features/notifications/inbox-record-service-factory";
import { readCostAlertNotification } from "../../features/operations/read-cost/alerts";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { STRICT_SYNC_REVISION_SQL } from "../support/sync-revision-fixture";

// Sprint 0118 (coordinator item from 0129): the shared inbox upsert decided
// "did anything change" by comparing JSON strings of `copy`. PostgreSQL jsonb
// stores object keys in its own order (shorter keys first, then bytewise), so a
// producer that builds copy as {zh, en, ja} never matched its own stored row:
// every redelivery bumped the notification revision (a client's expectedRevision
// then conflicts on mark-read) and, since 0118, would also send the row to every
// device again. Each producer's real builder is redelivered here against
// Postgres: the revision, the stored payload and the row's sync_revision stay put.

const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const options = { skip: databaseUrl ? false : "Explicit isolated PostgreSQL URL required", timeout: 60_000 };
const W = "workspace:inbox-redelivery";
const A = "actor:redelivery-a";
const AT = "2026-09-27T08:00:00.000Z";

async function host(t: TestContext) {
  assert.ok(databaseUrl);
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname), "local Postgres only");
  const schema = `inbox_redelivery_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 4, options: `-c search_path=${schema} -c statement_timeout=15000` });
  const client = createTransactionalPostgresClient({ connectionString: databaseUrl, pool });
  t.after(async () => { try { await client.close(); } finally { try { await admin.query(`drop schema if exists ${schema} cascade`); } finally { await admin.end(); } } });
  await admin.query(`create schema ${schema}`);
  await client.query(ORBIT_RECORDS_SCHEMA_SQL);
  await client.query(STRICT_SYNC_REVISION_SQL);
  const runtime = createInboxRuntime({ client, workspaceId: W, now: () => AT });
  const stored = async (id: string) => {
    const result = await client.query<{ revision: number; sync_revision: string; payload: string }>(
      "select (payload->'notification'->>'revision')::int as revision, sync_revision::text as sync_revision, payload::text as payload from orbit_records where workspace_id = $1 and collection_name = 'inboxNotifications' and record_id = $2",
      [W, id],
    );
    assert.equal(result.rows.length, 1, `stored ${id}`);
    return result.rows[0]!;
  };
  return { client, runtime, stored };
}

async function seedNote(h: Awaited<ReturnType<typeof host>>) {
  await createPostgresLiveRecordStore({ client: h.client }).upsertRecord({
    workspaceId: W, collectionName: "notes", recordId: "note:1", userId: A, sourceType: "manual", sourceId: "note:1", evidenceIds: [],
    lifecycleState: "active", createdAt: AT, updatedAt: AT, payload: { id: "note:1", version: 4, title: "Sato", body: "deck" },
  });
}

/** Every producer's own builder, fed the way the producer feeds it. */
function producers(): { writer: string; build: () => InboxNotificationUpsert }[] {
  return [
    {
      writer: "appointment worker (appointmentChangeNotification)",
      build: () => appointmentChangeNotification({
        actorId: A, appointmentId: "appointment:1", contactName: "佐藤 花子", contactId: "contact:1", time: "2026-10-01T01:00:00.000Z", timeZone: "Asia/Tokyo",
        history: { version: 2, command: "propose", actorId: "actor:other", at: AT } as never,
      })!,
    },
    {
      writer: "business-card batch (batchResultNotification)",
      build: () => batchResultNotification({ actorId: A, batchId: "batch:1", revision: "3", occurredAt: AT, count: 12, status: "ready_for_review", pipeline: "v2" })!,
    },
    {
      writer: "integration expiry (integrationExpiryNotification)",
      build: () => integrationExpiryNotification({ actorId: A, principalId: A, provider: "google_calendar", expiresAt: AT, requiresReconnect: true })!,
    },
    {
      writer: "read-cost alert (readCostAlertNotification)",
      build: () => readCostAlertNotification({ alert_id: "alert:1", rule: "large_request", day: "2026-09-26", subject: "/api/demo", observed: 6_000_000, threshold: 5_000_000, created_at: AT } as never, A),
    },
    {
      writer: "business-card exchange (eventContactRequestNotification)",
      build: () => eventContactRequestNotification({
        actorId: A, revision: 1, transition: "created", occurredAt: AT, readAt: AT, contactId: null,
        facts: { requestId: "request:1", eventId: "event:1", requesterActorId: "actor:other", targetActorId: A, requesterParticipantId: "p:other", targetParticipantId: "p:a", counterpartName: "Other" } as never,
      }),
    },
    {
      writer: "reminder plan projection (reminderPlanNotification)",
      build: () => reminderPlanNotification({
        id: "reminder:1", ownerUserId: A, accountId: A, title: "Call back", body: "Follow up on the proposal", fireAt: "2026-09-27T07:00:00.000Z",
        createdAt: "2026-09-26T00:00:00.000Z", updatedAt: "2026-09-26T00:00:00.000Z", status: "scheduled", targetType: "task", targetId: "task:1", deepLink: "/app/tasks/task:1",
      } as never, AT)!,
    },
    {
      // The discovery worker builds its upsert inline (discovery-worker.ts): copy in zh, en, ja order, the zh text spread on top.
      writer: "discovery worker (inline copy)",
      build: () => {
        const copy = { zh: { title: "跟进佐藤", reason: "上次见面提到下周发资料。" }, en: { title: "Follow up with Sato", reason: "You said you would send the deck next week." }, ja: { title: "佐藤さんへのフォロー", reason: "来週資料を送ると話していました。" } };
        return {
          actorId: A, semanticKey: "discovery:sato", kind: "suggestion", origin: "automation", object: { id: "contact:1", name: "佐藤" }, ...copy.zh, copy,
          sources: [{ sourceKind: "note", sourceId: "note:1", sourceRevision: "4", occurredAt: AT, readAt: AT }],
          target: { kind: "source", id: "note:1", href: "/notes/note:1", status: "available" }, actions: ["read", "dismiss", "accept"], occurredAt: AT, expiresAt: "2026-10-27T00:00:00.000Z",
        } satisfies InboxNotificationUpsert;
      },
    },
  ];
}

test("redelivering each producer's notification keeps its revision, its payload and its sync revision", options, async (t) => {
  const h = await host(t);
  const bumped: string[] = [];
  for (const producer of producers()) {
    const first = await h.runtime.service.upsert(producer.build());
    assert.equal(first.revision, 1, producer.writer);
    const before = await h.stored(first.id);
    const replay = await h.runtime.service.upsert(producer.build());
    const after = await h.stored(first.id);
    if (replay.revision !== 1 || after.revision !== 1 || after.sync_revision !== before.sync_revision || after.payload !== before.payload) bumped.push(producer.writer);
  }
  assert.deepEqual(bumped, [], "a redelivery changed nothing, so it must write nothing");
});

test("a redelivery after the reader marked it read keeps the read state, and a real change still takes a new revision", options, async (t) => {
  const h = await host(t);
  // The discovery producer cites a note; the note exists and is at the cited version, so the source is available.
  await seedNote(h);
  const build = producers()[6]!.build;
  const first = await h.runtime.service.upsert(build());
  const read = await h.runtime.service.action(A, first.id, { action: "read", expectedRevision: first.revision, idempotencyKey: "read-1" });
  assert.equal(read.notification.revision, 2);
  const beforeReplay = await h.stored(first.id);
  const replay = await h.runtime.service.upsert(build());
  assert.equal(replay.revision, 2, "the reader's revision is still current");
  assert.ok(replay.readAt, "a replay never resets reading");
  assert.equal((await h.stored(first.id)).sync_revision, beforeReplay.sync_revision, "no write, no new sync revision");
  // Key order is not a change, but new text is.
  const changed = { ...build(), title: "跟进佐藤（改）", copy: { ...(build().copy!), zh: { title: "跟进佐藤（改）", reason: "上次见面提到下周发资料。" } } };
  const next = await h.runtime.service.upsert(changed);
  assert.equal(next.revision, 3, "a changed source revision and text is a new revision");
  assert.ok(next.readAt, "and still keeps reading");
});
