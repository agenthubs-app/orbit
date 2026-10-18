import assert from "node:assert/strict";
import test from "node:test";

import { networkApi } from "../../app/(app)/app/orbit-2026/network/network-api";

test("PX1 design contact detail, fit and connection stay on the actor-scoped development read", async () => {
  const calls: string[] = [];
  const before = globalThis.fetch;
  globalThis.fetch = async (input) => {
    calls.push(String(input));
    return new Response(JSON.stringify({ success: true, data: {
      rows: [{ id: "design-person-003", detail: { id: "design-person-003", displayName: "伊藤 直子" } }],
      links: [], goalRelatedIds: [], followUpContactIds: [],
      fits: { "design-person-003": { contactId: "design-person-003", fits: [{ planId: "p", itemId: "cfo", goal: "g", shortLabel: "CFO 経験者", emoji: "📊", status: "candidate" }] } },
      connections: {}, valueLines: { "design-person-003": { relation: "資本政策", evidence: ["card"] } },
    } }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const detail = await networkApi.detail("design-person-003");
    const fit = await networkApi.fit("design-person-003");
    const line = await networkApi.valueLine("design-person-003", "en");
    const connection = await networkApi.connection("design-person-003");
    assert.equal(detail.ok && detail.data.displayName, "伊藤 直子");
    assert.equal(fit.ok && fit.data.fits[0]?.shortLabel, "CFO 経験者");
    assert.equal(line.ok && line.data.lines[0]?.relation, "資本政策");
    assert.equal(connection.ok, false);
    assert.deepEqual([...new Set(calls)], ["/api/dev/network-design-fixture?contacts=1"]);
  } finally {
    globalThis.fetch = before;
  }
});
