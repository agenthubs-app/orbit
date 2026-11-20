/**
 * Integration of agent-design AG14 and AG15 (设计稿 §5.3 with §6: 约束在用户不在场时也生效).
 *
 * - The recall a scheduled rule uses is AG14's recallFor(), called with the rule owner's canonical account and the
 *   workspace and no session.
 * - A rule run applies what was recalled the way a conversation turn does (the same classification,
 *   domains/memory/turn.ts rankMemoryFrom): the recall's own `rules` and `relevant`, not a second filter by the
 *   entry's words. The rules for every task apply too; a run never writes memory.
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { AgentAutomation, AgentRuleSpec } from "../../features/agent/automations/contract";
import { configuredRuleRecall } from "../../features/agent/automations/recall-seam";
import { runRulePeriod, type RuleRunDeps } from "../../features/agent/automations/run-rule";
import type { AgentMemoryRecordPayload, CreateAgentMemoryInput } from "../../features/agent/memory/contract";
import { createStorageAgentMemoryService } from "../../features/agent/memory/service";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { ACTOR, fnWorld } from "../agent-v1/functions-kit";
import { captureTrace, recordAccessOf } from "../agent-v1/graph-kit";
import { access, graded, judgeStub } from "../agent-v1/judgment-kit";
import { FRIDAY_9, ruleSpec } from "./agent-automation-kit";

const WORKSPACE = "workspace:one";
const NOW = "2026-11-16T00:00:00.000Z";

type Entry = CreateAgentMemoryInput & { memoryId: string };

/** One store for every account, as in the product; a service per account and workspace. */
function memoryWorld() {
  const store = createMemoryLiveRecordStore<AgentMemoryRecordPayload>();
  let tick = Date.parse("2026-11-01T00:00:00.000Z");
  const asked: string[] = [];
  const serviceOf = (accountId: string, workspaceId = WORKSPACE) => createStorageAgentMemoryService({ actorId: accountId, now: () => new Date((tick += 1000)).toISOString(), store, workspaceId });
  return {
    asked,
    async save(accountId: string, entries: Entry[]) {
      for (const entry of entries) await serviceOf(accountId).create(entry);
    },
    serviceFor(accountId: string, workspaceId: string) {
      asked.push(`${accountId}@${workspaceId}`);
      return serviceOf(accountId, workspaceId);
    },
    serviceOf,
  };
}

/** The large account's hand-written entries (eval world large-v1). */
const LARGE: Entry[] = [
  { appliesTo: ["event.recommend"], category: "constraint", content: "不要推荐晚上的活动（18 点以后开始的）", memoryId: "LMM01" },
  { appliesTo: ["all"], category: "constraint", content: "时间一律写 24 小时制", memoryId: "LMM02" },
  { appliesTo: ["event.recommend"], category: "preference", content: "推荐活动时优先半导体和机器人主题", memoryId: "LMM03", structured: { strength: "prefer", topics: ["半导体", "机器人"] } },
  { appliesTo: ["event.recommend"], category: "preference", content: "推荐活动时优先周末", memoryId: "LMM04", validUntil: "2026-08-31" },
  { appliesTo: ["contact.recommend"], category: "constraint", content: "推荐联系人时每个人都写明公司", memoryId: "LMM05" },
  { appliesTo: ["contact.recommend", "memo.summarize"], category: "identity", content: "我是做半导体和机器人方向的猎头顾问", memoryId: "LMM06" },
  { appliesTo: ["contact.recommend"], category: "goal", content: "年底前认识三位功率器件方向的技术负责人", memoryId: "LMM07" },
  { appliesTo: ["todo.plan"], category: "preference", content: "安排面试相关的待办时尽量放在上午", memoryId: "LMM08" },
];

const ids = (items: readonly { memoryId: string }[]) => items.map((item) => item.memoryId).sort();

/* ── the seam: recallFor() with the owner's account and workspace ─────── */

test("a rule recalls its owner's saved memory by account and workspace: the standing rules in range, and the entries for that kind of task", async () => {
  const world = memoryWorld();
  await world.save("account:large", LARGE);
  await world.save("account:other", [{ appliesTo: ["contact.recommend"], category: "constraint", content: "推荐联系人时不要写公司", memoryId: "OTHER1" }]);
  const recall = configuredRuleRecall({ serviceFor: world.serviceFor });

  const contacts = await recall({ actorId: "account:large", domain: "contact", now: NOW, workspaceId: WORKSPACE });
  assert.deepEqual(world.asked, [`account:large@${WORKSPACE}`], "read for the rule's owner in the rule's workspace; nothing else is needed");
  assert.equal(contacts.enabled, true);
  assert.deepEqual(ids(contacts.rules), ["LMM02", "LMM05"], "the rule for every task and the rule for picking contacts");
  assert.deepEqual(contacts.rules.find((item) => item.memoryId === "LMM02")?.everyTask, true);
  assert.deepEqual(ids(contacts.relevant), ["LMM06", "LMM07"], "what applies to picking contacts; nothing of another task or account");

  const events = await recall({ actorId: "account:large", domain: "event", now: NOW, workspaceId: WORKSPACE });
  assert.deepEqual([ids(events.rules), ids(events.relevant)], [["LMM01", "LMM02"], ["LMM03"]], "the expired preference is not taken");

  const todos = await recall({ actorId: "account:large", domain: "todo", now: NOW, workspaceId: WORKSPACE });
  assert.deepEqual([ids(todos.rules), ids(todos.relevant)], [["LMM02"], ["LMM08"]]);

  assert.deepEqual(ids((await recall({ actorId: "account:other", domain: "contact", now: NOW, workspaceId: WORKSPACE })).rules), ["OTHER1"], "each owner gets its own entries only");
  const nobody = await recall({ actorId: "account:nobody", domain: "contact", now: NOW, workspaceId: WORKSPACE });
  assert.deepEqual([nobody.rules, nobody.relevant], [[], []], "an account with nothing saved recalls nothing");
});

test("with 「回答时参考这些」 off, or after an entry is forgotten, the recall no longer has it", async () => {
  const world = memoryWorld();
  await world.save("account:large", LARGE);
  const recall = configuredRuleRecall({ serviceFor: world.serviceFor });
  const service = world.serviceOf("account:large");

  await service.remove("LMM05");
  const after = await recall({ actorId: "account:large", domain: "contact", now: NOW, workspaceId: WORKSPACE });
  assert.deepEqual([ids(after.rules), ids(after.relevant)], [["LMM02"], ["LMM06", "LMM07"]], "read at the moment of the run, never from a copy");

  await service.updateSettings({ enabled: false });
  const off = await recall({ actorId: "account:large", domain: "contact", now: NOW, workspaceId: WORKSPACE });
  assert.deepEqual([off.enabled, off.rules, off.relevant], [false, [], []], "the switch is off: standing rules included");
});

test("an entry's last day is counted in the rule's own time zone", async () => {
  const world = memoryWorld();
  await world.save("account:a", [{ appliesTo: ["event.recommend"], category: "constraint", content: "不要推荐晚上的活动", memoryId: "M1", validUntil: "2026-11-20" }]);
  const recall = configuredRuleRecall({ serviceFor: world.serviceFor });
  // 2026-11-20 16:30 UTC is the 21st in Tokyo and still the 20th in Los Angeles.
  const late = "2026-11-20T16:30:00.000Z";
  assert.deepEqual((await recall({ actorId: "account:a", domain: "event", now: late, timeZone: "Asia/Tokyo", workspaceId: WORKSPACE })).rules, []);
  assert.deepEqual(ids((await recall({ actorId: "account:a", domain: "event", now: late, timeZone: "America/Los_Angeles", workspaceId: WORKSPACE })).rules), ["M1"]);
});

test("a memory read that fails is traced and the run goes on without memory", async () => {
  const trace = captureTrace();
  try {
    const recall = configuredRuleRecall({ serviceFor: () => ({ snapshot: async () => { throw new Error("memory store unavailable"); } }) });
    const none = await recall({ actorId: "account:a", domain: "event", now: NOW, workspaceId: WORKSPACE });
    assert.deepEqual([none.rules, none.relevant], [[], []]);
    const errors = trace.events.filter((event) => event.type === "read.error");
    assert.equal(errors.length, 1);
    assert.equal(errors[0].where, "rule.recall");
    assert.match(String(errors[0].error), /memory store unavailable/u);
  } finally {
    trace.restore();
  }
});

/* ── a rule run with nobody present ───────────────────────────────────── */

const at = (value: string) => new Date(value).toISOString();
const FRIDAY = at("2026-11-20T09:00:00+09:00");

function automation(rule: Partial<AgentRuleSpec> = {}): AgentAutomation {
  return { automationId: "rule:1", capabilityId: "events.recommend", createdAt: "2026-11-15T01:00:00.000Z", delivery: "in_app", handledEventIds: [], instruction: "x", lastRun: null, nextRunAt: FRIDAY, revisions: [], rule: ruleSpec(rule), runCount: 0, status: "active", title: "每周五挑三场周末活动", trigger: { kind: "schedule", schedule: FRIDAY_9 }, updatedAt: "2026-11-15T01:00:00.000Z", version: 1 };
}

/** One period of the weekend rule of ACTOR over the FN world, with this memory world behind the seam. */
async function run(world: ReturnType<typeof memoryWorld>, rule: Partial<AgentRuleSpec> = {}, extra: Partial<RuleRunDeps> = {}) {
  const result = await runRulePeriod({ now: () => at("2026-11-20T09:10:00+09:00"), recall: configuredRuleRecall({ serviceFor: world.serviceFor }), records: recordAccessOf(fnWorld()), workspaceId: WORKSPACE, ...extra }, { automation: automation(rule), ownerId: ACTOR, scheduledAt: FRIDAY, told: new Set() });
  return { ...result, listed: result.items.map((item) => item.id.replace("event:", "")) };
}

// Without memory the weekend rule lists e101 (Sat 10:00), e104 (Sat 19:00), e102 (Sun 9:30); e105 (Sun 10:00) is cut by the count.

test("the owner's standing rule for this kind of task is applied, named, and traced by id and revision only", async () => {
  const world = memoryWorld();
  await world.save(ACTOR, [
    { appliesTo: ["event.recommend"], category: "constraint", content: "不要推荐晚上的活动", memoryId: "memory:evening" },
    { appliesTo: ["contact.recommend"], category: "constraint", content: "不要推荐晚上的活动，联系人每位都写明公司", memoryId: "memory:contacts-only" },
  ]);
  await world.save("actor:b", [{ appliesTo: ["event.recommend"], category: "constraint", content: "不要推荐上午的活动", memoryId: "memory:b-morning" }]);
  const trace = captureTrace();
  try {
    const result = await run(world);
    assert.equal(result.outcome, "computed");
    assert.deepEqual(result.listed, ["e101", "e102", "e105"], "the Saturday evening event is removed by the owner's rule; the other account's rule about mornings changes nothing");
    assert.match(result.text, /同时按你让我记住的这条来办：不要推荐晚上的活动。/u);
    assert.doesNotMatch(result.text, /写明公司|不要推荐上午/u, "an entry that applies to another kind of task, or belongs to another account, is not applied to this one");
    assert.deepEqual(world.asked, [`${ACTOR}@${WORKSPACE}`]);
    const recalled = trace.events.filter((event) => event.type === "memory.recall");
    assert.equal(recalled.length, 1);
    assert.deepEqual(recalled[0].memories, ["memory:evening"]);
    assert.deepEqual(recalled[0].entries, [{ memoryId: "memory:evening", revision: 1 }]);
    assert.equal(recalled[0].where, "rule");
    assert.doesNotMatch(JSON.stringify(recalled[0]), /不要推荐晚上/u, "the trace holds the entry's id, never its words");
  } finally {
    trace.restore();
  }
});

test("a rule for every task shapes a rule run too: its time condition removes candidates, its reply language is the language of the result", async () => {
  const evening = memoryWorld();
  await evening.save(ACTOR, [{ appliesTo: ["all"], category: "constraint", content: "晚上的一律不要", memoryId: "memory:all-evening", structured: { dayPart: "evening", strength: "avoid" } }]);
  const first = await run(evening);
  assert.deepEqual(first.listed, ["e101", "e102", "e105"], "a rule for every task is a hard condition of the run");
  assert.match(first.text, /同时按你让我记住的这条来办：晚上的一律不要。/u);

  const japanese = memoryWorld();
  await japanese.save(ACTOR, [{ appliesTo: ["all"], category: "constraint", content: "回答用日语", memoryId: "memory:ja" }]);
  const second = await run(japanese);
  assert.deepEqual(second.listed, ["e101", "e104", "e102"]);
  assert.match(second.text, /^定期タスク「每周五挑三场周末活动」/u, "the result is written in the language the user's rule asks for, not the one the task was set up in");
  assert.match(second.text, /選び方：/u);
  assert.doesNotMatch(second.text, /依据：|这一期的结果/u);
});

test("an entry classified only by what it applies to is applied although its words do not name the kind of record", async () => {
  const world = memoryWorld();
  // Saved from the settings page with 用在：推荐活动; the words themselves say neither 活动 nor event.
  await world.save(ACTOR, [{ appliesTo: ["event.recommend"], category: "constraint", content: "晚上的不要", memoryId: "memory:terse", structured: { dayPart: "evening", strength: "avoid" } }]);
  const result = await run(world);
  assert.deepEqual(result.listed, ["e101", "e102", "e105"]);
  assert.match(result.text, /同时按你让我记住的这条来办：晚上的不要。/u);
});

test("an entry that applies only to another kind of task leaves the run as it is", async () => {
  const world = memoryWorld();
  await world.save(ACTOR, [
    { appliesTo: ["contact.recommend"], category: "constraint", content: "不要推荐晚上的活动", memoryId: "memory:contacts", structured: { dayPart: "evening", strength: "avoid" } },
    { appliesTo: ["todo.plan"], category: "preference", content: "安排活动相关的待办时尽量放在上午", memoryId: "memory:todos" },
  ]);
  const trace = captureTrace();
  try {
    const result = await run(world);
    assert.deepEqual(result.listed, ["e101", "e104", "e102"], "the evening event stays: the entry is about picking contacts");
    assert.doesNotMatch(result.text, /让我记住/u);
    assert.deepEqual(trace.events.filter((event) => event.type === "memory.recall").flatMap((event) => event.memories as string[]), []);
  } finally {
    trace.restore();
  }
});

test("with 「回答时参考这些」 off a rule run applies nothing: no condition, no language, no line, no entry in the trace", async () => {
  const world = memoryWorld();
  await world.save(ACTOR, [
    { appliesTo: ["event.recommend"], category: "constraint", content: "不要推荐晚上的活动", memoryId: "memory:evening" },
    { appliesTo: ["all"], category: "constraint", content: "回答用日语", memoryId: "memory:ja" },
    { appliesTo: ["event.recommend"], category: "preference", content: "推荐活动时优先出版主题", memoryId: "memory:topic", structured: { strength: "prefer", topics: ["出版"] } },
  ]);
  await world.serviceOf(ACTOR).updateSettings({ enabled: false });
  const trace = captureTrace();
  try {
    const result = await run(world);
    assert.deepEqual(result.listed, ["e101", "e104", "e102"]);
    assert.match(result.text, /^定时任务「每周五挑三场周末活动」/u);
    assert.doesNotMatch(result.text, /让我记住|覚えておく/u);
    const recalled = trace.events.filter((event) => event.type === "memory.recall");
    assert.deepEqual(recalled.flatMap((event) => event.memories as string[]), []);
    assert.ok(recalled.every((event) => event.enabled === false));
  } finally {
    trace.restore();
  }
});

test("a saved preference for a topic only ranks, and gives way when the task has its own basis", async () => {
  const world = memoryWorld();
  await world.save(ACTOR, [{ appliesTo: ["event.recommend"], category: "preference", content: "推荐活动时优先出版主题", memoryId: "memory:topic", structured: { strength: "prefer", topics: ["出版"] } }]);
  // The task orders by start time and names no topic: the preference puts the publishing fair first (the judgment says
  // which events fit the saved topic); the others follow in the task's own order and nothing is removed.
  // The stub answers per candidate key ("match_level__c1"); the candidate's own line in the input says which event it is.
  const lineOf = (id: string, call: { body: unknown }) => ((call.body as { input: { text: string }[] }).input.flatMap((item) => item.text.split("\n")).find((line) => line.startsWith(`[${id.replace("match_level__", "")}]`)) ?? "");
  const fits = judgeStub((id, _question, call) => (/独立出版市集/u.test(lineOf(id, call)) ? graded(0.02, 0.08, 0.9) : graded(0.9, 0.05, 0.05)));
  const byField = await run(world, {}, { judgment: access(fits.fetchImplementation) });
  assert.deepEqual(byField.listed, ["e105", "e101", "e104"], "the event that fits the saved topic comes first; the places left go by start time, not only to events that fit");
  assert.equal(fits.calls.length, 1);
  assert.match(JSON.stringify(fits.calls[0].body), /出版/u, "the judgment is asked about the saved topic");
  assert.match(byField.text, /同时按你让我记住的这条来办：推荐活动时优先出版主题。/u);
  // When the judgment gives no answer the task's own order stands and the list is still full.
  assert.deepEqual((await run(world)).listed, ["e101", "e104", "e102"]);

  // The task picks by a note: its own basis. The saved topic is not used and not named.
  const judge = judgeStub((id, _question, call) => (/设计师之夜/u.test(lineOf(id, call)) ? graded(0.9, 0.05, 0.05) : graded(0.02, 0.08, 0.9)));
  const trace = captureTrace();
  try {
    const byNote = await run(world, { ranking: {}, rankingBasis: "与兴趣笔记的主题相关", references: [{ id: "note:m36", title: "兴趣笔记", type: "memo" }] }, { judgment: access(judge.fetchImplementation) });
    assert.deepEqual([...byNote.listed].sort(), ["e101", "e102", "e105"]);
    assert.doesNotMatch(byNote.text, /让我记住/u, "an entry the task's own basis overrules is not said to have been applied");
    assert.doesNotMatch(JSON.stringify(judge.calls.map((call) => call.body)), /优先出版主题/u, "the judgment is asked about the note, not about the saved preference");
    const recalled = trace.events.filter((event) => event.type === "memory.recall");
    assert.deepEqual(recalled.flatMap((event) => event.memories as string[]), []);
    assert.deepEqual(recalled.flatMap((event) => (event.overruled as string[] | undefined) ?? []), ["memory:topic"]);
  } finally {
    trace.restore();
  }
});

test("a rule run never writes memory: the scope is the same before and after", async () => {
  const world = memoryWorld();
  await world.save(ACTOR, [
    { appliesTo: ["event.recommend"], category: "constraint", content: "不要推荐晚上的活动", memoryId: "memory:evening" },
    { appliesTo: ["all"], category: "constraint", content: "回答用日语", memoryId: "memory:ja" },
  ]);
  const before = await world.serviceOf(ACTOR).snapshot();
  await run(world);
  await run(world, { action: "replan", ranking: { field: { direction: "asc", name: "plannedDate" } }, rankingBasis: "按计划日从早到晚", scope: { domain: "todo", filter: "past_planned" }, scopeText: "过了计划日还没完成的待办" });
  const after = await world.serviceOf(ACTOR).snapshot();
  assert.equal(after.version, before.version);
  assert.deepEqual(after.entries, before.entries);
  assert.deepEqual(after.settings, before.settings);
});
