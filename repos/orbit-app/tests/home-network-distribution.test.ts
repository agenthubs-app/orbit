import assert from "node:assert/strict";
import test from "node:test";

import type { NetworkAnalysisRow } from "../src/api/compute/network-analysis-model";
import {
  defaultHomeNetworkDimension, homeNetworkCounts, homeNetworkDistribution, homeNetworkDimensionKey, parseHomeNetworkDimension,
} from "../src/screens/home/home-network-distribution";

// Sprint 0148: the home 人脉 card's distribution — the analysis model's own buckets (analysisBucketKey),
// shown as the top three + 其他 + 未填写, on the dimension that is filled in the most.
let seq = 0;
function person(extra: Partial<NetworkAnalysisRow> = {}): NetworkAnalysisRow {
  seq += 1;
  return { id: `c${seq}`, name: `人${seq}`, organization: "", role: "", status: "active", goalRelated: false, needsFollowUp: false, nextActionPreview: "", ...extra };
}
const many = (count: number, extra: Partial<NetworkAnalysisRow> = {}) => Array.from({ length: count }, () => person(extra));

test("industry: top three biggest first, the rest folded into 其他, the unset people apart as 未填写", () => {
  const rows = [
    ...many(4, { primaryIndustryId: "technology_internet" }), ...many(3, { primaryIndustryId: "manufacturing_supply_chain" }),
    ...many(2, { primaryIndustryId: "finance_investment" }), ...many(1, { primaryIndustryId: "retail_consumer" }), ...many(1, { primaryIndustryId: "other" }),
    ...many(3, {}),
  ];
  const view = homeNetworkDistribution(homeNetworkCounts(rows, "industry"), "industry", rows.length);
  assert.deepEqual(view.slices, [
    { id: "technology_internet", count: 4, kind: "named" }, { id: "manufacturing_supply_chain", count: 3, kind: "named" },
    { id: "finance_investment", count: 2, kind: "named" }, { id: "rest", count: 2, kind: "rest" }, { id: "none", count: 3, kind: "unset" },
  ]);
  assert.equal(view.total, 14);
  assert.equal(view.filled, 11);
  assert.equal(view.slices.reduce((sum, slice) => sum + slice.count, 0), view.total, "the slices add up to the total");
});

test("three or fewer named buckets: no 其他; nobody unset: no 未填写; empty buckets never show", () => {
  const rows = [...many(2, { primaryIndustryId: "technology_internet" }), ...many(1, { primaryIndustryId: "finance_investment" })];
  assert.deepEqual(homeNetworkDistribution(homeNetworkCounts(rows, "industry"), "industry", 3).slices,
    [{ id: "technology_internet", count: 2, kind: "named" }, { id: "finance_investment", count: 1, kind: "named" }]);
  assert.deepEqual(homeNetworkDistribution(new Map(), "industry", 0).slices, []);
});

test("region uses the analysis rule: city, then the location text, then the country; nothing at all is 未填写", () => {
  const rows = [person({ city: "Tokyo" }), person({ location: "大阪市北区" }), person({ countryCode: "CN" }), person({ countryCode: "CN" }), person({})];
  assert.deepEqual(homeNetworkDistribution(homeNetworkCounts(rows, "region"), "region", rows.length).slices, [
    { id: "CN", count: 2, kind: "named" }, { id: "Osaka", count: 1, kind: "named" }, { id: "Tokyo", count: 1, kind: "named" }, { id: "none", count: 1, kind: "unset" },
  ]);
});

test("where we met: an unknown place reads 其他 (kept last), never 未填写; it does not count as filled in", () => {
  const rows = [...many(3, { metKind: "event" }), ...many(1, { metKind: "referral" }), ...many(2, {})];
  const view = homeNetworkDistribution(homeNetworkCounts(rows, "met"), "met", rows.length);
  assert.deepEqual(view.slices, [{ id: "event", count: 3, kind: "named" }, { id: "referral", count: 1, kind: "named" }, { id: "other", count: 2, kind: "unset" }]);
  assert.equal(view.filled, 4);
});

test("a server summary's facets (no row list) give the same slices; people missing from the facets are unset", () => {
  const view = homeNetworkDistribution({ technology_internet: 3, finance_investment: 1 }, "industry", 6);
  assert.deepEqual(view.slices, [{ id: "technology_internet", count: 3, kind: "named" }, { id: "finance_investment", count: 1, kind: "named" }, { id: "none", count: 2, kind: "unset" }]);
});

test("the default dimension is the one filled in the most; ties go industry, region, where we met", () => {
  const rows = [...many(3, { primaryIndustryId: "technology_internet", metKind: "event" }), ...many(2, { city: "Tokyo", metKind: "visit" }), ...many(1, { city: "Osaka" })];
  const of = (list: NetworkAnalysisRow[]) => ({
    industry: homeNetworkDistribution(homeNetworkCounts(list, "industry"), "industry", list.length),
    region: homeNetworkDistribution(homeNetworkCounts(list, "region"), "region", list.length),
    met: homeNetworkDistribution(homeNetworkCounts(list, "met"), "met", list.length),
  });
  assert.equal(defaultHomeNetworkDimension(of(rows)), "met", "met 5/6 > industry 3/6 = region 3/6");
  assert.equal(defaultHomeNetworkDimension(of(many(4, { primaryIndustryId: "other", city: "Tokyo" }))), "industry");
  assert.equal(defaultHomeNetworkDimension(of(many(4, { city: "Tokyo" }))), "region");
  assert.equal(defaultHomeNetworkDimension(of([])), "industry");
});

test("the saved choice is scoped by server and account and read back strictly", () => {
  assert.equal(homeNetworkDimensionKey("account:one", "http://fixture"), "orbit:home-network-dimension:v1:http%3A%2F%2Ffixture:account%3Aone");
  assert.equal(homeNetworkDimensionKey("", "http://fixture"), null);
  assert.notEqual(homeNetworkDimensionKey("account:one", "http://a"), homeNetworkDimensionKey("account:one", "http://b"));
  assert.equal(parseHomeNetworkDimension("region"), "region");
  assert.equal(parseHomeNetworkDimension("seniority"), null);
  assert.equal(parseHomeNetworkDimension(null), null);
});
