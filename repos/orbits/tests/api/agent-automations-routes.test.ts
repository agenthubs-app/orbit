import assert from "node:assert/strict";
import test from "node:test";

import { parseCreateAgentAutomationInput, parseUpdateAgentAutomationInput } from "../../app/api/agent/automations/request";
import { handleAutomationDispatchRequest } from "../../features/agent/automations/dispatch-configured";
import { listScheduledTasks, scheduledTaskHistory } from "../../features/agent/automations/task-view";
import { agentScheduledTaskHistorySchema, agentScheduledTaskListSchema } from "../../shared/api-schema/agent-v1";
import { createDispatchKit, createRule, FRIDAY_9, picked, ruleSpec, serviceFor } from "../capabilities/agent-automation-kit";

/**
 * agent-design AG15 (设计稿 §5.3, §10「我的定时任务」): the dispatch entry names no account; the list and the history
 * give a task with the card's own rows, its next expected run, and one line per period.
 */

const SECRET = "s".repeat(40);
const summary = { claimed: 2, delivered: 2, deliveriesRetried: 0, failed: 0, needsAttention: 0, noMatch: 0, periods: 2, skippedPeriods: 0, timersFired: 0, undelivered: 0 };
const call = (headers: Record<string, string>, url = "http://127.0.0.1/api/internal/agent/automations") => handleAutomationDispatchRequest(new Request(url, { headers, method: "POST" }), async () => summary, SECRET);

test("the dispatch entry takes only the scheduler's secret: no account in the request, no parameters", async () => {
  assert.equal((await call({})).status, 401);
  assert.equal((await call({ authorization: "Bearer wrong" })).status, 401);
  assert.equal((await call({ authorization: `Bearer ${SECRET}`, "x-orbit-actor-id": "user:a" })).status, 400, "the old per-account header is refused, not honoured");
  assert.equal((await call({ authorization: `Bearer ${SECRET}` }, "http://127.0.0.1/api/internal/agent/automations?actor=user:a")).status, 400);
  const ok = await call({ authorization: `Bearer ${SECRET}` });
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { data: { dispatch: summary } });
  assert.equal(ok.headers.get("cache-control"), "no-store");
  const short = await handleAutomationDispatchRequest(new Request("http://127.0.0.1/x", { headers: { authorization: "Bearer short" }, method: "POST" }), async () => summary, "short");
  assert.equal(short.status, 401, "a secret under 32 characters never opens the entry");
  const unconfigured = await handleAutomationDispatchRequest(new Request("http://127.0.0.1/x", { headers: { authorization: `Bearer ${SECRET}` }, method: "POST" }), async () => null, SECRET);
  assert.equal(unconfigured.status, 503);
});

test("a form may send the rule fields; an id for the rule is never taken from a request body", () => {
  const created = parseCreateAgentAutomationInput({ automationId: "rule:chosen-by-client", capabilityId: "events.recommend", delivery: "in_app", instruction: "周末活动", rule: ruleSpec(), title: "每周五挑三场周末活动", trigger: { kind: "schedule", schedule: FRIDAY_9 } });
  assert.ok(created);
  assert.equal("automationId" in created!, false);
  assert.equal(created!.rule?.maxItems, 3);
  const updated = parseUpdateAgentAutomationInput({ rule: ruleSpec({ maxItems: 5 }), status: "paused" });
  assert.equal(updated?.rule?.maxItems, 5);
  assert.equal(updated?.status, "paused");
  assert.equal(parseCreateAgentAutomationInput({ capabilityId: "events.recommend", delivery: "in_app", instruction: "x", rule: "not a rule", title: "t", trigger: { kind: "schedule", schedule: FRIDAY_9 } })?.rule, undefined);
});

test("'my scheduled tasks' shows the card's rows, the next expected run and the latest run; the history has one plain line per period", async () => {
  const kit = createDispatchKit();
  const rule = await createRule(kit.storage, "user:a", kit.now, { rule: { validUntil: "2026-12-31" } });
  await createRule(kit.storage, "user:b", kit.now, { title: "乙的任务" });
  const service = serviceFor(kit.storage, "user:a", kit.now);
  let tasks = await listScheduledTasks({ now: kit.now(), ownerId: "user:a", service, storage: kit.storage });
  assert.equal(tasks.length, 1, "only the owner's own tasks");
  assert.deepEqual(tasks[0].rows.map((row) => [row.label, row.value]), [
    ["检查时间", "每周五 9:00 之后约10分钟内"],
    ["候选范围", "周末活动"],
    ["排序依据", "按开始时间从早到晚"],
    ["条数", "最多3场"],
    ["有效期", "到12月31日（周四）为止"],
    ["提醒方式", "只放进站内收件箱，不推送"],
    ["下次预计运行", "11月20日（周五） 9:00 之后约10分钟内"],
  ]);
  assert.deepEqual([tasks[0].status, tasks[0].nextRunAt, tasks[0].lastRun], ["active", new Date("2026-11-20T09:00:00+09:00").toISOString(), null]);

  await kit.dispatch("2026-11-20T09:10:00+09:00");
  kit.result.value = () => picked([]);
  await kit.dispatch("2026-11-27T09:10:00+09:00");
  const history = await scheduledTaskHistory({ automationId: rule.automationId, now: kit.now(), ownerId: "user:a", service, storage: kit.storage });
  assert.ok(history);
  assert.deepEqual(history!.runs.map((run) => [run.scheduledAt, run.outcome, run.line]), [
    [new Date("2026-11-27T09:00:00+09:00").toISOString(), "no_match", "没有新的"],
    [new Date("2026-11-20T09:00:00+09:00").toISOString(), "delivered", "已放进收件箱（3条）"],
  ]);
  assert.deepEqual(history!.runs[1].items.map((item) => item.ref), ["event:E101", "event:E102", "event:E105"]);
  assert.deepEqual(history!.runs[1].delivery, { attempts: 1, deliveredAt: new Date("2026-11-20T09:10:00+09:00").toISOString(), state: "delivered" });
  assert.equal(history!.runs[1].computedAt, new Date("2026-11-20T09:10:00+09:00").toISOString());
  assert.equal(history!.task.lastRun?.outcome, "no_match");
  assert.equal(history!.task.rows.at(-1)?.value, "12月4日（周五） 9:00 之后约10分钟内");
  // Both shapes are what the two clients read.
  assert.equal(agentScheduledTaskHistorySchema.safeParse(history).success, true);
  tasks = await listScheduledTasks({ now: kit.now(), ownerId: "user:a", service, storage: kit.storage });
  assert.equal(agentScheduledTaskListSchema.safeParse({ tasks }).success, true);

  // Another account asking for this task by its id finds nothing.
  assert.equal(await scheduledTaskHistory({ automationId: rule.automationId, now: kit.now(), ownerId: "user:b", service: serviceFor(kit.storage, "user:b", kit.now), storage: kit.storage }), null);

  // Paused: no next run; past its last day: ended.
  await service.update(rule.automationId, { status: "paused" });
  tasks = await listScheduledTasks({ now: kit.now(), ownerId: "user:a", service, storage: kit.storage });
  assert.deepEqual([tasks[0].status, tasks[0].nextRunAt, tasks[0].rows.at(-1)?.value], ["paused", null, "没有要运行的了"]);
  await service.update(rule.automationId, { status: "active" });
  kit.result.value = () => picked(["E200"]);
  await kit.dispatch("2027-01-08T09:10:00+09:00");
  tasks = await listScheduledTasks({ now: kit.now(), ownerId: "user:a", service, storage: kit.storage });
  assert.deepEqual([tasks[0].status, tasks[0].nextRunAt], ["completed", null], "after its last valid day the task is shown as ended");
});
