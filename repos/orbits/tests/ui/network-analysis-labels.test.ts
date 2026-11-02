import assert from "node:assert/strict";
import test from "node:test";

import { bucketLabel, regionLabel } from "../../app/(app)/app/orbit-2026/network-analysis/analysis-labels";

// Sprint 0148: a region bucket with only a country (shared analysisBucketKey falls back to the ISO code) reads the
// country's name in the page language, like the App's analysis-labels.ts; known cities keep the 人脈 copy.
const t = (key: string) => key;

test("0148: a country-only region bucket shows the localized country name; cities and unknown text are unchanged", () => {
  assert.equal(regionLabel("CN", "zh"), "中国");
  assert.equal(regionLabel("JP", "ja"), "日本");
  assert.equal(regionLabel("SG", "en"), "Singapore");
  assert.equal(bucketLabel("region", "CN", t as never, "en"), "China");
  assert.equal(bucketLabel("region", "Tokyo", t as never, "zh"), "东京");
  assert.equal(bucketLabel("region", "Hangzhou", t as never, "ja"), "Hangzhou");
  assert.equal(bucketLabel("region", "rest", t as never, "zh"), "rest");
});
