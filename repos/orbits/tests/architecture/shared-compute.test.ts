import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { auditSharedComputeSources, COMPUTE_TEXT_HELPER, type ComputeSource } from "../support/shared-compute-audit";

// Sprint 0117 (dashboard D3, design decision 3): shared/compute is the one
// directory of runtime code the server and the App share (copied to the App by
// npm run sync:contract). Its files may only import each other, contract types
// and the two synced dictionaries, and may not touch IO, the network, the
// clock or runtime-dependent text rules outside the text helper.

const computeDir = join(process.cwd(), "shared", "compute");

function computeSources(): ComputeSource[] {
  return readdirSync(computeDir)
    .filter((name) => name.endsWith(".ts"))
    .sort()
    .map((name) => ({ name, text: readFileSync(join(computeDir, name), "utf8") }));
}

test("shared/compute exists and every file follows the shared-directory rule", () => {
  assert.equal(existsSync(computeDir), true, "shared/compute is the explicitly shared directory");
  const sources = computeSources();
  assert.ok(sources.some((source) => source.name === COMPUTE_TEXT_HELPER), "the text helper pins the runtime-dependent primitives");
  assert.deepEqual(auditSharedComputeSources(sources), []);
  assert.deepEqual(readdirSync(computeDir).filter((name) => !name.endsWith(".ts")), [], "only .ts files: the sync copies .ts files");
});

test("the audit refuses a server import, a package, IO, the network, the clock and runtime-dependent text outside the helper", () => {
  const ok = { name: "dashboard-ok.ts", text: "import type { SourceReferenceContract } from \"../contract/source\";\nimport { isIndustryIdCode } from \"../domain/industries\";\nimport { compareText } from \"./compute-text\";\nexport const f = (a: string, b: string, s?: SourceReferenceContract) => compareText(a, b) + (isIndustryIdCode(a) ? 1 : 0) + (s ? 0 : 1);\n" };
  const helper = { name: COMPUTE_TEXT_HELPER, text: "export const compareText = (a: string, b: string) => new Intl.Collator(\"en-US\").compare(a, b) || Date.parse(a) || new Date(b).getTime();\n" };
  assert.deepEqual(auditSharedComputeSources([ok, helper]), [], "the allowed shapes pass");
  const bad: Record<string, string> = {
    "server-import.ts": "import { createPostgresLiveRecordStore } from \"../storage/postgres-live-record-store\";\nexport const x = createPostgresLiveRecordStore;\n",
    "feature-import.ts": "import { x } from \"../../features/dashboard/contract\";\nexport const y = x;\n",
    "package-import.ts": "import { z } from \"zod\";\nexport const s = z.string();\n",
    "node-import.ts": "import { readFileSync } from \"node:fs\";\nexport const r = readFileSync;\n",
    "contract-value.ts": "import { CONTACT } from \"../contract/contacts\";\nexport const c = CONTACT;\n",
    "missing-sibling.ts": "import { gone } from \"./not-here\";\nexport const g = gone;\n",
    "dynamic.ts": "export const load = () => import(\"./compute-text\");\n",
    "fetches.ts": "export const get = () => fetch(\"https://example.com\");\n",
    "env.ts": "export const flag = process.env.ORBIT;\n",
    "logs.ts": "export const log = (m: string) => console.log(m);\n",
    "timer.ts": "export const later = (f: () => void) => setTimeout(f, 1);\n",
    "clock.ts": "export const now = () => Date.now();\n",
    "clock2.ts": "export const now = () => new Date().toISOString();\n",
    "random.ts": "export const pick = () => Math.random();\n",
    "locale.ts": "export const sort = (a: string, b: string) => a.localeCompare(b);\n",
    "lower.ts": "export const low = (a: string) => a.toLocaleLowerCase();\n",
    "intl.ts": "export const c = new Intl.Collator(\"en\");\n",
    "parse.ts": "export const t = (v: string) => new Date(v).getTime() + Date.parse(v);\n",
    "Bad_Name.ts": "export const n = 1;\n",
  };
  const problems = auditSharedComputeSources([helper, ...Object.entries(bad).map(([name, text]) => ({ name, text }))]);
  for (const name of Object.keys(bad)) {
    assert.ok(problems.some((problem) => problem.startsWith(name)), `${name} must be refused; problems: ${problems.join(" | ")}`);
  }
  assert.ok(!problems.some((problem) => problem.startsWith(COMPUTE_TEXT_HELPER)), "the helper itself may pin Intl and Date parsing");
});

test("the server's dashboard computations are the shared code (same function objects), not a second copy", async () => {
  const pairs: [string, string, string][] = [
    ["features/dashboard/live-distribution-service", "shared/compute/dashboard-distribution", "networkGapCoreFromGraph"],
    ["features/dashboard/live-opportunity-service", "shared/compute/dashboard-opportunity", "opportunityCoreFromGraph"],
    ["features/dashboard/live-service", "shared/compute/dashboard-aggregate", "dashboardAggregateReadModelFromGraph"],
    ["features/dashboard/live-service", "shared/compute/dashboard-aggregate", "createLiveDashboardAggregateService"],
    ["features/dashboard/opportunity-action-brief", "shared/compute/dashboard-opportunity", "createOpportunityActionBrief"],
    ["features/dashboard/summary", "shared/compute/dashboard-aggregate", "buildDashboardAggregateSummary"],
    ["features/dashboard/aggregate-projection", "shared/compute/dashboard-aggregate", "dashboardDueLabel"],
    ["features/dashboard/storage/dashboard-live-record-provider", "shared/compute/dashboard-graph", "dashboardGraphFromRecords"],
  ];
  for (const [server, shared, name] of pairs) {
    const serverModule = await import(join(process.cwd(), server)) as Record<string, unknown>;
    const sharedModule = await import(join(process.cwd(), shared)) as Record<string, unknown>;
    assert.equal(typeof sharedModule[name], "function", `${shared} exports ${name}`);
    assert.equal(serverModule[name], sharedModule[name], `${server}.${name} is the shared function`);
  }
  // The two analytics factories add only the server clock when no "now" is passed.
  const graph = { connections: [], contacts: [], events: [], evidence: [], generatedAt: "2026-09-28T00:00:00.000Z", tasks: [] };
  const now = () => "2026-09-28T09:00:00.000Z";
  const distribution = await import(join(process.cwd(), "features/dashboard/live-distribution-service"));
  const sharedDistribution = await import(join(process.cwd(), "shared/compute/dashboard-distribution"));
  const provider = { source: "s", sourceLabel: "l", readNetworkDistributionGraph: () => graph };
  assert.deepEqual(await distribution.createLiveNetworkDistributionAnalyticsService({ now, provider }).getNetworkGaps(), await sharedDistribution.createLiveNetworkDistributionAnalyticsService({ now, provider }).getNetworkGaps());
  const opportunity = await import(join(process.cwd(), "features/dashboard/live-opportunity-service"));
  const sharedOpportunity = await import(join(process.cwd(), "shared/compute/dashboard-opportunity"));
  const opportunityProvider = { source: "s", sourceLabel: "l", readOpportunityGraph: () => graph };
  assert.deepEqual(await opportunity.createLiveOpportunityReminderAnalyticsService({ now, provider: opportunityProvider }).getOpportunityReminderAnalytics(), await sharedOpportunity.createLiveOpportunityReminderAnalyticsService({ now, provider: opportunityProvider }).getOpportunityReminderAnalytics());
});

test("the server and device contact pipeline use the same shared stage decision", async () => {
  const shared = await import(join(process.cwd(), "shared/compute/contact-pipeline")) as Record<string, unknown>;
  const server = await import(join(process.cwd(), "features/contacts/pipeline-page-reader")) as Record<string, unknown>;
  assert.equal(typeof shared.contactPipelineStageFor, "function");
  assert.equal(server.contactPipelineStageFor, shared.contactPipelineStageFor);
});
