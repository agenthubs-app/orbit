/**
 * agent-design AG14-1 / AG14-5 (设计稿 §6 账号一致性, 工作区边界): entries live under the canonical account and its
 * workspace, carry a revision, and another account reads, changes and deletes nothing of them.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { AgentMemoryRevisionConflictError, type AgentMemoryRecordPayload } from "../../features/agent/memory/contract";
import { AGENT_MEMORY_COLLECTION, agentMemoryScopeId, createStorageAgentMemoryService } from "../../features/agent/memory/service";

function world() {
  const store = createMemoryLiveRecordStore<AgentMemoryRecordPayload>();
  let tick = Date.parse("2026-11-15T01:00:00.000Z");
  let next = 0;
  const now = () => new Date((tick += 1000)).toISOString();
  const of = (accountId: string, workspaceId = "workspace:one") => createStorageAgentMemoryService({ actorId: accountId, id: () => `memory-${(next += 1)}`, now, store, workspaceId });
  return { of, store };
}

test("an entry is stored under the account and its workspace, with revision 1, in use, owned by the account", async () => {
  const { of, store } = world();
  const alice = of("account:alice");
  const created = await alice.create({ appliesTo: ["event.recommend"], category: "preference", content: "推荐活动时优先周末上午", source: "conversation", sourceMessageRef: "request:r1", structured: { dayPart: "morning", preferredDays: ["Sat", "Sun"], strength: "prefer" } });
  assert.equal(created.revision, 1);
  assert.equal(created.status, "active");
  assert.deepEqual(created.appliesTo, ["event.recommend"]);
  assert.deepEqual(created.structured, { dayPart: "morning", preferredDays: ["Sat", "Sun"], strength: "prefer" });
  assert.equal(created.sourceMessageRef, "request:r1");
  const rows = await store.listRecords({ collectionName: AGENT_MEMORY_COLLECTION, limit: "unbounded", workspaceId: agentMemoryScopeId("workspace:one", "account:alice") });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].userId, "account:alice");
});

test("another account reads nothing, changes nothing and deletes nothing of it", async () => {
  const { of } = world();
  const alice = of("account:alice");
  const bob = of("account:bob");
  const entry = await alice.create({ appliesTo: ["all"], category: "constraint", content: "回答用日语" });
  assert.deepEqual(await bob.list(), []);
  assert.equal(await bob.get(entry.memoryId), null);
  assert.equal(await bob.version(), 0);
  assert.deepEqual(await bob.deletionMarks(), []);
  await assert.rejects(bob.update(entry.memoryId, { content: "回答用英语" }), /was not found/u);
  await assert.rejects(bob.remove(entry.memoryId), /was not found/u);
  const still = await alice.get(entry.memoryId);
  assert.equal(still?.content, "回答用日语");
  assert.equal(still?.revision, 1);
});

test("the same account in another workspace has its own entries and switches", async () => {
  const { of } = world();
  const here = of("account:alice", "workspace:one");
  const there = of("account:alice", "workspace:two");
  await here.create({ category: "goal", content: "明年春天前找到两家新的窑" });
  await here.updateSettings({ enabled: false });
  assert.deepEqual(await there.list(), []);
  assert.equal((await there.getSettings()).enabled, true);
  assert.equal((await here.list()).length, 1);
});

test("a change is the same entry at the next revision; a change made from an older revision is a conflict and writes nothing", async () => {
  const { of } = world();
  const alice = of("account:alice");
  const entry = await alice.create({ appliesTo: ["event.recommend"], category: "preference", content: "推荐活动时优先周末上午", structured: { dayPart: "morning", preferredDays: ["Sat", "Sun"], strength: "prefer" } });
  const changed = await alice.update(entry.memoryId, { content: "推荐活动时优先周末下午", expectedRevision: 1, structured: { dayPart: "afternoon", preferredDays: ["Sat", "Sun"], strength: "prefer" } });
  assert.equal(changed.memoryId, entry.memoryId);
  assert.equal(changed.revision, 2);
  assert.equal(changed.structured?.dayPart, "afternoon");
  assert.equal((await alice.list()).length, 1);
  await assert.rejects(alice.update(entry.memoryId, { content: "推荐活动时优先工作日晚上", expectedRevision: 1 }), (error: unknown) => error instanceof AgentMemoryRevisionConflictError && error.current === 2);
  await assert.rejects(alice.remove(entry.memoryId, { expectedRevision: 1 }), AgentMemoryRevisionConflictError);
  assert.equal((await alice.get(entry.memoryId))?.content, "推荐活动时优先周末下午");
  assert.equal((await alice.get(entry.memoryId))?.revision, 2);
});

test("an entry stored before AG14 reads as revision 1, in use and not classified, and can be changed", async () => {
  const { of, store } = world();
  await store.upsertRecord({
    collectionName: AGENT_MEMORY_COLLECTION, createdAt: "2026-07-01T00:00:00.000Z", evidenceIds: [], lifecycleState: "active",
    payload: { kind: "memory", memory: { category: "preference", content: "Keep replies short.", createdAt: "2026-07-01T00:00:00.000Z", memoryId: "old-1", source: "manual", updatedAt: "2026-07-01T00:00:00.000Z" } as never },
    recordId: "old-1", sourceId: "old-1", sourceType: "manual", updatedAt: "2026-07-01T00:00:00.000Z", workspaceId: agentMemoryScopeId("workspace:one", "account:alice"),
  });
  const alice = of("account:alice");
  const [old] = await alice.list();
  assert.equal(old.revision, 1);
  assert.equal(old.status, "active");
  assert.deepEqual(old.appliesTo, []);
  assert.equal(old.structured, null);
  const changed = await alice.update("old-1", { appliesTo: ["all"], expectedRevision: 1 });
  assert.equal(changed.revision, 2);
  assert.deepEqual(changed.appliesTo, ["all"]);
});

test("validity dates are days; an end before the start, an unknown task or an unknown category is refused", async () => {
  const { of } = world();
  const alice = of("account:alice");
  const entry = await alice.create({ category: "preference", content: "推荐活动时优先平日晚上", validUntil: "2026-09-30" });
  assert.equal(entry.validUntil, "2026-09-30");
  await assert.rejects(alice.create({ category: "preference", content: "x", validFrom: "2026-10-01", validUntil: "2026-09-30" }), /validUntil/u);
  await assert.rejects(alice.create({ category: "preference", content: "x", validUntil: "next week" }), /YYYY-MM-DD/u);
  await assert.rejects(alice.create({ appliesTo: ["everything" as never], category: "preference", content: "x" }), /Unknown Agent memory task/u);
  await assert.rejects(alice.create({ category: "habit" as never, content: "x" }), /Unknown Agent memory category/u);
  assert.equal((await alice.update(entry.memoryId, { validUntil: null })).validUntil, null);
});

test("a confirmed card applied twice makes one entry", async () => {
  const { of } = world();
  const alice = of("account:alice");
  const first = await alice.create({ category: "preference", content: "推荐活动时优先周末上午", memoryId: "memory:card-1", source: "conversation" });
  const again = await alice.create({ category: "preference", content: "推荐活动时优先周末上午", memoryId: "memory:card-1", source: "conversation" });
  assert.equal(again.memoryId, first.memoryId);
  assert.equal((await alice.list()).length, 1);
  assert.equal(await alice.version(), 1);
});
