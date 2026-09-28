import assert from "node:assert/strict";
import test from "node:test";

import { computeDashboardSections, computeDashboardStructureDetail } from "../../shared/compute/dashboard-local";
import type { LiveDashboardGraph } from "../../shared/compute/dashboard-graph";

// Sprint 0131 (coordinator item from 0117): a non-ASCII location bucket (上海)
// carries percent escapes in its id (`location_${encodeURIComponent(value)}`),
// and the route parameter reached the lookup decoded one time too many, so the
// drill-down said "not found" on both the server and the device (they share
// this code). The lookup now canonicalises the id however many times it was
// decoded.
const NOW = "2026-09-28T01:00:00.000Z";
const source = { type: "manual", id: "src:1", label: "手动记录" } as const;
const contact = (id: string, name: string, location: string) => ({ id, displayName: name, location, stage: "nurture" as const, source, evidenceIds: [`e:${id}`] as [string], createdAt: NOW, updatedAt: NOW });
const graph: LiveDashboardGraph = {
  contacts: [contact("c1", "王磊", "上海"), contact("c2", "李娜", "上海"), contact("c3", "Émile", "Paris"), contact("c4", "Ana", "50% remote")],
  connections: [], events: [], evidence: [], tasks: [], generatedAt: NOW,
};

async function locationBuckets() {
  const sections = await computeDashboardSections(graph, { actorId: "account:one", now: NOW });
  const distribution = sections.distributions as unknown as { structureDistributions: { location: { bucketId: string; label: string; contactCount: number }[] } };
  return distribution.structureDistributions.location;
}

test("a non-ASCII location bucket opens whether its id arrives once or twice decoded", async () => {
  const shanghai = (await locationBuckets()).find((bucket) => bucket.label === "上海");
  assert.ok(shanghai, "the 上海 bucket exists");
  assert.match(shanghai.bucketId, /%/u, "its id carries percent escapes");
  for (const bucketId of [shanghai.bucketId, decodeURIComponent(shanghai.bucketId)]) {
    const detail = await computeDashboardStructureDetail(graph, { dimension: "location", bucketId, now: NOW });
    assert.equal(detail.success, true, bucketId);
    if (detail.success) assert.deepEqual(detail.data.contacts.map((item) => item.displayName).sort(), ["李娜", "王磊"]);
  }
  const paris = (await locationBuckets()).find((bucket) => bucket.label.toLowerCase() === "paris");
  assert.ok(paris);
  assert.equal((await computeDashboardStructureDetail(graph, { dimension: "location", bucketId: paris.bucketId, now: NOW })).success, true);
  // A literal percent sign in the value survives too.
  const percent = (await locationBuckets()).find((bucket) => bucket.label.includes("%"));
  assert.ok(percent);
  for (const bucketId of [percent.bucketId, decodeURIComponent(percent.bucketId)]) {
    assert.equal((await computeDashboardStructureDetail(graph, { dimension: "location", bucketId, now: NOW })).success, true, bucketId);
  }
  assert.equal((await computeDashboardStructureDetail(graph, { dimension: "location", bucketId: "location_nowhere", now: NOW })).success, false);
});
