/**
 * agent-design AG14-2 (设计稿 §6 "记忆分两种取法"): standing rules are loaded every time in their range and take no place;
 * the others are taken for their task only, at most 5; expired entries are not taken; with no match the list is empty;
 * with 「回答时参考这些」 off nothing is taken.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import type { AgentMemoryRecordPayload, CreateAgentMemoryInput } from "../../features/agent/memory/contract";
import { RECALL_CONSTRAINT_LIMIT, RECALL_RELEVANT_LIMIT, recallFor, recallRefs } from "../../features/agent/memory/recall";
import { createStorageAgentMemoryService } from "../../features/agent/memory/service";

const NOW = "2026-11-15T01:00:00.000Z";

async function serviceWith(entries: (CreateAgentMemoryInput & { memoryId: string })[], accountId = "account:a") {
  const store = createMemoryLiveRecordStore<AgentMemoryRecordPayload>();
  let tick = Date.parse("2026-11-01T00:00:00.000Z");
  const make = (id: string) => createStorageAgentMemoryService({ actorId: id, now: () => new Date((tick += 1000)).toISOString(), store, workspaceId: "workspace:one" });
  const service = make(accountId);
  for (const entry of entries) await service.create(entry);
  return { make, service };
}

const ids = (items: readonly { memoryId: string }[]) => items.map((item) => item.memoryId).sort();

/** The regular account's twelve entries (eval world regular-v1). */
const REGULAR: (CreateAgentMemoryInput & { memoryId: string })[] = [
  { appliesTo: ["event.recommend"], category: "constraint", content: "不要推荐晚上 18 点以后开始的活动", memoryId: "RMM01" },
  { appliesTo: ["all"], category: "constraint", content: "回答里的日期都带上星期", memoryId: "RMM02" },
  { appliesTo: ["contact.recommend"], category: "constraint", content: "不要把没和我做过生意的人推荐成供应方", memoryId: "RMM03" },
  { appliesTo: ["event.recommend"], category: "preference", content: "推荐活动时优先和器物、茶有关的", memoryId: "RMM04", structured: { strength: "prefer", topics: ["器物", "茶"] } },
  { appliesTo: ["event.recommend"], category: "preference", content: "推荐活动时优先平日晚上", memoryId: "RMM05", validUntil: "2026-09-30" },
  { appliesTo: ["memo.summarize"], category: "preference", content: "整理笔记时先列结论再列细节", memoryId: "RMM06" },
  { appliesTo: ["todo.plan"], category: "preference", content: "安排待办时把要跑邮局的事排在上午", memoryId: "RMM07" },
  { appliesTo: ["contact.recommend"], category: "preference", content: "推荐联系人时优先半年内见过面的", memoryId: "RMM08" },
  { appliesTo: ["contact.recommend"], category: "goal", content: "明年春天前找到两家新的窑", memoryId: "RMM09" },
  { appliesTo: ["todo.plan"], category: "goal", content: "年底前把包材成本降一成", memoryId: "RMM10" },
  { appliesTo: ["contact.recommend", "memo.summarize"], category: "identity", content: "我经营一个进口日本茶器的小品牌", memoryId: "RMM11" },
  { appliesTo: ["schedule.plan"], category: "identity", content: "我常驻东京，每月去一次上海", memoryId: "RMM12" },
];

test("recommending events: the rule for this task, the rule for every task and the preference for it; the expired one is not taken", async () => {
  const { service } = await serviceWith(REGULAR);
  const recall = await recallFor({ accountId: "account:a", now: NOW, service, task: "event.recommend" });
  assert.equal(recall.enabled, true);
  assert.deepEqual(ids(recall.rules), ["RMM01", "RMM02"]);
  assert.deepEqual(ids(recall.relevant), ["RMM04"]);
  assert.equal(recall.rules.find((item) => item.memoryId === "RMM02")?.everyTask, true);
  assert.equal(recall.rules.find((item) => item.memoryId === "RMM01")?.everyTask, false);
  assert.deepEqual(recallRefs(recall).map((item) => item.revision), [1, 1, 1]);
});

test("a task with no kind (asking for the open to-dos): only the rules for every task; no preference is taken", async () => {
  const { service } = await serviceWith(REGULAR);
  const recall = await recallFor({ accountId: "account:a", now: NOW, service, task: null });
  assert.deepEqual(ids(recall.rules), ["RMM02"]);
  assert.deepEqual(recall.relevant, []);
});

test("no entry applies: both lists are empty", async () => {
  const { service } = await serviceWith(REGULAR.filter((entry) => entry.memoryId !== "RMM02" && !entry.appliesTo?.includes("schedule.plan")));
  const recall = await recallFor({ accountId: "account:a", now: NOW, service, task: "schedule.plan" });
  assert.deepEqual(recall.rules, []);
  assert.deepEqual(recall.relevant, []);
});

test("「回答时参考这些」 off: nothing is taken, rules included; the entries stay", async () => {
  const { service } = await serviceWith(REGULAR);
  await service.updateSettings({ enabled: false });
  const recall = await recallFor({ accountId: "account:a", now: NOW, service, task: "event.recommend" });
  assert.equal(recall.enabled, false);
  assert.deepEqual(recall.rules, []);
  assert.deepEqual(recall.relevant, []);
  assert.equal((await service.list()).length, 12);
});

test("rules take no place among the others: five preferences and every rule in range come back", async () => {
  const preferences = Array.from({ length: 8 }, (_, index): CreateAgentMemoryInput & { memoryId: string } => ({ appliesTo: ["event.recommend"], category: "preference", content: `偏好 ${index + 1}`, memoryId: `P${index + 1}` }));
  const rules = Array.from({ length: 7 }, (_, index): CreateAgentMemoryInput & { memoryId: string } => ({ appliesTo: [index % 2 ? "all" : "event.recommend"], category: "constraint", content: `规矩 ${index + 1}`, memoryId: `C${index + 1}` }));
  const { service } = await serviceWith([...preferences, ...rules]);
  const recall = await recallFor({ accountId: "account:a", now: NOW, service, task: "event.recommend" });
  assert.equal(recall.relevant.length, RECALL_RELEVANT_LIMIT);
  assert.equal(recall.rules.length, 7);
  // The latest five (the list is by the time of the last change).
  assert.deepEqual(ids(recall.relevant), ["P4", "P5", "P6", "P7", "P8"]);
});

test("at most 20 rules are loaded for one account and workspace", async () => {
  const rules = Array.from({ length: 23 }, (_, index): CreateAgentMemoryInput & { memoryId: string } => ({ appliesTo: ["all"], category: "constraint", content: `规矩 ${index + 1}`, memoryId: `C${String(index + 1).padStart(2, "0")}` }));
  const { service } = await serviceWith(rules);
  const recall = await recallFor({ accountId: "account:a", now: NOW, service });
  assert.equal(recall.rules.length, RECALL_CONSTRAINT_LIMIT);
});

test("validity is by day in the user's time zone: not yet valid and expired entries are left out, the last valid day counts", async () => {
  const { service } = await serviceWith([
    { appliesTo: ["event.recommend"], category: "preference", content: "还没开始", memoryId: "FUTURE", validFrom: "2026-11-16" },
    { appliesTo: ["event.recommend"], category: "preference", content: "今天到期", memoryId: "LASTDAY", validUntil: "2026-11-15" },
    { appliesTo: ["event.recommend"], category: "constraint", content: "昨天到期", memoryId: "GONE", validUntil: "2026-11-14" },
  ]);
  // 2026-11-15 10:00 in Tokyo.
  const recall = await recallFor({ accountId: "account:a", now: NOW, service, task: "event.recommend", timeZone: "Asia/Tokyo" });
  assert.deepEqual(ids(recall.relevant), ["LASTDAY"]);
  assert.deepEqual(recall.rules, []);
  // The same instant is still 2026-11-14 in Honolulu: the entry that ends that day still counts there.
  const earlier = await recallFor({ accountId: "account:a", now: NOW, service, task: "event.recommend", timeZone: "Pacific/Honolulu" });
  assert.deepEqual(ids(earlier.rules), ["GONE"]);
});

test("an entry that was never classified is used only where its own words name the task; never as a rule for every task", async () => {
  const { service } = await serviceWith([
    { category: "preference", content: "推荐活动时优先周末上午", memoryId: "OLD-EVENT" },
    { category: "constraint", content: "Keep replies short.", memoryId: "OLD-RULE" },
  ]);
  assert.deepEqual(ids((await recallFor({ accountId: "account:a", now: NOW, service, task: "event.recommend" })).relevant), ["OLD-EVENT"]);
  const todo = await recallFor({ accountId: "account:a", now: NOW, service, task: "todo.plan" });
  assert.deepEqual(todo.relevant, []);
  assert.deepEqual(todo.rules, []);
});

test("another account recalls nothing of these entries; a deleted entry is not recalled and the version moved", async () => {
  const { make, service } = await serviceWith(REGULAR);
  const other = await recallFor({ accountId: "account:b", now: NOW, service: make("account:b"), task: "event.recommend" });
  assert.deepEqual(recallRefs(other), []);
  assert.equal(other.memoryVersion, 0);
  const before = await recallFor({ accountId: "account:a", now: NOW, service, task: "event.recommend" });
  await service.remove("RMM04");
  const after = await recallFor({ accountId: "account:a", now: NOW, service, task: "event.recommend" });
  assert.deepEqual(after.relevant, []);
  assert.equal(after.memoryVersion, before.memoryVersion + 1);
});
