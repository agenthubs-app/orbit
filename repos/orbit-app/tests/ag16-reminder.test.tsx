import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";

import type { OrbitApiClient } from "../src/api/client";
import { cardTurnedReminderOn, reminderLineOf, showsReminderLines } from "../src/api/compute/agent-reminder";
import type { AgentActionPreviewContract } from "../src/api/contract/agent-v1";
import { createTranslator } from "../src/i18n/messages";
import { phoneReminderState } from "../src/notifications/phone-reminder";
import { AgentConfirmationCard } from "../src/screens/ai/cards/AgentConfirmationCard";
import { phoneLine } from "../src/screens/me/ScheduledTaskReminder";
import { setScheduledTaskPush } from "../src/screens/me/scheduled-tasks-api";
import { renderedText } from "./helpers/render";

/**
 * agent-design AG16 on the App (approved visual draft 16-1 to 16-4, D16-1, D16-3):
 *   - one switch per task, saved at once on the web's route, in the App's language;
 *   - this phone's line: allowed (「这台手机会收到提醒」, 「不在这台手机上提醒」), refused or later switched off in the system
 *     (「去系统设置打开」), never asked (the system's prompt comes only from the owner's press), turned off in Orbit;
 *   - under a confirmed card that turned a reminder on: 「已打开。这台手机还没允许通知」; nothing when it will ring;
 *   - the history's second line comes from the server and only for tasks that have or had the reminder on.
 * The screen wiring is checked in the source; the Simulator run (evidence) shows it on screen.
 */
const t = createTranslator("zh");
const words = (line: ReturnType<typeof phoneLine>) => (line ? [line.lead ? t(line.lead) : "", t(line.title), line.body ? t(line.body) : "", t(line.action)].join("|") : "");

test("this phone's state: the system's answer and Orbit's own switch (「在这台 iPhone 上接收通知」)", () => {
  assert.equal(phoneReminderState("granted", true), "on");
  assert.equal(phoneReminderState("granted", false), "off");
  assert.equal(phoneReminderState("undetermined", false), "not_asked");
  assert.equal(phoneReminderState("undetermined", true), "not_asked");
  assert.equal(phoneReminderState("denied", true), "blocked");
});

test("16-3 (App): what the line says in each state, and the draft's two cases word for word", () => {
  assert.equal(words(phoneLine("on", false)), "|这台手机会收到提醒||不在这台手机上提醒");
  assert.equal(words(phoneLine("blocked", false)), "|这台手机不让 Orbit 发通知|所以这里不会弹提醒。结果照常在收件箱，任务照常运行。|去系统设置打开");
  assert.equal(words(phoneLine("not_asked", false)), "|这台手机还没允许 Orbit 发通知|允许之后，这里才会弹提醒。不允许也没关系，结果照常在收件箱。|允许这台手机通知");
  assert.equal(words(phoneLine("off", false)), "|这台手机现在不收 Orbit 的通知|你在这台手机上关掉了通知。结果照常在收件箱。|在这台手机上提醒");
  // 16-2: under the card, only when it will not ring yet, with 「已打开。」 in front.
  assert.equal(phoneLine("on", true), null);
  assert.equal(words(phoneLine("not_asked", true)), "已打开。|这台手机还没允许通知|允许之后，这里才会弹提醒。不允许也没关系，结果照常在收件箱。|允许这台手机通知");
  assert.ok(words(phoneLine("blocked", true)).startsWith("已打开。|这台手机不让 Orbit 发通知"));
  for (const language of ["en", "ja"] as const) {
    const other = createTranslator(language);
    for (const state of ["on", "blocked", "not_asked", "off"] as const) {
      const line = phoneLine(state, state !== "on");
      for (const key of [line?.lead, line?.title, line?.body, line?.action]) if (key) assert.notEqual(other(key), key, `${language} ${key}`);
    }
  }
});

test("16-1 (App): the switch saves at once on the web's route, and sends the switch only", async () => {
  const calls: string[] = [];
  const client = { async put(path: string, options: { body: unknown }) { calls.push(`PUT ${path} ${JSON.stringify(options.body)}`); return { data: { task: {} }, status: 200, success: true }; } } as unknown as OrbitApiClient;
  assert.equal(await setScheduledTaskPush(client, "rule:1", true), true);
  assert.equal(await setScheduledTaskPush(client, "rule:1", false), true);
  assert.deepEqual(calls, ["PUT /api/agent/automations/rule%3A1/reminder {\"push\":true}", "PUT /api/agent/automations/rule%3A1/reminder {\"push\":false}"]);
  const failing = { async put() { return { error: { code: "NOT_FOUND" }, status: 404, success: false }; } } as unknown as OrbitApiClient;
  assert.equal(await setScheduledTaskPush(failing, "rule:1", true), false);
});

const reminderCard = (overrides: Partial<AgentActionPreviewContract> = {}): AgentActionPreviewContract => ({
  actionId: "a9", locale: "zh", operations: [{ after: { notify: { inApp: true, push: true } }, before: { notify: { inApp: true, push: false } }, capability: "rule.update", display: { change: "update", note: "只改这一条，别的任务照旧只进收件箱。提醒上不写活动名称、时间和地点。", record: "定时任务「每周五挑 3 场周末活动」", rows: [{ after: "放进收件箱，并在手机和浏览器上提醒", before: "只放进收件箱", field: "notify", label: "有新结果" }] }, operationId: "a9:op1", status: "succeeded", text: "t" }],
  payloadHash: "h", revision: 1, revisions: [], status: "completed", summary: "s", title: "修改1项", updatedAt: "2026-11-20T01:00:00.000Z", ...overrides,
});

test("16-2 (App): the card is unchanged; a confirmed one that turned a reminder on gets the line under it", () => {
  assert.equal(cardTurnedReminderOn(reminderCard()), true);
  assert.equal(cardTurnedReminderOn(reminderCard({ status: "awaiting_confirmation" })), false);
  const waiting = renderedText(<AgentConfirmationCard card={reminderCard({ status: "awaiting_confirmation" })} language="zh" online pendingTargets={[]} onDecide={async () => true} onRegenerate={async () => true} />);
  assert.ok(waiting.includes("定时任务「每周五挑 3 场周末活动」") && waiting.includes("只放进收件箱"), waiting);
  const source = readFileSync(new URL("../src/screens/ai/cards/AgentConfirmationCard.tsx", import.meta.url), "utf8");
  assert.match(source, /reminderOn \? <View style=\{styles\.afterCard\} testID="agent-card-reminder"><PhoneReminderLine afterCard \/><\/View> : null/u);
});

test("16-1 and 16-4 (App): the screen's wiring — the block in AG15's slot, 「怎么通知你」 dropped while on, two history lines, the list marker", () => {
  const source = readFileSync(new URL("../src/screens/me/ScheduledTasksScreens.tsx", import.meta.url), "utf8");
  assert.match(source, /task\.status === "completed" \? null : <ReminderCard task=\{task\} client=\{client\}/u);
  assert.match(source, /row\.field !== "nextRunAt" && !\(row\.field === "notify" && task\.notify\.push\)/u);
  assert.match(source, /showsReminderLines\(task, history\.runs\)/u);
  assert.match(source, /reminderLineOf\(run\)/u);
  assert.match(source, /task\.notify\.push \? <UiText[^>]*>\{" · "\}\{t\("scheduledTasks\.reminderMarker"\)\}/u);
  assert.equal(showsReminderLines({ notify: { inApp: true, push: false } }, [{ push: { attempts: 0, line: "当时没开提醒", state: "not_requested" } }]), false);
  assert.deepEqual(reminderLineOf({ push: { attempts: 1, line: "提醒没送到：手机的通知被关了。结果在收件箱里。", state: "failed" } }), { text: "提醒没送到：手机的通知被关了。结果在收件箱里。", tone: "missed" });
  assert.deepEqual(reminderLineOf({ push: { attempts: 2, line: "第一次没送出去，9:20 补送到了。没有重新算。", state: "delivered" } })?.tone, "delivered");
  assert.equal(React.isValidElement(<AgentConfirmationCard card={reminderCard()} language="zh" online pendingTargets={[]} onDecide={async () => true} onRegenerate={async () => true} />), true);
});
