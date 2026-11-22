/**
 * agent-design AG14-4 (设计稿 §6 "忘掉"; 附录 E): forgetting drops the words, keeps a mark, moves the memory version on;
 * the message an entry came from is never a source again; an answer written with an entry that has since changed or
 * gone is stale for a resumed conversation.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import type { AgentMemoryRecordPayload } from "../../features/agent/memory/contract";
import { forgottenSourceRequests, isForgottenSource, memorySourceRef, rememberMemoryUse, staleMemoryUses, MEMORY_USE_LIMIT } from "../../features/agent/memory/forget";
import { AGENT_MEMORY_COLLECTION, agentMemoryScopeId, createStorageAgentMemoryService } from "../../features/agent/memory/service";

function world() {
  const store = createMemoryLiveRecordStore<AgentMemoryRecordPayload>();
  let tick = Date.parse("2026-11-15T01:00:00.000Z");
  let next = 0;
  const service = createStorageAgentMemoryService({ actorId: "account:a", id: () => `memory-${(next += 1)}`, now: () => new Date((tick += 1000)).toISOString(), store, workspaceId: "workspace:one" });
  return { service, store };
}

test("forgetting keeps a mark and none of the words: not in the entry, not in the stored row, not in its search text", async () => {
  const { service, store } = world();
  const entry = await service.create({ appliesTo: ["event.recommend"], category: "preference", content: "推荐活动时优先周末上午", source: "conversation", sourceMessageRef: memorySourceRef("req-1"), structured: { dayPart: "morning", preferredDays: ["Sat", "Sun"], strength: "prefer" } });
  await service.remove(entry.memoryId, { expectedRevision: 1 });
  assert.deepEqual(await service.list(), []);
  assert.equal(await service.get(entry.memoryId), null);
  const marks = await service.deletionMarks();
  assert.equal(marks.length, 1);
  assert.deepEqual({ ...marks[0], deletedAt: "" }, { appliesTo: ["event.recommend"], category: "preference", deletedAt: "", memoryId: entry.memoryId, revision: 2, sourceMessageRef: "request:req-1" });
  const rows = await store.listRecords({ collectionName: AGENT_MEMORY_COLLECTION, includeDeleted: true, limit: "unbounded", workspaceId: agentMemoryScopeId("workspace:one", "account:a") });
  assert.equal(rows.length, 1);
  const stored = JSON.stringify(rows[0]);
  assert.equal(stored.includes("周末上午"), false);
  assert.equal(stored.includes("morning"), false);
  assert.equal(stored.includes("\"status\":\"deleted\""), true);
});

test("the memory version moves with every creation, change and deletion, and never goes back", async () => {
  const { service } = world();
  assert.equal(await service.version(), 0);
  const first = await service.create({ category: "preference", content: "a" });
  assert.equal(await service.version(), 1);
  await service.update(first.memoryId, { content: "b" });
  assert.equal(await service.version(), 2);
  const second = await service.create({ category: "constraint", content: "c" });
  assert.equal(await service.version(), 3);
  await service.remove(first.memoryId);
  assert.equal(await service.version(), 4);
  await service.remove(second.memoryId);
  assert.equal(await service.version(), 5);
});

test("a deleted entry cannot be changed, deleted again or brought back under its id", async () => {
  const { service } = world();
  const entry = await service.create({ category: "preference", content: "推荐活动时优先周末上午", memoryId: "memory:card-1" });
  await service.remove(entry.memoryId);
  await assert.rejects(service.update(entry.memoryId, { content: "推荐活动时优先周末上午" }), /was not found/u);
  await assert.rejects(service.remove(entry.memoryId), /was not found/u);
  await assert.rejects(service.create({ category: "preference", content: "推荐活动时优先周末上午", memoryId: "memory:card-1" }), /already exists/u);
  assert.deepEqual(await service.list(), []);
});

test("the message a deleted entry came from is not a source again; another message is", async () => {
  const { service } = world();
  const entry = await service.create({ category: "preference", content: "推荐活动时优先周末上午", source: "conversation", sourceMessageRef: memorySourceRef("req-1") });
  assert.equal(isForgottenSource(await service.deletionMarks(), memorySourceRef("req-1")), false);
  await service.remove(entry.memoryId);
  const marks = await service.deletionMarks();
  assert.equal(isForgottenSource(marks, memorySourceRef("req-1")), true);
  assert.equal(isForgottenSource(marks, memorySourceRef("req-2")), false);
  assert.deepEqual([...forgottenSourceRequests(marks)], ["req-1"]);
  // An entry typed on the settings page has no source message: its deletion marks none.
  const typed = await service.create({ category: "constraint", content: "回答用日语" });
  await service.remove(typed.memoryId);
  assert.deepEqual([...forgottenSourceRequests(await service.deletionMarks())], ["req-1"]);
});

test("an answer that used an entry is stale once that entry is deleted or changed; one that used unchanged entries is not", async () => {
  const { service } = world();
  const kept = await service.create({ category: "constraint", content: "不要推荐晚上的活动" });
  const changed = await service.create({ category: "preference", content: "推荐活动时优先周末上午" });
  const gone = await service.create({ category: "preference", content: "推荐活动时优先器物" });
  let uses = rememberMemoryUse(undefined, { memories: [{ memoryId: kept.memoryId, revision: 1 }], requestId: "req-kept" });
  uses = rememberMemoryUse(uses, { memories: [{ memoryId: kept.memoryId, revision: 1 }, { memoryId: changed.memoryId, revision: 1 }], requestId: "req-changed" });
  uses = rememberMemoryUse(uses, { memories: [{ memoryId: gone.memoryId, revision: 1 }], requestId: "req-gone" });
  uses = rememberMemoryUse(uses, { memories: [], requestId: "req-none" });
  assert.equal(uses.length, 3);
  const current = async () => [...(await service.list()), ...(await service.deletionMarks()).map((mark) => ({ memoryId: mark.memoryId, revision: mark.revision, status: "deleted" as const }))];
  assert.deepEqual([...staleMemoryUses(uses, await current())], []);
  await service.update(changed.memoryId, { content: "推荐活动时优先周末下午" });
  await service.remove(gone.memoryId);
  assert.deepEqual([...staleMemoryUses(uses, await current())].sort(), ["req-changed", "req-gone"]);
});

test("a conversation keeps the uses of its latest answers only", () => {
  let uses = rememberMemoryUse(undefined, { memories: [{ memoryId: "m", revision: 1 }], requestId: "req-0" });
  for (let index = 1; index <= MEMORY_USE_LIMIT + 5; index += 1) uses = rememberMemoryUse(uses, { memories: [{ memoryId: "m", revision: 1 }], requestId: `req-${index}` });
  assert.equal(uses.length, MEMORY_USE_LIMIT);
  assert.equal(uses[uses.length - 1].requestId, `req-${MEMORY_USE_LIMIT + 5}`);
  // The same request written again replaces its own line.
  assert.equal(rememberMemoryUse(uses, { memories: [{ memoryId: "m", revision: 2 }], requestId: `req-${MEMORY_USE_LIMIT + 5}` }).length, MEMORY_USE_LIMIT);
});
