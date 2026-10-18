import assert from "node:assert/strict";
import test from "node:test";

import {
  availableSorts, buildNetworkAnalysisPeople, buildNetworkAnalysisView, bucketMembers, distribution, insights, opportunities, planGaps,
  type NetworkAnalysisNeed, type NetworkAnalysisRow,
} from "../../features/network-analysis/analysis-model";

// R11b SC-03～07（PLANNER §2 B-1 / B-2 / B-5、§5、§6）：分布对账、机会 = 名单、趋势样本不足即隐藏、锁定时什么都不算。
const NOW = new Date("2026-10-18T03:00:00.000Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();
let seq = 0;
function person(extra: Partial<NetworkAnalysisRow> = {}): NetworkAnalysisRow {
  seq += 1;
  return { id: `c${String(seq).padStart(3, "0")}`, name: `名前${seq}`, organization: "会社", role: "役職", status: "active", goalRelated: false, needsFollowUp: false,
    nextActionPreview: "", addedAt: daysAgo(200), ...extra };
}
const many = (count: number, extra: Partial<NetworkAnalysisRow> = {}) => Array.from({ length: count }, () => person(extra));

test("locked below 10: no structure, no opportunities, no insights — even when rows are handed in", () => {
  const view = buildNetworkAnalysisView({ total: 9, rows: many(9), needs: [], now: NOW });
  assert.deepEqual(view, { asOf: NOW.toISOString(), lock: { state: "locked", total: 9, required: 10, missing: 1 } });
  assert.equal(buildNetworkAnalysisView({ total: 5, rows: null, needs: null, now: NOW }).lock.state, "locked");
  const open = buildNetworkAnalysisView({ total: 10, rows: many(10), needs: [], now: NOW });
  assert.deepEqual(open.lock, { state: "open", total: 10, required: 10, reference: true });
  assert.equal(buildNetworkAnalysisView({ total: 30, rows: many(30), needs: [], now: NOW }).lock.state === "open" && (buildNetworkAnalysisView({ total: 30, rows: many(30), needs: [], now: NOW }).lock as { reference: boolean }).reference, false);
});

test("every distribution adds up to the total; the fourth industry / region row folds the rest and the unset people", () => {
  const rows = [
    ...many(6, { primaryIndustryId: "finance_investment", city: "Tokyo", metKind: "event", seniorityLevel: "c_level" }),
    ...many(4, { primaryIndustryId: "manufacturing", city: "Osaka", metKind: "referral", seniorityLevel: "manager" }),
    ...many(3, { primaryIndustryId: "technology_internet", city: "Nagoya", metKind: "visit", seniorityLevel: "individual_contributor" }),
    ...many(2, { primaryIndustryId: "retail_trade", city: "Kyoto" }),
    ...many(2, {}),
  ];
  const industries = distribution(rows, "industry");
  assert.deepEqual(industries.buckets, [{ id: "finance_investment", count: 6 }, { id: "manufacturing", count: 4 }, { id: "technology_internet", count: 3 }, { id: "other", count: 4 }]);
  for (const dimension of ["industry", "seniority", "region", "met"] as const) {
    const result = distribution(rows, dimension);
    assert.equal(result.buckets.reduce((sum, bucket) => sum + bucket.count, 0), rows.length, dimension);
    for (const bucket of result.buckets) assert.equal(bucketMembers(rows, dimension, bucket.id, { nowMs: NOW.getTime(), hasPlan: false })!.length, bucket.count, `${dimension}:${bucket.id}`);
  }
  assert.deepEqual(distribution(rows, "seniority").buckets, [{ id: "decision", count: 6 }, { id: "manager", count: 4 }, { id: "staff", count: 3 }, { id: "unset", count: 4 }]);
  assert.deepEqual(distribution(rows, "met").buckets, [{ id: "event", count: 6 }, { id: "referral", count: 4 }, { id: "visit", count: 3 }, { id: "other", count: 4 }]);
  // Four named industries and nobody unset: four rows, no その他.
  assert.deepEqual(distribution(rows.slice(0, 15), "industry").buckets.map((bucket) => bucket.id), ["finance_investment", "manufacturing", "technology_internet", "retail_trade"]);
});

test("plan gaps: target above linked only; null when the plan could not be read", () => {
  const needs: NetworkAnalysisNeed[] = [
    { planId: "p", needId: "n1", title: "CVC・事業会社の投資担当", primaryIndustryId: "finance_investment", targetCount: 4, linkedCount: 1, skipped: false },
    { planId: "p", needId: "n2", title: "済み", primaryIndustryId: null, targetCount: 2, linkedCount: 2, skipped: false },
    { planId: "p", needId: "n3", title: "スキップ", primaryIndustryId: null, targetCount: 5, linkedCount: 0, skipped: true },
  ];
  assert.deepEqual(planGaps(needs), [{ planId: "p", needId: "n1", title: "CVC・事業会社の投資担当", targetCount: 4, linkedCount: 1 }]);
  assert.equal(planGaps(null), null);
  assert.deepEqual(planGaps([]), []);
});

test("opportunities: each count equals its drill-down list; reconnect needs a plan; a kind without people is left out", () => {
  const rows = [
    ...many(3, { goalRelated: true, lastInteractionAt: daysAgo(120) }),
    person({ goalRelated: true, lastInteractionAt: daysAgo(10) }),
    ...many(2, { status: "nurture", lastInteractionAt: daysAgo(40) }),
    person({ status: "nurture", lastInteractionAt: daysAgo(60) }),
    person({ status: "nurture", lastInteractionAt: daysAgo(5) }),
    ...many(4),
  ];
  const cards = opportunities(rows, NOW.getTime(), true);
  assert.deepEqual(cards.map((card) => [card.kind, card.count]), [["reconnect", 3], ["stalled", 3]]);
  assert.equal(cards[1]!.averageDays, Math.round((40 + 40 + 60) / 3));
  for (const card of cards) {
    const list = buildNetworkAnalysisPeople({ rows, needs: [{ planId: "p", needId: "n", title: "t", primaryIndustryId: null, targetCount: 1, linkedCount: 0, skipped: false }], dimension: "opportunity", bucketId: card.kind, now: NOW })!;
    assert.equal(list.total, card.count);
    assert.ok(card.preview.every((ref) => list.items.some((item) => item.id === ref.id)), "avatars belong to the list");
  }
  assert.deepEqual(opportunities(rows, NOW.getTime(), false).map((card) => card.kind), ["stalled"], "no plan → no 再会すべき人");
  assert.deepEqual(opportunities(many(5), NOW.getTime(), true), []);
});

test("insights: hidden below 30 people or with fewer than 5 on a side; computed from real rows otherwise", () => {
  const base = [
    ...many(8, { primaryIndustryId: "finance_investment", metKind: "event", status: "active" }),
    ...many(2, { primaryIndustryId: "finance_investment", metKind: "event", status: "nurture" }),
    ...many(3, { primaryIndustryId: "finance_investment", metKind: "referral", status: "active" }),
    ...many(3, { primaryIndustryId: "finance_investment", metKind: "referral", status: "nurture" }),
    ...many(10, { primaryIndustryId: "manufacturing", addedAt: daysAgo(3) }),
    ...many(4, { primaryIndustryId: "retail_trade" }),
  ];
  assert.equal(base.length, 30);
  const result = insights(base, [{ planId: "p", needId: "n", title: "製造業の新規顧客開拓", primaryIndustryId: "manufacturing", targetCount: 3, linkedCount: 0, skipped: false }], NOW.getTime());
  const met = result.find((entry) => entry.kind === "met_path")!;
  assert.deepEqual(met, { kind: "met_path", industryId: "finance_investment", sample: 16, eventShare: 63, eventRate: 20, referralRate: 50 });
  const growth = result.find((entry) => entry.kind === "growth")!;
  assert.equal(growth.industryId, "manufacturing");
  assert.equal(growth.added, 10);
  assert.equal(growth.planNeedTitle, "製造業の新規顧客開拓");
  assert.equal(growth.months!.length, 6);
  assert.equal(growth.months!.at(-1)!.month, "2026-10");
  assert.equal(growth.months!.reduce((sum, month) => sum + month.added, 0), 10, "every joiner of the last six months is in a bar (the rest joined 200 days ago)");
  assert.deepEqual(insights(base.slice(0, 29), null, NOW.getTime()), [], "below 30: no trend cards");
  const thin = base.filter((row) => !(row.metKind === "referral" && row.status === "nurture"));
  assert.equal(insights([...thin, ...many(3)], null, NOW.getTime()).some((entry) => entry.kind === "met_path"), false, "3 referrals: no comparison");
});

test("drill-down list: 段階の内訳 adds up; sorts offered only with data; paging keeps the total", () => {
  const rows = [
    ...many(3, { primaryIndustryId: "finance_investment", status: "nurture", lastInteractionAt: daysAgo(3) }),
    ...many(4, { primaryIndustryId: "finance_investment", goalRelated: true }),
    ...many(2, { primaryIndustryId: "manufacturing" }),
  ];
  const first = buildNetworkAnalysisPeople({ rows, needs: [], dimension: "industry", bucketId: "finance_investment", limit: 4, now: NOW })!;
  assert.equal(first.total, 7);
  assert.deepEqual(first.stages, { active: 4, nurture: 3 });
  assert.deepEqual(first.sorts, ["recent", "name"], "no plan → no 目標に近い順");
  assert.equal(first.sort, "recent");
  assert.equal(first.items.length, 4);
  const second = buildNetworkAnalysisPeople({ rows, needs: [], dimension: "industry", bucketId: "finance_investment", limit: 4, cursor: first.nextCursor!, now: NOW })!;
  assert.equal(second.items.length, 3);
  assert.equal(second.nextCursor, null);
  assert.equal(new Set([...first.items, ...second.items].map((item) => item.id)).size, 7);
  assert.deepEqual(availableSorts(many(2), false), ["name"]);
  assert.equal(buildNetworkAnalysisPeople({ rows, needs: [], dimension: "industry", bucketId: "finance_investment", sort: "goal", now: NOW })!.sort, "recent", "an order the data cannot support falls back");
  assert.equal(buildNetworkAnalysisPeople({ rows, needs: [], dimension: "opportunity", bucketId: "nope", now: NOW }), null);
  assert.throws(() => buildNetworkAnalysisPeople({ rows, needs: [], dimension: "industry", bucketId: "finance_investment", cursor: "%%%", now: NOW }), /NETWORK_ANALYSIS_CURSOR_INVALID/);
});
