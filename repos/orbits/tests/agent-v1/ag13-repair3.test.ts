import assert from "node:assert/strict";
import test from "node:test";

import { withEffectiveDates } from "../../features/agent-v1/answer/claims";
import { unproposedOutcome } from "../../features/agent-v1/graph/nodes/propose";
import { UNSUPPORTED_REPEAT, unsupportedRepeatLine } from "../../features/agent-v1/propose/events-resolve";
import { subjectInsideRecord } from "../../features/agent-v1/understand/described-clue";

/**
 * agent-design AG13 repair round 3 (judged gate run-03 and the reruns at AG13):
 * - AE-EVT-004: the second layer proposed nothing for "帮我把签到补上"; the user saw "我没看出要怎么改".
 * - AE-EVT-007: "隔周" came as rule.create (generic "can't change this"); "每月第二个周二…呢？" went to an answer that told
 *   the user to set that monthly rule.
 * - AE-AMB-009 (AG04): "我和他最近聊了什么" — 他 was dropped as a subject inside a note, so 小林 was lost.
 * - AE-SCL-016 (AG09): the page says "effective October 1, 2026"; the answer said "(dated Oct 1, 2026)".
 */

test("AE-EVT-004: nothing proposed for a check-in request is the organizer's record, with what the user can do", () => {
  const checkIn = unproposedOutcome("zh", "昨晚的 SaaS 定价研讨会我忘了扫码签到，你帮我把签到补上。");
  assert.equal(checkIn.reason, "organizer_record");
  assert.match(checkIn.line, /签到是主办方那边的记录/u);
  assert.match(checkIn.line, /Orbit 替你改不了/u);
  assert.match(checkIn.line, /我去过/u, "offers the user's own «我去过» instead");
  assert.doesNotMatch(checkIn.line, /已签到|已补签/u);
  assert.equal(unproposedOutcome("zh", "帮我处理一下那件事").reason, "not_understood");
  assert.match(unproposedOutcome("ja", "チェックインを代わりにしておいて").line, /主催者側の記録/u);
});

test("AE-EVT-007: a repetition the schedule cannot store is said so, with one-off dates offered; a weekly one is not", () => {
  const ctx = { asOf: "2026-11-15T01:00:00.000Z", language: "zh" as const, timeZone: "Asia/Tokyo" };
  const everyOther = unsupportedRepeatLine("帮我建一个隔周周三下午三点到四点的例会，叫产品同步。", ctx);
  assert.ok(everyOther);
  assert.match(everyOther!, /「隔周」这种重复方式现在还不支持/u);
  assert.match(everyOther!, /几条单次日程/u);
  assert.match(everyOther!, /11月18日（周三）/u, "the next Wednesdays, every other week");
  const monthly = unsupportedRepeatLine("那改成每月第二个周二下午三点到四点呢？", ctx);
  assert.match(monthly!, /「每月第二个周二」这种重复方式现在还不支持/u);
  assert.match(monthly!, /12月8日（周二）/u, "the second Tuesdays of the coming months");
  assert.doesNotMatch(monthly!, /重复方式选「每月」/u, "never tells the user to set the rule it cannot store");
  assert.equal(unsupportedRepeatLine("每周三下午三点开例会", ctx), null);
  assert.ok(UNSUPPORTED_REPEAT.test("那改成每月第二个周二下午三点到四点呢？"), "the route sends this follow-up to code's sentence");
});

test("AE-AMB-009: a pronoun inside the note words is the person named earlier, not a subject inside a note", () => {
  const him = { entity: "contact", text: "他" };
  assert.equal(subjectInsideRecord(him, [him, { entity: "memo", text: "我和他最近聊了什么" }]), false);
  assert.equal(subjectInsideRecord({ entity: "contact", text: "him" }, [{ entity: "memo", text: "what I talked about with him lately" }]), false);
  assert.equal(subjectInsideRecord({ entity: "contact", text: "he" }, [{ entity: "memo", text: "the Nov 10 note" }]), true, "a whole word, not 'he' inside 'the'");
  // AG12 (AE-WEB-004) still holds: "那家公司" beside a note named in its own words is the subject inside that note.
  const company = { entity: "contact", text: "那家公司" };
  assert.equal(subjectInsideRecord(company, [company, { entity: "memo", text: "竞品笔记 C" }]), true);
});

test("AE-SCL-016: a date the page gives as effective is said as effective, not as the page's date", () => {
  const sources = ["Team: JPY 2,400 per seat per month, billed annually (effective October 1, 2026). Minimum 5 seats."];
  const fixed = withEffectiveDates("Lumen ATS's pricing page (dated Oct 1, 2026) lists the Team plan at JPY 2,400 per seat per month.", sources);
  assert.equal(fixed.text, "Lumen ATS's pricing page (effective Oct 1, 2026) lists the Team plan at JPY 2,400 per seat per month.");
  assert.equal(fixed.changed.length, 1);
  assert.equal(withEffectiveDates("The quote is dated Nov 2, 2026.", sources).changed.length, 0, "another date is left as written");
  assert.equal(withEffectiveDates("官网价格（更新于 2026 年 10 月 1 日）是每席每月 2,400 日元。", ["2026年10月1日起适用新价格。"]).text, "官网价格（2026年10月1日起生效）是每席每月 2,400 日元。");
  assert.equal(withEffectiveDates("The page is dated Oct 1, 2026.", ["Updated October 1, 2026."]).changed.length, 0, "no effective date in the sources: nothing changes");
});
