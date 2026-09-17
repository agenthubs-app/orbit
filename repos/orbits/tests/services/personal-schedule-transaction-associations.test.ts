import assert from "node:assert/strict";
import test from "node:test";
import { personalScheduleTransactionAssociationsFixture } from "../fixtures/personal-schedule-transaction-associations";
import { createConfiguredTransactionalPostgresRuntime } from "../../shared/storage/transactional-postgres";
import { createConfiguredPersonalScheduleService } from "../../features/personal-schedule/service-factory";
import { createPersonalScheduleService } from "../../features/personal-schedule/service";
import { createPersonalScheduleAssociationReader } from "../../features/personal-schedule/association-reader";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

const actorId = "account:owner", workspaceId = "workspace:transaction-associations";
const stamp = "2026-09-17T00:00:00.000Z";
async function fixture() {
  const sql = personalScheduleTransactionAssociationsFixture();
  // Prime the existing configured-runtime seam with the controlled pool, then
  // call the unchanged production factory. No env file or real DB is read.
  const envKeys = ["ORBIT_EVENT_DATABASE_URL", "ORBIT_WORKSPACE_ID"] as const;
  const previous = envKeys.map(key => process.env[key]);
  process.env.ORBIT_EVENT_DATABASE_URL = "postgres://fixture.invalid/associations";
  process.env.ORBIT_WORKSPACE_ID = workspaceId;
  const runtime = createConfiguredTransactionalPostgresRuntime({ createClient: () => sql.client });
  assert.ok(runtime);
  let service;
  try { service = createConfiguredPersonalScheduleService(); }
  finally { envKeys.forEach((key, i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i]; }); }
  for (const [kind, id, payload] of [
    ["contacts", "contact:owned", { id: "contact:owned", displayName: "Owned contact", organization: "Orbit", role: "Founder", stage: "active", source: { id: "source:contact", type: "manual", label: "Manual", sourceId: "source:contact" }, evidenceIds: ["evidence:contact"], createdAt: stamp, updatedAt: stamp }],
    ["notes", "note:owned", { schemaVersion: 2, operations: [], note: { id: "note:owned", accountId: actorId, ownerUserId: actorId, title: "Owned note", body: "Private fixture note", manualContactIds: [], mentions: [], contactIds: [], eventIds: [], version: 1, createdAt: stamp, updatedAt: stamp } }],
  ] as const) await sql.store.upsertRecord({ workspaceId, collectionName: kind, recordId: id, userId: actorId, sourceType: "manual", sourceId: id, evidenceIds: [], lifecycleState: "active", createdAt: stamp, updatedAt: stamp, payload });
  const { scheduleItem } = await service.create(actorId, { title: "Original", startsAt: "2026-09-19T00:15:00Z", endsAt: "2026-09-19T00:45:00Z", timeZone: "Asia/Tokyo", contactIds: ["contact:owned"], noteIds: ["note:owned"], reminderMinutes: 15, recurrence: { frequency: "daily", until: "2026-09-21" }, idempotencyKey: "seed-associated-series" });
  sql.calls.length = 0;
  return { ...sql, client: runtime.client, service, scheduleItem };
}

test("production factory keeps associated concurrent saves inside the max2 transaction pool", async () => {
  const f = await fixture();
  try {
    const commands = ["First", "Second"].map(title => ({ expectedUpdatedAt: f.scheduleItem.updatedAt, idempotencyKey: "parallel-" + title, scope: "series" as const, patch: { title } }));
    f.concurrentPair();
    const results = await Promise.allSettled(commands.map(command => f.service.update(actorId, f.scheduleItem.id, command)));
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1, results.filter(r => r.status === "rejected").map(r => String(r.reason)).join("\n"));
    const loser = results.find(r => r.status === "rejected");
    assert.equal(loser?.status === "rejected" && loser.reason.code, "CONFLICT", loser?.status === "rejected" ? String(loser.reason) : "Missing rejected request");
    assert.deepEqual(f.stats(), { leased: 0, highWater: 2, escapedReads: 0 });
    const associationReads = f.calls.filter(call => call.sql.trim().startsWith("select") && ["contacts", "notes"].includes(String(call.values[1])));
    assert.ok(associationReads.some(call => call.values[1] === "contacts"));
    assert.ok(associationReads.some(call => call.values[1] === "notes"));
    assert.ok(associationReads.every(call => call.lane === "transaction"));
    const winnerIndex = results.findIndex(r => r.status === "fulfilled");
    const winner = results[winnerIndex]!;
    assert.ok(winner.status === "fulfilled");
    const snapshot = f.snapshot();
    assert.deepEqual(await f.service.update(actorId, f.scheduleItem.id, commands[winnerIndex]!), winner.value);
    assert.deepEqual(f.snapshot(), snapshot);
    await assert.rejects(f.service.update(actorId, f.scheduleItem.id, { ...commands[winnerIndex]!, patch: { title: "Changed retry" } }), { code: "CONFLICT" });
    const reopened = await f.service.get({ actorId, id: f.scheduleItem.id });
    assert.equal(reopened.title, commands[winnerIndex]!.patch.title);
    assert.deepEqual(reopened.contactIds, ["contact:owned"]);
    assert.deepEqual(reopened.noteIds, ["note:owned"]);
    assert.deepEqual(reopened.recurrence, { frequency: "daily", until: "2026-09-21" });
    assert.equal(reopened.reminderMinutes, 15);
  } finally { await f.client.close(); }
});

for (const kind of ["contact", "note"] as const) for (const state of ["foreign", "deleted", "missing", "other-workspace"] as const) {
  test(`transaction-bound ${kind} ACL rejects ${state} associations without partial writes`, async () => {
    const f = await fixture();
    try {
      const collectionName = kind === "contact" ? "contacts" : "notes";
      const owned = await f.store.getRecord({ workspaceId, collectionName, recordId: kind + ":owned" });
      assert.ok(owned);
      const id = kind + ":unavailable";
      if (state !== "missing") await f.store.upsertRecord({ ...owned, recordId: id, sourceId: id,
        workspaceId: state === "other-workspace" ? "workspace:elsewhere" : workspaceId,
        userId: state === "foreign" ? "account:elsewhere" : actorId,
        lifecycleState: state === "deleted" ? "deleted" : "active",
        payload: kind === "contact" ? { ...owned.payload, id } : { ...owned.payload, note: { ...(owned.payload.note as Record<string, unknown>), id } },
      });
      const snapshot = f.snapshot();
      await assert.rejects(f.service.update(actorId, f.scheduleItem.id, {
        expectedUpdatedAt: f.scheduleItem.updatedAt, scope: "series", idempotencyKey: "denied-update", patch: kind === "contact" ? { contactIds: [id] } : { noteIds: [id] },
      }), { code: "VALIDATION_ERROR" });
      assert.deepEqual(f.snapshot(), snapshot);
      await assert.rejects(f.service.create(actorId, { title: "Denied create", startsAt: "2026-09-19T00:15:00Z", idempotencyKey: "denied-create", ...(kind === "contact" ? { contactIds: [id] } : { noteIds: [id] }) }), { code: "VALIDATION_ERROR" });
      assert.deepEqual(f.snapshot(), snapshot);
      assert.equal(f.stats().leased, 0);
      assert.deepEqual(await f.service.get({ actorId, id: f.scheduleItem.id }), f.scheduleItem);
    } finally { await f.client.close(); }
  });
}

for (const collection of ["reminderPlans", "personal_schedule_mutations"] as const) {
  test(`${collection} SQL failure rolls back associated occurrence, series, plans and receipt then releases the connection`, async () => {
    const f = await fixture();
    try {
      assert.equal((await f.store.listRecords({ workspaceId, collectionName: "reminderPlans" })).length, 3);
      const occurrenceId = f.scheduleItem.id + ":occurrence:2026-09-20";
      const command = { expectedUpdatedAt: f.scheduleItem.updatedAt, idempotencyKey: "failed-occurrence", scope: "occurrence" as const, patch: { startsAt: "2026-09-20T01:15:00Z", endsAt: "2026-09-20T01:45:00Z" } };
      const before = f.snapshot();
      f.failWritesTo(collection);
      await assert.rejects(f.service.update(actorId, occurrenceId, command), /injected association schedule SQL failure/);
      assert.deepEqual(f.snapshot(), before);
      assert.equal(f.stats().leased, 0);
      assert.ok(f.calls.some(call => call.sql === "rollback"));
      assert.deepEqual(await f.service.get({ actorId, id: f.scheduleItem.id }), f.scheduleItem);
      f.failWritesTo(null);
      const saved = await f.service.update(actorId, occurrenceId, command);
      assert.equal(saved.scheduleItem.startsAt, "2026-09-20T01:15:00Z");
      assert.deepEqual(saved.scheduleItem.noteIds, ["note:owned"]);
      assert.deepEqual(saved.scheduleItem.contactIds, ["contact:owned"]);
      const committed = f.snapshot();
      assert.deepEqual(await f.service.update(actorId, occurrenceId, command), saved);
      assert.deepEqual(f.snapshot(), committed);
    } finally { await f.client.close(); }
  });
}

test("association-bound series saves preserve durable cancelled instances and inherited rules", async () => {
  const f = await fixture();
  try {
    const cancelledId = f.scheduleItem.id + ":occurrence:2026-09-20";
    await f.service.remove(actorId, cancelledId, { expectedUpdatedAt: f.scheduleItem.updatedAt, scope: "occurrence", idempotencyKey: "cancel-single" });
    const current = await f.service.get({ actorId, id: f.scheduleItem.id });
    const saved = await f.service.update(actorId, current.id, { expectedUpdatedAt: current.updatedAt, scope: "series", idempotencyKey: "preserve-cancel", patch: { title: "Updated series" } });
    await assert.rejects(f.service.get({ actorId, id: cancelledId }), { code: "NOT_FOUND" });
    const remaining = await f.service.list({ actorId, from: "2026-09-19T00:00:00Z", to: "2026-09-22T00:00:00Z" });
    assert.deepEqual(remaining.map(item => item.occurrenceDate), ["2026-09-19", "2026-09-21"]);
    for (const item of remaining) {
      assert.equal(item.title, saved.scheduleItem.title);
      assert.deepEqual(item.noteIds, ["note:owned"]);
      assert.deepEqual(item.contactIds, ["contact:owned"]);
      assert.equal(item.reminderMinutes, 15);
      assert.deepEqual(item.recurrence, { frequency: "daily", until: "2026-09-21" });
    }
  } finally { await f.client.close(); }
});

test("readers do not mix actor or workspace authorization across saves", async () => {
  const f = await fixture();
  try {
    const otherWorkspace = createPersonalScheduleService({ store: f.store, client: f.client, workspaceId: "workspace:other", associationReaderForStore: store => createPersonalScheduleAssociationReader({ store, workspaceId: "workspace:other" }) });
    const before = f.snapshot();
    await assert.rejects(f.service.update("account:other", f.scheduleItem.id, { expectedUpdatedAt: f.scheduleItem.updatedAt, scope: "series", idempotencyKey: "steal", patch: { title: "Stolen" } }), { code: "NOT_FOUND" });
    await assert.rejects(otherWorkspace.update(actorId, f.scheduleItem.id, { expectedUpdatedAt: f.scheduleItem.updatedAt, scope: "series", idempotencyKey: "wrong-workspace", patch: { title: "Stolen" } }), { code: "NOT_FOUND" });
    await assert.rejects(f.service.create("account:other", { title: "Foreign associations", startsAt: "2026-09-19T00:15:00Z", contactIds: ["contact:owned"], noteIds: ["note:owned"], idempotencyKey: "foreign-create" }), { code: "VALIDATION_ERROR" });
    await assert.rejects(otherWorkspace.create(actorId, { title: "Foreign workspace", startsAt: "2026-09-19T00:15:00Z", noteIds: ["note:owned"], idempotencyKey: "foreign-workspace-create" }), { code: "VALIDATION_ERROR" });
    assert.deepEqual(f.snapshot(), before);
    const saved = await f.service.update(actorId, f.scheduleItem.id, { expectedUpdatedAt: f.scheduleItem.updatedAt, scope: "series", idempotencyKey: "owner-still-valid", patch: { title: "Valid owner" } });
    assert.equal(saved.scheduleItem.title, "Valid owner");
    assert.equal(f.stats().leased, 0);
  } finally { await f.client.close(); }
});

test("legacy injected readers still authorize associations without a PG transaction", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const owned = { workspaceId, collectionName: "notes", recordId: "note:owned", userId: actorId, sourceType: "manual", sourceId: "note:owned", evidenceIds: [], lifecycleState: "active" as const, createdAt: stamp, updatedAt: stamp, payload: { schemaVersion: 1, operations: [], note: { id: "note:owned", accountId: actorId, ownerUserId: actorId, body: "Private note", contactIds: [], version: 1, createdAt: stamp, updatedAt: stamp } } };
  await store.upsertRecord(owned);
  const service = createPersonalScheduleService({ store, workspaceId, now: () => stamp, associationReader: createPersonalScheduleAssociationReader({ store, workspaceId }) });
  const saved = await service.create(actorId, { title: "Compatible", startsAt: "2026-09-19T00:15:00Z", noteIds: ["note:owned"], idempotencyKey: "legacy-reader" });
  assert.deepEqual(saved.scheduleItem.noteIds, ["note:owned"]);
  await assert.rejects(service.update(actorId, saved.scheduleItem.id, { expectedUpdatedAt: saved.scheduleItem.updatedAt, idempotencyKey: "legacy-denied", patch: { noteIds: ["note:missing"] } }), { code: "VALIDATION_ERROR" });
  assert.deepEqual(await service.get({ actorId, id: saved.scheduleItem.id }), saved.scheduleItem);
});
