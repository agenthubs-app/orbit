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

test("UR-S shared contact methods: fixture people from the fixture, exchanged contacts from the route, anyone else asks nothing", async () => {
  const calls: string[] = [];
  const before = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    const data = url.startsWith("/api/dev/network-design-fixture")
      ? { rows: [], links: [], goalRelatedIds: [], followUpContactIds: [], fits: {}, connections: {}, valueLines: {}, sharedContactMethods: { "design-person-001": { lineId: "misaki_aoba", email: "m.takahashi@aoba-vc.example" } } }
      : { lineId: "matsumoto.t" };
    return new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const fixture = await networkApi.sharedMethods("design-person-001");
    const fixtureNone = await networkApi.sharedMethods("design-person-002");
    const manual = await networkApi.sharedMethods("contact:manual-v2:abc");
    const exchanged = await networkApi.sharedMethods("contact:event-consent:xyz");
    assert.deepEqual(fixture.ok && fixture.data, { lineId: "misaki_aoba", email: "m.takahashi@aoba-vc.example" });
    assert.equal(fixtureNone.ok && fixtureNone.data, null);
    assert.equal(manual.ok && manual.data, null);
    assert.deepEqual(exchanged.ok && exchanged.data, { lineId: "matsumoto.t" });
    assert.deepEqual([...new Set(calls)], ["/api/dev/network-design-fixture?contacts=1", "/api/contacts/contact%3Aevent-consent%3Axyz/shared-contact-methods"]);
  } finally {
    globalThis.fetch = before;
  }
});
