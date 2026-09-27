import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import { createStorageBusinessCardContactWriteProvider } from "../../features/contacts/storage/contact-write-live-record-provider";
import { runRelationshipLifecycleMigrations } from "../../features/connections/lifecycle/migrations";
import type { EventOperationsConfiguration } from "../../features/events/event-operations/contract";
import { createEventOperationsOutboxProjector, EventOperationsOutboxProjectionError } from "../../features/events/event-operations/outbox-projector";
import { runEventOperationsMigrations } from "../../features/events/event-operations/storage/migrations";
import { createEventOperationsPostgresClient } from "../../features/events/event-operations/storage/postgres-client";
import type { EventOperationsOutboxMessage } from "../../features/events/event-operations/storage/postgres-outbox-repository";
import { createPostgresEventOperationsRepository } from "../../features/events/event-operations/storage/postgres-repository";
import type { EventRegistration } from "../../features/events/registration/contract";
import { createEventRegistrationLiveRecordProvider } from "../../features/events/registration/storage/live-record-provider";
import { createInboxEventContactRequestNotificationWriter } from "../../features/notifications/event-contact-request-inbox";
import { createLegacyEventContactRequestMigration } from "../../features/notifications/event-contact-request-inbox-migration";
import { createInboxRuntime } from "../../features/notifications/inbox-record-service-factory";
import { createNotificationInteractionService } from "../../features/notifications/interaction-service";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";

// Sprint 0129: a live business-card exchange must reach the typed inbox that
// the App and web read, once per transition, with the 0122 unread semantics.
const url = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const workspaceId = "workspace:exchange-inbox";
const eventId = "event:exchange-inbox";

const at = (base: number, minutes: number) => new Date(base + minutes * 60_000).toISOString();

function registration(actorId: string, displayName: string, registeredAt: string): EventRegistration {
  const participantProfileId = `participant:${eventId}:${actorId}`;
  return {
    cancelledAt: null,
    eventId,
    id: `registration:${eventId}:${actorId}`,
    participantProfile: {
      answers: { desiredOutcome: "Meet collaborators", industry: "Software", valueOffered: "Introductions" },
      createdAt: registeredAt,
      displayName,
      eventId,
      id: participantProfileId,
      updatedAt: registeredAt,
      userId: actorId,
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
  const address = new URL(url);
  assert.ok(["localhost", "127.0.0.1"].includes(address.hostname), "local Postgres only");
  const schema = `exchange_inbox_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: url, max: 1 });
  await admin.query(`create schema ${schema}`);
  const pool = new Pool({ connectionString: url, max: 8, options: `-c search_path=${schema} -c statement_timeout=10000 -c lock_timeout=2000` });
  const events = createEventOperationsPostgresClient({ connectionString: url, pool });
  const transactional = createTransactionalPostgresClient({ connectionString: url, pool });
  await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
  await runRelationshipLifecycleMigrations(pool);
  await runEventOperationsMigrations(events);
  const base = (await pool.query<{ now: Date }>("select statement_timestamp() as now")).rows[0]!.now.getTime();
  const repository = createPostgresEventOperationsRepository({ client: events, workspaceId });
  await repository.saveConfiguration(configuration(base));
  await pool.query("update event_ops_events set lifecycle_state_v2='published' where workspace_id=$1 and event_id=$2", [workspaceId, eventId]);
  const people = [["actor:a", "Avery Lin"], ["actor:b", "佐藤 葵"], ["actor:x", "Xavier Outsider"]] as const;
  await repository.activateCanonicalRegistrations(eventId, people.map(([actorId, name]) => registration(actorId, name, at(base, -95))));
  const store = createPostgresLiveRecordStore({ client: transactional });
  const writer = createInboxEventContactRequestNotificationWriter({ client: events, workspaceId });
  const projector = createEventOperationsOutboxProjector({
    contactRequestNotifications: writer,
    registrationProvider: createEventRegistrationLiveRecordProvider({ store, workspaceId }),
    relationshipProvider: createStorageBusinessCardContactWriteProvider({ store, workspaceId }),
  });
  const inbox = createInboxRuntime({ client: transactional, workspaceId });
  async function outbox(aggregateType?: string): Promise<EventOperationsOutboxMessage[]> {
    const rows = await pool.query<{ outbox_id: string; aggregate_id: string; aggregate_type: string; event_type: string; payload: Record<string, unknown> }>(
      `select outbox_id,aggregate_id,aggregate_type,event_type,payload from event_ops_outbox
        where workspace_id=$1 and event_id=$2 and ($3::text is null or aggregate_type=$3) order by created_at,outbox_id`,
      [workspaceId, eventId, aggregateType ?? null]);
    return rows.rows.map((row) => ({
      aggregateId: row.aggregate_id, aggregateType: row.aggregate_type, attempts: 1, eventId, eventType: row.event_type,
      leaseEpoch: 1, leaseExpiresAt: at(base, 10), leaseToken: `test:${row.outbox_id}`, outboxId: row.outbox_id, payload: row.payload, workerId: "worker:test",
    }));
  }
  /** Relationship sides first, like a worker that has already drained them; then notifications. */
  async function drain() {
    for (const message of await outbox("event_relationship_side")) await projector.project(message);
    for (const message of await outbox("event_contact_request")) await projector.project(message);
  }
  const participant = (actorId: string) => `participant:${eventId}:${actorId}`;
  const close = async () => {
    await pool.end();
    await admin.query(`drop schema ${schema} cascade`);
    await admin.end();
  };
  return { base, close, drain, events, inbox, outbox, participant, pool, projector, repository, store };
}

test("a live exchange puts one typed notification in each side's inbox, with the live-page and contact deep links", { skip: !url, timeout: 60_000 }, async () => {
  const ctx = await setup();
  try {
    const request = await ctx.repository.createContactRequestAtomically({ expectedRevision: null, eventId, requesterActorId: "actor:a", targetParticipantId: ctx.participant("actor:b") });
    await ctx.drain();
    // B (the target) is told right away, before any acceptance.
    const bInbox = await ctx.inbox.service.list("actor:b", { limit: 50 });
    assert.equal(bInbox.items.length, 1);
    assert.equal(bInbox.unreadCount, 1);
    const received = bInbox.items[0]!;
    assert.equal(received.kind, "update");
    assert.equal(received.origin, "business");
    assert.equal(received.title, "Avery Lin 想和你交换名片");
    assert.equal(received.target.status, "available");
    assert.equal(received.target.href, `/events/${encodeURIComponent(eventId)}/live?participant=${encodeURIComponent(ctx.participant("actor:a"))}`);
    assert.deepEqual(received.sources.map((s) => [s.sourceKind, s.sourceId]), [["event_contact_request", request.requestId]]);
    assert.equal((await ctx.inbox.service.list("actor:b", { limit: 50, language: "en" })).items[0]!.title, "Avery Lin wants to exchange business cards");
    assert.equal((await ctx.inbox.service.list("actor:b", { limit: 50, language: "ja" })).items[0]!.title, "Avery Linさんから名刺交換の申請が届きました");

    await ctx.repository.respondToContactRequestAtomically({ accept: true, expectedRevision: request.revision, eventId, requestId: request.requestId, targetActorId: "actor:b" });
    await ctx.drain();
    // A (the requester) learns of the acceptance and lands on the contact the exchange created.
    const aInbox = await ctx.inbox.service.list("actor:a", { limit: 50 });
    assert.equal(aInbox.items.length, 1);
    assert.equal(aInbox.unreadCount, 1);
    const accepted = aInbox.items[0]!;
    assert.equal(accepted.title, "佐藤 葵 接受了你的名片交换");
    const contactId = (await ctx.pool.query<{ contact_id: string }>("select contact_id from event_ops_relationship_sides where owner_actor_id='actor:a'")).rows[0]!.contact_id;
    const contact = await ctx.store.getRecord({ workspaceId, collectionName: "contacts", recordId: contactId });
    assert.equal(contact?.userId, "actor:a");
    assert.equal(accepted.target.href, `/contacts/${encodeURIComponent(contactId)}?eventId=${encodeURIComponent(eventId)}`);
    // B still has exactly the one "received" notification; acceptance does not duplicate it.
    assert.equal((await ctx.inbox.service.list("actor:b", { limit: 50 })).items.length, 1);

    // Isolation: the bystander sees nothing, and A cannot open B's notification.
    assert.equal((await ctx.inbox.service.list("actor:x", { history: true, limit: 50 })).items.length, 0);
    await assert.rejects(ctx.inbox.service.get("actor:a", received.id), /not found/i);
    // One writer: nothing is written to the legacy notifications table any more.
    assert.equal((await ctx.store.listRecords({ limit: "unbounded", workspaceId, collectionName: "notifications" })).length, 0);
  } finally {
    await ctx.close();
  }
});

test("outbox replays never duplicate or re-open a notification; unread count and mark-all-read keep the 0122 rules", { skip: !url, timeout: 60_000 }, async () => {
  const ctx = await setup();
  try {
    const request = await ctx.repository.createContactRequestAtomically({ expectedRevision: null, eventId, requesterActorId: "actor:a", targetParticipantId: ctx.participant("actor:b") });
    await ctx.drain();
    await ctx.drain(); // at-least-once delivery: the same messages again
    const first = await ctx.inbox.service.list("actor:b", { limit: 50 });
    assert.equal(first.items.length, 1);
    assert.equal(first.items[0]!.revision, 1);
    assert.equal(await ctx.inbox.service.unreadCount("actor:b"), 1);

    // Mark-all-read uses the visible snapshot, exactly as both clients do.
    const read = await ctx.inbox.service.readBatch("actor:b", { idempotencyKey: "read-all", items: first.items.map((n) => ({ expectedRevision: n.revision, id: n.id })) });
    assert.ok(read.results.every((r) => "notification" in r && r.notification.readAt));
    assert.equal(await ctx.inbox.service.unreadCount("actor:b"), 0);
    await ctx.drain(); // a late replay after reading must not make it unread again
    const again = await ctx.inbox.service.list("actor:b", { limit: 50 });
    assert.equal(again.items.length, 1);
    assert.ok(again.items[0]!.readAt);
    assert.equal(again.unreadCount, 0);

    // A new transition is a new notification: the requester withdraws.
    await ctx.repository.withdrawContactRequestAtomically({ eventId, expectedRevision: request.revision, requestId: request.requestId, requesterActorId: "actor:a" });
    await ctx.drain();
    const afterWithdraw = await ctx.inbox.service.list("actor:b", { limit: 50 });
    assert.deepEqual(afterWithdraw.items.map((n) => n.title), ["Avery Lin 撤回了名片交换申请", "Avery Lin 想和你交换名片"]);
    assert.equal(afterWithdraw.unreadCount, 1);
    assert.equal((await ctx.inbox.service.list("actor:a", { limit: 50 })).items.length, 0);
  } finally {
    await ctx.close();
  }
});

test("a deleted exchange contact takes the acceptance notice out of the list and the unread count; forged recipients are refused", { skip: !url, timeout: 60_000 }, async () => {
  const ctx = await setup();
  try {
    const request = await ctx.repository.createContactRequestAtomically({ expectedRevision: null, eventId, requesterActorId: "actor:a", targetParticipantId: ctx.participant("actor:b") });
    await ctx.repository.respondToContactRequestAtomically({ accept: true, expectedRevision: request.revision, eventId, requestId: request.requestId, targetActorId: "actor:b" });
    // Acceptance processed before the contact exists: retryable, nothing published with a dead link.
    const [acceptedMessage] = (await ctx.outbox("event_contact_request")).filter((m) => m.eventType === "event.contact_request.accepted");
    await assert.rejects(ctx.projector.project(acceptedMessage!),
      (error: unknown) => error instanceof EventOperationsOutboxProjectionError && error.retryable === true);
    assert.equal((await ctx.inbox.service.list("actor:a", { history: true, limit: 50 })).items.length, 0);
    await ctx.drain();
    assert.equal(await ctx.inbox.service.unreadCount("actor:a"), 1);
    const contactId = (await ctx.pool.query<{ contact_id: string }>("select contact_id from event_ops_relationship_sides where owner_actor_id='actor:a'")).rows[0]!.contact_id;
    await ctx.store.deleteRecord({ workspaceId, collectionName: "contacts", recordId: contactId, deletedAt: new Date().toISOString() });
    assert.equal((await ctx.inbox.service.list("actor:a", { limit: 50 })).items.length, 0);
    assert.equal(await ctx.inbox.service.unreadCount("actor:a"), 0);
    const history = await ctx.inbox.service.list("actor:a", { history: true, limit: 50 });
    assert.equal(history.items[0]!.target.status, "unavailable");
    assert.equal(history.items[0]!.target.href, null);

    // A payload that names a bystander as recipient is rejected and writes nothing for them.
    const [created] = (await ctx.outbox("event_contact_request")).filter((m) => m.eventType === "event.contact_request.created");
    await assert.rejects(ctx.projector.project({ ...created!, outboxId: "forged", payload: { ...created!.payload, targetActorId: "actor:x" } }),
      (error: unknown) => error instanceof EventOperationsOutboxProjectionError && error.retryable === false);
    assert.equal((await ctx.inbox.service.list("actor:x", { history: true, limit: 50 })).items.length, 0);
  } finally {
    await ctx.close();
  }
});

// ── Existing legacy rows (written by the pre-0129 worker) ──
async function seedLegacy(ctx: Awaited<ReturnType<typeof setup>>, row: { id: string; actorId: string; createdAt: string; title: string; href: string; targetType: "event" | "contact" }) {
  // Byte-for-byte the shape the retired writer produced (see evidence baseline-legacy-rows.txt).
  await ctx.store.upsertRecord({
    collectionName: "notifications", createdAt: row.createdAt, evidenceIds: [`${row.id}:evidence`], lifecycleState: "active", occurredAt: row.createdAt,
    payload: { actionHref: row.href, body: row.title, channel: "in_app", createdAt: row.createdAt, evidenceIds: [`${row.id}:evidence`], id: row.id, scheduledFor: row.createdAt,
      source: { id: row.id, label: "Event business-card request", type: "event_import" }, status: "pending", title: row.title },
    recordId: row.id, searchText: row.title, sourceId: row.id, sourceLabel: "Event business-card request", sourceType: "event_import",
    targetId: eventId, targetType: row.targetType, updatedAt: row.createdAt, userId: row.actorId, workspaceId,
  });
}

test("legacy exchange notifications migrate once: dry-run writes nothing, apply keeps read state, a second run and outbox replays add nothing", { skip: !url, timeout: 60_000 }, async () => {
  const ctx = await setup();
  try {
    const r1 = await ctx.repository.createContactRequestAtomically({ expectedRevision: null, eventId, requesterActorId: "actor:a", targetParticipantId: ctx.participant("actor:b") });
    const r1Accepted = await ctx.repository.respondToContactRequestAtomically({ accept: true, expectedRevision: r1.revision, eventId, requestId: r1.requestId, targetActorId: "actor:b" });
    const r2 = await ctx.repository.createContactRequestAtomically({ expectedRevision: null, eventId, requesterActorId: "actor:x", targetParticipantId: ctx.participant("actor:b") });
    for (const message of await ctx.outbox("event_relationship_side")) await ctx.projector.project(message);
    const legacyId = (requestId: string, revision: number, transition: string, actorId: string) =>
      `notification:event-contact-request:${encodeURIComponent(requestId)}:${revision}:${transition}:${encodeURIComponent(actorId)}`;
    const ids = {
      r1Created: legacyId(r1.requestId, 1, "created", "actor:b"),
      r1Accepted: legacyId(r1.requestId, r1Accepted.revision, "accepted", "actor:a"),
      r2Created: legacyId(r2.requestId, 1, "created", "actor:b"),
      orphan: legacyId("event-contact-request:gone", 1, "created", "actor:b"),
    };
    await seedLegacy(ctx, { id: ids.r1Created, actorId: "actor:b", createdAt: r1.createdAt, title: "收到新的名片交换申请", href: "/app/events/x#event-matchmaking-title", targetType: "event" });
    await seedLegacy(ctx, { id: ids.r1Accepted, actorId: "actor:a", createdAt: r1Accepted.updatedAt, title: "名片交换申请已接受", href: "/app/contacts/x", targetType: "contact" });
    await seedLegacy(ctx, { id: ids.r2Created, actorId: "actor:b", createdAt: r2.createdAt, title: "收到新的名片交换申请", href: "/app/events/x#event-matchmaking-title", targetType: "event" });
    await seedLegacy(ctx, { id: ids.orphan, actorId: "actor:b", createdAt: r2.createdAt, title: "收到新的名片交换申请", href: "/app/events/x#event-matchmaking-title", targetType: "event" });
    // An unrelated legacy notification (agent reminder) must never be touched.
    await ctx.store.upsertRecord({ collectionName: "notifications", createdAt: r1.createdAt, evidenceIds: [], lifecycleState: "active", payload: { id: "reminder:agent:1", title: "Call back", status: "pending" },
      recordId: "reminder:agent:1", sourceId: "reminder:agent:1", sourceType: "agent_action", updatedAt: r1.createdAt, userId: "actor:a", workspaceId });
    const interactions = createNotificationInteractionService({ store: ctx.store, workspaceId });
    await interactions.set({ actorId: "actor:b", notificationId: ids.r1Created, state: "ignored" });
    await interactions.set({ actorId: "actor:a", notificationId: ids.r1Accepted, state: "read" });

    const migration = createLegacyEventContactRequestMigration({ client: createTransactionalPostgresClient({ connectionString: url!, pool: ctx.pool }), workspaceId });
    const legacyState = async () => Object.fromEntries((await ctx.pool.query<{ record_id: string; lifecycle_state: string }>(
      "select record_id,lifecycle_state from orbit_records where collection_name='notifications' order by record_id")).rows.map((r) => [r.record_id, r.lifecycle_state]));
    const inboxRows = async () => Number((await ctx.pool.query<{ n: string }>("select count(*) as n from orbit_records where collection_name='inboxNotifications'")).rows[0]!.n);
    const before = await legacyState();

    const dry = await migration.plan();
    assert.deepEqual({ candidates: dry.candidates, migrate: dry.migrate, skipped: dry.skipped }, { candidates: 4, migrate: 3, skipped: 1 });
    assert.deepEqual(dry.items.filter((i) => i.action === "skip").map((i) => [i.legacyId, i.reason]), [[ids.orphan, "source_missing"]]);
    assert.equal(await inboxRows(), 0, "dry-run writes nothing");
    assert.deepEqual(await legacyState(), before);

    const applied = await migration.apply();
    assert.deepEqual({ migrated: applied.migrated, skipped: applied.skipped }, { migrated: 3, skipped: 1 });
    assert.equal(await inboxRows(), 3);
    const bList = await ctx.inbox.service.list("actor:b", { limit: 50 });
    assert.deepEqual(bList.items.map((n) => [n.title, n.legacyId]), [["Xavier Outsider 想和你交换名片", ids.r2Created]]);
    assert.equal(bList.unreadCount, 1);
    const bHistory = await ctx.inbox.service.list("actor:b", { history: true, limit: 50 });
    assert.equal(bHistory.items.find((n) => n.legacyId === ids.r1Created)?.disposition, "dismissed");
    const aList = await ctx.inbox.service.list("actor:a", { limit: 50 });
    assert.equal(aList.items.length, 1);
    assert.ok(aList.items[0]!.readAt, "legacy read state carries over");
    assert.equal(aList.unreadCount, 0);
    assert.deepEqual(await legacyState(), { ...before, [ids.r1Created]: "archived", [ids.r1Accepted]: "archived", [ids.r2Created]: "archived" });

    const dryAgain = await migration.plan();
    assert.deepEqual({ candidates: dryAgain.candidates, migrate: dryAgain.migrate, skipped: dryAgain.skipped }, { candidates: 1, migrate: 0, skipped: 1 });
    const appliedAgain = await migration.apply();
    assert.equal(appliedAgain.migrated, 0);
    assert.equal(await inboxRows(), 3);

    // The live writer replaying the same transitions lands on the migrated records.
    for (const message of await ctx.outbox("event_contact_request")) await ctx.projector.project(message);
    assert.equal(await inboxRows(), 3);
    assert.ok((await ctx.inbox.service.list("actor:a", { limit: 50 })).items[0]!.readAt);
    assert.equal(await ctx.inbox.service.unreadCount("actor:b"), 1);
  } finally {
    await ctx.close();
  }
});
