import assert from "node:assert/strict";
import test from "node:test";

import { createMemoryAutomationStorage } from "../../features/agent/automations/due-index";
import { buildCardOperationList, cardCountTitle, cardIntentOf } from "../../features/agent/runtime/card-operations";
import { AgentExecutionPermanentError } from "../../features/agent/runtime/service";
import { ruleIdOf, ruleSnapshotOf, ruleWriteExecutors } from "../../features/agent-v1/domains/rule/apply";
import { checkTimeWords, nextRunWords, prepareRuleOperation, RULE_CANCEL, RULE_CREATE, RULE_PAUSE, RULE_RESUME, RULE_UPDATE, type RuleCreateIntent } from "../../features/agent-v1/domains/rule/ops";
import { isRuleRequest, qualifiesRuleOf } from "../../features/agent-v1/graph/nodes/route";
import { matchRule, ruleTaskOf } from "../../features/agent-v1/graph/nodes/rule";
import { INDUSTRY_WORDS, PLACE_WORDS } from "../../features/agent-v1/graph/nodes/functions";
import { domainSaidIn, pushSaidIn, recurrenceSaidIn, replanSaidIn, scheduleSaidIn, scopeSaidIn, stateVerbSaidIn, timeSaidIn, untilSaidIn } from "../../features/agent-v1/rule/parse";
import { checkRuleDraft } from "../../features/agent-v1/rule/prompt";
import { FRIDAY_9, ruleSpec, serviceFor, WORKSPACE } from "../capabilities/agent-automation-kit";

/**
 * agent-design AG15-1 (设计稿 §5.3, §3.5; PLANNER 易错边界 1): the rule card lists when it checks, what it picks from, what
 * it picks by, how many, until when and how it tells the owner — each on its own row — and the day of the next run;
 * the time is "after 9:00, within about 10 minutes", never the exact minute. Nothing exists before the click.
 */

const TOKYO = "Asia/Tokyo";
const dictionaries = { industries: INDUSTRY_WORDS, places: PLACE_WORDS };

test("the schedule is read from the user's words by code, in Chinese, English and Japanese", () => {
  assert.deepEqual(scheduleSaidIn("每周五上午九点，用 @兴趣笔记 给我挑三场周末活动", TOKYO), { daysOfWeek: [5], kind: "weekly", time: "09:00", timeZone: TOKYO });
  assert.deepEqual(scheduleSaidIn("Every Friday at 9am, send me up to three events happening that weekend", TOKYO), { daysOfWeek: [5], kind: "weekly", time: "09:00", timeZone: TOKYO });
  assert.deepEqual(scheduleSaidIn("毎週金曜の朝9時に、その週末のイベントを3つ選んで知らせて", TOKYO), { daysOfWeek: [5], kind: "weekly", time: "09:00", timeZone: TOKYO });
  assert.deepEqual(scheduleSaidIn("每天下午3点半看看有没有新的摄影活动", TOKYO), { kind: "daily", time: "15:30", timeZone: TOKYO });
  assert.deepEqual(scheduleSaidIn("every Monday and Thursday at 18:30", TOKYO), { daysOfWeek: [1, 4], kind: "weekly", time: "18:30", timeZone: TOKYO });
  assert.deepEqual(scheduleSaidIn("每周一、周三晚上八点", TOKYO), { daysOfWeek: [1, 3], kind: "weekly", time: "20:00", timeZone: TOKYO });
  assert.deepEqual(scheduleSaidIn("毎日 午後6時", TOKYO), { kind: "daily", time: "18:00", timeZone: TOKYO });
  assert.deepEqual(scheduleSaidIn("every weekday at 8am", TOKYO), { daysOfWeek: [1, 2, 3, 4, 5], kind: "weekly", time: "08:00", timeZone: TOKYO });
  assert.equal(scheduleSaidIn("把报价待办改到周五", TOKYO), null, "one Friday is not a recurrence");
  assert.equal(scheduleSaidIn("每周五给我挑三场活动", TOKYO), null, "no time said: code does not make one up");
  assert.equal(scheduleSaidIn("每周五给我挑三场活动", TOKYO, "09:00")?.time, "09:00", "the caller may give the default it shows on the card");
  assert.equal(recurrenceSaidIn("this Friday at 9"), null);
  assert.equal(timeSaidIn("at 12am"), "00:00");
  assert.equal(timeSaidIn("中午十二点"), "12:00");
});

test("the last day, the push wish and the scope are read by code", () => {
  assert.equal(untilSaidIn("结果放站内收件箱就行，不用推送，先跑到 11 月底。", "2026-11-15"), "2026-11-30");
  assert.equal(untilSaidIn("Keep it running through the end of November.", "2026-11-15"), "2026-11-30");
  assert.equal(untilSaidIn("11月末まで続けて。", "2026-11-15"), "2026-11-30");
  assert.equal(untilSaidIn("到 12 月 15 日为止", "2026-11-15"), "2026-12-15");
  assert.equal(untilSaidIn("until Feb 10", "2026-11-15"), "2027-02-10", "a month already past means next year's");
  assert.equal(untilSaidIn("每周五上午九点给我挑三场周末活动", "2026-11-15"), null);
  assert.equal(pushSaidIn("结果放站内收件箱就行，不用推送"), false);
  assert.equal(pushSaidIn("In-app inbox only, no push."), false);
  assert.equal(pushSaidIn("通知はアプリ内の受信箱だけでいいよ。"), false);
  assert.equal(pushSaidIn("有结果就推送提醒我"), true);
  assert.equal(pushSaidIn("每周五给我挑三场活动"), null);

  assert.deepEqual(scopeSaidIn("每周五挑三场周末活动", dictionaries), { domain: "event", window: "weekend" });
  assert.deepEqual(scopeSaidIn("events happening that weekend", dictionaries), { domain: "event", window: "weekend" });
  assert.deepEqual(scopeSaidIn("当周周六、周日开始的平台活动", dictionaries), { domain: "event", window: "weekend" });
  assert.deepEqual(scopeSaidIn("本月每天留意摄影主题的活动", dictionaries), { domain: "event", topics: ["摄影"], window: "month" });
  assert.deepEqual(scopeSaidIn("每周五看看有什么活动", dictionaries), { domain: "event", window: "week" });
  assert.deepEqual(scopeSaidIn("行业是半导体、最近一次真实往来在 60 天以前的联系人", dictionaries), { domain: "contact", industries: ["半导体"], quietDays: 60 });
  assert.equal(replanSaidIn("每周一把过了计划日还没完成的待办改到当天"), true);
  assert.equal(domainSaidIn("每周一把过了计划日还没完成的待办改到当天"), "todo");
  assert.equal(scopeSaidIn("随便挑点什么", dictionaries), null);
  assert.equal(stateVerbSaidIn("把「每周五挑三场周末活动」这条定时任务先暂停。"), "pause");
  assert.equal(stateVerbSaidIn("恢复那条定时任务"), "resume");
  assert.equal(stateVerbSaidIn("delete the scheduled task"), "cancel");
});

test("the model's pointers must be pieces of the message; approval flags and account ids are dropped", () => {
  const message = "Every Friday at 9am, send me up to three events happening that weekend, soonest first.";
  const ok = checkRuleDraft(JSON.stringify({ accountId: "user_b", approved: true, basisText: "soonest first", count: 3, domain: "event", schedule: { daysOfWeek: [5], kind: "weekly", time: "09:00" }, scheduleText: "Every Friday at 9am", scopeText: "events happening that weekend", target: null, until: null, untilText: null, verb: "create" }), message);
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(message.slice(...ok.draft.basisText!), "soonest first");
    assert.deepEqual(ok.draft.schedule, { daysOfWeek: [5], kind: "weekly", time: "09:00" });
    assert.equal("approved" in ok.draft, false);
  }
  const bad = checkRuleDraft(JSON.stringify({ basisText: "by popularity", scheduleText: "Every Friday at 9am", verb: "create" }), message);
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.match(bad.errors.join(" "), /basisText .* not copied/u);
  assert.equal(checkRuleDraft("not json", message).ok, false);
});

const createIntent = (overrides: Partial<RuleCreateIntent["set"]> = {}): RuleCreateIntent => ({
  capability: RULE_CREATE,
  set: { rule: ruleSpec({ rankingBasis: "按笔记「兴趣笔记」的主题", ranking: {}, references: [{ id: "note:m36", title: "兴趣笔记", type: "memo" }], scopeText: "周末活动（那个周末开始的公开活动）", validUntil: "2026-11-30" }), schedule: FRIDAY_9, title: "每周五挑3个：周末活动", ...overrides },
});

test("the card of a new task lists the six things on their own rows, says 'after 9:00, within about 10 minutes', and names the next run's day", () => {
  const op = prepareRuleOperation({ actionId: "action:1", index: 0, intent: createIntent(), locale: "zh", now: "2026-11-15T01:00:00.000Z", revision: 1 });
  assert.equal(op.capability, RULE_CREATE);
  assert.equal(op.executorKey, RULE_CREATE);
  assert.deepEqual(op.display?.rows.map((row) => [row.label, row.after]), [
    ["检查时间", "每周五 9:00 之后约10分钟内"],
    ["候选范围", "周末活动（那个周末开始的公开活动）"],
    ["排序依据", "按笔记「兴趣笔记」的主题"],
    ["条数", "最多3场"],
    ["有效期", "到11月30日（周一）为止"],
    ["有新结果", "只放进收件箱"],
    ["下次预计运行", "11月20日（周五） 9:00 之后约10分钟内"],
  ]);
  assert.equal(op.display?.record, "定时任务「每周五挑3个：周末活动」");
  assert.equal(op.display?.change, "create");
  // What the card sets is what the rule will hold: ids of the notes, never their text.
  assert.deepEqual(op.after, {
    maxItems: 3,
    notify: { inApp: true, push: false },
    onEmpty: "silent",
    rankingBasis: "按笔记「兴趣笔记」的主题",
    references: [{ id: "note:m36", type: "memo" }],
    schedule: FRIDAY_9,
    scopeText: "周末活动（那个周末开始的公开活动）",
    title: "每周五挑3个：周末活动",
    validUntil: "2026-11-30",
  });
  assert.doesNotMatch(JSON.stringify(op), /最近想多看摄影展/u, "no text of the note is on the card or in its payload");
  assert.equal(checkTimeWords(FRIDAY_9, "en"), "Every Friday, within about 10 minutes after 9:00");
  assert.equal(checkTimeWords(FRIDAY_9, "ja"), "毎週金曜 9:00 以降、約10分以内");
  assert.equal(nextRunWords(FRIDAY_9, "2026-11-30", "2026-11-28T01:00:00.000Z", "zh"), "有效期内已经没有下一次运行");
  // AG15 interface (approved draft 15-1): a card that only makes scheduled tasks is titled 「新建1条定时任务」.
  assert.equal(cardCountTitle([op], "zh"), "新建1条定时任务");
  // Regenerating a card rebuilds the same item from the kept intent.
  assert.deepEqual(cardIntentOf(op), { ...createIntent(), partId: "p1" });
});

test("a rule item goes on a card like any other item and is hashed with it", async () => {
  const built = await buildCardOperationList(null, { actionId: "action:2", intents: [{ ...createIntent(), partId: "p1" }], locale: "en", revision: 1 });
  assert.equal(built.operations.length, 1);
  assert.equal(built.operations[0].display?.rows[0].after, "Every Friday, within about 10 minutes after 9:00");
  assert.equal(built.operations[0].display?.rows[5].after, "To your inbox only");
});

function executorsFor(now: () => string) {
  const storage = createMemoryAutomationStorage(WORKSPACE);
  const automations = serviceFor(storage, "user:a", now);
  const executors = new Map(ruleWriteExecutors({ automations }).map((executor) => [executor.key, executor]));
  const run = (key: string, payload: Record<string, unknown>, idempotencyKey = "action:1:r1:op1") => executors.get(key)!.execute(payload, { actionId: "action:1", idempotencyKey, now: now(), operationId: "action:1:op1", runId: "run:1" });
  return { automations, run, storage };
}

test("before the click nothing exists; the executor makes the rule and its due-index row once, however often it is replayed", async () => {
  let now = "2026-11-15T01:00:00.000Z";
  const { automations, run, storage } = executorsFor(() => now);
  const op = prepareRuleOperation({ actionId: "action:1", index: 0, intent: createIntent(), locale: "zh", now, revision: 1 });
  // Frozen, not confirmed: no rule, nothing due — so nothing can run when the time comes.
  assert.deepEqual(await automations.list(), []);
  assert.deepEqual(await storage.claimDue({ leaseId: "l", leaseMs: 1, limit: 10, now: "2026-11-20T00:10:00.000Z" }), []);

  const first = await run(RULE_CREATE, op.payload as Record<string, unknown>);
  const again = await run(RULE_CREATE, op.payload as Record<string, unknown>);
  assert.equal(first.resultRef, ruleIdOf("action:1:r1:op1"));
  assert.equal(again.resultRef, first.resultRef, "the same operation key finds the same rule");
  const rules = await automations.list();
  assert.equal(rules.length, 1);
  assert.equal(rules[0].rule?.references[0].id, "note:m36");
  assert.equal(rules[0].capabilityId, "events.recommend");
  assert.equal(rules[0].nextRunAt, new Date("2026-11-20T09:00:00+09:00").toISOString());
  assert.equal((await storage.listOwned("user:a", "rule")).length, 1);

  const snapshot = ruleSnapshotOf(rules[0])!;
  now = "2026-11-16T01:00:00.000Z";
  await run(RULE_PAUSE, prepareRuleOperation({ actionId: "action:2", index: 0, intent: { capability: RULE_PAUSE, expectedVersion: snapshot.version, shown: snapshot, targetId: snapshot.automationId }, locale: "zh", now, revision: 1 }).payload as Record<string, unknown>);
  assert.equal((await automations.get(snapshot.automationId))?.status, "paused");
  assert.equal((await storage.listOwned("user:a", "rule"))[0].status, "paused");
  await run(RULE_RESUME, { automationId: snapshot.automationId, expectedVersion: snapshot.version });
  assert.equal((await automations.get(snapshot.automationId))?.status, "active");

  // A change makes a new version; a card frozen from the old version no longer applies.
  await run(RULE_UPDATE, { automationId: snapshot.automationId, expectedVersion: snapshot.version, set: { notify: { inApp: true, push: true } } });
  const changed = (await automations.get(snapshot.automationId))!;
  assert.deepEqual([changed.version, changed.rule?.notify.push, changed.delivery], [2, true, "push"]);
  await assert.rejects(() => run(RULE_PAUSE, { automationId: snapshot.automationId, expectedVersion: snapshot.version }), (error: unknown) => error instanceof AgentExecutionPermanentError && /CARD_CONTENT_CHANGED/u.test(error.message));
  assert.equal((await automations.get(snapshot.automationId))?.status, "active", "nothing was overwritten");

  await run(RULE_CANCEL, { automationId: snapshot.automationId, expectedVersion: 2 });
  assert.equal(await automations.get(snapshot.automationId), null);
  assert.deepEqual(await storage.listOwned("user:a", "rule"), []);
  await run(RULE_CANCEL, { automationId: snapshot.automationId, expectedVersion: 2 });
});

test("pause, resume and removal cards say which task, and that it will not run until resumed", () => {
  const shown = { automationId: "rule:1", rule: ruleSpec(), schedule: FRIDAY_9, status: "active", title: "每周五挑三场周末活动", version: 1 };
  const pause = prepareRuleOperation({ actionId: "a", index: 0, intent: { capability: RULE_PAUSE, expectedVersion: 1, shown, targetId: "rule:1" }, locale: "zh", now: "2026-11-20T00:15:00.000Z", revision: 1 });
  assert.equal(pause.display?.record, "定时任务「每周五挑三场周末活动」");
  assert.match(pause.display?.note ?? "", /之后不再运行，直到你恢复它/u);
  assert.match(pause.preview, /暂停定时任务「每周五挑三场周末活动」/u);
  assert.deepEqual(pause.targetRef, { collection: "agentAutomations", id: "rule:1" });
  assert.deepEqual(pause.after, { status: "paused" });
  const cancel = prepareRuleOperation({ actionId: "a", index: 0, intent: { capability: RULE_CANCEL, expectedVersion: 1, shown, targetId: "rule:1" }, locale: "en", revision: 1 });
  assert.equal(cancel.display?.change, "delete");
  assert.equal(cardCountTitle([pause], "zh"), "修改1项");
  assert.equal(cardCountTitle([cancel], "en"), "1 deletion");
  const update = prepareRuleOperation({ actionId: "a", index: 0, intent: { capability: RULE_UPDATE, expectedVersion: 1, set: { notify: { inApp: true, push: true } }, shown, targetId: "rule:1" }, locale: "zh", revision: 1 });
  assert.deepEqual(update.display?.rows.map((row) => [row.label, row.before, row.after]), [["有新结果", "只放进收件箱", "放进收件箱，并在手机和浏览器上提醒"]]);
  assert.deepEqual(update.after, { notify: { inApp: true, push: true } });
});

test("code decides what is a scheduled-task request, and which of the account's tasks the words name", () => {
  const part = (capabilities: string[], continues: { kind: string; ref: string } | null = null) => ({ capabilities: capabilities as never, continues });
  assert.equal(isRuleRequest(part(["rule.create", "event.read"]), "每周五上午九点，用 @兴趣笔记 给我挑三场周末活动", []), true);
  assert.equal(isRuleRequest(part(["event.read", "fn.rank"]), "Every Friday at 9am, send me up to three events happening that weekend", []), true, "a recurrence with a pick-and-tell ask is a task even when the first layer tagged only a read");
  assert.equal(isRuleRequest(part(["rule.pause"]), "把「每周五挑三场周末活动」这条定时任务先暂停。", []), true);
  assert.equal(isRuleRequest(part(["schedule.create"]), "每周一上午十点的团队周会加进我的日程", []), false, "a recurring calendar entry is a schedule item");
  assert.equal(isRuleRequest(part(["schedule.update", "rule.update"]), "毎週月曜の定例「团队周会」を、これからはずっと11時から12時に変更して。", []), false, "also when the first layer named a rule capability next to the schedule one (AE-EVT-006)");
  assert.equal(isRuleRequest(part(["rule.create"]), "那改成每月第二个周二下午三点到四点呢？", []), false, "a repetition that is no weekly or daily recurrence is not read as one");
  assert.equal(ruleTaskOf({ deps: {}, input: {}, run: {} } as never, { capabilities: ["rule.create"], continues: { kind: "alternative", ref: "alternative:r1:p1" }, reason: "proposing", route: "propose_write" } as never, undefined), null, "accepting an offered alternative keeps its own sentence");
  assert.equal(ruleTaskOf({ deps: {}, input: {}, run: {} } as never, { capabilities: ["schedule.update", "rule.update"], continues: null, reason: "proposing", route: "propose_write" } as never, undefined), null);
  assert.deepEqual(ruleTaskOf({ deps: {}, input: {}, run: {} } as never, { capabilities: ["rule.create"], continues: null, reason: "proposing", route: "propose_write" } as never, undefined), { kind: "rule" });
  assert.equal(isRuleRequest(part(["event.read", "fn.rank"]), "给我挑三场周末活动", []), false, "no recurrence: an ordinary pick");
  assert.equal(isRuleRequest(part([], { kind: "clarification", ref: "clarification:r1:p1" }), "開始時間が早い順でお願い。", [{ ref: "clarification:r1:p1", rule: {} }]), true, "the reply to a task's question goes on with the task");
  assert.equal(isRuleRequest(part([], { kind: "clarification", ref: "clarification:r1:p1" }), "開始時間が早い順でお願い。", [{ ref: "clarification:r1:p1" }]), false);

  // A sentence that only says how to be told or until when belongs to the task said in the same message.
  const task = { part: { ...part(["rule.create"]), localId: "p1" }, quote: "每周五上午九点，用 @兴趣笔记 给我挑三场周末活动。" };
  const qualifier = (capabilities: string[], refs: { entity: string; recordId: string | null }[] = []) => ({ ...part(capabilities), localId: "p2", refs });
  assert.equal(qualifiesRuleOf(qualifier(["rule.update"]), "结果放站内收件箱就行，不用推送，先跑到 11 月底。", [task], []), true);
  assert.equal(qualifiesRuleOf(qualifier([]), "In-app inbox only, no push.", [{ ...task, quote: "Every Friday at 9am, send me up to three events happening that weekend, soonest first." }], []), true);
  assert.equal(qualifiesRuleOf(qualifier([]), "11月末まで続けて。", [{ ...task, quote: "毎週金曜の朝9時に、その週末のイベントを3つ選んで知らせて。" }], []), true);
  assert.equal(qualifiesRuleOf(qualifier(["todo.update"]), "把报价待办改到 11 月底。", [task], []), false, "another change of its own is not a qualifier");
  assert.equal(qualifiesRuleOf(qualifier([]), "不用推送。", [{ part: { ...part(["event.read"]), localId: "p1" }, quote: "这周末有什么活动？" }], []), false, "no scheduled task in the message to belong to");
  assert.equal(qualifiesRuleOf(qualifier([]), "顺便问一下小林最近怎么样？", [task], []), false);

  const rules = [
    { automationId: "r1", rule: ruleSpec(), schedule: FRIDAY_9, status: "active", title: "每周五挑三场周末活动", version: 1 },
    { automationId: "r2", rule: ruleSpec(), schedule: FRIDAY_9, status: "active", title: "本月每天留意摄影主题的活动", version: 1 },
  ];
  assert.equal(matchRule("把「每周五挑三场周末活动」这条定时任务先暂停。", rules)?.automationId, "r1");
  assert.equal(matchRule("那条留意摄影主题活动的任务", rules)?.automationId, "r2");
  assert.equal(matchRule("把那条提醒我喝水的任务停掉", rules), null, "no task like it: nothing is guessed");
  assert.equal(matchRule("暂停这条定时任务", [rules[0]])?.automationId, "r1", "the only task there is");
  assert.equal(matchRule("暂停这条定时任务", rules), null);
});
