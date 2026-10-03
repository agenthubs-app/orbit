import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOfflineScheduleMutation,
  isOfflineScheduleEditable,
  localNoteIdsOfSchedule,
  parseOfflineScheduleRequest,
} from "../src/data/sync/schedule-outbox-mutation";
import type { PersonalScheduleContract } from "../src/api/contract/tasks";

const createdAt = "2026-10-03T09:00:00.000Z";
const localId = "local:123e4567-e89b-42d3-a456-426614174000";
const localNote = "local:7f3a0000-0000-4000-8000-000000000001";

test("schedule outbox freezes a non-recurring create request exactly as the server accepts it", () => {
  const requestBody = { title: "Call Chen", startsAt: "2026-10-04T09:00:00.000Z", timeZone: "Asia/Tokyo", reminderMinutes: 15, noteIds: [localNote], idempotencyKey: "s-create-1" };
  const mutation = buildOfflineScheduleMutation({ mutationId: "s-create-1", entityId: localId, operation: "create", baseRevision: null, requestBody, createdAt });
  assert.equal(mutation.domainId, "personal-schedule");
  assert.equal(mutation.kind, "personal_schedule");
  assert.equal(mutation.requestJson, JSON.stringify(requestBody));
  const { idempotencyKey: _key, ...fields } = requestBody;
  assert.deepEqual(mutation.patch, fields);
  assert.deepEqual(parseOfflineScheduleRequest(mutation).requestBody, requestBody);
  assert.deepEqual(localNoteIdsOfSchedule(mutation), [localNote]);

  const invalid: Array<[string, Record<string, unknown>, string]> = [
    ["recurring create", { ...requestBody, recurrence: { frequency: "daily" }, idempotencyKey: "s-x" }, "s-x"],
    ["receipt key mismatch", { ...requestBody, idempotencyKey: "other" }, "s-y"],
    ["missing title", { startsAt: requestBody.startsAt, idempotencyKey: "s-z" }, "s-z"],
    ["server-unknown field", { ...requestBody, notes: "x", idempotencyKey: "s-w" }, "s-w"],
  ];
  for (const [name, body, mutationId] of invalid) {
    assert.throws(() => buildOfflineScheduleMutation({ mutationId, entityId: localId, operation: "create", baseRevision: null, requestBody: body, createdAt }), TypeError, name);
  }
  assert.throws(() => buildOfflineScheduleMutation({ mutationId: "s-create-1", entityId: "personal:abc", operation: "create", baseRevision: null, requestBody, createdAt }),
    TypeError, "a create needs a local id");
  const explicitNoRepeat = buildOfflineScheduleMutation({ mutationId: "s-null", entityId: localId, operation: "create", baseRevision: null,
    requestBody: { title: "One-off", startsAt: requestBody.startsAt, recurrence: null, idempotencyKey: "s-null" }, createdAt });
  assert.equal(explicitNoRepeat.operation, "create");
});

test("schedule edits and deletes carry the server version; scope and repeat rules stay online-only", () => {
  const update = buildOfflineScheduleMutation({ mutationId: "s-update-1", entityId: "personal:abc", operation: "update", baseRevision: "r1",
    requestBody: { expectedUpdatedAt: createdAt, idempotencyKey: "s-update-1", patch: { title: "Moved", location: null, noteIds: ["note:1", localNote] } }, createdAt });
  assert.deepEqual(update.patch, { title: "Moved", location: null, noteIds: ["note:1", localNote] });
  assert.deepEqual(localNoteIdsOfSchedule(update), [localNote]);
  const remove = buildOfflineScheduleMutation({ mutationId: "s-delete-1", entityId: "personal:abc", operation: "delete", baseRevision: "r1",
    requestBody: { expectedUpdatedAt: createdAt, idempotencyKey: "s-delete-1" }, createdAt });
  assert.deepEqual(remove.patch, {});
  assert.deepEqual(localNoteIdsOfSchedule(remove), []);
  // A queued edit of a schedule still waiting for its create has no server revision yet.
  assert.equal(buildOfflineScheduleMutation({ mutationId: "s-update-2", entityId: localId, operation: "update", baseRevision: null,
    requestBody: { expectedUpdatedAt: createdAt, idempotencyKey: "s-update-2", patch: { title: "x" } }, createdAt }).id, localId);

  const rejected: Array<[string, string, string | null, Record<string, unknown>, string]> = [
    ["series scope", "update", "r1", { expectedUpdatedAt: createdAt, idempotencyKey: "a", scope: "series", patch: { title: "x" } }, "a"],
    ["occurrence scope delete", "delete", "r1", { expectedUpdatedAt: createdAt, idempotencyKey: "b", scope: "occurrence" }, "b"],
    ["turning on repeat", "update", "r1", { expectedUpdatedAt: createdAt, idempotencyKey: "c", patch: { recurrence: { frequency: "weekly" } } }, "c"],
    ["missing version", "delete", "r1", { idempotencyKey: "d" }, "d"],
    ["formal id without revision", "update", null, { expectedUpdatedAt: createdAt, idempotencyKey: "e", patch: { title: "x" } }, "e"],
    ["empty patch", "update", "r1", { expectedUpdatedAt: createdAt, idempotencyKey: "f", patch: {} }, "f"],
    ["unknown operation", "complete", "r1", { idempotencyKey: "g" }, "g"],
  ];
  for (const [name, operation, baseRevision, requestBody, mutationId] of rejected) {
    assert.throws(() => buildOfflineScheduleMutation({ mutationId, entityId: "personal:abc", operation, baseRevision, requestBody, createdAt }), TypeError, name);
  }
  assert.throws(() => parseOfflineScheduleRequest({ ...update, requestJson: JSON.stringify({ expectedUpdatedAt: createdAt, idempotencyKey: "s-update-1", patch: { title: "tampered" } }) }),
    TypeError, "the queue envelope and the frozen request must agree");
});

test("only the actor's own non-recurring personal schedule is editable offline", () => {
  const base = { id: "personal:abc", sourceId: "personal:abc", accountId: "a", ownerUserId: "a", kind: "personal", category: "personal", state: "upcoming",
    title: "One-off", startsAt: "2026-10-04T09:00:00.000Z", createdAt, updatedAt: createdAt } as PersonalScheduleContract;
  assert.equal(isOfflineScheduleEditable(base, "a"), true);
  assert.equal(isOfflineScheduleEditable({ ...base, recurrence: { frequency: "daily" } }, "a"), false, "a repeating series needs the network");
  assert.equal(isOfflineScheduleEditable({ ...base, id: "personal:abc:occurrence:2026-10-04", seriesId: "personal:abc", occurrenceDate: "2026-10-04", sourceId: "personal:abc" }, "a"), false,
    "a single occurrence of a series needs the network");
  assert.equal(isOfflineScheduleEditable({ ...base, ownerUserId: "b", accountId: "b" }, "a"), false);
  assert.equal(isOfflineScheduleEditable({ ...base, state: "cancelled" }, "a"), false);
  assert.equal(isOfflineScheduleEditable(null, "a"), false);
});
