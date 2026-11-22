/**
 * AG21c R34 (W): "already saved" failed when a topic was written as one compound word — saved [木工, 体验], said 「木工体验」 —
 * so a second create card was made and stayed waiting beside a later update card for the same entry. Two topic sets are now
 * the same when they cover the same words once a compound is split against the other side's words; and a create card still
 * waiting when the same entry is saved or changed by a later card is not applied (it was replaced). Own sentences.
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { AgentMemoryRecordPayload } from "../../features/agent/memory/contract";
import { createStorageAgentMemoryService } from "../../features/agent/memory/service";
import { memoryWriteExecutors } from "../../features/agent-v1/domains/memory/apply";
import { MEMORY_CREATE } from "../../features/agent-v1/domains/memory/ops";
import { sameTopics, settleRemember } from "../../features/agent-v1/domains/memory/turn";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

const NOW = "2026-11-21T01:00:00.000Z";

async function memoryWith(entries: { content: string; topics?: string[]; appliesTo?: string[] }[]) {
  const store = createMemoryLiveRecordStore<AgentMemoryRecordPayload>();
  let next = 0;
  const service = createStorageAgentMemoryService({ actorId: "account:w", id: () => `memory-${(next += 1)}`, now: () => NOW, store, workspaceId: "workspace:w" });
  for (const entry of entries) await service.create({ appliesTo: (entry.appliesTo ?? ["event.recommend"]) as never, category: "preference", content: entry.content, structured: entry.topics ? { topics: entry.topics } : null });
  const snapshot = { ...(await service.snapshot()), settings: { allowConversationLearning: true, enabled: true, updatedAt: "" } };
  return { service, snapshot };
}

test("R34 topic sets are the same when a compound on one side splits into the other side's words (zh, ja, en)", () => {
  assert.ok(sameTopics(["木工", "体验"], ["木工体验"]));
  assert.ok(sameTopics(["陶芸体験"], ["体験", "陶芸"]));
  assert.ok(sameTopics(["letterpress", "printing"], ["printing", "letterpress"]));
  assert.ok(sameTopics(["香道"], ["香道"]));
  assert.ok(!sameTopics(["木工"], ["木工体验"]), "a compound with a word the other side lacks is another topic");
  assert.ok(!sameTopics(["陶芸"], ["漆芸"]));
  assert.ok(!sameTopics([], ["陶芸"]));
});

test("R34 saved topics [木工, 体验] and 「优先木工体验相关的」: already saved, no card; the same in ja and en", async () => {
  const zh = await memoryWith([{ content: "推荐活动时优先木工和体验相关的", topics: ["木工", "体验"] }]);
  const said = settleRemember({ language: "zh", requestId: "req-w1", snapshot: zh.snapshot, today: "2026-11-21", words: "记住，推荐活动时优先木工体验相关的" });
  assert.deepEqual([said.kind, (said as { reason?: string }).reason], ["line", "memory_already_saved"]);
  const ja = await memoryWith([{ content: "イベントは陶芸と体験を優先", topics: ["陶芸", "体験"] }]);
  const jaSaid = settleRemember({ language: "ja", requestId: "req-w2", snapshot: ja.snapshot, today: "2026-11-21", words: "覚えておいて。イベントは陶芸体験を優先して" });
  assert.equal((jaSaid as { reason?: string }).reason, "memory_already_saved", JSON.stringify(jaSaid));
  // Another topic is still a new entry.
  const other = settleRemember({ language: "zh", requestId: "req-w3", snapshot: zh.snapshot, today: "2026-11-21", words: "记住，推荐活动时优先漆艺相关的" });
  assert.equal(((other as { intent?: { capability: string } }).intent)?.capability, MEMORY_CREATE);
});

test("R34 a create card still waiting when the same entry was saved meanwhile is not applied (no second entry)", async () => {
  const { service } = await memoryWith([{ content: "推荐活动时优先香道和茶席相关的", topics: ["香道", "茶席"] }]);
  const [create] = memoryWriteExecutors({ memory: service });
  await assert.rejects(create.execute({ appliesTo: ["event.recommend"], category: "preference", content: "推荐活动时优先香道茶席相关的", memoryId: "memory-from-card" }, {} as never), /already saved/u);
  assert.equal((await service.list()).length, 1);
  // A new topic is written as usual.
  await create.execute({ appliesTo: ["event.recommend"], category: "preference", content: "推荐活动时优先篆刻相关的", memoryId: "memory-new" }, {} as never);
  assert.equal((await service.list()).length, 2);
});
