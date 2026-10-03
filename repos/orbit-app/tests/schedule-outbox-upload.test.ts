import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test, { type TestContext } from "node:test";
import type { OrbitApiClient } from "../src/api/client";
import { initializeLocalSyncDatabase } from "../src/data/sync/local-sync-database";
import { createLocalSyncRepository } from "../src/data/sync/local-sync-repository";
import { buildOfflineNoteMutation } from "../src/data/sync/note-outbox-mutation";
import { createNoteOutboxUploader } from "../src/data/sync/note-outbox-upload";
import { buildOfflineScheduleMutation } from "../src/data/sync/schedule-outbox-mutation";
import { createScheduleOutboxUploader } from "../src/data/sync/schedule-outbox-upload";
import type { SyncClient } from "../src/data/sync/sync-client";
import { NodeTestDatabase } from "./helpers/node-sync-database";

const actorId = "actor-a", workspaceId = "workspace-a", baseUrl = "https://schedule.example";
const T0 = Date.parse("2026-10-03T09:00:00.000Z");
const at = (offset: number) => new Date(T0 + offset).toISOString();
const localNote = "local:7f3a0000-0000-4000-8000-000000000001";
const localSchedule = "local:b21c0000-0000-4000-8000-000000000002";
const formalNote = "note:server-1", formalSchedule = "personal:server-1";

type Sent = { method: string; path: string; body: unknown; headers?: Record<string, string> };

async function device(t: TestContext) {
  const database = new NodeTestDatabase();
  t.after(() => database.close());
  await initializeLocalSyncDatabase(database);
  const scopes = ["notes", "personal-schedule"].map(domainId => ({ baseUrl, actorId, workspaceId, domainId, authorizationEpoch: `${domainId}-e1` }));
  const repository = createLocalSyncRepository({ actorId, database, baseUrl, hashPayload: async serialized => createHash("sha256").update(serialized).digest("hex"),
    registeredDomainIds: ["notes", "personal-schedule"], activeReadScopes: () => scopes });
  await repository.setLease({ version: 2, baseUrl, actorId, subject: "fixture", sessionExpiresAt: T0 + 86_400_000, offlineReadExpiresAt: T0 + 86_400_000,
    lastVerifiedAt: T0, grants: scopes.map(({ workspaceId: w, domainId, authorizationEpoch }) => ({ workspaceId: w, domainId, authorizationEpoch })), databaseKeyRef: "fixture" });
  return { database, repository, scopes };
}

/** A fake server: notes and schedule items it holds are served as domain pages. */
function server(options: { noteStatus?: number; noteNetworkError?: boolean } = {}) {
  const sent: Sent[] = [];
  const notes = new Map<string, Record<string, unknown>>();
  const items = new Map<string, Record<string, unknown> | null>();
  let revision = 0;
  const syncClient: SyncClient = {
    async getLease() { throw new Error("unused"); }, async getManifest() { throw new Error("unused"); }, async getPage() { throw new Error("unused"); },
    async getDomainPage(input) {
      revision += 1;
      const source = input.domainId === "notes" ? [...notes.entries()] : [...items.entries()];
      return { domainId: input.domainId, schemaVersion: 2, registryVersion: 1, authorizationEpoch: `${input.domainId}-e1`,
        changes: source.map(([id, payload]) => payload ? { id, revision: `r${revision}`, operation: "upsert" as const, payload } : { id, revision: `r${revision}`, operation: "delete" as const, payload: null }),
        nextCursor: `${input.domainId}:${revision}`, highWatermark: String(revision), hasMore: false, generation: "g1", serverTime: at(revision * 1000) };
    },
  };
  const scheduleItem = (body: Record<string, unknown>, updatedAt: string) => ({ id: formalSchedule, sourceId: formalSchedule, accountId: actorId, ownerUserId: actorId,
    kind: "personal", category: "personal", state: "upcoming", createdAt: at(0), updatedAt, ...body });
  const writeClient = {
    async post(path: string, request: { body: Record<string, unknown>; headers?: Record<string, string> }) {
      sent.push({ method: "POST", path, body: request.body, ...(request.headers ? { headers: request.headers } : {}) });
      if (path === "/api/notes") {
        if (options.noteNetworkError) throw new Error("offline");
        if (options.noteStatus && options.noteStatus >= 400) return { success: false as const, status: options.noteStatus, error: { code: "VALIDATION_ERROR", message: "bad" } };
        const note = { id: formalNote, accountId: actorId, ownerUserId: actorId, title: request.body.title, body: request.body.body, manualContactIds: [], mentions: [], contactIds: [], eventIds: [], version: 1, createdAt: at(0), updatedAt: at(0) };
        notes.set(formalNote, note);
        return { success: true as const, status: 201, data: { note }, meta: {} };
      }
      const { idempotencyKey: _key, ...fields } = request.body;
      const item = scheduleItem(fields, at(5000));
      items.set(formalSchedule, item);
      return { success: true as const, status: 201, data: { scheduleItem: item }, meta: {} };
    },
    async patch(path: string, request: { body: Record<string, unknown>; headers?: Record<string, string> }) {
      sent.push({ method: "PATCH", path, body: request.body, ...(request.headers ? { headers: request.headers } : {}) });
      const current = items.get(formalSchedule)!;
      if (request.body.expectedUpdatedAt !== current.updatedAt) return { success: false as const, status: 409, error: { code: "CONFLICT", message: "changed" } };
      const item = { ...current, ...(request.body.patch as Record<string, unknown>), updatedAt: at(6000) };
      items.set(formalSchedule, item);
      return { success: true as const, status: 200, data: { scheduleItem: item }, meta: {} };
    },
    async delete(path: string, request: { body: Record<string, unknown>; headers?: Record<string, string> }) {
      sent.push({ method: "DELETE", path, body: request.body, ...(request.headers ? { headers: request.headers } : {}) });
      const current = items.get(formalSchedule)!;
      if (request.body.expectedUpdatedAt !== current.updatedAt) return { success: false as const, status: 409, error: { code: "CONFLICT", message: "changed" } };
      items.set(formalSchedule, null);
      return { success: true as const, status: 200, data: { scheduleItem: { ...current, state: "cancelled", updatedAt: at(7000) }, deleted: true }, meta: {} };
    },
  } as unknown as Pick<OrbitApiClient, "post" | "patch" | "delete">;
  return { sent, notes, items, syncClient, writeClient };
}

async function queueNoteAndSchedule(repository: Awaited<ReturnType<typeof device>>["repository"]) {
  const noteBody = { title: "Three things", body: "1. quote 2. intro 3. revisit", manualContactIds: [], mentions: [], eventIds: [], idempotencyKey: "m-01" };
  await repository.enqueueOutboxMutation({ ...buildOfflineNoteMutation({ mutationId: "m-01", entityId: localNote, operation: "create", baseRevision: null, requestBody: noteBody, createdAt: at(0) }), actorId, workspaceId });
  const scheduleBody = { title: "Call Chen", startsAt: "2026-10-04T09:00:00.000Z", timeZone: "Asia/Tokyo", noteIds: [localNote], idempotencyKey: "m-03" };
  await repository.enqueueOutboxMutation({ ...buildOfflineScheduleMutation({ mutationId: "m-03", entityId: localSchedule, operation: "create", baseRevision: null, requestBody: scheduleBody, createdAt: at(2) }), actorId, workspaceId });
  return { noteBody, scheduleBody };
}

function uploaders(repository: Awaited<ReturnType<typeof device>>["repository"], fake: ReturnType<typeof server>) {
  const common = { actorId, baseUrl, repository, syncClient: fake.syncClient, writeClient: fake.writeClient, workspaceId, now: () => T0 + 60_000 };
  return { notes: createNoteOutboxUploader(common), schedule: createScheduleOutboxUploader(common) };
}

test("a schedule linked to an offline note uploads after the note and carries the note's formal id", async t => {
  const { repository } = await device(t);
  const fake = server();
  await queueNoteAndSchedule(repository);
  const upload = uploaders(repository, fake);
  // The schedule uploader alone must not send a temporary note id.
  const early = await upload.schedule.run();
  assert.equal(early.sent, 0, "the schedule waits for its note");
  assert.equal(fake.sent.length, 0);
  assert.equal((await upload.notes.run()).acknowledged, 1);
  const queuedSchedule = (await repository.listQueuedMutations({ workspaceId, domainId: "personal-schedule" }))[0]!;
  assert.deepEqual((JSON.parse(queuedSchedule.requestJson!) as { noteIds: string[] }).noteIds, [formalNote], "the note ACK rewrites the unsent schedule request");
  assert.deepEqual((queuedSchedule.patch as { noteIds: string[] }).noteIds, [formalNote]);
  const result = await upload.schedule.run();
  assert.equal(result.acknowledged, 1, JSON.stringify({ result, sent: fake.sent }));
  const schedulePost = fake.sent.find(item => item.path === "/api/schedule-items")!;
  assert.deepEqual((schedulePost.body as { noteIds: string[] }).noteIds, [formalNote]);
  assert.equal(schedulePost.headers?.["x-orbit-personal-schedule-version"], "3", "reminder fields need schedule API version 3");
  assert.ok(!JSON.stringify(fake.sent).includes("local:"), "the server never sees a temporary id");
  assert.equal((await repository.listQueuedMutations({ workspaceId })).length, 0);
  assert.equal(await repository.resolveAlias({ workspaceId, domainId: "personal-schedule", localId: localSchedule, now: at(60_000) }), formalSchedule);
  const [mirrored] = await repository.listRecordsByIds({ workspaceId, kind: "personal_schedule", ids: [formalSchedule] });
  assert.deepEqual((mirrored?.payload as { noteIds: string[] }).noteIds, [formalNote]);
});

test("a permanently failed note create marks its linked schedule failed instead of sending it", async t => {
  const { repository } = await device(t);
  const fake = server({ noteStatus: 422 });
  await queueNoteAndSchedule(repository);
  const upload = uploaders(repository, fake);
  assert.equal((await upload.notes.run()).failed, 1);
  const result = await upload.schedule.run();
  assert.equal(result.sent, 0);
  assert.deepEqual(fake.sent.map(item => item.path), ["/api/notes"]);
  const schedule = (await repository.listQueuedMutations({ workspaceId, domainId: "personal-schedule" }))[0]!;
  assert.equal(schedule.state, "failed");
  assert.equal(schedule.lastErrorCode, "NOTE_DEPENDENCY_FAILED");
  assert.ok(schedule.requestJson, "the schedule content is kept for the user to fix or discard");
});

test("a schedule stays queued while its note is still waiting for the network", async t => {
  const { repository } = await device(t);
  const fake = server({ noteNetworkError: true });
  await queueNoteAndSchedule(repository);
  const upload = uploaders(repository, fake);
  // The note create is still queued (its upload round has not succeeded yet).
  assert.equal((await upload.schedule.run()).sent, 0);
  const schedule = (await repository.listQueuedMutations({ workspaceId, domainId: "personal-schedule" }))[0]!;
  assert.equal(schedule.state, "queued");
  assert.equal(schedule.attemptCount, 0, "an unsent schedule is still editable before its first upload");
});

test("create, edit and delete of an offline schedule replay in order under one formal id; the delete ACK leaves a tombstone", async t => {
  const { repository } = await device(t);
  const fake = server();
  const createBody = { title: "Dentist", startsAt: "2026-10-05T01:00:00.000Z", idempotencyKey: "s-create" };
  await repository.enqueueOutboxMutation({ ...buildOfflineScheduleMutation({ mutationId: "s-create", entityId: localSchedule, operation: "create", baseRevision: null, requestBody: createBody, createdAt: at(0) }), actorId, workspaceId });
  await repository.enqueueOutboxMutation({ ...buildOfflineScheduleMutation({ mutationId: "s-update", entityId: localSchedule, operation: "update", baseRevision: null,
    requestBody: { expectedUpdatedAt: at(0), idempotencyKey: "s-update", patch: { title: "Dentist (moved)" } }, createdAt: at(1) }), actorId, workspaceId, dependsOn: "s-create" });
  await repository.enqueueOutboxMutation({ ...buildOfflineScheduleMutation({ mutationId: "s-delete", entityId: localSchedule, operation: "delete", baseRevision: null,
    requestBody: { expectedUpdatedAt: at(1), idempotencyKey: "s-delete" }, createdAt: at(2) }), actorId, workspaceId, dependsOn: "s-update" });
  assert.equal((await repository.listQueuedMutations({ workspaceId, domainId: "personal-schedule" })).length, 3, "unsent schedule writes are not merged into one request");
  const result = await uploaders(repository, fake).schedule.run();
  assert.equal(result.acknowledged, 3, JSON.stringify({ result, sent: fake.sent, queued: await repository.listQueuedMutations({ workspaceId }) }));
  assert.deepEqual(fake.sent.map(item => `${item.method} ${item.path}`), [
    "POST /api/schedule-items", `PATCH /api/schedule-items/${encodeURIComponent(formalSchedule)}`, `DELETE /api/schedule-items/${encodeURIComponent(formalSchedule)}`,
  ]);
  assert.equal((fake.sent[1]!.body as Record<string, unknown>).expectedUpdatedAt, at(5000), "the create ACK supplies the edit's server version");
  assert.equal((fake.sent[2]!.body as Record<string, unknown>).expectedUpdatedAt, at(6000), "the edit ACK supplies the delete's server version");
  assert.equal((await repository.listQueuedMutations({ workspaceId })).length, 0);
  const visible = (await repository.listRecordsByIds({ workspaceId, kind: "personal_schedule", ids: [formalSchedule, localSchedule] })).filter(record => record.deletedAt === null);
  assert.deepEqual(visible, []);
});

test("a stale offline schedule edit becomes a conflict holding the server version", async t => {
  const { repository, scopes } = await device(t);
  const fake = server();
  const serverItem = { id: formalSchedule, sourceId: formalSchedule, accountId: actorId, ownerUserId: actorId, kind: "personal", category: "personal", state: "upcoming",
    title: "Web title", startsAt: "2026-10-05T01:00:00.000Z", createdAt: at(0), updatedAt: at(3000) };
  fake.items.set(formalSchedule, serverItem);
  await repository.applyDomainPage(scopes[1]!, { domainId: "personal-schedule", schemaVersion: 2, registryVersion: 1, authorizationEpoch: "personal-schedule-e1",
    changes: [{ id: formalSchedule, revision: "r0", operation: "upsert", payload: { ...serverItem, title: "Phone base", updatedAt: at(0) } }],
    nextCursor: "personal-schedule:0", highWatermark: "0", hasMore: false, generation: "g1", serverTime: at(0) });
  await repository.enqueueOutboxMutation({ ...buildOfflineScheduleMutation({ mutationId: "s-stale", entityId: formalSchedule, operation: "update", baseRevision: "r0",
    requestBody: { expectedUpdatedAt: at(0), idempotencyKey: "s-stale", patch: { title: "Phone title" } }, createdAt: at(1) }), actorId, workspaceId });
  const result = await uploaders(repository, fake).schedule.run();
  assert.equal(result.conflicts, 1);
  const conflict = (await repository.listQueuedMutations({ workspaceId, domainId: "personal-schedule" }))[0]!;
  assert.equal(conflict.state, "conflict");
  assert.equal((conflict.serverSnapshot as { title: string }).title, "Web title", "the server version is kept next to the local edit");
  assert.equal((JSON.parse(conflict.requestJson!) as { patch: { title: string } }).patch.title, "Phone title");
});
