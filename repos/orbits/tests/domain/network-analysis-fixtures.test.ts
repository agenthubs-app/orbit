import assert from "node:assert/strict";
import test from "node:test";

import { buildNetworkAnalysisPeople, buildNetworkAnalysisView } from "../../features/network-analysis/analysis-model";
import { NETWORK_FIXTURE_NOW, fixtureNetworkAnalysisReadDeps, fixtureNetworkSnapshotView, installNetworkFixtureWorld } from "../../features/network-analysis/analysis-fixtures";
import { designNetworkNeeds, designNetworkPeople, designNetworkWorld } from "../../features/network-analysis/design-fixtures";

// R11b 设计稿示例 fixture：画板上的数字都是这些行的真实计数（只补数据，不改结构；HOW-TO §8）。
const view = (variant: Parameters<typeof designNetworkPeople>[0]) => {
  const rows = designNetworkPeople(variant);
  return buildNetworkAnalysisView({ total: rows.length, rows, needs: designNetworkNeeds(variant), now: NETWORK_FIXTURE_NOW });
};
const counts = (buckets: { id: string; count: number }[]) => buckets.map((bucket) => bucket.count);

test("many286 reproduces b5 #34 / #35 / #36 / #40 / #41", () => {
  const result = view("many286");
  assert.deepEqual(result.lock, { state: "open", total: 286, required: 10, reference: false });
  assert.deepEqual(counts(result.structure!.industries.buckets), [105, 83, 63, 35]);
  assert.deepEqual(counts(result.structure!.seniority.buckets), [74, 96, 116]);
  assert.deepEqual(counts(result.structure!.regions.buckets), [188, 41, 33, 24]);
  assert.deepEqual(counts(result.structure!.mets.buckets), [142, 61, 52, 31]);
  assert.deepEqual(result.structure!.gaps, [{ planId: "design-plan", needId: "design-need-cvc", title: "CVC・事業会社の投資担当", targetCount: 4, linkedCount: 1 }]);
  const byKind = Object.fromEntries(result.opportunities!.map((card) => [card.kind, card]));
  assert.equal(byKind.reconnect!.count, 12);
  assert.deepEqual(byKind.reconnect!.preview.map((ref) => ref.name), ["山本 彩", "森 隆之", "藤田 亮介"]);
  assert.equal(byKind.stalled!.count, 18);
  assert.equal(byKind.stalled!.averageDays, 46);
  const met = result.insights!.find((entry) => entry.kind === "met_path")!;
  assert.equal(met.sample, 105);
  assert.equal(met.eventShare, 68);
  assert.equal(met.referralRate, 21);
  const growth = result.insights!.find((entry) => entry.kind === "growth")!;
  assert.equal(growth.added, 9);
  assert.equal(growth.planNeedTitle, "小売の新規顧客開拓");
  const finance = buildNetworkAnalysisPeople({ rows: designNetworkPeople("many286"), needs: designNetworkNeeds("many286"), dimension: "industry", bucketId: "finance_investment", now: NETWORK_FIXTURE_NOW })!;
  assert.equal(finance.total, 105);
  assert.equal(finance.sort, "goal");
  assert.ok(finance.items[0]!.goalRelated, "目標に近い順 starts with plan-related people");
  assert.equal(finance.stages.active + finance.stages.nurture, 105);
});

test("few14 reproduces b5 #33 / #39; locked5 and empty stay locked", () => {
  const result = view("few14");
  assert.deepEqual(result.lock, { state: "open", total: 14, required: 10, reference: true });
  assert.deepEqual(counts(result.structure!.industries.buckets), [5, 4, 3, 2]);
  assert.deepEqual(counts(result.structure!.seniority.buckets), [4, 6, 4]);
  assert.deepEqual(counts(result.structure!.regions.buckets), [9, 2, 2, 1]);
  assert.deepEqual(counts(result.structure!.mets.buckets), [7, 3, 3, 1]);
  assert.deepEqual(result.structure!.gaps!.map((gap) => [gap.targetCount, gap.linkedCount]), [[4, 0]]);
  assert.deepEqual(result.insights, []);
  assert.deepEqual(view("locked5").lock, { state: "locked", total: 5, required: 10, missing: 5 });
  assert.deepEqual(view("empty").lock, { state: "locked", total: 0, required: 10, missing: 10 });
});

test("the installed world is process-wide and null restores the demo world; the mock snapshot cites fixture people", async () => {
  installNetworkFixtureWorld(designNetworkWorld("locked5"));
  assert.equal(await fixtureNetworkAnalysisReadDeps().readTotal({ id: "a" }), 5);
  assert.equal(fixtureNetworkSnapshotView("ja").state, "insufficient");
  installNetworkFixtureWorld(designNetworkWorld("many286"));
  const snapshot = fixtureNetworkSnapshotView("ja");
  assert.equal(snapshot.blocks.find((block) => block.kind === "gap")?.needId, "design-need-cvc");
  installNetworkFixtureWorld(null);
  assert.equal(await fixtureNetworkAnalysisReadDeps().readTotal({ id: "a" }), 10);
});
