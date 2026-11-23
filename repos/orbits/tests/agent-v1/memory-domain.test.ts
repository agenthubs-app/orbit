/**
 * agent-design AG14-1 / AG14-3 / AG14-4 (附录 B 个人记忆): the memory items of a card and their executors — nothing is
 * written before the click; what the executor writes is what the card showed; an update is the same entry at the next
 * revision and only from the revision the card showed; a delete leaves a mark and no words; applied twice is once.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { memoryWriteExecutors } from "../../features/agent-v1/domains/memory/apply";
import { MEMORY_CREATE, MEMORY_DELETE, MEMORY_UPDATE, memoryIntentOf, prepareMemoryOperation, type MemoryCardIntent } from "../../features/agent-v1/domains/memory/ops";
import { settleForget, settleRemember } from "../../features/agent-v1/domains/memory/turn";
import type { AgentMemoryRecordPayload } from "../../features/agent/memory/contract";
import { createStorageAgentMemoryService } from "../../features/agent/memory/service";
import { buildCardOperationList, cardCountTitle, cardIntentOf } from "../../features/agent/runtime/card-operations";
import { AgentExecutionPermanentError } from "../../features/agent/runtime/service";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

function world(accountId = "account:a") {
  const store = createMemoryLiveRecordStore<AgentMemoryRecordPayload>();
  let tick = Date.parse("2026-11-15T01:00:00.000Z");
  let next = 0;
  const of = (id: string) => createStorageAgentMemoryService({ actorId: id, id: () => `memory-${(next += 1)}`, now: () => new Date((tick += 1000)).toISOString(), store, workspaceId: "workspace:one" });
  const service = of(accountId);
  const executors = new Map(memoryWriteExecutors({ memory: service }).map((executor) => [executor.key, executor]));
  const run = (key: string, payload: Readonly<Record<string, unknown>>) => executors.get(key)!.execute(payload, { idempotencyKey: "card:r1:op1", now: "2026-11-15T01:10:00.000Z" } as never);
  return { of, run, service };
}

const freeze = async (intent: MemoryCardIntent) => (await buildCardOperationList(null, { actionId: "card:req-1", intents: [intent], locale: "zh", revision: 1 })).operations[0];

test("memory.create: the card is frozen without writing; the click writes exactly what the card showed, once", async () => {
  const { run, service } = world();
  const settled = settleRemember({ language: "zh", requestId: "req-1", snapshot: { ...(await service.snapshot()), settings: { allowConversationLearning: true, enabled: true, updatedAt: "" } }, today: "2026-11-15", words: "记住，以后给我推荐活动时优先周末上午。" });
  assert.equal(settled.kind, "card");
  const op = await freeze((settled as { intent: MemoryCardIntent }).intent);
  // Frozen, shown, not clicked: nothing is saved.
  assert.deepEqual(await service.list(), []);
  assert.equal(await service.version(), 0);
  assert.equal(op.operationType, "create_memory");
  assert.equal(op.executorKey, MEMORY_CREATE);
  assert.deepEqual(op.preconditions, { targetExists: false });
  const receipt = await run(MEMORY_CREATE, op.payload);
  const [saved] = await service.list();
  assert.equal(receipt.resultRef, `agentMemories:${saved.memoryId}`);
  assert.deepEqual({ appliesTo: saved.appliesTo, category: saved.category, content: saved.content, structured: saved.structured }, op.after);
  assert.equal(saved.revision, 1);
  assert.equal(saved.source, "conversation");
  assert.equal(saved.sourceMessageRef, "request:req-1");
  // The same confirmed card applied again (a retry): still one entry at revision 1.
  await run(MEMORY_CREATE, op.payload);
  assert.equal((await service.list()).length, 1);
  assert.equal(await service.version(), 1);
});

test("memory.update: the same entry before → after, written only from the revision the card showed", async () => {
  const { run, service } = world();
  const entry = await service.create({ appliesTo: ["event.recommend"], category: "preference", content: "推荐活动时优先周末上午", structured: { dayPart: "morning", preferredDays: ["Sat", "Sun"], strength: "prefer" } });
  const settled = settleRemember({ language: "zh", requestId: "req-2", snapshot: await service.snapshot(), today: "2026-11-15", words: "以后改成周末下午" });
  assert.equal(settled.kind, "card");
  const intent = (settled as { intent: MemoryCardIntent }).intent;
  assert.equal(intent.capability, MEMORY_UPDATE);
  const op = await freeze(intent);
  assert.deepEqual(op.before, { content: "推荐活动时优先周末上午", structured: { dayPart: "morning", preferredDays: ["Sat", "Sun"], strength: "prefer" } });
  assert.deepEqual(op.after, { content: "推荐活动时优先周末下午", structured: { dayPart: "afternoon", preferredDays: ["Sat", "Sun"], strength: "prefer" } });
  assert.deepEqual(op.preconditions, { targetExists: true, versionToken: "1" });
  assert.equal((await service.get(entry.memoryId))?.revision, 1, "nothing changes before the click");
  await run(MEMORY_UPDATE, op.payload);
  const changed = await service.get(entry.memoryId);
  assert.equal(changed?.revision, 2);
  assert.equal(changed?.content, "推荐活动时优先周末下午");
  assert.equal(changed?.structured?.dayPart, "afternoon");
  assert.deepEqual(changed?.appliesTo, ["event.recommend"]);
  assert.equal((await service.list()).length, 1, "the entry is changed, not another one added");
  // Applied again: our own write is recognised; the revision does not move twice.
  await run(MEMORY_UPDATE, op.payload);
  assert.equal((await service.get(entry.memoryId))?.revision, 2);
  // A card frozen from revision 1 after the entry moved on writes nothing.
  const stale = await freeze({ capability: MEMORY_UPDATE, expectedRevision: 1, set: { content: "推荐活动时优先工作日晚上" }, shown: { appliesTo: ["event.recommend"], category: "preference", content: "推荐活动时优先周末上午", structured: null }, targetId: entry.memoryId });
  await assert.rejects(run(MEMORY_UPDATE, stale.payload), (error: unknown) => error instanceof AgentExecutionPermanentError && /CARD_CONTENT_CHANGED/u.test(error.message));
  assert.equal((await service.get(entry.memoryId))?.content, "推荐活动时优先周末下午");
});

test("memory.delete: the card names the entry; the click forgets it at that revision; a card from an older revision deletes nothing", async () => {
  const { run, service } = world();
  const entry = await service.create({ appliesTo: ["event.recommend"], category: "preference", content: "推荐活动时优先周末上午", source: "conversation", sourceMessageRef: "request:req-1" });
  const settled = settleForget({ language: "zh", snapshot: await service.snapshot(), words: "忘掉我的活动时段偏好。" });
  const op = await freeze((settled as { intent: MemoryCardIntent }).intent);
  assert.equal(op.operationType, "delete_memory");
  assert.deepEqual(op.after, { status: "deleted" });
  // AG14 UI (board 3): the item names the entry; 用在 under it; what follows the click in one line.
  assert.equal(op.display?.record, "记忆「推荐活动时优先周末上午」");
  assert.equal(op.display?.change, "delete");
  assert.deepEqual(op.display?.rows.map((row) => `${row.label}:${row.after}`), ["用在:推荐活动时"]);
  assert.equal(op.display?.note, "删掉以后，新对话和以前的对话都不再用它。");
  assert.equal((await service.list()).length, 1, "nothing is deleted before the click");
  await run(MEMORY_DELETE, op.payload);
  assert.deepEqual(await service.list(), []);
  assert.deepEqual((await service.deletionMarks()).map((mark) => [mark.memoryId, mark.revision, mark.sourceMessageRef]), [[entry.memoryId, 2, "request:req-1"]]);
  // Applied again: already ours.
  await run(MEMORY_DELETE, op.payload);
  assert.equal(await service.version(), 2);
  // An entry changed since its card was shown is not deleted.
  const other = await service.create({ category: "constraint", content: "回答用日语" });
  await service.update(other.memoryId, { content: "回答用英语" });
  const old = await freeze({ capability: MEMORY_DELETE, expectedRevision: 1, shown: { appliesTo: [], category: "constraint", content: "回答用日语", structured: null }, targetId: other.memoryId });
  await assert.rejects(run(MEMORY_DELETE, old.payload), AgentExecutionPermanentError);
  assert.equal((await service.get(other.memoryId))?.content, "回答用英语");
});

test("an exception for this time is no card item: 「这次……」 never reaches settleRemember, and a card of another account's executor finds nothing", async () => {
  const { of, service } = world();
  const entry = await service.create({ category: "preference", content: "推荐活动时优先周末上午" });
  // Another account's executor (its own service) cannot change or delete this entry.
  const other = new Map(memoryWriteExecutors({ memory: of("account:b") }).map((executor) => [executor.key, executor]));
  const op = await freeze({ capability: MEMORY_DELETE, expectedRevision: 1, shown: { appliesTo: [], category: "preference", content: "推荐活动时优先周末上午", structured: null }, targetId: entry.memoryId });
  await assert.rejects(other.get(MEMORY_DELETE)!.execute(op.payload, { idempotencyKey: "k", now: "2026-11-15T01:10:00.000Z" } as never), AgentExecutionPermanentError);
  assert.equal((await service.get(entry.memoryId))?.revision, 1);
});

test("a regenerated card keeps its memory items; the card's count sentence says additions, changes and deletions", async () => {
  const create = await freeze({ capability: MEMORY_CREATE, set: { appliesTo: ["all"], category: "constraint", content: "回答用日语", structured: { replyLanguage: "ja" } }, sourceMessageRef: "request:req-1" });
  const update = await freeze({ capability: MEMORY_UPDATE, expectedRevision: 3, set: { content: "b" }, shown: { appliesTo: ["todo.plan"], category: "goal", content: "a", structured: null }, targetId: "m-1" });
  const remove = await freeze({ capability: MEMORY_DELETE, expectedRevision: 2, shown: { appliesTo: ["all"], category: "constraint", content: "回答用日语", structured: null }, targetId: "m-2" });
  for (const op of [create, update, remove]) {
    const again = await freeze(memoryIntentOf(op)!);
    assert.deepEqual({ after: again.after, before: again.before, display: again.display, payload: again.payload, preview: again.preview }, { after: op.after, before: op.before, display: op.display, payload: op.payload, preview: op.preview });
    assert.deepEqual(cardIntentOf(op), { ...memoryIntentOf(op), partId: "p1" });
  }
  assert.equal(cardCountTitle([update, create, remove], "zh"), "修改1项，新增1项，删除1项");
  assert.equal(create.display?.record, "记忆「回答用日语」");
  assert.equal(create.display?.rows[1].after, "一直遵守的");
  assert.equal(create.display?.rows[0].after, "所有回答");
  // AG14 UI (D1): a change shows the words before and after side by side.
  assert.equal(update.display?.record, "记忆");
  assert.deepEqual(update.display?.rows[0], { after: "b", before: "a", field: "content", label: "内容", sideBySide: true });
});

test("AG14 UI (D2): a limit in the words is the entry's last day and the card's 到期 row; none, no row", async () => {
  const { expiryIn } = await import("../../features/agent-v1/domains/memory/words");
  assert.equal(expiryIn("记住，这个月先优先周末上午", "2026-11-15"), "2026-11-30");
  assert.equal(expiryIn("记住，这周不要推荐晚上的", "2026-11-15"), "2026-11-15", "2026-11-15 is a Sunday: the week ends that day");
  assert.equal(expiryIn("记住，这周不要推荐晚上的", "2026-11-17"), "2026-11-22");
  assert.equal(expiryIn("记住，到12月31日之前都优先周末", "2026-11-15"), "2026-12-31");
  assert.equal(expiryIn("今年は週末を優先して", "2026-11-15"), "2026-12-31");
  assert.equal(expiryIn("Remember: this month, prefer weekend mornings", "2026-11-15"), "2026-11-30");
  assert.equal(expiryIn("记住，以后给我推荐活动时优先周末上午", "2026-11-15"), null);
  // The limit is the 到期 row, not part of the entry's words.
  const { withoutExpiryWords } = await import("../../features/agent-v1/domains/memory/words");
  assert.equal(withoutExpiryWords("这个月整理笔记时不要超过五条要点"), "整理笔记时不要超过五条要点");
  assert.equal(withoutExpiryWords("到12月31日之前都优先周末"), "都优先周末");
  assert.equal(withoutExpiryWords("this month, prefer weekend mornings"), "prefer weekend mornings");
  const { service: own } = world();
  await own.updateSettings({ allowConversationLearning: true });
  const settled = settleRemember({ language: "zh", requestId: "req-limit", snapshot: await own.snapshot(), today: "2026-11-20", words: "记住，这个月整理笔记时不要超过五条要点。" });
  assert.equal(settled.kind, "card");
  const set = (settled as { intent: { set: { content: string; validUntil?: string } } }).intent.set;
  assert.deepEqual([set.content, set.validUntil], ["整理笔记时不要超过五条要点", "2026-11-30"]);
  const dated = await freeze({ capability: MEMORY_CREATE, set: { appliesTo: ["event.recommend"], category: "preference", content: "推荐活动时优先周末上午", structured: null, validUntil: "2026-11-30" }, sourceMessageRef: "request:req-1" });
  assert.deepEqual(dated.display?.rows.map((row) => `${row.label}:${row.after}`), ["用在:推荐活动时", "归到:酌情参考的", "到期:11月30日（周一）"]);
  assert.equal((dated.payload as Record<string, unknown>).validUntil, "2026-11-30");
  const { run, service } = world();
  await run(MEMORY_CREATE, dated.payload);
  assert.equal((await service.list())[0]?.validUntil, "2026-11-30");
});
