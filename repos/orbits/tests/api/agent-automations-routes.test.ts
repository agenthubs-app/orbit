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
  // AG15 interface: the seven facts with the approved draft's labels (15-4), each value written by code.
  assert.deepEqual(tasks[0].rows.map((row) => [row.label, row.value, row.note ?? null]), [
    ["什么时候查", "每周五 9:00 之后约10分钟内", "东京时间。不保证整点开始。"],
    ["从哪里挑", "周末活动", null],
    ["按什么挑", "按开始时间从早到晚", null],
    ["挑几条", "最多3场", null],
    ["跑到哪天", "跑到 12月31日（周四）为止", null],
    ["怎么通知你", "放进收件箱", "没有新的就不打扰"],
    ["下次运行", "11月20日（周五） 9:00 之后约10分钟内", null],
  ]);
  assert.deepEqual([tasks[0].status, tasks[0].nextRunAt, tasks[0].lastRun], ["active", new Date("2026-11-20T09:00:00+09:00").toISOString(), null]);
  assert.deepEqual(tasks[0].summary, { attention: null, schedule: "每周五 9:00 之后约10分钟内", status: "下次 11月20日（周五）" });
  assert.deepEqual(tasks[0].next, { day: "11月20日（周五）", time: "9:00 之后约10分钟内" });
  assert.equal(tasks[0].domain, "event");

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
  // The history as the page shows it (15-4): the period's day, the time it finished, what it found, what opens.
  assert.deepEqual(history!.runs.map((run) => run.display), [
    { day: "11月27日（周五）", opens: null, skippedNote: null, text: "没有新的", time: "9:10" },
    { day: "11月20日（周五）", opens: "result", skippedNote: null, text: "有 3 场新活动", time: "9:10" },
  ]);
  assert.deepEqual(history!.task.last, { opens: null, runId: history!.runs[0].runId, text: "没有新的", when: "今天 9:10" });
  assert.equal(history!.task.summary?.status, "下次 12月4日（周五） · 上次 今天 9:10：没有新的");
  assert.deepEqual(kit.inbox.filter((entry) => entry.actorId === "user:a").map((entry) => [entry.title, entry.object?.name]), [["有 3 场新活动", "每周五挑三场周末活动"]], "the inbox entry says what was found; the task's name is its second line");
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
  assert.deepEqual(tasks[0].summary, { attention: null, schedule: "跑到 12月31日（周四）为止", status: "已结束 · 一共跑了 3 期" });
});

test("AG15 interface: a paused task, a task whose note cannot be opened, a period passed over and a retried one read as the approved draft says", async () => {
  const kit = createDispatchKit();
  const rule = await createRule(kit.storage, "user:a", kit.now, { rule: { rankingBasis: "按笔记「兴趣笔记」的主题", ranking: {}, references: [{ id: "M36", title: "兴趣笔记", type: "memo" }] } });
  const service = serviceFor(kit.storage, "user:a", kit.now);
  // The note is unreadable at the first period: it needs the owner; the list says "没跑成" and the yellow line says why.
  kit.result.value = () => ({ attention: { message: "这条任务用来挑选的笔记「兴趣笔记」读不到了。", reason: "reference_unreadable", reference: { id: "M36", title: "兴趣笔记", type: "memo" } }, items: [], outcome: "needs_attention", text: "x" });
  await kit.dispatch("2026-11-20T09:10:00+09:00");
  let tasks = await listScheduledTasks({ now: kit.now(), ownerId: "user:a", service, storage: kit.storage });
  assert.equal(tasks[0].needsAttention, true);
  assert.deepEqual(tasks[0].summary, { attention: "需要你处理：笔记「兴趣笔记」打不开了。重新选一篇，或者改成别的挑法。", schedule: "每周五 9:00 之后约10分钟内", status: "上次 今天 9:10：没跑成" });
  assert.equal(tasks[0].rows[2].note, "每次运行读它当时的内容", "a note is read again at every run");
  assert.deepEqual(tasks[0].form?.basis, { kind: "note", noteId: "M36", title: "兴趣笔记" });
  // Paused.
  await service.update(rule.automationId, { status: "paused" });
  tasks = await listScheduledTasks({ now: kit.now(), ownerId: "user:a", service, storage: kit.storage });
  assert.equal(tasks[0].summary?.status, "已暂停，不会再运行 · 上次 今天 9:10：没跑成");
  assert.equal(tasks[0].needsAttention, true);
});

test("AG15 interface: the form makes the same rule fields a card would, with words written by code", async () => {
  const { ruleFromForm } = await import("../../features/agent/automations/task-form");
  const made = ruleFromForm({ basis: { kind: "note", noteId: "M36", title: "兴趣笔记" }, domain: "event", maxItems: 3, push: false, schedule: { daysOfWeek: [5], kind: "weekly", time: "09:00", timeZone: "Asia/Tokyo" }, title: "", validUntil: null, window: "weekend" }, "zh");
  assert.deepEqual(made.rule.references, [{ id: "M36", title: "兴趣笔记", type: "memo" }]);
  assert.equal(made.rule.rankingBasis, "按笔记「兴趣笔记」的主题");
  assert.equal(made.rule.scopeText, "那个周末开始的公开活动");
  assert.equal(made.title, "每周五挑3场：那个周末开始的公开活动", "an empty title is written by code");
  const changed = ruleFromForm({ basis: { field: "startsAt", kind: "field" }, domain: "event", maxItems: 5, push: true, schedule: { kind: "daily", time: "08:00", timeZone: "Asia/Tokyo" }, title: "每天看活动", validUntil: "2026-12-31", window: "weekend" }, "zh", { rule: { ...made.rule, scopeText: "周末活动" } } as never);
  assert.equal(changed.rule.scopeText, "周末活动", "an unchanged scope keeps its words");
  assert.deepEqual([changed.rule.references, changed.rule.ranking, changed.rule.notify, changed.rule.maxItems, changed.rule.validUntil], [[], { field: { direction: "asc", name: "startsAt" } }, { inApp: true, push: true }, 5, "2026-12-31"]);
  const todo = ruleFromForm({ basis: { kind: "topic", words: "ignored" }, domain: "todo", maxItems: 10, push: false, schedule: { daysOfWeek: [5], kind: "weekly", time: "08:30", timeZone: "Asia/Tokyo" }, title: "", validUntil: null }, "zh");
  assert.deepEqual([todo.rule.action, todo.rule.ranking.field?.name, todo.rule.scope], ["replan", "plannedDate", { domain: "todo", filter: "past_planned" }]);
});
