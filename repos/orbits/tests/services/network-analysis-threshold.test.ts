/**
 * W0054 SC-03：人脉分析门槛纯函数（`features/network-analysis/analysis-threshold.ts`）与读取器。
 * 门槛 = 引导第 1 步同一常量；N = 3 − 已确认数；替换卡只在不足 3 位或「从不足 3 人恢复」时出现。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { START_REQUIRED_CONTACTS } from "../../features/guide/start-steps";
import {
  ANALYSIS_GATE_IMPORT_HREF,
  ANALYSIS_GATE_SCAN_HREF,
  analysisGate,
  analysisThreshold,
  belowThresholdSnapshotView,
  NETWORK_ANALYSIS_MIN_CONTACTS,
} from "../../features/network-analysis/analysis-threshold";
import { readAnalysisThreshold } from "../../features/network-analysis/analysis-threshold-reader";
import { SNAPSHOT_MIN_CONTACTS } from "../../features/network-analysis/contract";

test("the threshold shares the guide's constant (and the snapshot minimum); N = 3 − confirmed", () => {
  assert.equal(NETWORK_ANALYSIS_MIN_CONTACTS, START_REQUIRED_CONTACTS);
  assert.equal(NETWORK_ANALYSIS_MIN_CONTACTS, SNAPSHOT_MIN_CONTACTS);
  assert.deepEqual([0, 1, 2, 3, 4].map((n) => analysisThreshold(n)), [
    { confirmed: 0, met: false, missing: 3 },
    { confirmed: 1, met: false, missing: 2 },
    { confirmed: 2, met: false, missing: 1 },
    { confirmed: 3, met: true, missing: 0 },
    { confirmed: 4, met: true, missing: 0 },
  ]);
  assert.deepEqual(analysisThreshold(Number.NaN), { confirmed: 0, met: false, missing: 3 });
  assert.equal(ANALYSIS_GATE_SCAN_HREF, "/app/contacts/new?method=scan");
  assert.equal(ANALYSIS_GATE_IMPORT_HREF, "/app/contacts/new?method=csv");
});

test("the gate: threshold first; then only a recovering snapshot gets 「正在更新」 or 「明天更新」; anything else shows no card", () => {
  const view = (freshness: Partial<ReturnType<typeof belowThresholdSnapshotView>["freshness"]>, backgroundRetryOn?: string) => {
    const base = belowThresholdSnapshotView();
    return { ...base, freshness: { ...base.freshness, ...freshness }, quota: { ...base.quota, background: { ...base.quota.background, ...(backgroundRetryOn ? { retryOn: backgroundRetryOn } : {}) } } };
  };
  assert.deepEqual(analysisGate(analysisThreshold(2), view({ recovering: true })), { kind: "threshold", missing: 1 });
  assert.equal(analysisGate(analysisThreshold(5), view({ job: "queued", stale: true })), null, "a normal stale snapshot keeps showing");
  assert.equal(analysisGate(null, null), null, "unknown threshold and no snapshot: no card");
  assert.deepEqual(analysisGate(analysisThreshold(3), view({ job: "queued", recovering: true })), { kind: "updating" });
  assert.deepEqual(analysisGate(null, view({ job: "running", recovering: true })), { kind: "updating" });
  assert.deepEqual(analysisGate(analysisThreshold(3), view({ job: "deferred", recovering: true, retryOn: "2026-10-04T15:00:00.000Z" })), { kind: "deferred", retryOn: "2026-10-04T15:00:00.000Z" });
  assert.deepEqual(analysisGate(analysisThreshold(3), view({ job: "none", recovering: true }, "2026-10-04T15:00:00.000Z")), { kind: "deferred", retryOn: "2026-10-04T15:00:00.000Z" });
  assert.equal(belowThresholdSnapshotView().state, "insufficient");
  assert.deepEqual(belowThresholdSnapshotView().blocks, []);
});

test("the reader counts with the injected (guide) counter and fails to null instead of throwing", async () => {
  const seen: string[] = [];
  assert.deepEqual(await readAnalysisThreshold("actor:a", async (actorId) => { seen.push(actorId); return 2; }), { confirmed: 2, met: false, missing: 1 });
  assert.deepEqual(seen, ["actor:a"]);
  const original = console.error;
  console.error = () => undefined;
  try {
    assert.equal(await readAnalysisThreshold("actor:a", async () => { throw new Error("down"); }), null);
  } finally {
    console.error = original;
  }
});
