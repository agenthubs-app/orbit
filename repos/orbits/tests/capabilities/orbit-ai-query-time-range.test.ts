import assert from "node:assert/strict";
import test from "node:test";

import { createActorQueryInputSchema, createAiReadInputSchema } from "../../features/orbit-ai/data-query/query-schema";
import { executeActorScopedQuery } from "../../features/orbit-ai/data-query/query-service";
import { taskLiveRecordFromPayload } from "../../features/tasks/task-record";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

/**
 * Time ranges compare instants, not strings (AG01 run-02, approved by the coordinator). Stored times
 * are UTC ("…Z") while the model sends ranges with an offset ("…+09:00"); compared as text,
 * "2026-11-19T03:00:00.000Z" sorts before "2026-11-19T11:00:00+09:00" and a 12:00 JST lunch was
 * dropped from an 11:00–14:00 JST query (AE-ENT-005).
 */

const WORKSPACE = "workspace:query-time-range";
const ACTOR = "actor:a";
const NOW = "2026-11-15T01:00:00.000Z";

async function scheduleStore(items: { id: string; startsAt: string; endsAt?: string }[]) {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  for (const item of items) {
    await store.upsertRecord({
      collectionName: "personal_schedule_items",
      createdAt: NOW,
      evidenceIds: [],
      lifecycleState: "active",
      payload: {
        accountId: ACTOR, category: "personal", createdAt: NOW, evidenceIds: [], id: item.id, kind: "personal", ownerUserId: ACTOR,
        sourceId: item.id, startsAt: item.startsAt, ...(item.endsAt ? { endsAt: item.endsAt } : {}), state: "upcoming", timeZone: "Asia/Tokyo", title: item.id, updatedAt: NOW,
      },
      recordId: item.id,
      sourceId: item.id,
      sourceType: "manual",
      updatedAt: NOW,
      userId: ACTOR,
      workspaceId: WORKSPACE,
    });
  }
  return store;
}

async function scheduleIds(store: Awaited<ReturnType<typeof scheduleStore>>, from: string, to: string): Promise<string[]> {
  const result = await executeActorScopedQuery({ actorId: ACTOR, input: { from, operation: "list", query: "我有什么安排", to }, store, toolName: "schedule.query", workspaceId: WORKSPACE });
  return result.items.map((item) => String(item.id));
}

test("schedule stored in UTC, queried with a +09:00 range: inside and edge records are kept, outside ones are not", async () => {
  const store = await scheduleStore([
    { endsAt: "2026-11-19T01:00:00.000Z", id: "before", startsAt: "2026-11-19T00:00:00.000Z" }, // 09:00–10:00 JST
    { endsAt: "2026-11-19T02:00:00.000Z", id: "ends-at-start", startsAt: "2026-11-19T01:30:00.000Z" }, // 10:30–11:00 JST
    { endsAt: "2026-11-19T04:00:00.000Z", id: "lunch", startsAt: "2026-11-19T03:00:00.000Z" }, // 12:00–13:00 JST
    { endsAt: "2026-11-19T06:00:00.000Z", id: "starts-at-end", startsAt: "2026-11-19T05:00:00.000Z" }, // 14:00–15:00 JST
    { endsAt: "2026-11-19T07:00:00.000Z", id: "after", startsAt: "2026-11-19T06:00:00.000Z" }, // 15:00–16:00 JST
  ]);
  assert.deepEqual(await scheduleIds(store, "2026-11-19T11:00:00+09:00", "2026-11-19T14:00:00+09:00"), ["ends-at-start", "lunch", "starts-at-end"]);
});

test("a whole local day keeps the records of that day and drops the next day's early ones", async () => {
  const store = await scheduleStore([
    { id: "day-start", startsAt: "2026-11-18T15:30:00.000Z" }, // 11-19 00:30 JST
    { endsAt: "2026-11-19T04:00:00.000Z", id: "lunch", startsAt: "2026-11-19T03:00:00.000Z" },
    { id: "next-day", startsAt: "2026-11-19T15:30:00.000Z" }, // 11-20 00:30 JST: text comparison kept it
    { endsAt: "2026-11-18T14:30:00.000Z", id: "previous-day", startsAt: "2026-11-18T14:00:00.000Z" }, // 11-18 23:00 JST
  ]);
  assert.deepEqual(await scheduleIds(store, "2026-11-19T00:00:00+09:00", "2026-11-19T23:59:59+09:00"), ["day-start", "lunch"]);
});

test("a Z range against values stored with +09:00, ordered by instant", async () => {
  const store = await scheduleStore([
    { endsAt: "2026-11-19T13:00:00+09:00", id: "noon-jst", startsAt: "2026-11-19T12:00:00+09:00" },
    { endsAt: "2026-11-19T04:00:00.000Z", id: "one-pm-utc", startsAt: "2026-11-19T03:30:00.000Z" },
    { endsAt: "2026-11-19T21:00:00+09:00", id: "evening-jst", startsAt: "2026-11-19T20:00:00+09:00" },
  ]);
  assert.deepEqual(await scheduleIds(store, "2026-11-19T02:30:00.000Z", "2026-11-19T03:45:00.000Z"), ["noon-jst", "one-pm-utc"]);
});

async function taskStore(tasks: { id: string; dueAt?: string }[]) {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  for (const task of tasks) {
    await store.upsertRecord(taskLiveRecordFromPayload({ workspaceId: WORKSPACE, payload: {
      activities: [], version: 1,
      task: { accountId: ACTOR, category: "work", createdAt: NOW, ...(task.dueAt ? { dueAt: task.dueAt } : {}), id: task.id, ownerUserId: ACTOR, priority: "normal", source: "manual", status: "open", title: task.id, updatedAt: NOW },
    } }));
  }
  return store;
}

test("todo due dates compare as instants against an offset range", async () => {
  const store = await taskStore([
    { dueAt: "2026-11-17T09:00:00.000Z", id: "due-1800-jst" }, // 11-17 18:00 JST
    { dueAt: "2026-11-16T15:00:00.000Z", id: "due-midnight-jst" }, // 11-17 00:00 JST: the range's edge
    { dueAt: "2026-11-17T16:00:00.000Z", id: "due-next-day-jst" }, // 11-18 01:00 JST: text comparison kept it
    { id: "no-due" },
  ]);
  const result = await executeActorScopedQuery({ actorId: ACTOR, input: { from: "2026-11-17T00:00:00+09:00", operation: "list", query: "11 月 17 日到期的待办", to: "2026-11-17T23:59:59+09:00" }, store, toolName: "tasks.query", workspaceId: WORKSPACE });
  assert.deepEqual(result.items.map((item) => item.id).sort(), ["due-1800-jst", "due-midnight-jst"]);
});

test("follow-up due dates compare as instants against an offset range", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const base = { createdAt: NOW, evidenceIds: [], lifecycleState: "active" as const, sourceType: "manual" as const, updatedAt: NOW, userId: ACTOR, workspaceId: WORKSPACE };
  await store.upsertRecord({ ...base, collectionName: "connections", payload: { accountId: ACTOR, contactId: "contact:t", id: "connection:t", stage: "connected", version: 1 }, recordId: "connection:t", sourceId: "connection:t" });
  for (const [id, dueAt] of [["in-range", "2026-11-17T09:00:00.000Z"], ["next-day", "2026-11-17T16:00:00.000Z"]] as const) {
    await store.upsertRecord({ ...base, collectionName: "tasks", payload: { accountId: ACTOR, connectionId: "connection:t", contactId: "contact:t", createdAt: NOW, dueAt, id, status: "open", title: id, updatedAt: NOW }, recordId: id, sourceId: id });
  }
  const result = await executeActorScopedQuery({ actorId: ACTOR, input: { from: "2026-11-17T00:00:00+09:00", operation: "list", query: "跟进", to: "2026-11-17T23:59:59+09:00" }, store, toolName: "followups.query", workspaceId: WORKSPACE });
  assert.deepEqual(result.items.map((item) => item.id), ["in-range"]);
});

test("the input schemas compare from and to as instants", () => {
  for (const schema of [createActorQueryInputSchema("schedule.query"), createAiReadInputSchema("schedule.query")]) {
    // 11:00 JST is 02:00Z, before 03:30Z: a valid range that text comparison rejected.
    assert.equal(schema.parse({ from: "2026-11-19T11:00:00+09:00", operation: "list", query: "q", to: "2026-11-19T03:30:00Z" }).success, true);
    // 13:00 JST is 04:00Z, after 03:30Z: really reversed.
    assert.equal(schema.parse({ from: "2026-11-19T13:00:00+09:00", operation: "list", query: "q", to: "2026-11-19T03:30:00Z" }).success, false);
    assert.equal(schema.parse({ from: "2026-11-19T00:00:00+09:00", operation: "list", query: "q", to: "2026-11-19T23:59:59+09:00" }).success, true);
  }
});
