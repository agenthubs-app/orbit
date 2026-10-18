/**
 * W0050 SC-01／SC-03 源码扫描：「机会」标签的代码路径
 * - 不 import 关键词版需求匹配 `features/contact-needs`，不请求 `/api/contacts/needs-matches`；
 * - 不再请求 `/api/dashboard/opportunities/recompute`（「⟳ 刷新机会」下线）、不跳 iOrbit 聊天报告（`stashAgentPrefill`）；
 * - 计划只经 `getCurrent()` + 纯投影 `toOpportunityPlanView`：路径上没有 `getCurrentView`／`enterCurrentPhase`（R-6）；
 * - 快照读取带 `enqueue: false`（打开页面不排队，D46③）。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "../../..");
const read = (path: string) => readFileSync(join(root, path), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// R11b：机会标签换成新屏（orbit-2026/network-analysis）与它的读取（features/network-analysis/analysis-*）。
const OPPORTUNITIES_PATH = [
  "app/(app)/app/orbit-2026/network-analysis/AnalysisViews.tsx",
  "app/(app)/app/orbit-2026/network-analysis/NetworkAnalysisScreen.tsx",
  "features/network-analysis/analysis-model.ts",
  "features/network-analysis/analysis-reader.ts",
  "features/network-analysis/analysis-page-loader.ts",
  "app/(app)/app/contacts/analysis/opportunities-view-model.ts",
  "app/(app)/app/contacts/analysis/opportunities-report-card.ts",
  "features/plans/coverage.ts",
];

test("the opportunities tab path never touches keyword need matching, the old recompute or the iOrbit report entry", () => {
  for (const path of OPPORTUNITIES_PATH) {
    const source = read(path);
    assert.doesNotMatch(source, /contact-needs/, `${path} imports features/contact-needs`);
    assert.doesNotMatch(source, /needs-matches/, `${path} requests /api/contacts/needs-matches`);
    assert.doesNotMatch(source, /opportunities\/recompute/, `${path} requests the old recompute`);
    assert.doesNotMatch(source, /stashAgentPrefill|contacts\.analysis/, `${path} jumps to the iOrbit report`);
    assert.doesNotMatch(source, /getCurrentView|enterCurrentPhase/, `${path} uses a plan read that can write`);
  }
});

test("R11b: the analysis reads plan needs only through readActiveV2Needs and writes nothing", () => {
  const reader = read("features/network-analysis/analysis-reader.ts");
  assert.match(reader, /readActiveV2Needs\(actorId, "live"\)/);
  assert.doesNotMatch(reader, /enqueuePlan|enqueueSnapshotJob|insert into|update |delete from|getCurrentView|enterCurrentPhase/i);
  const runtime = read("features/network-analysis/runtime.ts");
  assert.match(runtime, /export async function readCurrentPlanForSnapshot[\s\S]*?\.getCurrent\(\)/);
  const page = read("features/network-analysis/analysis-page-loader.ts");
  // Below 10 people nothing after the count runs (no snapshot read).
  assert.match(page, /if \(view\.lock\.state !== "open"\) return \{ view, snapshot: null, evidenceNames: \{\} \};/);
});
