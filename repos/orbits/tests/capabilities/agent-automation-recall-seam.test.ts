/**
 * Integration of agent-design AG14 and AG15 (设计稿 §5.3 with §6: 约束在用户不在场时也生效): the recall a scheduled rule
 * uses is AG14's recallFor(), called with the rule owner's canonical account and the workspace and no session.
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { AgentAutomation } from "../../features/agent/automations/contract";
import { configuredRuleRecall } from "../../features/agent/automations/recall-seam";
import { runRulePeriod } from "../../features/agent/automations/run-rule";
import type { AgentMemoryRecordPayload, CreateAgentMemoryInput } from "../../features/agent/memory/contract";
import { createStorageAgentMemoryService } from "../../features/agent/memory/service";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { ACTOR, fnWorld } from "../agent-v1/functions-kit";
import { captureTrace, recordAccessOf } from "../agent-v1/graph-kit";
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

const ids = (items: readonly { id: string }[]) => items.map((item) => item.id).sort();

test("a rule recalls its owner's saved memory by account and workspace: the standing rules in range, then the entries for that kind of task", async () => {
  const world = memoryWorld();
  await world.save("account:large", LARGE);
  await world.save("account:other", [{ appliesTo: ["contact.recommend"], category: "constraint", content: "推荐联系人时不要写公司", memoryId: "OTHER1" }]);
  const recall = configuredRuleRecall({ serviceFor: world.serviceFor });

  const contacts = await recall({ actorId: "account:large", domain: "contact", now: NOW, workspaceId: WORKSPACE });
  assert.deepEqual(world.asked, [`account:large@${WORKSPACE}`], "read for the rule's owner in the rule's workspace; nothing else is needed");
  assert.deepEqual(ids(contacts), ["LMM02", "LMM05", "LMM06", "LMM07"], "the rule for every task, the rule for picking contacts, and what applies to picking contacts; nothing of another task or account");
  assert.deepEqual(contacts.slice(0, 2).map((item) => item.category), ["constraint", "constraint"], "standing rules come first");
  assert.deepEqual(contacts.find((item) => item.id === "LMM05"), { category: "constraint", content: "推荐联系人时每个人都写明公司", id: "LMM05" });

  const events = await recall({ actorId: "account:large", domain: "event", now: NOW, workspaceId: WORKSPACE });
  assert.deepEqual(ids(events), ["LMM01", "LMM02", "LMM03"], "the expired preference is not taken");

  const todos = await recall({ actorId: "account:large", domain: "todo", now: NOW, workspaceId: WORKSPACE });
  assert.deepEqual(ids(todos), ["LMM02", "LMM08"]);

  assert.deepEqual(ids(await recall({ actorId: "account:other", domain: "contact", now: NOW, workspaceId: WORKSPACE })), ["OTHER1"], "each owner gets its own entries only");
  assert.deepEqual(await recall({ actorId: "account:nobody", domain: "contact", now: NOW, workspaceId: WORKSPACE }), [], "an account with nothing saved recalls nothing");
});

test("with 「回答时参考这些」 off, or after an entry is forgotten, a rule run no longer gets it", async () => {
  const world = memoryWorld();
  await world.save("account:large", LARGE);
  const recall = configuredRuleRecall({ serviceFor: world.serviceFor });
  const service = world.serviceOf("account:large");

  await service.remove("LMM05");
  assert.deepEqual(ids(await recall({ actorId: "account:large", domain: "contact", now: NOW, workspaceId: WORKSPACE })), ["LMM02", "LMM06", "LMM07"], "read at the moment of the run, never from a copy");

  await service.updateSettings({ enabled: false });
  assert.deepEqual(await recall({ actorId: "account:large", domain: "contact", now: NOW, workspaceId: WORKSPACE }), [], "the switch is off: standing rules included");
});

test("an entry's last day is counted in the rule's own time zone", async () => {
  const world = memoryWorld();
  await world.save("account:a", [{ appliesTo: ["event.recommend"], category: "constraint", content: "不要推荐晚上的活动", memoryId: "M1", validUntil: "2026-11-20" }]);
  const recall = configuredRuleRecall({ serviceFor: world.serviceFor });
  // 2026-11-20 16:30 UTC is the 21st in Tokyo and still the 20th in Los Angeles.
  const late = "2026-11-20T16:30:00.000Z";
  assert.deepEqual(await recall({ actorId: "account:a", domain: "event", now: late, timeZone: "Asia/Tokyo", workspaceId: WORKSPACE }), []);
  assert.deepEqual(ids(await recall({ actorId: "account:a", domain: "event", now: late, timeZone: "America/Los_Angeles", workspaceId: WORKSPACE })), ["M1"]);
});

test("a memory read that fails is traced and the run goes on without memory", async () => {
  const trace = captureTrace();
  try {
    const recall = configuredRuleRecall({ serviceFor: () => ({ snapshot: async () => { throw new Error("memory store unavailable"); } }) });
    assert.deepEqual(await recall({ actorId: "account:a", domain: "event", now: NOW, workspaceId: WORKSPACE }), []);
    const errors = trace.events.filter((event) => event.type === "read.error");
    assert.equal(errors.length, 1);
    assert.equal(errors[0].where, "rule.recall");
    assert.match(String(errors[0].error), /memory store unavailable/u);
  } finally {
    trace.restore();
  }
});

test("a rule run with nobody present applies the owner's standing rule from the memory store, names it, and traces the entry by id only", async () => {
  const world = memoryWorld();
  await world.save(ACTOR, [
    { appliesTo: ["event.recommend"], category: "constraint", content: "不要推荐晚上的活动", memoryId: "memory:evening" },
    { appliesTo: ["all"], category: "constraint", content: "时间一律写 24 小时制", memoryId: "memory:clock" },
    { appliesTo: ["contact.recommend"], category: "constraint", content: "推荐联系人时每个人都写明公司", memoryId: "memory:company" },
  ]);
  await world.save("actor:b", [{ appliesTo: ["event.recommend"], category: "constraint", content: "不要推荐上午的活动", memoryId: "memory:b-morning" }]);
  const at = (value: string) => new Date(value).toISOString();
  const friday = at("2026-11-20T09:00:00+09:00");
  const automation: AgentAutomation = { automationId: "rule:1", capabilityId: "events.recommend", createdAt: "2026-11-15T01:00:00.000Z", delivery: "in_app", handledEventIds: [], instruction: "x", lastRun: null, nextRunAt: friday, revisions: [], rule: ruleSpec(), runCount: 0, status: "active", title: "每周五挑三场周末活动", trigger: { kind: "schedule", schedule: FRIDAY_9 }, updatedAt: "2026-11-15T01:00:00.000Z", version: 1 };
  const trace = captureTrace();
  try {
    const result = await runRulePeriod({ now: () => at("2026-11-20T09:10:00+09:00"), recall: configuredRuleRecall({ serviceFor: world.serviceFor }), records: recordAccessOf(fnWorld()), workspaceId: WORKSPACE }, { automation, ownerId: ACTOR, scheduledAt: friday, told: new Set() });
    assert.equal(result.outcome, "computed");
    assert.deepEqual(result.items.map((item) => item.id.replace("event:", "")), ["e101", "e102", "e105"], "the Saturday evening event is removed by the owner's rule; the other account's rule about mornings changes nothing");
    assert.match(result.text, /同时按你让我记住的这条来办：不要推荐晚上的活动/u);
    assert.doesNotMatch(result.text, /写明公司|不要推荐上午/u, "a rule about another task, or of another account, is not applied to this one");
    assert.deepEqual(world.asked, [`${ACTOR}@${WORKSPACE}`]);
    const recalled = trace.events.filter((event) => event.type === "memory.recall");
    assert.equal(recalled.length, 1);
    assert.deepEqual(recalled[0].memories, ["memory:evening"]);
    assert.doesNotMatch(JSON.stringify(recalled[0]), /不要推荐晚上/u, "the trace holds the entry's id, never its words");
  } finally {
    trace.restore();
  }
});
