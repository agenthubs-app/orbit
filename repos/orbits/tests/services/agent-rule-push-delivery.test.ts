import assert from "node:assert/strict";
import test from "node:test";

import { pushRun, RULE_PUSH_BODY, RULE_PUSH_MAX_ATTEMPTS, rulePushMessage, type RulePushDeps, type RulePushDevice, type RulePushHold } from "../../features/agent/automations/push";
import { pushDeliveryIdOf, pushDueKeyOf, pushHistoryLine, runHistoryLine, runIdOfPushDelivery } from "../../features/agent/automations/runs";
import { scheduledRunView } from "../../features/agent/automations/task-view";
import type { OrbitPushMessage } from "../../features/notifications/push-adapter";
import { agentScheduledTaskRunSchema } from "../../shared/api-schema/agent-v1";
import { ruleWriteExecutors } from "../../features/agent-v1/domains/rule/apply";
import { prepareRuleOperation, RULE_UPDATE } from "../../features/agent-v1/domains/rule/ops";
import { createDispatchKit, createRule, FRIDAY_9, picked, serviceFor, type DispatchKit } from "../capabilities/agent-automation-kit";
import type { AgentAutomation } from "../../features/agent/automations/contract";
import { configuredRuleRecall } from "../../features/agent/automations/recall-seam";
import { runRulePeriod } from "../../features/agent/automations/run-rule";
import type { AgentMemoryRecordPayload } from "../../features/agent/memory/contract";
import { createStorageAgentMemoryService } from "../../features/agent/memory/service";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { ACTOR, fnWorld } from "../agent-v1/functions-kit";
import { recordAccessOf } from "../agent-v1/graph-kit";

/**
 * agent-design AG16-1/2/3 (设计稿 §5.3; PLANNER 易错边界 1–5): a reminder goes out only for a task whose own switch is on;
 * it is one fixed sentence with nothing of the result in title, body or data; a device that refuses leaves the inbox
 * result and the task as they are; sending again never works the result out again; when the result was worked out and
 * whether the reminder arrived are two separate records.
 */

const TICK = "2026-11-20T09:10:00+09:00";
const LATER = "2026-11-20T09:20:00+09:00";
const RESULT_WORDS = ["东京街头摄影展", "街拍工作坊", "独立出版市集", "涩谷", "下北泽", "每周五挑三场周末活动"];

interface PushKit {
  sent: (OrbitPushMessage & { platform: string })[];
  devices: Map<string, RulePushDevice[]>;
  revoked: string[];
  /** What the push service does with the next sends to a device: "ok" when nothing is queued. */
  answers: Map<string, ("ok" | "refuse" | "gone" | "silent")[]>;
  hold: { value: RulePushHold | null };
  counted: string[];
  receipts: Map<string, { status: "ok" | "pending" } | { status: "error"; error: string }>;
  deps: RulePushDeps;
}

function withPush(kit: DispatchKit): PushKit {
  const sent: PushKit["sent"] = [];
  const devices: PushKit["devices"] = new Map();
  const revoked: string[] = [];
  const answers: PushKit["answers"] = new Map();
  const hold: PushKit["hold"] = { value: null };
  const counted: string[] = [];
  const receipts: PushKit["receipts"] = new Map();
  let ticket = 0;
  const deps: RulePushDeps = {
    channel: {
      async getReceipt(receiptId) {
        return receipts.get(receiptId) ?? { status: "pending" };
      },
      hasReceipts: (platform) => platform !== "web",
      async send(message) {
        sent.push(message);
        const answer = answers.get(message.token)?.shift() ?? "ok";
        if (answer === "refuse") throw Object.assign(new Error("Expo push adapter returned HTTP 200: MessageRateExceeded"), { notAccepted: true });
        if (answer === "gone") throw Object.assign(new Error("Expo push adapter returned HTTP 200: DeviceNotRegistered"), { notAccepted: true });
        if (answer === "silent") throw new Error("fetch failed");
        return { receiptId: `ticket-${(ticket += 1)}` };
      },
      supports: () => true,
    },
    devices: (ownerId) => ({
      async listActive() {
        return (devices.get(ownerId) ?? []).filter((device) => !revoked.includes(device.deviceId));
      },
      async revoke(deviceId) {
        revoked.push(deviceId);
      },
    }),
    now: kit.now,
    policy: {
      async check() {
        return hold.value ? { reason: hold.value, send: false } : { send: true };
      },
      async sent(_ownerId, input) {
        counted.push(input.eventKey);
      },
    },
    storage: kit.storage,
  };
  kit.deps.push = deps;
  return { answers, counted, deps, devices, hold, receipts, revoked, sent };
}

const phone = (id = "PD1"): RulePushDevice => ({ deviceId: id, platform: "ios", token: `ExponentPushToken[${id}]` });
const browser = (id = "PD2"): RulePushDevice => ({ deviceId: id, platform: "web", token: `{"endpoint":"https://fcm.googleapis.com/fcm/send/${id}"}` });
const pushOn = { notify: { inApp: true as const, push: true } };

function setup() {
  const kit = createDispatchKit();
  kit.result.value = () => ({ items: [{ id: "E101", kind: "event", line: "东京街头摄影展 · 11月21日 14:00 · 涩谷", ref: "event:E101", title: "东京街头摄影展" }, { id: "E102", kind: "event", line: "街拍工作坊 · 下北泽", ref: "event:E102", title: "街拍工作坊" }], outcome: "computed", text: "这个周末有 2 场：东京街头摄影展（涩谷）、街拍工作坊（下北泽）；独立出版市集已经告诉过你" });
  return { kit, push: withPush(kit) };
}

test("AG16-1: only the task whose own switch is on sends a reminder; the other one only goes to the inbox and is never tried", async () => {
  const { kit, push } = setup();
  push.devices.set("user:a", [phone()]);
  const on = await createRule(kit.storage, "user:a", kit.now, { rule: pushOn });
  const off = await createRule(kit.storage, "user:a", kit.now, { title: "每周五看看周末的设计活动" });
  const summary = await kit.dispatch(TICK);
  assert.equal(kit.inbox.length, 2, "both results are in the inbox");
  assert.equal(push.sent.length, 1, "one reminder, for the task that asked for it");
  assert.equal(summary.pushesDelivered, 1);
  const [ran] = await kit.runs("user:a", on.automationId);
  const [quiet] = await kit.runs("user:a", off.automationId);
  assert.deepEqual([ran.delivery.push.state, ran.delivery.push.attempts], ["delivered", 1]);
  assert.deepEqual([quiet.delivery.push.state, quiet.delivery.push.attempts, quiet.delivery.push.targets], ["not_requested", 0, undefined]);
  assert.equal(push.sent[0].data.deliveryId, pushDeliveryIdOf(ran.runId));
  assert.equal((await kit.storage.listOwned("user:a", "delivery")).filter((row) => row.key === pushDueKeyOf(quiet.runId)).length, 0, "no reminder row was ever written for the task without the switch");
  assert.equal(pushHistoryLine(quiet, "zh"), "当时没开提醒");
});

test("AG16-1: a period with nothing new sends no reminder even when the switch is on", async () => {
  const { kit, push } = setup();
  push.devices.set("user:a", [phone()]);
  const rule = await createRule(kit.storage, "user:a", kit.now, { rule: pushOn });
  kit.result.value = () => picked([]);
  await kit.dispatch(TICK);
  const [run] = await kit.runs("user:a", rule.automationId);
  assert.equal(push.sent.length, 0);
  assert.equal(run.delivery.push.state, "not_requested");
  assert.equal(pushHistoryLine(run, "zh"), "没有新的，所以不提醒");
});

test("AG16-2: the reminder is one fixed sentence; title, body and data hold nothing of the result or of the task", async () => {
  const { kit, push } = setup();
  push.devices.set("user:a", [phone(), browser()]);
  const rule = await createRule(kit.storage, "user:a", kit.now, { rule: pushOn });
  await kit.dispatch(TICK);
  const [run] = await kit.runs("user:a", rule.automationId);
  assert.equal(push.sent.length, 2, "the phone and the browser each get it");
  assert.deepEqual(push.sent.map((message) => message.platform).sort(), ["ios", "web"]);
  for (const message of push.sent) {
    assert.equal(message.title, "Orbit");
    assert.equal(message.body, "有新结果，请到 Orbit 查看。");
    assert.deepEqual(message.data, { deliveryId: pushDeliveryIdOf(run.runId) }, "the only data is the opaque id");
    const { token: _token, ...written } = message;
    const all = JSON.stringify(written);
    for (const word of RESULT_WORDS) assert.equal(all.includes(word), false, `"${word}" is not on the reminder`);
    assert.equal(all.includes(rule.automationId), false, "not even the task's id");
  }
  assert.match(pushDeliveryIdOf(run.runId), /^rule-push:[0-9a-f]{32}$/u);
  assert.equal(runIdOfPushDelivery(pushDeliveryIdOf(run.runId)), run.runId);
  assert.equal(runIdOfPushDelivery("rule-push:../../x"), null);
  // The message is built from the language and the run id alone: there is no input a "show content" setting could reach.
  assert.deepEqual(Object.keys(rulePushMessage("zh", run.runId)).sort(), ["body", "data", "sound", "title"]);
  assert.equal(rulePushMessage.length, 2);
});

test("AG16-2: the sentence is in the language of the task's results — the language of the inbox entry it announces", async () => {
  for (const [locale, body] of Object.entries(RULE_PUSH_BODY) as ["zh" | "en" | "ja", string][]) {
    const { kit, push } = setup();
    push.devices.set("user:a", [phone()]);
    // A language stored with the switch before this rule (older records) no longer decides anything.
    const other = locale === "zh" ? "ja" : "zh";
    const rule = await createRule(kit.storage, "user:a", kit.now, { rule: { locale, notify: { inApp: true, push: true, pushLocale: other } } });
    await kit.dispatch(TICK);
    const [run] = await kit.runs("user:a", rule.automationId);
    assert.equal(run.locale, locale);
    assert.equal(push.sent[0].body, body);
    assert.equal(push.sent[0].title, "Orbit");
  }
  assert.equal(RULE_PUSH_BODY.en, "You have new results. Open Orbit to see them.");
  assert.equal(RULE_PUSH_BODY.ja, "新しい結果があります。Orbit でご確認ください。");
});

test("AG16-3: a refused reminder is sent again at a later pass — the result is not worked out again and the inbox gets no second entry", async () => {
  const { kit, push } = setup();
  push.devices.set("user:a", [phone()]);
  push.answers.set(phone().token, ["refuse"]);
  const rule = await createRule(kit.storage, "user:a", kit.now, { rule: pushOn });
  const first = await kit.dispatch(TICK);
  let [run] = await kit.runs("user:a", rule.automationId);
  assert.equal(run.outcome, "delivered", "the task's period is done: the result is in the inbox");
  assert.deepEqual([run.delivery.push.state, run.delivery.push.attempts], ["pending", 1]);
  assert.equal(first.pushesDelivered, 0);
  assert.equal(pushHistoryLine(run, "zh"), "提醒第一次没送出去，会再送一次；不会重新算。");
  const computedAt = run.computedAt;
  const inboxDeliveredAt = run.delivery.inbox.deliveredAt;
  const row = (await kit.storage.listOwned("user:a", "delivery")).find((item) => item.key === pushDueKeyOf(run.runId));
  assert.equal(row?.nextRunAt, new Date(Date.parse(TICK) + 5 * 60_000).toISOString(), "tried again five minutes later at the earliest");

  const second = await kit.dispatch(LATER);
  [run] = await kit.runs("user:a", rule.automationId);
  assert.deepEqual([run.delivery.push.state, run.delivery.push.attempts], ["delivered", 2]);
  assert.equal(second.periods, 0, "no period ran at the second pass");
  assert.equal(second.pushesDelivered, 1);
  assert.equal(kit.computed.length, 1, "the result was worked out once");
  assert.equal(kit.inbox.length, 1, "one inbox entry");
  assert.equal(run.computedAt, computedAt, "the completion time is untouched by the retry");
  assert.equal(run.delivery.inbox.deliveredAt, inboxDeliveredAt);
  assert.equal(run.delivery.push.deliveredAt, new Date(LATER).toISOString());
  assert.ok(Date.parse(run.computedAt) < Date.parse(run.delivery.push.deliveredAt!), "two times, each its own field");
  assert.equal(push.sent.length, 2);
  assert.deepEqual(push.sent[0], push.sent[1], "the second send is the same fixed message");
  assert.equal((await kit.runs("user:a", rule.automationId)).length, 1, "9:20 did not run another period");
  assert.equal(pushHistoryLine(run, "zh"), "第一次没送出去，后来补送到了。没有重新算。");
  assert.equal(runHistoryLine(run, "zh"), "已放进收件箱（2条）");
  assert.deepEqual(push.counted, [pushDeliveryIdOf(run.runId)], "counted once towards the day's limit");
});

test("AG16-3: a reminder round reads the run and the task's row only — no record is read and nothing is computed", async () => {
  const { kit, push } = setup();
  push.devices.set("user:a", [phone()]);
  push.answers.set(phone().token, ["refuse", "refuse"]);
  const rule = await createRule(kit.storage, "user:a", kit.now, { rule: pushOn });
  await kit.dispatch(TICK);
  const [run] = await kit.runs("user:a", rule.automationId);
  let visibleCalls = 0;
  const visible = kit.deps.delivery.visible!;
  kit.deps.delivery.visible = async (ownerId, refs) => {
    visibleCalls += 1;
    return visible(ownerId, refs);
  };
  kit.clock.now = new Date(LATER).toISOString();
  assert.equal(await pushRun(push.deps, { ownerId: "user:a", runId: run.runId }), "pending");
  assert.equal(kit.computed.length, 1);
  assert.equal(visibleCalls, 0, "not even the id-only permission check of the inbox delivery is repeated");
  const [after] = await kit.runs("user:a", rule.automationId);
  assert.deepEqual({ ...after, delivery: { ...after.delivery, push: null } }, { ...run, delivery: { ...run.delivery, push: null } }, "only the reminder block changed");
});

test("AG16-3: an unanswered send is never sent again; the reminder is recorded as not arrived, the task as done", async () => {
  const { kit, push } = setup();
  push.devices.set("user:a", [phone()]);
  push.answers.set(phone().token, ["silent"]);
  const rule = await createRule(kit.storage, "user:a", kit.now, { rule: pushOn });
  await kit.dispatch(TICK);
  await kit.dispatch(LATER);
  await kit.dispatch("2026-11-20T12:00:00+09:00");
  const [run] = await kit.runs("user:a", rule.automationId);
  assert.equal(push.sent.length, 1, "it may have arrived: not sent twice");
  assert.deepEqual([run.outcome, run.delivery.push.state, run.delivery.push.reason, run.delivery.push.attempts], ["delivered", "failed", "outcome_unknown", 1]);
  assert.equal(pushHistoryLine(run, "zh"), "提醒没送到。结果在收件箱里。");
});

test("AG16-1: a device whose permission was revoked is refused by the push service — the inbox result stays whole, the task keeps running, the device is not sent to again", async () => {
  const { kit, push } = setup();
  push.devices.set("user:a", [phone()]);
  push.answers.set(phone().token, ["gone"]);
  const rule = await createRule(kit.storage, "user:a", kit.now, { rule: pushOn });
  await kit.dispatch(TICK);
  let [run] = await kit.runs("user:a", rule.automationId);
  assert.equal(kit.inbox.length, 1);
  assert.match(kit.inbox[0].reason, /东京街头摄影展/u, "the inbox entry has the whole result");
  assert.deepEqual([run.outcome, run.delivery.inbox.state], ["delivered", "delivered"], "not a failed task");
  assert.deepEqual([run.delivery.push.state, run.delivery.push.reason], ["failed", "permission_revoked"]);
  assert.deepEqual(push.revoked, ["PD1"], "the registration is revoked");
  assert.equal(pushHistoryLine(run, "zh"), "提醒没送到：手机的通知被关了。结果在收件箱里。");
  assert.equal(pushHistoryLine(run, "en"), "The reminder did not arrive: notifications were turned off on your phone. The result is in your inbox.");
  const service = serviceFor(kit.storage, "user:a", kit.now);
  assert.equal((await service.get(rule.automationId))?.status, "active");
  const ruleRow = (await kit.storage.listOwned("user:a", "rule"))[0];
  assert.deepEqual([ruleRow.status, ruleRow.nextRunAt], ["active", new Date("2026-11-27T09:00:00+09:00").toISOString()], "the next period is scheduled as before");

  // The next period: the result goes to the inbox; nothing is sent to the revoked device.
  kit.result.value = () => picked(["E201"]);
  await kit.dispatch("2026-11-27T09:10:00+09:00");
  [run] = await kit.runs("user:a", rule.automationId);
  assert.equal(push.sent.length, 1, "no second send");
  assert.equal(kit.inbox.length, 2);
  assert.deepEqual([run.delivery.push.state, run.delivery.push.reason, run.delivery.push.attempts], ["failed", "no_device", 0]);
  assert.equal(pushHistoryLine(run, "zh"), "提醒没送到：没有设备允许 Orbit 发通知。结果在收件箱里。");
});

test("AG16-1: with a phone and a browser, one refusing does not stop the other; the refused one is revoked alone", async () => {
  const { kit, push } = setup();
  push.devices.set("user:a", [phone(), browser()]);
  push.answers.set(browser().token, ["gone"]);
  const rule = await createRule(kit.storage, "user:a", kit.now, { rule: pushOn });
  await kit.dispatch(TICK);
  const [run] = await kit.runs("user:a", rule.automationId);
  assert.equal(run.delivery.push.state, "delivered");
  assert.deepEqual(run.delivery.push.targets?.map((target) => [target.platform, target.state]).sort(), [["ios", "delivered"], ["web", "revoked"]]);
  assert.deepEqual(push.revoked, ["PD2"]);
  assert.equal(JSON.stringify(run.delivery.push).includes("ExponentPushToken"), false, "no token is kept on the run");
});

test("AG16-1: the switch is looked at again before sending — turned off, paused or deleted in between means no reminder, and the history says why", async () => {
  const cases = [
    { change: async (kit: DispatchKit, id: string) => void (await serviceFor(kit.storage, "user:a", kit.now).update(id, { status: "paused" })), line: "没有提醒：送出前你暂停了这条任务。结果在收件箱里。", reason: "rule_paused" },
    { change: async (kit: DispatchKit, id: string) => void (await serviceFor(kit.storage, "user:a", kit.now).remove(id)), line: "没有提醒：送出前你删除了这条任务。结果在收件箱里。", reason: "rule_removed" },
    { change: async (kit: DispatchKit, id: string) => { const service = serviceFor(kit.storage, "user:a", kit.now); const current = (await service.get(id))!; await service.update(id, { rule: { ...current.rule!, notify: { inApp: true, push: false } } }); }, line: "没有提醒：送出前你关掉了这条任务的提醒。结果在收件箱里。", reason: "reminder_off" },
  ] as const;
  for (const item of cases) {
    const { kit, push } = setup();
    push.devices.set("user:a", [phone()]);
    push.answers.set(phone().token, ["refuse"]);
    const rule = await createRule(kit.storage, "user:a", kit.now, { rule: pushOn });
    await kit.dispatch(TICK);
    await item.change(kit, rule.automationId);
    await kit.dispatch(LATER);
    const [run] = await kit.runs("user:a", rule.automationId);
    assert.equal(push.sent.length, 1, `${item.reason}: not sent again`);
    assert.deepEqual([run.delivery.push.state, run.delivery.push.reason], ["skipped", item.reason]);
    assert.equal(pushHistoryLine(run, "zh"), item.line);
    assert.equal(run.delivery.inbox.state, "delivered", "the result stays in the inbox");
  }
});

test("AG16 (视觉稿 D16-4, approved 2026-11-20): quiet hours, the daily limit and a turned-off notification kind hold the reminder back; the result is in the inbox and the history says why", async () => {
  const lines: Record<RulePushHold, string> = {
    daily_cap: "没有提醒：当天的提醒已到每日上限。结果在收件箱里。",
    notifications_off: "没有提醒：通知设置里关掉了这类提醒。结果在收件箱里。",
    quiet_hours: "没有提醒：当时是免打扰时段。结果在收件箱里。",
  };
  for (const reason of Object.keys(lines) as RulePushHold[]) {
    const { kit, push } = setup();
    push.devices.set("user:a", [phone()]);
    push.hold.value = reason;
    const rule = await createRule(kit.storage, "user:a", kit.now, { rule: pushOn });
    await kit.dispatch(TICK);
    push.hold.value = null;
    await kit.dispatch(LATER);
    const [run] = await kit.runs("user:a", rule.automationId);
    assert.equal(push.sent.length, 0, "held back, and not sent later either");
    assert.deepEqual([run.outcome, run.delivery.push.state, run.delivery.push.reason, run.delivery.push.attempts], ["delivered", "skipped", reason, 0]);
    assert.equal(pushHistoryLine(run, "zh"), lines[reason]);
    assert.equal(kit.inbox.length, 1);
    assert.deepEqual(push.counted, []);
  }
});

test("AG16-3: a refusal that keeps coming is given up after the last round; a late receipt saying the device is gone turns 'delivered' into 'not arrived'", async () => {
  const { kit, push } = setup();
  push.devices.set("user:a", [phone()]);
  push.answers.set(phone().token, Array.from({ length: RULE_PUSH_MAX_ATTEMPTS }, () => "refuse" as const));
  const rule = await createRule(kit.storage, "user:a", kit.now, { rule: pushOn });
  await kit.dispatch(TICK);
  for (let hour = 1; hour <= 30; hour += 1) await kit.dispatch(new Date(Date.parse(TICK) + hour * 3_600_000).toISOString());
  let [run] = (await kit.runs("user:a", rule.automationId)).slice(-1);
  assert.equal(push.sent.length, RULE_PUSH_MAX_ATTEMPTS);
  assert.deepEqual([run.delivery.push.state, run.delivery.push.reason, run.delivery.push.attempts], ["failed", "provider_rejected", RULE_PUSH_MAX_ATTEMPTS]);
  assert.equal(kit.computed.filter((item) => item.scheduledAt === run.scheduledAt).length, 1);

  const other = setup();
  other.push.devices.set("user:a", [phone()]);
  const second = await createRule(other.kit.storage, "user:a", other.kit.now, { rule: pushOn });
  await other.kit.dispatch(TICK);
  [run] = await other.kit.runs("user:a", second.automationId);
  assert.equal(run.delivery.push.targets?.[0].receipt, "pending");
  other.push.receipts.set(run.delivery.push.targets![0].receiptId!, { error: "DeviceNotRegistered", status: "error" });
  await other.kit.dispatch(LATER);
  assert.equal((await other.kit.runs("user:a", second.automationId))[0].delivery.push.state, "delivered", "a receipt is not asked for before fifteen minutes");
  await other.kit.dispatch("2026-11-20T09:30:00+09:00");
  [run] = await other.kit.runs("user:a", second.automationId);
  assert.deepEqual([run.delivery.push.state, run.delivery.push.reason, run.delivery.push.deliveredAt], ["failed", "permission_revoked", undefined]);
  assert.deepEqual(other.push.revoked, ["PD1"]);
  assert.equal(other.push.sent.length, 1, "a receipt never causes a second send");
  assert.equal(run.outcome, "delivered");
});

test("AG16-2: turned on from a Japanese conversation, a Chinese task's reminder is Chinese; the confirmed card wrote only the switch", async () => {
  const { kit, push } = setup();
  push.devices.set("user:a", [phone()]);
  const rule = await createRule(kit.storage, "user:a", kit.now);
  assert.equal(rule.rule?.locale, "zh");
  const automations = serviceFor(kit.storage, "user:a", kit.now);
  const shown = { automationId: rule.automationId, rule: rule.rule!, schedule: FRIDAY_9, status: "active", title: rule.title, version: rule.version };
  const op = prepareRuleOperation({ actionId: "action:1", index: 0, intent: { capability: RULE_UPDATE, expectedVersion: rule.version, set: { notify: { inApp: true, push: true } }, shown, targetId: rule.automationId }, locale: "ja", revision: 1 });
  await ruleWriteExecutors({ automations }).find((item) => item.key === RULE_UPDATE)!.execute(op.payload as Record<string, unknown>, { actionId: "action:1", idempotencyKey: "k1", now: kit.now(), operationId: "op1", runId: "run:1" });
  assert.deepEqual((await automations.get(rule.automationId))?.rule?.notify, (op.after as { notify: unknown }).notify, "writes exactly the card's new value");
  await kit.dispatch(TICK);
  assert.equal(push.sent.length, 1);
  assert.equal(push.sent[0].body, RULE_PUSH_BODY.zh, "the same language as the result it announces");
});

/** One device, the push service accepts at 9:10; the receipt is asked for at the round 15 minutes later. */
async function acceptedThenReceipt(receipt: { status: "ok" | "pending" } | { status: "error"; error: string } | null) {
  const { kit, push } = setup();
  push.devices.set("user:a", [phone()]);
  const rule = await createRule(kit.storage, "user:a", kit.now, { rule: pushOn });
  await kit.dispatch(TICK);
  let [run] = await kit.runs("user:a", rule.automationId);
  assert.deepEqual([run.delivery.push.state, run.delivery.push.targets?.[0].receipt], ["delivered", "pending"]);
  assert.equal(pushHistoryLine(run, "zh", "Asia/Tokyo"), "提醒已送到 9:10");
  if (receipt) push.receipts.set(run.delivery.push.targets![0].receiptId!, receipt);
  // The second round: at 9:25 the receipt is due.
  await kit.dispatch("2026-11-20T09:26:00+09:00");
  [run] = await kit.runs("user:a", rule.automationId);
  return { kit, push, rule, run };
}

test("AG16-3: the round after a delivery only reads the receipt — ok: nothing is sent and the history still says delivered", async () => {
  const { push, run } = await acceptedThenReceipt({ status: "ok" });
  assert.equal(push.sent.length, 1, "nothing sent again");
  assert.deepEqual([run.delivery.push.state, run.delivery.push.attempts, run.delivery.push.targets?.[0].receipt], ["delivered", 1, "verified"]);
  assert.equal(pushHistoryLine(run, "zh", "Asia/Tokyo"), "提醒已送到 9:10");
  assert.deepEqual(push.counted.length, 1);
});

test("AG16-3: the receipt not there yet: nothing is sent; it is asked for again later, and after a day it is no longer asked for", async () => {
  const { kit, push, rule, run } = await acceptedThenReceipt({ status: "pending" });
  assert.equal(push.sent.length, 1);
  assert.deepEqual([run.delivery.push.state, run.delivery.push.targets?.[0].receipt], ["delivered", "pending"]);
  await kit.dispatch("2026-11-21T09:30:00+09:00");
  const [later] = await kit.runs("user:a", rule.automationId);
  assert.equal(push.sent.length, 1, "a receipt that never comes never causes a send");
  assert.deepEqual([later.delivery.push.state, later.delivery.push.targets?.[0].receipt], ["delivered", undefined]);
});

test("AG16-3: the receipt says the push service did not deliver: one resend, the history says so; a second failure is not resent", async () => {
  const { kit, push, rule, run } = await acceptedThenReceipt({ error: "MessageRateExceeded", status: "error" });
  assert.equal(push.sent.length, 2, "sent once more");
  assert.deepEqual(push.sent[0], push.sent[1], "the same fixed message");
  assert.deepEqual([run.delivery.push.state, run.delivery.push.attempts, run.delivery.push.targets?.[0].attempts], ["delivered", 2, 2]);
  assert.equal(pushHistoryLine(run, "zh", "Asia/Tokyo"), "第一次没送出去，9:26 补送到了。没有重新算。", "not 「已送到」 followed by a silent second push");
  assert.equal(push.counted.length, 1, "still one reminder towards the day's limit");
  // The resend's receipt also fails: no third send; the history says it did not arrive.
  push.receipts.set(run.delivery.push.targets![0].receiptId!, { error: "MessageRateExceeded", status: "error" });
  await kit.dispatch("2026-11-20T09:45:00+09:00");
  const [after] = await kit.runs("user:a", rule.automationId);
  assert.equal(push.sent.length, 2, "at most one resend per device per period");
  assert.deepEqual([after.delivery.push.state, after.delivery.push.reason], ["failed", "provider_rejected"]);
  assert.equal(pushHistoryLine(after, "zh", "Asia/Tokyo"), "提醒没送到。结果在收件箱里。");
  assert.equal(kit.computed.length, 1, "nothing was worked out again");
  assert.equal(kit.inbox.length, 1, "one inbox entry");
});

test("AG16-3: a receipt saying the device is gone, or a refusal that will not change, is never resent", async () => {
  for (const error of ["DeviceNotRegistered", "MessageTooBig", "InvalidCredentials"]) {
    const { push, run } = await acceptedThenReceipt({ error, status: "error" });
    assert.equal(push.sent.length, 1, error);
    assert.equal(run.delivery.push.state, "failed", error);
  }
});

test("AG16: a result called off before it reached the inbox takes its reminder with it; no channel configured is said as such", async () => {
  const { kit, push } = setup();
  push.devices.set("user:a", [phone()]);
  kit.inboxFails.value = true;
  const rule = await createRule(kit.storage, "user:a", kit.now, { rule: pushOn });
  await kit.dispatch(TICK);
  assert.equal(push.sent.length, 0, "no reminder before the result is in the inbox");
  await serviceFor(kit.storage, "user:a", kit.now).update(rule.automationId, { status: "paused" });
  kit.inboxFails.value = false;
  await kit.dispatch(LATER);
  const [run] = await kit.runs("user:a", rule.automationId);
  assert.deepEqual([run.delivery.inbox.state, run.delivery.push.state, run.delivery.push.reason], ["cancelled", "skipped", "result_not_sent"]);
  assert.equal(pushHistoryLine(run, "zh"), "没有提醒：这一期的结果没有送出。");
  assert.equal(push.sent.length, 0);

  const bare = createDispatchKit();
  const lone = await createRule(bare.storage, "user:a", bare.now, { rule: pushOn });
  await bare.dispatch(TICK);
  const [unsent] = await bare.runs("user:a", lone.automationId);
  assert.deepEqual([unsent.outcome, unsent.delivery.push.state, unsent.delivery.push.reason], ["delivered", "failed", "no_device"]);
  assert.equal((await bare.storage.listOwned("user:a", "delivery")).length, 0, "nothing is left to retry forever");
});

test("AG16: turning the reminder on makes a new version of the task, and what it told before is still not told again", async () => {
  const { kit, push } = setup();
  push.devices.set("user:a", [phone()]);
  const rule = await createRule(kit.storage, "user:a", kit.now, { schedule: { kind: "daily", time: "09:00", timeZone: "Asia/Tokyo" } });
  kit.result.value = (input) => picked(["E101", "E102", "E103"].filter((id) => !input.told.has(`event:${id}`)));
  await kit.dispatch("2026-11-16T09:10:00+09:00");
  const service = serviceFor(kit.storage, "user:a", kit.now);
  const current = (await service.get(rule.automationId))!;
  const updated = await service.update(rule.automationId, { rule: { ...current.rule!, notify: { inApp: true, push: true }, toldFromVersion: current.rule!.toldFromVersion ?? current.version } });
  assert.equal(updated.version, 2);
  await kit.dispatch("2026-11-17T09:10:00+09:00");
  assert.deepEqual(kit.computed.map((item) => item.told), [[], ["event:E101", "event:E102", "event:E103"]]);
  assert.equal(push.sent.length, 0, "nothing new, so no reminder");
});

test("AG16-3: what the two task pages read — the result's completion time and the reminder are separate fields, and every history line of the draft's 16-4 can be said", async () => {
  const { kit, push } = setup();
  push.devices.set("user:a", [phone()]);
  push.answers.set(phone().token, ["refuse"]);
  const rule = await createRule(kit.storage, "user:a", kit.now, { rule: pushOn });
  await kit.dispatch(TICK);
  await kit.dispatch(LATER);
  const [run] = await kit.runs("user:a", rule.automationId);
  const view = scheduledRunView(run, "zh");
  assert.equal(agentScheduledTaskRunSchema.safeParse(view).success, true, JSON.stringify(agentScheduledTaskRunSchema.safeParse(view)));
  assert.equal(view.computedAt, new Date(TICK).toISOString());
  // The page shows the clock of the second round in the task's own zone (draft 16-4 「9:20 补送到了」); the clients format nothing.
  assert.deepEqual({ attempts: view.push.attempts, deliveredAt: view.push.deliveredAt, line: view.push.line, state: view.push.state }, { attempts: 2, deliveredAt: new Date(LATER).toISOString(), line: "第一次没送出去，9:20 补送到了。没有重新算。", state: "delivered" });
  assert.equal(scheduledRunView(run, "en", "Asia/Tokyo").push.line, "The reminder did not go out at first and arrived at 9:20. Nothing was worked out a second time.");
  assert.equal(scheduledRunView(run, "ja", "Asia/Tokyo").push.line, "お知らせは最初は送れず、9:20 に届きました。結果の計算はやり直していません。");
  assert.equal(scheduledRunView(run, "zh", "Europe/London").push.line, "第一次没送出去，0:20 补送到了。没有重新算。", "in the task's zone");
  const once = { ...run, delivery: { ...run.delivery, push: { ...run.delivery.push, attempts: 1, deliveredAt: new Date(TICK).toISOString() } } };
  assert.equal(scheduledRunView(once, "zh", "Asia/Tokyo").push.line, "提醒已送到 9:10");
  assert.equal(scheduledRunView(once, "en", "Asia/Tokyo").push.line, "Reminder delivered at 9:10");
  assert.equal(scheduledRunView(once, "ja", "Asia/Tokyo").push.line, "お知らせを届けました（9:10）");
  // Without a zone (as before AG16's pages) the line has no clock.
  assert.equal(pushHistoryLine(once, "zh"), "提醒已送到");
  assert.deepEqual(view.push.targets, [{ deviceId: "PD1", platform: "ios", state: "delivered" }]);
  assert.equal(JSON.stringify(view.push).includes("ticket-"), false, "the push service's ticket is not sent to the clients");
  assert.equal(view.line, "已放进收件箱（2条）", "the first line is the result's; it does not change because of the reminder");
});

/* ── Integration (AG14 × AG16, coordinator's decision 6, 2026-11-20) ── */

/** The real period computation over the FN world, with the owner's saved memory behind the recall seam. */
async function realRuns(saved: { content: string; memoryId: string }[]) {
  const { kit, push } = setup();
  const store = createMemoryLiveRecordStore<AgentMemoryRecordPayload>();
  const memoryOf = (accountId: string, workspaceId: string) => createStorageAgentMemoryService({ actorId: accountId, now: kit.now, store, workspaceId });
  for (const entry of saved) await memoryOf(ACTOR, kit.storage.workspaceId).create({ appliesTo: ["all"], category: "constraint", ...entry });
  const recall = configuredRuleRecall({ serviceFor: memoryOf });
  kit.result.value = (input) => runRulePeriod({ now: kit.now, recall, records: recordAccessOf(fnWorld()), workspaceId: kit.storage.workspaceId }, { ...(input as typeof input & { automation: AgentAutomation }), previousCardId: null });
  push.devices.set(ACTOR, [phone()]);
  const rule = await createRule(kit.storage, ACTOR, kit.now, { rule: pushOn });
  await kit.dispatch(TICK);
  const [run] = await kit.runs(ACTOR, rule.automationId);
  return { push, run };
}

test("a Chinese task with a saved 「回答用日语」 rule: the result is Japanese, the run records Japanese, and so is the reminder", async () => {
  const { push, run } = await realRuns([{ content: "回答用日语", memoryId: "memory:ja" }]);
  assert.match(run.text ?? "", /^定期タスク「每周五挑三场周末活动」/u, run.text);
  assert.equal(run.locale, "ja");
  assert.equal(push.sent.length, 1);
  assert.equal(push.sent[0].body, RULE_PUSH_BODY.ja);
});

test("with no saved reply-language rule the result, the run and the reminder all follow the task's own language", async () => {
  const { push, run } = await realRuns([]);
  assert.match(run.text ?? "", /^定时任务「每周五挑三场周末活动」/u, run.text);
  assert.equal(run.locale, "zh");
  assert.equal(push.sent.length, 1);
  assert.equal(push.sent[0].body, RULE_PUSH_BODY.zh);
});
