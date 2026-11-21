import assert from "node:assert/strict";
import test from "node:test";

import { createMemoryAutomationStorage } from "../../features/agent/automations/due-index";
import { ruleWriteExecutors } from "../../features/agent-v1/domains/rule/apply";
import { prepareRuleOperation, reminderNote, RULE_UPDATE } from "../../features/agent-v1/domains/rule/ops";
import { cardPayloadHash } from "../../features/agent/runtime/decision";
import { isRuleRequest } from "../../features/agent-v1/graph/nodes/route";
import { stateVerbSaidIn } from "../../features/agent-v1/rule/parse";
import { checkRuleChoice, reminderSaidIn, reminderSpanIn, ruleChoiceSystemPrompt, ruleChoiceUserText, withoutReminderWords } from "../../features/agent-v1/rule/reminder";
import { createRule, FRIDAY_9, ruleSpec, serviceFor, WORKSPACE } from "../capabilities/agent-automation-kit";

/**
 * agent-design AG16-1 (PLANNER 易错边界 1; AE-PSH-001/004/005): "remind me on my phone when this task has something new"
 * is a change of that task — read by code, shown on a confirmation card, written only after the click, and only for
 * the one task named.
 */

test("code reads the words that ask for a reminder, and the ones that call it off, in Chinese, Japanese and English", () => {
  const on = [
    "「每周五挑三场周末活动」这个定时任务，以后有新结果就在手机上提醒我。",
    "这条任务以后在手机上提醒我",
    "有新结果就通知我",
    "「每周五挑三场周末活动」の定期タスク、これからは新しい結果が出たらスマホに通知してほしいです。",
    "新しい結果が出たら知らせて",
    "Can you turn on phone notifications for my Friday weekend-picks task?",
    "Ping me whenever it finds something new.",
    "notify me when the scheduled task has results",
  ];
  for (const words of on) assert.equal(reminderSaidIn(words), true, words);
  const off = ["这条定时任务不用提醒了", "把这个任务的提醒关掉提醒", "关掉通知", "turn off notifications for my weekend task", "stop pinging me about that task", "この定期タスクの通知はいらないです", "通知をオフにして"];
  for (const words of off) assert.equal(reminderSaidIn(words), false, words);
  for (const words of ["把报价待办改到周五", "暂停这个定时任务", "pause the scheduled task", "每周五挑三场周末活动"]) assert.equal(reminderSaidIn(words), null, words);
  assert.equal(reminderSpanIn("暂停这个定时任务"), null);
  const message = "这个定时任务，以后有新结果就在手机上提醒我。";
  const [start, end] = reminderSpanIn(message)!;
  assert.match(message.slice(start, end), /提醒/u);
});

test("calling a reminder off does not pause the task: the pause words are read without the reminder phrase", () => {
  const sentence = "turn off notifications for my scheduled task";
  assert.equal(stateVerbSaidIn(sentence), "pause", "AG15's reading of the bare words");
  assert.equal(stateVerbSaidIn(withoutReminderWords(sentence)), null, "with the reminder phrase taken out there is no pause left");
  assert.equal(stateVerbSaidIn(withoutReminderWords("暂停这个定时任务，也不用提醒了")), "pause", "a real pause said next to it is still a pause");
});

test("the route sends a reminder change of a task to the card step, and leaves an ordinary 'remind me' alone", () => {
  const part = (capabilities: string[]) => ({ capabilities: capabilities as never, continues: null });
  assert.equal(isRuleRequest(part([]), "这个定时任务以后在手机上提醒我", []), true, "names a scheduled task and asks for a reminder");
  assert.equal(isRuleRequest(part(["rule.update"]), "Can you turn on phone notifications for my Friday weekend-picks task?", []), true, "the first layer named a rule capability");
  assert.equal(isRuleRequest(part([]), "「每周五挑三场周末活动」の定期タスク、これからは新しい結果が出たらスマホに通知してほしいです。", []), true);
  assert.equal(isRuleRequest(part(["todo.create"]), "明天下午三点提醒我给王总回电话", []), false, "a to-do reminder is not a scheduled task");
  assert.equal(isRuleRequest(part([]), "提醒我明天交任务", []), false);
  assert.equal(isRuleRequest(part(["schedule.update", "rule.update"]), "把周会的日程提醒我一下", []), false, "a calendar entry stays with the schedule");
});

test("the card says which task, that only this one changes, and that the reminder holds no content — in the language of the message", () => {
  const shown = { automationId: "rule:1", rule: ruleSpec(), schedule: FRIDAY_9, status: "active", title: "每周五挑三场周末活动", version: 1 };
  const card = (locale: "zh" | "en" | "ja") => prepareRuleOperation({ actionId: "a", index: 0, intent: { capability: RULE_UPDATE, expectedVersion: 1, set: { notify: { inApp: true, push: true } }, shown, targetId: "rule:1" }, locale, revision: 1 });
  const zh = card("zh");
  assert.equal(zh.display?.record, "定时任务「每周五挑三场周末活动」");
  // The approved draft's words (16-2): 「有新结果  只放进收件箱 → 放进收件箱，并在手机和浏览器上提醒」 and one sentence under it.
  assert.deepEqual(zh.display?.rows.map((row) => [row.field, row.label, row.before, row.after]), [["notify", "有新结果", "只放进收件箱", "放进收件箱，并在手机和浏览器上提醒"]]);
  assert.equal(zh.display?.note, "只改这一条，别的任务照旧只进收件箱。提醒上不写活动名称、时间和地点。");
  assert.equal(zh.preview, `定时任务「每周五挑三场周末活动」：有新结果：只放进收件箱 → 放进收件箱，并在手机和浏览器上提醒。${zh.display?.note}`, "the card's own text says it too");
  // The text line that mirrors the card separates the label from its value as the new-task card's line does.
  assert.equal(card("en").preview, 'Scheduled task "每周五挑三场周末活动": When there\'s something new: To your inbox only → To your inbox, with a reminder on your phone and in your browser. Only this task changes; your other tasks still go to your inbox only. The reminder shows no event names, times or places.');
  assert.match(card("ja").preview, /：新しい結果があったら：受信箱に届けるだけ → 受信箱に届け、スマホとブラウザにもお知らせ。/u);
  // The product owner's rule: no 「推送」「站内」 (push, in-app) anywhere on the card, in any language.
  for (const locale of ["zh", "en", "ja"] as const) {
    for (const push of [true, false]) {
      const turned = prepareRuleOperation({ actionId: "a", index: 0, intent: { capability: RULE_UPDATE, expectedVersion: 1, set: { notify: { inApp: true, push } }, shown: { ...shown, rule: ruleSpec({ notify: { inApp: true, push: !push } }) }, targetId: "rule:1" }, locale, revision: 1 });
      const visible = JSON.stringify([turned.display, turned.preview]);
      assert.doesNotMatch(visible, /推送|站内|in-app|In-app|プッシュ|アプリ内|\bpush\b/u, `${locale} ${push}: ${visible}`);
    }
  }
  // The card writes the switch only: no language behind it (the reminder follows the language of the task's results).
  assert.deepEqual(zh.after, { notify: { inApp: true, push: true } });
  assert.deepEqual(zh.before, { notify: { inApp: true, push: false } });
  assert.deepEqual((zh.payload as { set: unknown }).set, { notify: { inApp: true, push: true } });
  assert.match(card("ja").display?.note ?? "", /^変わるのはこのタスクだけで、ほかのタスクはこれまでどおり受信箱だけです。お知らせにはイベント名・日時・場所を書きません。$/u);
  assert.match(card("en").display?.note ?? "", /^Only this task changes; your other tasks still go to your inbox only\. The reminder shows no event names, times or places\.$/u);
  for (const locale of ["zh", "en", "ja"] as const) for (const word of ["来源", "证据", "授权", "引用", "范围"]) assert.equal(reminderNote(true, locale).includes(word) || reminderNote(false, locale).includes(word), false);
  // A change that leaves the reminder as it is says nothing about reminders.
  const count = prepareRuleOperation({ actionId: "a", index: 0, intent: { capability: RULE_UPDATE, expectedVersion: 1, set: { maxItems: 5 }, shown, targetId: "rule:1" }, locale: "zh", revision: 1 });
  assert.equal(count.display?.note, undefined);
});

test("after the click the reminder is on for that one task and the change writes exactly what the card shows; before it, nothing changed", async () => {
  const storage = createMemoryAutomationStorage(WORKSPACE);
  const now = () => "2026-11-15T01:00:00.000Z";
  const one = await createRule(storage, "user:a", now);
  const other = await createRule(storage, "user:a", now, { title: "每周五看看周末的设计活动" });
  const automations = serviceFor(storage, "user:a", now);
  const executor = ruleWriteExecutors({ automations }).find((item) => item.key === RULE_UPDATE)!;
  const shown = { automationId: one.automationId, rule: one.rule!, schedule: FRIDAY_9, status: "active", title: one.title, version: 1 };
  const op = prepareRuleOperation({ actionId: "action:1", index: 0, intent: { capability: RULE_UPDATE, expectedVersion: 1, set: { notify: { inApp: true, push: true } }, shown, targetId: one.automationId }, locale: "ja", revision: 1 });
  assert.deepEqual((await automations.get(one.automationId))?.rule?.notify, { inApp: true, push: false }, "a frozen card changes nothing");
  await executor.execute(op.payload as Record<string, unknown>, { actionId: "action:1", idempotencyKey: "k1", now: now(), operationId: "op1", runId: "run:1" });
  const changed = (await automations.get(one.automationId))!;
  // writes_exact: the task's stored switch is exactly the card's new value — nothing the card does not show.
  assert.deepEqual(changed.rule?.notify, (op.after as { notify: unknown }).notify);
  assert.deepEqual(changed.rule?.notify, { inApp: true, push: true });
  assert.deepEqual(op.display?.rows.map((row) => row.field), ["notify"], "the only thing written is the one row on the card");
  // A task stored with a language from before this change loses it when the switch is flipped again.
  const old = await createRule(storage, "user:a", now, { rule: { notify: { inApp: true, push: true, pushLocale: "en" } }, title: "旧的那条" });
  await executor.execute({ automationId: old.automationId, expectedVersion: 1, set: { notify: { inApp: true, push: false } } }, { actionId: "action:3", idempotencyKey: "k3", now: now(), operationId: "op3", runId: "run:3" });
  assert.deepEqual((await automations.get(old.automationId))?.rule?.notify, { inApp: true, push: false });
  assert.deepEqual([changed.version, changed.rule?.toldFromVersion, changed.delivery], [2, 1, "push"], "a reminder-only change keeps what the task told before");
  assert.deepEqual((await automations.get(other.automationId))?.rule?.notify, { inApp: true, push: false }, "no other task changes");
  // A change of what the task does starts its memory anew, as before AG16.
  await executor.execute({ automationId: one.automationId, expectedVersion: 2, set: { maxItems: 5 } }, { actionId: "action:2", idempotencyKey: "k2", now: now(), operationId: "op2", runId: "run:2" });
  const recounted = (await automations.get(one.automationId))!;
  assert.deepEqual([recounted.version, recounted.rule?.maxItems, recounted.rule?.toldFromVersion, recounted.rule?.notify.push], [3, 5, undefined, true]);
});

test("the model is asked which task only as a number of the list it was shown; anything else is 'could not be told'", () => {
  assert.equal(checkRuleChoice('{"task": 2}', 2), 2);
  assert.equal(checkRuleChoice('```json\n{"task": 1}\n```', 2), 1);
  for (const text of ['{"task": 3}', '{"task": 0}', '{"task": null}', '{"task": "1"}', '{"task": 1.5}', "the first one", '{"approved": true}']) assert.equal(checkRuleChoice(text, 2), null, text);
  const user = ruleChoiceUserText({ message: "turn on phone notifications for my Friday weekend-picks task, not the design one", options: [{ checks: "every Friday at 9:00", number: 1, pickedBy: "按笔记「兴趣笔记」的主题", picksFrom: "周末活动", title: "每周五挑三场周末活动" }, { checks: "every Friday at 9:00", number: 2, pickedBy: "主题是设计", picksFrom: "周末活动", title: "每周五看看周末的设计活动" }] });
  assert.match(user, /1\. title: "每周五挑三场周末活动" \| picks from: 周末活动 \| picked by: 按笔记「兴趣笔记」的主题/u);
  assert.match(ruleChoiceSystemPrompt(), /Never guess/u);
});

test("the card's hash covers every word the reminder row shows: its label, both values and the sentence under it", () => {
  const shown = { automationId: "rule:1", rule: ruleSpec(), schedule: FRIDAY_9, status: "active", title: "每周五挑三场周末活动", version: 1 };
  const op = prepareRuleOperation({ actionId: "a", index: 0, intent: { capability: RULE_UPDATE, expectedVersion: 1, set: { notify: { inApp: true, push: true } }, shown, targetId: "rule:1" }, locale: "zh", revision: 1 });
  const hash = (operation: typeof op) => cardPayloadHash({ operations: [operation as never], preview: operation.preview, revision: 1, title: "修改1项" });
  const display = op.display!;
  const base = hash(op);
  for (const changed of [
    { ...display, note: `${display.note}x` },
    { ...display, rows: display.rows.map((row) => ({ ...row, label: "提醒方式" })) },
    { ...display, rows: display.rows.map((row) => ({ ...row, before: "只放进站内收件箱，不推送" })) },
    { ...display, rows: display.rows.map((row) => ({ ...row, after: `${row.after}x` })) },
  ]) assert.notEqual(hash({ ...op, display: changed }), base, JSON.stringify(changed));
});
