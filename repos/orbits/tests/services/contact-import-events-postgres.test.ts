/**
 * W0053 SC-W0053-04（真实 PostgreSQL）：「从活动添加」只列本人作为 owner 的已互换对象（已接受）；已拒绝、已撤回、
 * 别人之间的交换都不出现；按活动分组显示人数、已在人脉数、同步中数。导入只补空 metEventId／metEventTitle，
 * 整批走一次三层入口；联系人还没投影出来的显示「同步中」，不自建 `contact:event-consent:*`。
 * 交换走真实的现场交换仓储与 outbox 投影（与 event-contact-request-inbox-postgres 同一套夹具写法）。
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import { createContactImportHandlers } from "../../app/api/contacts/import/handlers";
import { runRelationshipLifecycleMigrations } from "../../features/connections/lifecycle/migrations";
import { runContactImportMigrations } from "../../features/contacts/import/migrations";
import { createContactImportService } from "../../features/contacts/import/service";
import { createStorageBusinessCardContactWriteProvider } from "../../features/contacts/storage/contact-write-live-record-provider";
import type { EventOperationsConfiguration } from "../../features/events/event-operations/contract";
import { createEventOperationsOutboxProjector } from "../../features/events/event-operations/outbox-projector";
import { runEventOperationsMigrations } from "../../features/events/event-operations/storage/migrations";
import { createEventOperationsPostgresClient } from "../../features/events/event-operations/storage/postgres-client";
import type { EventOperationsOutboxMessage } from "../../features/events/event-operations/storage/postgres-outbox-repository";
import { createPostgresEventOperationsRepository } from "../../features/events/event-operations/storage/postgres-repository";
import type { EventRegistration } from "../../features/events/registration/contract";
import { createEventRegistrationLiveRecordProvider } from "../../features/events/registration/storage/live-record-provider";
import { createInboxEventContactRequestNotificationWriter } from "../../features/notifications/event-contact-request-inbox";
import type { RunNewContactLayersInput } from "../../features/network-analysis/new-contact-layers";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";

const url = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const workspaceId = "workspace:contact-import-events";
const eventId = "event:contact-import-events";
const TITLE = "架空 SaaS Night";

const at = (base: number, minutes: number) => new Date(base + minutes * 60_000).toISOString();

function registration(actorId: string, displayName: string, registeredAt: string): EventRegistration {
  const participantProfileId = `participant:${eventId}:${actorId}`;
  return {
    cancelledAt: null,
    eventId,
    id: `registration:${eventId}:${actorId}`,
    participantProfile: {
      answers: { desiredOutcome: "Meet collaborators", industry: "Software", valueOffered: "Introductions" },
      createdAt: registeredAt, displayName, eventId, id: participantProfileId, updatedAt: registeredAt, userId: actorId,
    },
    participantProfileId,
    reactivatedAt: null,
    registeredAt,
    sideEffects: { calendarUpdateExecuted: false, emailSent: false, globalProfileWriteExecuted: false, notificationDelivered: false, organizerMessageSent: false, refundRequested: false },
    status: "rsvped",
    updatedAt: registeredAt,
    userId: actorId,
  };
}

function configuration(base: number): EventOperationsConfiguration {
  return {
    checkInOpensAt: at(base, -120), eventEndsAt: at(base, 180), eventId, eventStartsAt: at(base, -30), maxAttemptsPerTask: 3,
    organizerActorId: "actor:organizer", profileEditDeadlineAt: at(base, -100), recommendationCount: 3, registrationCutoffAt: at(base, -90),
    resultsAvailableAt: at(base, -60), roundOneStartsAt: at(base, 15), roundTwoStartsAt: at(base, 60), shardSize: 4, tableSize: 4, updatedAt: at(base, -150),
  };
}

async function setup() {
  assert.ok(url);
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(url).hostname), "local Postgres only");
  const schema = `contact_import_events_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: url, max: 1 });
  await admin.query(`create schema ${schema}`);
  const pool = new Pool({ connectionString: url, max: 8, options: `-c search_path=${schema} -c statement_timeout=10000 -c lock_timeout=2000` });
  const events = createEventOperationsPostgresClient({ connectionString: url, pool });
  const transactional = createTransactionalPostgresClient({ connectionString: url, pool });
  await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
  await runRelationshipLifecycleMigrations(pool);
  await runEventOperationsMigrations(events);
  await runContactImportMigrations(pool);
  const base = (await pool.query<{ now: Date }>("select statement_timestamp() as now")).rows[0]!.now.getTime();
  const repository = createPostgresEventOperationsRepository({ client: events, workspaceId });
  await repository.saveConfiguration(configuration(base));
  await pool.query("update event_ops_events set lifecycle_state_v2 = 'published', title = $3 where workspace_id = $1 and event_id = $2", [workspaceId, eventId, TITLE]);
  const people = [["actor:a", "Avery Lin"], ["actor:b", "佐藤 葵"], ["actor:c", "Casey Doe"], ["actor:d", "Devon Roe"], ["actor:e", "Emery Poe"], ["actor:f", "Finley Moe"]] as const;
  await repository.activateCanonicalRegistrations(eventId, people.map(([actorId, name]) => registration(actorId, name, at(base, -95))));
  const store = createPostgresLiveRecordStore({ client: transactional });
  const projector = createEventOperationsOutboxProjector({
    contactRequestNotifications: createInboxEventContactRequestNotificationWriter({ client: events, workspaceId }),
    registrationProvider: createEventRegistrationLiveRecordProvider({ store, workspaceId }),
    relationshipProvider: createStorageBusinessCardContactWriteProvider({ store, workspaceId }),
  });
  async function drain() {
    const rows = await pool.query<{ outbox_id: string; aggregate_id: string; aggregate_type: string; event_type: string; payload: Record<string, unknown> }>(
      // 先投影关系（联系人），再投影通知（通知的深链要求联系人已存在）——与真实 worker 的顺序一致。
      `select outbox_id, aggregate_id, aggregate_type, event_type, payload from event_ops_outbox where workspace_id = $1 and event_id = $2
        order by (aggregate_type = 'event_relationship_side') desc, created_at, outbox_id`,
      [workspaceId, eventId]);
    for (const row of rows.rows) {
      const message: EventOperationsOutboxMessage = {
        aggregateId: row.aggregate_id, aggregateType: row.aggregate_type, attempts: 1, eventId, eventType: row.event_type,
        leaseEpoch: 1, leaseExpiresAt: at(base, 10), leaseToken: `test:${row.outbox_id}`, outboxId: row.outbox_id, payload: row.payload, workerId: "worker:test",
      };
      await projector.project(message);
    }
  }
  const participant = (actorId: string) => `participant:${eventId}:${actorId}`;
  const exchange = async (from: string, to: string, outcome: "accept" | "decline" | "withdraw" | "pending") => {
    const request = await repository.createContactRequestAtomically({ eventId, expectedRevision: null, requesterActorId: from, targetParticipantId: participant(to) });
    if (outcome === "accept" || outcome === "decline") {
      await repository.respondToContactRequestAtomically({ accept: outcome === "accept", eventId, expectedRevision: request.revision, requestId: request.requestId, targetActorId: to });
    } else if (outcome === "withdraw") {
      await repository.withdrawContactRequestAtomically({ eventId, expectedRevision: request.revision, requestId: request.requestId, requesterActorId: from });
    }
  };
  const layerCalls: RunNewContactLayersInput[] = [];
  const service = createContactImportService({
    client: transactional,
    log: () => undefined,
    runLayers: async (input) => {
      layerCalls.push(input);
      return { deferredContactIds: [], enrichment: "done", operations: 0, planMatch: "enqueued", snapshot: "fresh", writtenContacts: 0 };
    },
    schedule: () => undefined,
    workspaceId,
  });
  const close = async () => {
    await pool.end();
    await admin.query(`drop schema ${schema} cascade`);
    await admin.end();
  };
  return { close, drain, exchange, layerCalls, pool, service };
}

async function contactFor(pool: Pool, owner: string, displayName: string) {
  return (await pool.query("select record_id, payload from orbit_records where collection_name = 'contacts' and user_id = $1 and payload->>'displayName' = $2", [owner, displayName])).rows[0];
}

test("SC-04 event import lists only accepted exchanges owned by me, grouped by event; imports fill only empty met-event fields; unprojected contacts stay 「同步中」 and are never created here", { skip: !url, timeout: 60_000 }, async () => {
  const ctx = await setup();
  try {
    await ctx.exchange("actor:a", "actor:b", "accept");
    await ctx.exchange("actor:a", "actor:c", "decline");
    await ctx.exchange("actor:a", "actor:d", "withdraw");
    await ctx.exchange("actor:a", "actor:e", "accept");
    await ctx.exchange("actor:f", "actor:a", "accept"); // 对方发起、我接受：同样算我已互换
    await ctx.exchange("actor:b", "actor:c", "accept"); // 别人之间的交换
    await ctx.drain();
    // E 的联系人还没投影（模拟 outbox 未处理）：删掉投影结果。
    const emery = await contactFor(ctx.pool, "actor:a", "Emery Poe");
    assert.match(emery.record_id, /^contact:event-consent:/);
    await ctx.pool.query("delete from orbit_records where collection_name in ('contacts', 'connections') and user_id = 'actor:a' and (record_id = $1 or payload->>'contactId' = $1)", [emery.record_id]);
    // B 已经记着别的活动：只补空，不覆盖。
    const aoi = await contactFor(ctx.pool, "actor:a", "佐藤 葵");
    await ctx.pool.query("update orbit_records set payload = payload || '{\"metEventId\":\"event:earlier\",\"metEventTitle\":\"Earlier\"}'::jsonb where record_id = $1", [aoi.record_id]);
    const contactsBefore = (await ctx.pool.query("select count(*)::int as n from orbit_records where collection_name = 'contacts' and user_id = 'actor:a'")).rows[0].n;
    assert.equal(contactsBefore, 2);

    const handlers = (actor: string) => createContactImportHandlers({ resolveActor: async () => ({ id: actor }) as never, schedule: () => undefined, service: () => ctx.service });
    const listed = (await (await handlers("actor:a").events()).json()).data.events;
    assert.equal(listed.length, 1);
    assert.deepEqual(
      { alreadyMarked: listed[0].alreadyMarked, eventId: listed[0].eventId, exchanged: listed[0].exchanged, inNetwork: listed[0].inNetwork, syncing: listed[0].syncing, title: listed[0].title },
      { alreadyMarked: 0, eventId, exchanged: 3, inNetwork: 2, syncing: 1, title: TITLE },
    );
    const outsider = (await (await handlers("actor:x").events()).json()).data.events;
    assert.deepEqual(outsider, []);

    const key = randomUUID();
    const response = await handlers("actor:a").importEvent(new Request("http://localhost/x", { body: JSON.stringify({ eventId, idempotencyKey: key }), method: "POST" }));
    assert.equal(response.status, 201);
    const batch = (await response.json()).data.batch;
    assert.equal(batch.kind, "event");
    assert.equal(batch.fileName, TITLE);
    assert.equal(batch.status, "completed");
    assert.deepEqual(batch.counts, { created: 0, failed: 0, merged: 1, skipped: 1 });
    await ctx.service.runPendingLayers("actor:a", batch.id);
    assert.equal(ctx.layerCalls.length, 1, "the whole event goes through the layers entry once");
    const finley = await contactFor(ctx.pool, "actor:a", "Finley Moe");
    assert.deepEqual([...ctx.layerCalls[0]!.contactIds].sort(), [aoi.record_id, finley.record_id].sort());
    assert.equal(finley.payload.metEventId, eventId);
    assert.equal(finley.payload.metEventTitle, TITLE);
    assert.equal((await contactFor(ctx.pool, "actor:a", "佐藤 葵")).payload.metEventId, "event:earlier", "existing met-event kept");
    assert.equal((await ctx.pool.query("select count(*)::int as n from orbit_records where collection_name = 'contacts' and user_id = 'actor:a'")).rows[0].n, 2, "no contact created for the syncing exchange");

    const replay = await handlers("actor:a").importEvent(new Request("http://localhost/x", { body: JSON.stringify({ eventId, idempotencyKey: key }), method: "POST" }));
    assert.equal(replay.status, 200);
    assert.equal((await replay.json()).data.batch.id, batch.id);
    const afterList = (await (await handlers("actor:a").events()).json()).data.events;
    assert.equal(afterList[0].alreadyMarked, 1);
    const nothing = await handlers("actor:x").importEvent(new Request("http://localhost/x", { body: JSON.stringify({ eventId, idempotencyKey: randomUUID() }), method: "POST" }));
    assert.equal(nothing.status, 409, "someone without exchanges cannot import the event");
  } finally {
    await ctx.close();
  }
});
