import assert from "node:assert/strict";
import test from "node:test";

import { mirrorFreshness } from "../src/data/sync/mirror-freshness";
import { mirrorNote, notesFromMirror, overlayQueuedNotes, selectMirrorNotes } from "../src/view-models/notes-mirror";
import type { LocalSyncQueuedMutation } from "../src/data/sync/local-sync-repository";

// Sprint 0108: the local rules the notes page now applies to its mirror.
const note = (id: string, patch: Record<string, unknown> = {}) => ({
  payload: {
    id, accountId: "a", ownerUserId: "a", title: id, body: `${id} body`, manualContactIds: [], mentions: [], contactIds: [], eventIds: [], version: 1,
    createdAt: "2026-09-27T00:00:00.000Z", updatedAt: "2026-09-27T00:00:00.000Z", ...patch,
  },
});

test("mirror notes are the owner's only: one foreign row makes the whole list unconfirmed", () => {
  assert.equal(notesFromMirror([note("n1")], "a", "zh")?.length, 1);
  assert.equal(notesFromMirror([note("n1"), note("n2", { accountId: "b", ownerUserId: "b" })], "a", "zh"), null);
});

test("local selection matches the server's filters, search and newest-first order", () => {
  const notes = notesFromMirror([
    note("old", { updatedAt: "2026-09-01T00:00:00.000Z", body: "预算 讨论" }),
    note("people", { manualContactIds: ["c1"], contactIds: ["c1"], updatedAt: "2026-09-20T00:00:00.000Z" }),
    note("event", { eventIds: ["e1"], updatedAt: "2026-09-10T00:00:00.000Z" }),
    note("mention", { body: "和 @林玫 午餐", contactIds: ["c2"], mentions: [{ contactId: "c2", displayText: "@林玫", start: 2, end: 5 }], updatedAt: "2026-09-25T00:00:00.000Z" }),
  ], "a", "zh")!;
  const ids = (query: Parameters<typeof selectMirrorNotes>[1]) => selectMirrorNotes(notes, query).map((item) => item.id);
  assert.deepEqual(ids({ association: "all", q: "" }), ["mention", "people", "event", "old"]);
  assert.deepEqual(ids({ association: "contacts", q: "" }), ["mention", "people"]);
  assert.deepEqual(ids({ association: "events", q: "" }), ["event"]);
  assert.deepEqual(ids({ association: "unlinked", q: "" }), ["old"]);
  assert.deepEqual(ids({ association: "all", contactId: "c1", q: "" }), ["people"]);
  assert.deepEqual(ids({ association: "all", q: "预算" }), ["old"]);
  assert.deepEqual(ids({ association: "all", q: "林玫" }), ["mention"], "a mention name is searchable offline");
  assert.equal(mirrorNote(notes, "event")?.id, "event");
  assert.equal(mirrorNote(notes, "missing"), null);
});

test("pending note creates and edits overlay the server mirror without mutating it", () => {
  const server = notesFromMirror([note("n1", { body: "Server body", version: 4 })], "a", "en")!;
  const queued = (overrides: Partial<LocalSyncQueuedMutation>): LocalSyncQueuedMutation => ({
    actorId: "a", workspaceId: "w", domainId: "notes", mutationId: "m1", kind: "note",
    id: "n1", operation: "update", patch: { body: "Pending edit" }, requestJson: "{}", baseRevision: "r4",
    dependsOn: null, createdAt: "2026-09-28T00:00:00.000Z", retryCount: 0, nextRetryAt: null,
    lastErrorCode: null, state: "queued", attemptCount: 0, firstAttemptAt: null, serverSnapshot: null, ...overrides,
  });
  const overlay = overlayQueuedNotes(server, [
    queued({ mutationId: "create", id: "local:123e4567-e89b-42d3-a456-426614174000", operation: "create", baseRevision: null,
      patch: { title: "Local title", body: "Local body", manualContactIds: [], mentions: [], eventIds: [] } }),
    queued({ mutationId: "edit", createdAt: "2026-09-28T00:00:01.000Z", patch: { body: "Pending edit", title: "Edited" } }),
  ], "a", "en");

  assert.deepEqual(overlay?.map(({ id, title, body, version }) => ({ id, title, body, version })).sort((a, b) => a.id.localeCompare(b.id)), [
    { id: "local:123e4567-e89b-42d3-a456-426614174000", title: "Local title", body: "Local body", version: 1 },
    { id: "n1", title: "Edited", body: "Pending edit", version: 5 },
  ]);
  assert.equal(server[0]?.body, "Server body");
});

test("failed note creates and edits stay visible with their local content", () => {
  const server = notesFromMirror([note("n1", { body: "Server body", version: 4 })], "a", "en")!;
  const failed = (overrides: Partial<LocalSyncQueuedMutation>): LocalSyncQueuedMutation => ({
    actorId: "a", workspaceId: "w", domainId: "notes", mutationId: "m-failed", kind: "note",
    id: "n1", operation: "update", patch: { body: "Local failed body" }, requestJson: "{}", baseRevision: "r4",
    dependsOn: null, createdAt: "2026-09-28T00:00:00.000Z", retryCount: 0, nextRetryAt: null,
    lastErrorCode: "INVALID_REQUEST", state: "failed", attemptCount: 1, firstAttemptAt: "2026-09-28T00:00:01.000Z", serverSnapshot: null, ...overrides,
  });
  const overlay = overlayQueuedNotes(server, [
    failed({ id: "local:123e4567-e89b-42d3-a456-426614174000", operation: "create", baseRevision: null,
      patch: { title: "Failed create", body: "Create body stays here", manualContactIds: [], mentions: [], eventIds: [] } }),
    failed({}),
  ], "a", "en");

  assert.deepEqual(overlay?.map(({ id, title, body, localMutationState }) => ({ id, title, body, localMutationState })).sort((left, right) => left.id.localeCompare(right.id)), [
    { id: "local:123e4567-e89b-42d3-a456-426614174000", title: "Failed create", body: "Create body stays here", localMutationState: "failed" },
    { id: "n1", title: "n1", body: "Local failed body", localMutationState: "failed" },
  ]);
});

test("freshness: never synced is loading; a failed attempt after a sync is offline with its time", () => {
  const base = { error: null, lastSyncedAt: null, status: "unsynced" as const };
  assert.deepEqual([mirrorFreshness(base, true).readable, mirrorFreshness(base, true).loading, mirrorFreshness(base, true).offline], [false, true, false]);
  const failedFirst = mirrorFreshness({ ...base, status: "failure", error: "boom" }, true);
  assert.deepEqual([failedFirst.readable, failedFirst.failure, failedFirst.offline], [false, "boom", false], "a failed first sync is an error, not an offline copy");
  const offline = mirrorFreshness({ error: "Network request failed", lastSyncedAt: "2026-09-27T05:40:00.000Z", status: "stale" }, true);
  assert.deepEqual([offline.readable, offline.offline, offline.failure, offline.lastSyncedAt], [true, true, null, "2026-09-27T05:40:00.000Z"]);
  const emptyOffline = mirrorFreshness({ error: "Network request failed", lastSyncedAt: "2026-09-27T05:40:00.000Z", status: "failure" }, true);
  assert.deepEqual([emptyOffline.readable, emptyOffline.offline], [true, true], "an empty but synced mirror is still readable offline");
  const fresh = mirrorFreshness({ error: null, lastSyncedAt: "2026-09-27T05:40:00.000Z", status: "fresh" }, true);
  assert.deepEqual([fresh.readable, fresh.offline, fresh.syncLabelKey], [true, false, "sync.fresh"]);
  assert.equal(mirrorFreshness({ ...base, status: "fresh" }, false).readable, false, "not ready never claims a list");
});
