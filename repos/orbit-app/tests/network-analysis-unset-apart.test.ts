import assert from "node:assert/strict";
import test from "node:test";

import { buildNetworkAnalysisPeople, buildNetworkAnalysisView, type NetworkAnalysisRow } from "../src/api/compute/network-analysis-model";
import { withUnsetApart } from "../src/view-models/network-analysis-local";

// Sprint 0148 follow-up: the App's analysis page shows 未填写 apart for industry and region (as the home card does);
// 其他 keeps the named groups after the top three, and each drill-down list still equals its row.
let seq = 0;
function person(extra: Partial<NetworkAnalysisRow> = {}): NetworkAnalysisRow {
  seq += 1;
  return { id: `c${String(seq).padStart(3, "0")}`, name: `人${seq}`, organization: "", role: "", status: "active", goalRelated: false, needsFollowUp: false, nextActionPreview: "", ...extra };
}
const many = (count: number, extra: Partial<NetworkAnalysisRow> = {}) => Array.from({ length: count }, () => person(extra));
const now = new Date("2026-11-02T00:00:00.000Z");
const rows = [
  ...many(5, { primaryIndustryId: "technology_internet", city: "Tokyo" }), ...many(3, { primaryIndustryId: "finance_investment", city: "Osaka" }),
  ...many(2, { primaryIndustryId: "manufacturing_supply_chain" }), ...many(1, { primaryIndustryId: "retail_consumer" }), ...many(1, { primaryIndustryId: "other" }),
  ...many(3, {}),
];
const view = () => withUnsetApart(buildNetworkAnalysisView({ total: rows.length, rows, needs: [], now }), rows);
const structure = () => { const v = view(); assert.ok(v.structure); return v.structure; };

test("industry and region: 未填写 is its own last bucket and 其他 keeps only the named groups after the top three", () => {
  assert.deepEqual(structure().industries.buckets, [
    { id: "technology_internet", count: 5 }, { id: "finance_investment", count: 3 }, { id: "manufacturing_supply_chain", count: 2 },
    { id: "rest", count: 2 }, { id: "none", count: 3 },
  ]);
  assert.deepEqual(structure().regions.buckets, [{ id: "Tokyo", count: 5 }, { id: "Osaka", count: 3 }, { id: "none", count: 7 }], "no named rest: no 其他");
  for (const dist of [structure().industries, structure().regions]) assert.equal(dist.buckets.reduce((sum, bucket) => sum + bucket.count, 0), dist.total);
});

test("seniority and where we met are unchanged; nobody unset leaves the view as it was; a locked view is passed through", () => {
  const plain = buildNetworkAnalysisView({ total: rows.length, rows, needs: [], now });
  assert.deepEqual(structure().seniority, plain.structure!.seniority);
  assert.deepEqual(structure().mets, plain.structure!.mets);
  const filled = rows.filter((row) => row.primaryIndustryId && row.city);
  const all = [...filled, ...many(10, { primaryIndustryId: "education_research", city: "Kyoto" })];
  const filledView = buildNetworkAnalysisView({ total: all.length, rows: all, needs: [], now });
  assert.deepEqual(withUnsetApart(filledView, all), filledView);
  const locked = buildNetworkAnalysisView({ total: 3, rows: rows.slice(0, 3), needs: [], now });
  assert.deepEqual(withUnsetApart(locked, rows.slice(0, 3)), locked);
});

test("each bucket's list equals its row: 其他 without the unset people, 未填写 with only them", () => {
  const people = (bucketId: string, dimension: "industry" | "region" = "industry") => buildNetworkAnalysisPeople({ rows, needs: [], dimension, bucketId, unsetApart: true, now })?.total;
  assert.equal(people("rest"), 2);
  assert.equal(people("none"), 3);
  assert.equal(people("none", "region"), 7);
});
