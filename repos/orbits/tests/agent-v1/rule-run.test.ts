import assert from "node:assert/strict";
import test from "node:test";

import type { AgentAutomation, AgentRuleSpec } from "../../features/agent/automations/contract";
import { eventWindowOf, ruleCardId, runRulePeriod, type RuleCardAccess, type RuleRunDeps } from "../../features/agent/automations/run-rule";
import { FRIDAY_9, ruleSpec } from "../capabilities/agent-automation-kit";
import { ACTOR, fnWorld } from "./functions-kit";
import { recordAccessOf } from "./graph-kit";
import { access, graded, judgeStub } from "./judgment-kit";

/**
 * agent-design AG15-2/AG15-3 (设计稿 §5.3, §3.5, §3.8; PLANNER 易错边界 2/5/8/10): one period of a rule, computed with
 * nobody present — under the owner's authorization only, from the rule's parameters, with the same ranking a
 * conversation uses; the main model is not called.
 */

const at = (value: string) => new Date(value).toISOString();
const FRIDAY = at("2026-11-20T09:00:00+09:00");

function automation(rule: Partial<AgentRuleSpec> = {}, schedule: AgentAutomation["trigger"] = { kind: "schedule", schedule: FRIDAY_9 }): AgentAutomation {
  return { automationId: "rule:1", capabilityId: "events.recommend", createdAt: "2026-11-15T01:00:00.000Z", delivery: "in_app", handledEventIds: [], instruction: "x", lastRun: null, nextRunAt: FRIDAY, revisions: [], rule: ruleSpec(rule), runCount: 0, status: "active", title: "每周五挑三场周末活动", trigger: schedule, updatedAt: "2026-11-15T01:00:00.000Z", version: 1 };
}

function deps(extra: Partial<RuleRunDeps> = {}): RuleRunDeps {
  return { now: () => at("2026-11-20T09:10:00+09:00"), records: recordAccessOf(fnWorld()), workspaceId: "workspace:test", ...extra };
}

const ids = (result: { items: { id: string }[] }) => result.items.map((item) => item.id.replace("event:", ""));

test("the window of events is counted from the period, in the rule's own time zone", () => {
  assert.deepEqual(eventWindowOf("weekend", FRIDAY, "Asia/Tokyo"), { from: at("2026-11-21T00:00:00+09:00"), fromDay: "2026-11-21", lastDay: "2026-11-22", to: at("2026-11-23T00:00:00+09:00") });
  assert.deepEqual(eventWindowOf("weekend", at("2026-11-16T09:00:00+09:00"), "Asia/Tokyo").fromDay, "2026-11-21", "a Monday run looks at that week's Saturday and Sunday");
  assert.deepEqual(eventWindowOf("weekend", at("2026-11-22T09:00:00+09:00"), "Asia/Tokyo"), { from: at("2026-11-22T09:00:00+09:00"), fromDay: "2026-11-22", lastDay: "2026-11-22", to: at("2026-11-23T00:00:00+09:00") }, "on a Sunday: what is left of this weekend");
  assert.equal(eventWindowOf("month", at("2026-11-16T09:00:00+09:00"), "Asia/Tokyo").to, at("2026-12-01T00:00:00+09:00"));
  assert.equal(eventWindowOf("month", at("2026-12-16T09:00:00+09:00"), "Asia/Tokyo").to, at("2027-01-01T00:00:00+09:00"));
  assert.equal(eventWindowOf("week", FRIDAY, "Asia/Tokyo").lastDay, "2026-11-26");
});

test("a rule that orders by a field lists that weekend's events by start time, without any model", async () => {
  const result = await runRulePeriod(deps(), { automation: automation(), ownerId: ACTOR, scheduledAt: FRIDAY, told: new Set() });
  assert.equal(result.outcome, "computed");
  assert.deepEqual(ids(result), ["e101", "e104", "e102"], "Saturday 10:00, Saturday 19:00, Sunday 9:30; the fourth is cut by the count");
  assert.match(result.text, /定时任务「每周五挑三场周末活动」11月20日（周五）这一期的结果/u);
  assert.match(result.text, /依据：按开始时间从早到晚。范围：11月21日（周六）到11月22日（周日）开始的活动（共4场）/u);
  assert.doesNotMatch(result.text, /AI 产品沙龙|别人的草稿/u, "an event with no announced time, or another organizer's draft, is never in the list");
  assert.equal(result.items[0].ref, "event:event:e101");
  // AG15 interface: each pick carries AG19's record card, and the result page's basis line is the rule's own.
  assert.deepEqual(result.items.map((item) => [item.card?.kind, item.card?.id, Boolean(item.card?.title)]), [["event", "event:e101", true], ["event", "event:e104", true], ["event", "event:e102", true]]);
  assert.deepEqual(result.detail, { basis: "按开始时间从早到晚", notes: [] });
});

test("a rule that picks by a note reads the note again by id, judges at most 30 candidates, and lists only what fits", async () => {
  const judge = judgeStub((id) => (/e104/u.test(id) ? graded(0.9, 0.05, 0.05) : graded(0.02, 0.08, 0.9)));
  const rule = automation({ ranking: {}, rankingBasis: "与兴趣笔记的主题相关", references: [{ id: "note:m36", title: "兴趣笔记", type: "memo" }] });
  const result = await runRulePeriod(deps({ judgment: access(judge.fetchImplementation) }), { automation: rule, ownerId: ACTOR, scheduledAt: FRIDAY, told: new Set() });
  assert.equal(result.outcome, "computed");
  assert.deepEqual(ids(result).sort(), ["e101", "e102", "e105"], "the design evening does not fit the note and is not listed to fill the count");
  assert.equal(judge.calls.length, 1);
  assert.match(JSON.stringify(judge.calls[0].body), /最近想多看摄影展和街拍活动/u, "the note's current text is what is judged against — read now, not stored on the rule");
  // The basis says, in the user's own words, what was taken from the note, and which note it is (by its day — two notes
  // may share a title); the note is the result's source to open (AE-SCL-030 R4).
  assert.match(result.text, /依据：笔记「兴趣笔记」（11月1日）里写的：“最近想多看摄影展和街拍活动，也想认识做独立出版的人”。范围：/u);
  assert.doesNotMatch(result.text, /依据：与兴趣笔记的主题相关/u);
  assert.deepEqual(result.detail?.basisNote, { day: "2026-11-01", id: "note:m36", title: "兴趣笔记" });
  assert.equal(result.detail?.source?.caption, "按这篇笔记挑的");
  assert.deepEqual([result.detail?.source?.card.id, result.detail?.source?.card.kind, result.detail?.source?.card.title, result.detail?.source?.card.top], ["note:m36", "memo", "兴趣笔记", "11月1日（周日）"]);
  assert.equal(result.detail?.basis, "笔记「兴趣笔记」（11月1日）里写的：“最近想多看摄影展和街拍活动，也想认识做独立出版的人”");
  assert.match(result.text, /范围里的4场都细看过了/u);
  assert.deepEqual(result.coverage, { afterHardConditions: 4, judged: 4, total: 7, truncated: 0 });

  // The judgment does not answer: only records whose own words share the note's are listed, and the result says so.
  const unanswered = await runRulePeriod(deps({ judgment: null }), { automation: rule, ownerId: ACTOR, scheduledAt: FRIDAY, told: new Set() });
  assert.equal(unanswered.outcome, "computed");
  assert.ok(!ids(unanswered).includes("e104"));
  assert.match(unanswered.text, /没能逐个核对是否符合主题/u);
});

test("records the rule told its owner before are left out; when nothing is left the period has nothing new", async () => {
  const daily = automation({ scope: { domain: "event", topics: ["摄影"], window: "month" }, scopeText: "本月摄影主题的活动" }, { kind: "schedule", schedule: { kind: "daily", time: "09:00", timeZone: "Asia/Tokyo" } });
  const monday = at("2026-11-16T09:00:00+09:00");
  const first = await runRulePeriod(deps(), { automation: daily, ownerId: ACTOR, scheduledAt: monday, told: new Set() });
  assert.deepEqual(ids(first), ["e101", "e102", "e107"], "this month's photography events, by start time");
  const told = new Set(first.items.map((item) => item.ref));
  const second = await runRulePeriod(deps(), { automation: daily, ownerId: ACTOR, scheduledAt: at("2026-11-17T09:00:00+09:00"), told });
  assert.deepEqual([second.outcome, second.items.length, second.text], ["no_match", 0, ""]);
  assert.equal(second.ranked, "all_told_before", "nothing left because everything was told before — not 'unavailable'");
  const empty = await runRulePeriod(deps(), { automation: daily, ownerId: ACTOR, scheduledAt: at("2027-03-01T09:00:00+09:00"), told: new Set() });
  assert.deepEqual([empty.outcome, empty.ranked], ["no_match", "no_candidates"], "no event in the window at all");
  // A later run that still finds something says, in plain words, how many it left out because they were told before.
  const third = await runRulePeriod(deps(), { automation: daily, ownerId: ACTOR, scheduledAt: at("2026-11-17T09:00:00+09:00"), told: new Set([first.items[0].ref]) });
  assert.deepEqual(third.detail?.notes, ["之前告诉过你的 1 场，这次没有再列。"]);
  assert.doesNotMatch(third.detail!.notes.join(""), /范围|依据/u);
});

test("a referenced note that cannot be read makes the period need attention; nothing is picked and no other note stands in", async () => {
  const world = fnWorld();
  world.records = world.records.filter((record) => record.id !== "note:m36");
  const rule = automation({ ranking: {}, rankingBasis: "与兴趣笔记的主题相关", references: [{ id: "note:m36", title: "兴趣笔记", type: "memo" }] });
  const judge = judgeStub(() => graded(0.02, 0.08, 0.9));
  const result = await runRulePeriod(deps({ judgment: access(judge.fetchImplementation), records: recordAccessOf(world) }), { automation: rule, ownerId: ACTOR, scheduledAt: FRIDAY, told: new Set() });
  assert.equal(result.outcome, "needs_attention");
  assert.deepEqual(result.items, []);
  assert.equal(result.attention?.reason, "reference_unreadable");
  assert.match(result.attention?.message ?? "", /笔记「兴趣笔记」读不到了/u);
  assert.equal(judge.calls.length, 0, "nothing was ranked");
  // Another account's rule never reads this account's note either.
  const foreign = await runRulePeriod(deps({ judgment: access(judge.fetchImplementation) }), { automation: rule, ownerId: "user:b", scheduledAt: FRIDAY, told: new Set() });
  assert.equal(foreign.outcome, "needs_attention", "the note is account A's; account B's rule cannot read it");
});

test("a rule that re-plans to-dos proposes a card from the rule and the period; the earlier card gives way; nothing is written here", async () => {
  const frozen: Parameters<RuleCardAccess["freeze"]>[0][] = [];
  const superseded: string[] = [];
  const replacedBy: { actionId: string; firedAt: string }[] = [];
  const cards: RuleCardAccess = {
    async freeze(input) {
      frozen.push(input);
      return { actionId: input.actionId, expiresAt: "2026-11-23T00:10:00.000Z", preview: "待办「给李薇寄样片」：计划日 11月10日（周二） → 11月16日（周一）" };
    },
    async supersede(actionId, by) {
      superseded.push(actionId);
      if (by) replacedBy.push(by);
    },
  };
  const monday = at("2026-11-16T09:00:00+09:00");
  const replan = automation({ action: "replan", ranking: { field: { direction: "asc", name: "plannedDate" } }, rankingBasis: "按计划日从早到晚", scope: { domain: "todo", filter: "past_planned" }, scopeText: "过了计划日还没完成的待办" }, { kind: "schedule", schedule: { ...FRIDAY_9, daysOfWeek: [1] } });
  const result = await runRulePeriod(deps({ cards, now: () => at("2026-11-16T09:10:00+09:00") }), { automation: replan, ownerId: ACTOR, previousCardId: "action:rule:earlier", scheduledAt: monday, told: new Set() });
  assert.equal(result.outcome, "computed");
  assert.equal(result.cardId, ruleCardId({ automationId: "rule:1", ownerId: ACTOR, scheduledAt: monday, version: 1 }));
  assert.deepEqual(frozen[0].origin, { firedAt: monday, kind: "automation", ruleId: "rule:1" }, "the card's origin is the rule and the period, not a conversation");
  assert.deepEqual(frozen[0].intents, [{ capability: "todo.update", set: { plannedDate: "2026-11-16" }, targetId: "task:t45" }], "only the to-do past its planned day; the one planned for the 18th is left alone");
  assert.deepEqual(superseded, ["action:rule:earlier"]);
  assert.deepEqual(replacedBy, [{ actionId: result.cardId, firedAt: monday }], "the old card names the period and card that replaced it (D15-6)");
  assert.match(result.text, /提议做一项修改/u);
  assert.match(result.text, /在这里确认之后才会修改/u);
  // Without overdue to-dos the period has nothing to propose, and the waiting card of the period before still gives way.
  const none = await runRulePeriod(deps({ cards, now: () => at("2026-11-09T09:10:00+09:00") }), { automation: replan, ownerId: ACTOR, previousCardId: "action:rule:older", scheduledAt: at("2026-11-09T09:00:00+09:00"), told: new Set() });
  assert.equal(none.outcome, "no_match");
  assert.deepEqual(superseded, ["action:rule:earlier", "action:rule:older"]);
  assert.equal(replacedBy.length, 1, "with no new card, the old one is closed without naming a replacement");
  assert.equal(frozen.length, 1);
});

test("saved memory reaches a rule through the recall seam: a constraint is a hard condition and the result names it", async () => {
  const recalled: string[] = [];
  const recall: RuleRunDeps["recall"] = async (input) => {
    recalled.push(`${input.actorId}:${input.domain}`);
    // AG14's recall as it is (since the AG14 + AG15 integration the seam hands it over unchanged).
    return { enabled: true, memoryVersion: 1, relevant: [], rules: [{ appliesTo: ["event.recommend"], category: "constraint", content: "不要推荐晚上的活动", everyTask: false, memoryId: "memory:1", revision: 1, structured: null, why: "rule" }] };
  };
  const result = await runRulePeriod(deps({ recall }), { automation: automation(), ownerId: ACTOR, scheduledAt: FRIDAY, told: new Set() });
  assert.deepEqual(recalled, [`${ACTOR}:event`], "recalled for the rule's owner with no session");
  assert.deepEqual(ids(result), ["e101", "e102", "e105"], "the Saturday evening event is removed by the constraint");
  assert.match(result.text, /同时按你让我记住的这条来办：不要推荐晚上的活动/u);
});
