import assert from "node:assert/strict";
import test from "node:test";

import type { RelationshipTimelineItem } from "../../shared/contract/relationship-timeline";
import {
  computeRelationshipStrength,
  computeRelationshipTierCountsAt,
  relationshipSignalBasePoints,
} from "../../features/relationship-strength/compute";
import { RELATIONSHIP_STRENGTH_RULES, RELATIONSHIP_STRENGTH_RULES_VERSION } from "../../features/relationship-strength/rules";

// W0047 SC-01：规则打分纯函数（含按时间点）。表驱动；结果只取决于时间线与时间点。

const NOW = new Date("2026-10-02T03:00:00.000Z"); // 东京 2026-10-02 12:00
const DAY = 86_400_000;
const daysAgo = (days: number, hourUtc = 3) => new Date(Date.parse(`2026-10-02T${String(hourUtc).padStart(2, "0")}:00:00.000Z`) - days * DAY).toISOString();

let seq = 0;
function item(source: RelationshipTimelineItem["source"], occurredAt: string, extra: Partial<RelationshipTimelineItem> = {}): RelationshipTimelineItem {
  seq += 1;
  const recordId = `r${seq}`;
  return {
    id: `${source}:${recordId}`,
    source,
    contactId: "c1",
    occurredAt,
    occurredAtPrecision: "instant",
    title: { zh: source, en: source },
    ref: { store: "notes", recordId },
    ...extra,
  };
}
const capture = (at: string, captureMethod: NonNullable<RelationshipTimelineItem["detail"]>["captureMethod"] = "business_card") =>
  item("capture", at, { id: "capture:c1", ref: { store: "contacts", recordId: "c1" }, detail: { captureMethod } });
const memo = (at: string, memoEventTypes?: NonNullable<RelationshipTimelineItem["detail"]>["memoEventTypes"]) =>
  item("memo", at, memoEventTypes ? { detail: { memoEventTypes } } : {});
const meeting = (at: string) => item("schedule", at, { detail: { scheduleKind: "meeting" } });

test("rule table values, version and thresholds are the D44 draft", () => {
  assert.equal(RELATIONSHIP_STRENGTH_RULES_VERSION, "rs-2026-10-v1");
  assert.equal(RELATIONSHIP_STRENGTH_RULES.halfLifeDays, 90);
  assert.equal(RELATIONSHIP_STRENGTH_RULES.dormantAfterDays, 60);
  assert.equal(RELATIONSHIP_STRENGTH_RULES.coreThreshold, 70);
  assert.equal(RELATIONSHIP_STRENGTH_RULES.activeThreshold, 45);
  const at = daysAgo(0);
  const cases: [RelationshipTimelineItem, boolean, number][] = [
    [capture(at, "business_card"), false, 10],
    [capture(at, "qr"), false, 10],
    [capture(at, "event_exchange"), false, 10],
    [capture(at, "manual"), false, 5],
    [memo(at), false, 15],
    [memo(at, ["met"]), false, 20],
    [memo(at, ["introduced", "other"]), false, 20],
    [memo(at, ["met", "collaborated"]), false, 30],
    [item("encounter", at), false, 20],
    [meeting(at), false, 25],
    [item("schedule", at, { detail: { scheduleKind: "event" } }), false, 10],
    [meeting(at), true, 5],
    [item("schedule", at, { detail: { scheduleKind: "event" } }), true, 0],
    [item("followup_done", at), false, 10],
    [item("plan", at, { detail: { planEvent: "contact_established" } }), false, 20],
    [item("plan", at, { detail: { planEvent: "contact_linked" } }), false, 5],
    [item("plan", at, { detail: { planEvent: "item_status_changed" } }), false, 0],
    [item("note", at), false, 0],
  ];
  for (const [entry, future, expected] of cases) {
    assert.equal(relationshipSignalBasePoints(entry, future), expected, `${entry.source} ${JSON.stringify(entry.detail)} future=${future}`);
  }
});

test("illustration: card + memo = 25 new; + meeting = 50 active; a month later meeting + memo ≈ 80 core; then dormant", () => {
  const day0 = daysAgo(0);
  const start = [capture(day0), memo(day0)];
  const s1 = computeRelationshipStrength(start, NOW);
  assert.deepEqual([s1.score, s1.tier, s1.dormant], [25, "new", false]);

  const withMeeting = [...start, meeting(day0)];
  const s2 = computeRelationshipStrength(withMeeting, NOW);
  assert.deepEqual([s2.score, s2.tier], [50, "active"]);

  const later = new Date(NOW.getTime() + 30 * DAY);
  const month = [...withMeeting, meeting(later.toISOString()), memo(later.toISOString())];
  const s3 = computeRelationshipStrength(month, later);
  assert.equal(s3.score, 80); // 50 × 0.5^(30/90) ≈ 39.7 + 25 + 15
  assert.equal(s3.tier, "core");

  // 再 90 天无记录：分数约减半；第 60 天起待唤醒。
  const quiet90 = computeRelationshipStrength(month, new Date(later.getTime() + 90 * DAY));
  assert.equal(quiet90.score, 40);
  assert.equal(quiet90.peakScore, 80);
  assert.equal(quiet90.dormant, true);
});

test("half-life is 90 Tokyo days and decay counts Tokyo calendar days", () => {
  const encounter = item("encounter", daysAgo(90));
  const s = computeRelationshipStrength([capture(daysAgo(200)), encounter], NOW);
  const signal = s.signals.find((entry) => entry.timelineItemId === encounter.id)!;
  assert.equal(signal.basePoints, 20);
  assert.equal(signal.points, 10);
  // 东京 23:30（UTC 14:30）与次日 00:30（UTC 15:30）差 1 个东京日：衰减不同。
  const late = item("encounter", "2026-10-01T14:30:00.000Z");
  const early = item("encounter", "2026-10-01T15:30:00.000Z");
  const at = new Date("2026-10-02T15:00:00.000Z"); // 东京 10-03 00:00
  const points = (entry: RelationshipTimelineItem) => computeRelationshipStrength([entry], at).signals[0]!.points;
  assert.ok(points(late) < points(early));
});

test("dedupe: same source on the same Tokyo day counts once (the highest); the same ref counts once", () => {
  const day = daysAgo(1);
  const sameDay = [capture(daysAgo(10)), memo(day), memo(daysAgo(1, 5), ["collaborated"]), memo(daysAgo(1, 7))];
  const s = computeRelationshipStrength(sameDay, NOW);
  const memos = s.signals.filter((signal) => signal.source === "memo");
  assert.equal(memos.length, 1);
  assert.equal(memos[0]!.basePoints, 30);
  // 不同来源同一天各计一次。
  const mixed = computeRelationshipStrength([capture(daysAgo(10)), memo(day), item("encounter", day)], NOW);
  assert.equal(mixed.signals.filter((signal) => signal.source !== "capture").length, 2);
  // 同一 ref（不同 id、不同天）只计一次。
  const a = item("encounter", daysAgo(3), { ref: { store: "human_encounters", recordId: "same" } });
  const b = item("encounter", daysAgo(5), { ref: { store: "human_encounters", recordId: "same" } });
  assert.equal(computeRelationshipStrength([a, b], NOW).signals.length, 1);
});

test("tier thresholds 70 / 45", () => {
  const at = daysAgo(0);
  // 同一天同来源只计一条 → 用不同来源凑分。
  const at44 = [item("encounter", at), item("followup_done", at), memo(at)]; // 20 + 10 + 15 = 45
  assert.equal(computeRelationshipStrength(at44, NOW).tier, "active");
  const at69 = [meeting(at), item("encounter", at), memo(at, ["met"])]; // 25 + 20 + 20 = 65
  assert.equal(computeRelationshipStrength(at69, NOW).tier, "active");
  const at70 = [meeting(at), item("encounter", at), memo(at, ["met"]), capture(at, "manual")]; // 70
  assert.equal(computeRelationshipStrength(at70, NOW).score, 70);
  assert.equal(computeRelationshipStrength(at70, NOW).tier, "core");
  const at40 = [item("encounter", at), item("followup_done", at), capture(at, "business_card")]; // 40
  assert.equal(computeRelationshipStrength(at40, NOW).tier, "new");
});

test("dormant: peak ≥ 45 and no non-capture record for 60 Tokyo days (day 59 vs 60), future meetings, memo event types", () => {
  const base = (lastDaysAgo: number) => [capture(daysAgo(300)), meeting(daysAgo(lastDaysAgo)), item("encounter", daysAgo(lastDaysAgo)), memo(daysAgo(lastDaysAgo))];
  const d59 = computeRelationshipStrength(base(59), NOW);
  const d60 = computeRelationshipStrength(base(60), NOW);
  assert.ok(d59.peakScore >= 45 && d60.peakScore >= 45);
  assert.equal(d59.dormant, false);
  assert.equal(d60.dormant, true);
  assert.equal(d60.lastSignalAt, daysAgo(60));

  // 未来的约见：5 分、不衰减；不算「往来」（lastSignalAt 不变、仍待唤醒）。
  const future = meeting(new Date(NOW.getTime() + 20 * DAY).toISOString());
  const withFuture = computeRelationshipStrength([...base(60), future], NOW);
  assert.equal(withFuture.signals.find((signal) => signal.timelineItemId === future.id)?.points, 5);
  assert.equal(withFuture.score, d60.score + 5);
  assert.equal(withFuture.lastSignalAt, d60.lastSignalAt);
  // 约见发生后按已发生的 meeting 25 分重算。
  const after = computeRelationshipStrength([...base(60), future], new Date(NOW.getTime() + 21 * DAY));
  assert.equal(after.signals.find((signal) => signal.timelineItemId === future.id)?.basePoints, 25);
  assert.equal(after.dormant, false);

  // 从未达到 45 的人不会待唤醒。
  assert.equal(computeRelationshipStrength([capture(daysAgo(200)), memo(daysAgo(100))], NOW).dormant, false);
  // 只有 0 分记录（笔记）也算往来，阻止待唤醒。
  assert.equal(computeRelationshipStrength([...base(60), item("note", daysAgo(3))], NOW).dormant, false);
});

test("every signal points at an input timeline item; same input and time point give identical output", () => {
  const timeline = [capture(daysAgo(120)), memo(daysAgo(100), ["met"]), meeting(daysAgo(40)), item("plan", daysAgo(20), { detail: { planEvent: "contact_linked" } }), item("note", daysAgo(2))];
  const first = computeRelationshipStrength(timeline, NOW);
  const ids = new Set(timeline.map((entry) => entry.id));
  for (const signal of first.signals) assert.ok(ids.has(signal.timelineItemId), signal.timelineItemId);
  assert.deepEqual(computeRelationshipStrength([...timeline].reverse(), NOW), first);
  assert.equal(first.computedAt, NOW.toISOString());
  assert.equal(first.rulesVersion, "rs-2026-10-v1");
  assert.ok(first.signals.every((signal, index, all) => index === 0 || all[index - 1]!.points >= signal.points));
});

test("stage, tags, status, customTags, networkCategory are not inputs: changing them leaves the result unchanged", () => {
  const timeline = [capture(daysAgo(30)), memo(daysAgo(3)), meeting(daysAgo(2))];
  const plain = computeRelationshipStrength(timeline, NOW);
  // 运行时：即使有人把联系人字段混进条目，也不影响结果。
  const polluted = timeline.map((entry) => ({ ...entry, stage: "archived", tags: ["vip"], status: "archived", customTags: ["x"], networkCategory: "investor", businessRelevanceScore: 99 }));
  assert.deepEqual(computeRelationshipStrength(polluted as unknown as RelationshipTimelineItem[], NOW), plain);
  // 类型：输入类型不含这些字段与私信。
  type Input = Parameters<typeof computeRelationshipStrength>[0][number];
  type Forbidden = "stage" | "tags" | "status" | "customTags" | "networkCategory" | "businessRelevanceScore" | "conversationId" | "messages";
  const noForbidden: Extract<keyof Input, Forbidden> extends never ? true : false = true;
  assert.equal(noForbidden, true);
  // @ts-expect-error stage 不是时间线条目的字段
  const stage: Input["stage"] = undefined;
  assert.equal(stage, undefined);
});

test("R-7: 30-days-ago tier from the full deduped timeline (>12 signals) equals a full replay, not a replay of the 12 cached signals", () => {
  const timeline: RelationshipTimelineItem[] = [capture(daysAgo(400))];
  // 一年前起每 20 天一次完成跟进（共 18 条，10 分）：当前缓存只留 12 条信号。
  for (let index = 0; index < 18; index += 1) timeline.push(item("followup_done", daysAgo(380 - index * 20)));
  const current = computeRelationshipStrength(timeline, NOW);
  assert.equal(current.signals.length, 12);
  const at = new Date(NOW.getTime() - 30 * DAY);
  const fromFull = computeRelationshipStrength(timeline, at);
  // 只用缓存 12 条 signals 回放（错误做法）：把 signals 还原成条目再算。
  const cachedIds = new Set(current.signals.map((signal) => signal.timelineItemId));
  const fromCached = computeRelationshipStrength(timeline.filter((entry) => cachedIds.has(entry.id)), at);
  assert.notEqual(fromCached.score, fromFull.score);
  // 全量回放：逐条只取 occurredAt ≤ at 的条目（不经本函数的过滤）手工求和。
  const manual = timeline
    .filter((entry) => Date.parse(entry.occurredAt) <= at.getTime())
    .map((entry) => relationshipSignalBasePoints(entry, false) * Math.pow(0.5, Math.round((at.getTime() - Date.parse(entry.occurredAt)) / DAY) / 90))
    .reduce((sum, points) => sum + points, 0);
  assert.equal(fromFull.score, Math.min(100, Math.round(manual)));

  const counts = computeRelationshipTierCountsAt(new Map([["c1", timeline]]), at);
  assert.equal(counts.asOf, at.toISOString());
  assert.equal(counts.contactCount, 1);
  assert.equal(counts.counts[fromFull.dormant ? "dormant" : fromFull.tier], 1);
});

test("computeRelationshipTierCountsAt skips contacts captured after the time point and groups dormant first", () => {
  const at = new Date(NOW.getTime() - 30 * DAY);
  const newcomer = [{ ...capture(daysAgo(10)), contactId: "c2", id: "capture:c2" }];
  const dormantOne = [capture(daysAgo(300)), meeting(daysAgo(200)), item("encounter", daysAgo(200)), memo(daysAgo(200))].map((entry) => ({ ...entry, contactId: "c3" }));
  const fresh = [capture(daysAgo(40)), memo(daysAgo(35))].map((entry) => ({ ...entry, contactId: "c4" }));
  const counts = computeRelationshipTierCountsAt(new Map([["c2", newcomer], ["c3", dormantOne], ["c4", fresh]]), at);
  assert.deepEqual(counts, { asOf: at.toISOString(), counts: { new: 1, active: 0, core: 0, dormant: 1 }, contactCount: 2 });
});

test("review P2-5: a past and a later same-Tokyo-day meeting count once (the higher base points)", () => {
  // NOW = 东京 12:00；同一东京日 09:00 已发生、20:00 尚未发生。
  const past = meeting("2026-10-02T00:00:00.000Z");
  const later = meeting("2026-10-02T11:00:00.000Z");
  const s = computeRelationshipStrength([capture(daysAgo(30)), past, later], NOW);
  const meetings = s.signals.filter((signal) => signal.source === "schedule");
  assert.equal(meetings.length, 1);
  assert.equal(meetings[0]!.timelineItemId, past.id);
  assert.equal(meetings[0]!.basePoints, 25);
});

test("review P1-1: meetings after the time point never count in a historical replay, even when they would cross a threshold", () => {
  const at = new Date(NOW.getTime() - 30 * DAY);
  const after = (days: number) => new Date(at.getTime() + days * DAY).toISOString();
  // 截止点当时：名片 10 + memo 15 = 25（新认识）；截止点之后 6 次约见（各在不同日），按「未来约见」各 5 分就会跨过 45。
  const timeline = [capture(daysAgo(60)), memo(daysAgo(50)), ...[1, 3, 5, 7, 9, 11].map((d) => meeting(after(d)))];
  assert.equal(computeRelationshipStrength(timeline, at).tier, "active", "the snapshot rule itself would count them as booked meetings");
  const counts = computeRelationshipTierCountsAt(new Map([["c1", timeline]]), at);
  assert.deepEqual(counts.counts, { new: 1, active: 0, core: 0, dormant: 0 });
  // 当前快照的「未来约见」规则不变。
  const future = meeting(new Date(NOW.getTime() + 5 * DAY).toISOString());
  assert.equal(computeRelationshipStrength([capture(daysAgo(10)), future], NOW).signals.find((signal) => signal.timelineItemId === future.id)?.points, 5);
});
