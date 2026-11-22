import assert from "node:assert/strict";
import test from "node:test";

import { AGENT_INBOX_SOURCE_KINDS, isAgentInboxSourceKind } from "../../features/notifications/agent-inbox-source";
import { inboxNotificationSchema, inboxNotificationWriteSchema } from "../../shared/api-schema/inbox-notifications";
import { deliveryBackoffMs, inboxEntryOf } from "../../features/agent/automations/delivery";
import { runHistoryLine } from "../../features/agent/automations/runs";
import { scheduledRunView } from "../../features/agent/automations/task-view";
import { createDispatchKit, createRule, picked, serviceFor } from "./agent-automation-kit";

/**
 * agent-design AG15-3 and AG15-4 (设计稿 §5.3; PLANNER 易错边界 4/5/6/7/8): a period with nothing new is only written to
 * the history; what was told once is not told again; a failed delivery is sent again from the stored result without
 * computing anything; a paused rule's undelivered result is not sent; after an interruption only the latest period runs.
 */

const at = (value: string) => new Date(value).toISOString();
const FRIDAY = "2026-11-20T09:00:00+09:00";

test("a period with nothing new is written to the history only: no inbox entry, nothing to deliver", async () => {
  const kit = createDispatchKit();
  const rule = await createRule(kit.storage, "user:a", kit.now);
  kit.result.value = () => picked([]);
  const summary = await kit.dispatch("2026-11-20T09:10:00+09:00");
  assert.equal(summary.noMatch, 1);
  assert.equal(kit.inbox.length, 0);
  const [run] = await kit.runs("user:a", rule.automationId);
  assert.equal(run.outcome, "no_match");
  assert.equal(run.delivery.inbox.state, "none");
  assert.equal(run.delivery.push.state, "not_requested");
  assert.equal(runHistoryLine(run, "zh"), "没有新的", "the history says it in plain words, not as a failure");
  assert.equal((await kit.storage.listOwned("user:a", "delivery")).length, 0);
});

test("what a rule told its owner once is left out of later periods; a period whose candidates were all told has nothing new", async () => {
  const kit = createDispatchKit();
  const rule = await createRule(kit.storage, "user:a", kit.now, { schedule: { kind: "daily", time: "09:00", timeZone: "Asia/Tokyo" } });
  // The fake computes like the product: the candidates of the day minus what it is told to leave out.
  let candidates = ["E101", "E102", "E107"];
  kit.result.value = (input) => picked(candidates.filter((id) => !input.told.has(`event:${id}`)));
  await kit.dispatch("2026-11-16T09:10:00+09:00");
  await kit.dispatch("2026-11-17T09:10:00+09:00");
  candidates = [...candidates, "E106"];
  await kit.dispatch("2026-11-18T09:10:00+09:00");
  assert.deepEqual(kit.computed.map((item) => item.told), [[], ["event:E101", "event:E102", "event:E107"], ["event:E101", "event:E102", "event:E107"]]);
  const runs = (await kit.runs("user:a", rule.automationId)).reverse();
  assert.deepEqual(runs.map((run) => [run.outcome, run.items.map((item) => item.id)]), [["delivered", ["E101", "E102", "E107"]], ["no_match", []], ["delivered", ["E106"]]]);
  assert.equal(kit.inbox.length, 2, "the second period put nothing in the inbox");
  assert.equal(new Set(kit.inbox.map((entry) => entry.semanticKey)).size, 2);
});

test("an inbox entry's key is the rule, its version and the period: delivering the same run again makes no second entry", async () => {
  const kit = createDispatchKit();
  const rule = await createRule(kit.storage, "user:a", kit.now);
  await kit.dispatch("2026-11-20T09:10:00+09:00");
  const [run] = await kit.runs("user:a", rule.automationId);
  const entry = inboxEntryOf(run);
  assert.equal(entry.semanticKey, `agent-rule-result:${rule.automationId}:v1:${at(FRIDAY)}`);
  assert.equal(entry.sources[0].sourceKind, "automation_result");
  assert.equal(entry.sources[0].sourceId, run.runId);
  assert.deepEqual(entry.target, { href: null, id: rule.automationId, kind: "automation", status: "available" });
  assert.equal(entry.origin, "automation");
  await kit.deps.delivery.inbox!(entry);
  await kit.deps.delivery.inbox!(inboxEntryOf(run));
  assert.equal(kit.inbox.length, 1);
  // The entry is one the inbox accepts and both clients can read.
  const stored = { ...entry, disposition: "open", id: "inbox:x", readAt: null, revision: 1, updatedAt: run.computedAt };
  assert.equal(inboxNotificationWriteSchema.safeParse(stored).success, true);
  assert.equal(inboxNotificationSchema.safeParse(stored).success, true);
});

test("a failed delivery is sent again from the stored result: the period is not computed a second time", async () => {
  const kit = createDispatchKit();
  const a = await createRule(kit.storage, "user:a", kit.now);
  const b = await createRule(kit.storage, "user:b", kit.now, { title: "每周五看看有什么活动" });
  kit.inboxFails.value = true;
  const first = await kit.dispatch("2026-11-20T09:10:00+09:00");
  assert.equal(first.undelivered, 2);
  assert.equal(kit.inbox.length, 0);
  let [run] = await kit.runs("user:a", a.automationId);
  assert.equal(run.outcome, "undelivered");
  assert.deepEqual([run.delivery.inbox.state, run.delivery.inbox.attempts], ["pending", 1]);
  assert.match(run.delivery.inbox.lastError ?? "", /inbox write failed/u);
  assert.equal(run.text, "结果：E101、E102、E105", "the result is stored with what is still to be delivered");
  assert.equal(runHistoryLine(run, "zh"), "已算出，还没送出");
  // The second pass, ten minutes later: only the notification is sent.
  kit.inboxFails.value = false;
  const second = await kit.dispatch("2026-11-20T09:20:00+09:00");
  assert.equal(second.periods, 0);
  assert.equal(second.deliveriesRetried, 2);
  assert.equal(kit.computed.length, 2, "one computation per account in all: the retry read nothing and judged nothing");
  assert.deepEqual(kit.inbox.map((entry) => [entry.actorId, entry.reason]).sort(), [["user:a", "结果：E101、E102、E105"], ["user:b", "结果：E101、E102、E105"]]);
  [run] = await kit.runs("user:a", a.automationId);
  assert.equal(run.outcome, "delivered");
  assert.deepEqual([run.delivery.inbox.state, run.delivery.inbox.attempts], ["delivered", 2]);
  assert.equal(run.computedAt, at("2026-11-20T09:10:00+09:00"), "when it was computed stays apart from when it was delivered");
  assert.equal(run.delivery.inbox.deliveredAt, at("2026-11-20T09:20:00+09:00"));
  assert.equal(runHistoryLine(run, "zh"), "已放进收件箱（3条）（第一次没送到，补送到了；没有重新算）");
  // A third pass has nothing left to send.
  const third = await kit.dispatch("2026-11-20T09:30:00+09:00");
  assert.deepEqual([third.periods, third.deliveriesRetried, kit.inbox.length], [0, 0, 2]);
  assert.equal((await kit.runs("user:b", b.automationId)).length, 1);
});

test("a rule paused before its result was delivered: the result is not sent, the period stays worked out and not sent, later periods do not run", async () => {
  const kit = createDispatchKit();
  const rule = await createRule(kit.storage, "user:a", kit.now);
  kit.inboxFails.value = true;
  await kit.dispatch("2026-11-20T09:10:00+09:00");
  kit.inboxFails.value = false;
  kit.clock.now = at("2026-11-20T09:15:00+09:00");
  await serviceFor(kit.storage, "user:a", kit.now).update(rule.automationId, { status: "paused" });
  // The state is looked at again before the send.
  const afterPause = await kit.dispatch("2026-11-20T09:20:00+09:00");
  assert.equal(afterPause.delivered, 0);
  assert.deepEqual([afterPause.deliveriesRetried, afterPause.deliveriesCancelled], [1, 1], "the waiting delivery was taken up and cancelled — not sent");
  assert.equal(kit.inbox.length, 0);
  const nextWeek = await kit.dispatch("2026-11-27T09:10:00+09:00");
  assert.equal(nextWeek.periods, 0);
  const runs = await kit.runs("user:a", rule.automationId);
  assert.equal(runs.length, 1, "the only period in the history is the one before the pause");
  assert.equal(runs[0].outcome, "undelivered");
  assert.deepEqual([runs[0].delivery.inbox.state, runs[0].delivery.inbox.cancelReason], ["cancelled", "rule_paused"]);
  assert.equal(runHistoryLine(runs[0], "zh"), "已算出，没有送出：送出前你暂停了这条任务");
  assert.equal(scheduledRunView(runs[0]).delivery.cancelReason, "rule_paused");
  assert.equal(kit.computed.length, 1);
  assert.equal((await kit.storage.listOwned("user:a", "delivery")).length, 0);
});

test("a result is not delivered once the rule was removed, changed, or may no longer read the note it references", async () => {
  for (const [name, change, reason] of [
    ["removed", async (kit: ReturnType<typeof createDispatchKit>, id: string) => serviceFor(kit.storage, "user:a", kit.now).remove(id), "rule_removed"],
    ["changed", async (kit: ReturnType<typeof createDispatchKit>, id: string) => { await serviceFor(kit.storage, "user:a", kit.now).update(id, { title: "换了个名字" }); }, "rule_changed"],
    ["unreadable", async (kit: ReturnType<typeof createDispatchKit>) => { kit.unreadable.add("memo:note:m36"); }, "reference_unreadable"],
  ] as const) {
    const kit = createDispatchKit();
    const rule = await createRule(kit.storage, "user:a", kit.now, { rule: { ranking: {}, references: [{ id: "note:m36", type: "memo" }] } });
    kit.inboxFails.value = true;
    await kit.dispatch("2026-11-20T09:10:00+09:00");
    kit.inboxFails.value = false;
    kit.clock.now = at("2026-11-20T09:15:00+09:00");
    await change(kit, rule.automationId);
    await kit.dispatch("2026-11-20T09:20:00+09:00");
    assert.equal(kit.inbox.length, 0, name);
    const [run] = await kit.runs("user:a", rule.automationId);
    assert.deepEqual([run.outcome, run.delivery.inbox.state, run.delivery.inbox.cancelReason], ["undelivered", "cancelled", reason], name);
  }
});

test("after an interruption only the latest period runs, and its history line says how many were passed over", async () => {
  const kit = createDispatchKit();
  const rule = await createRule(kit.storage, "user:a", kit.now);
  kit.result.value = () => picked(["E107"]);
  // No pass from November 15 until the morning of November 28: November 20 and 27 were both due.
  const summary = await kit.dispatch("2026-11-28T08:00:00+09:00");
  assert.equal(summary.periods, 1);
  assert.equal(summary.skippedPeriods, 1);
  assert.deepEqual(kit.computed.map((item) => item.scheduledAt), [at("2026-11-27T09:00:00+09:00")]);
  const runs = await kit.runs("user:a", rule.automationId);
  assert.deepEqual(runs.map((run) => [run.scheduledAt, run.outcome, run.skipped]), [[at("2026-11-27T09:00:00+09:00"), "delivered", 1]]);
  assert.deepEqual(runs[0].skippedDays, ["2026-11-20"]);
  assert.equal(runHistoryLine(runs[0], "zh"), "已放进收件箱（1条）（之前有1期没有运行，已跳过：11月20日）", "the history names the period that was passed over");
  assert.equal(runHistoryLine(runs[0], "en"), "Sent to your inbox: 1 item — 1 earlier run was skipped while the service was down: Nov 20");
  assert.equal(scheduledRunView(runs[0]).skipped, 1);
  assert.equal((await kit.storage.direct.due.get({ key: rule.automationId, kind: "rule", ownerId: "user:a" }))?.nextRunAt, at("2026-12-04T09:00:00+09:00"));
  assert.equal(kit.inbox.length, 1);
});

test("a note the rule picks by cannot be read: the period needs attention, is said once, and nothing else stands in for the note", async () => {
  const kit = createDispatchKit();
  const rule = await createRule(kit.storage, "user:a", kit.now, { rule: { ranking: {}, references: [{ id: "note:m36", title: "兴趣笔记", type: "memo" }] } });
  kit.result.value = () => ({ attention: { message: "这条任务用来挑选的笔记「兴趣笔记」读不到了，所以这一期没有挑。", reason: "reference_unreadable", reference: { id: "note:m36", title: "兴趣笔记", type: "memo" } }, items: [], outcome: "needs_attention", text: "需要处理：兴趣笔记读不到了" });
  const first = await kit.dispatch("2026-11-20T09:10:00+09:00");
  assert.equal(first.needsAttention, 1);
  const second = await kit.dispatch("2026-11-27T09:10:00+09:00");
  assert.equal(second.needsAttention, 1);
  const runs = (await kit.runs("user:a", rule.automationId)).reverse();
  assert.deepEqual(runs.map((run) => [run.outcome, run.items.length, run.delivery.inbox.state]), [["needs_attention", 0, "delivered"], ["needs_attention", 0, "none"]]);
  assert.equal(kit.inbox.length, 1, "the owner is told once per rule version, not every period");
  assert.match(kit.inbox[0].reason, /兴趣笔记/u);
  assert.match(runHistoryLine(runs[1], "zh"), /读不到了/u);
});

test("a period that keeps failing is tried three times with the same key, then written to the history as failed; the next period still runs", async () => {
  const kit = createDispatchKit();
  const rule = await createRule(kit.storage, "user:a", kit.now);
  kit.result.value = () => { throw new Error("database is away"); };
  for (const minute of ["10", "20"]) {
    const summary = await kit.dispatch(`2026-11-20T09:${minute}:00+09:00`);
    assert.equal(summary.periods, 0);
    assert.equal((await kit.runs("user:a", rule.automationId)).length, 0, "not yet in the history: it is tried again");
  }
  await kit.dispatch("2026-11-20T09:30:00+09:00");
  let runs = await kit.runs("user:a", rule.automationId);
  assert.deepEqual(runs.map((run) => [run.outcome, run.scheduledAt]), [["failed", at(FRIDAY)]]);
  assert.match(runs[0].error ?? "", /database is away/u);
  assert.deepEqual(kit.computed.map((item) => item.scheduledAt), [at(FRIDAY), at(FRIDAY), at(FRIDAY)], "every attempt is the same period");
  assert.equal(kit.inbox.length, 0);
  kit.result.value = () => picked(["E107"]);
  await kit.dispatch("2026-11-27T09:10:00+09:00");
  runs = await kit.runs("user:a", rule.automationId);
  assert.deepEqual(runs.map((run) => [run.outcome, run.computeAttempts]), [["delivered", 1], ["failed", 3]], "the next period starts with a clean count of tries");

  // A period that fails once and then works is written once, and its line says it was tried again.
  const flaky = createDispatchKit();
  const other = await createRule(flaky.storage, "user:a", flaky.now);
  let tries = 0;
  flaky.result.value = () => {
    tries += 1;
    if (tries === 1) throw new Error("database is away");
    return picked(["E101"]);
  };
  await flaky.dispatch("2026-11-20T09:10:00+09:00");
  await flaky.dispatch("2026-11-20T09:20:00+09:00");
  const [retried] = await flaky.runs("user:a", other.automationId);
  assert.deepEqual([retried.outcome, retried.computeAttempts, retried.scheduledAt], ["delivered", 2, at(FRIDAY)]);
  assert.equal(runHistoryLine(retried, "zh"), "已放进收件箱（1条）（第一次没跑成，重试后跑成了）");
  assert.equal(scheduledRunView(retried).computeAttempts, 2);
});

test("the new inbox sources are the agent's own, never push candidates; a run only records whether its rule asked for a push", async () => {
  assert.deepEqual([...AGENT_INBOX_SOURCE_KINDS], ["automation_result", "agent_card", "external_proposal"]);
  for (const kind of AGENT_INBOX_SOURCE_KINDS) assert.equal(isAgentInboxSourceKind(kind), true);
  for (const kind of ["task", "event_pick", "reminder_plan"]) assert.equal(isAgentInboxSourceKind(kind), false);
  const kit = createDispatchKit();
  const quiet = await createRule(kit.storage, "user:a", kit.now);
  const loud = await createRule(kit.storage, "user:b", kit.now, { rule: { notify: { inApp: true, push: true } } });
  await kit.dispatch("2026-11-20T09:10:00+09:00");
  assert.equal((await kit.runs("user:a", quiet.automationId))[0].delivery.push.state, "not_requested");
  const [run] = await kit.runs("user:b", loud.automationId);
  // AG16 sends now: this kit has no device and no push channel, so the wanted reminder is recorded as not arrived —
  // and the result is in the inbox all the same (tests/services/agent-rule-push-delivery.test.ts covers the sending).
  assert.deepEqual([run.notify.push, run.delivery.push.state, run.delivery.push.reason, run.delivery.push.attempts, run.outcome], [true, "failed", "no_device", 0, "delivered"]);
});

test("a waiting delivery backs off between attempts and never past six hours", () => {
  assert.deepEqual([1, 2, 3, 4].map((attempt) => deliveryBackoffMs(attempt) / 60_000), [5, 10, 20, 40]);
  assert.equal(deliveryBackoffMs(30), 6 * 3_600_000);
});
