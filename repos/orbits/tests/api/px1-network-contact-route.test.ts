import assert from "node:assert/strict";
import test from "node:test";

import { createContactCardGetHandler } from "../../app/api/contacts/page/handler";
import { activeNetworkFixture, installNetworkFixtureWorld } from "../../features/network-analysis/analysis-fixtures";
import { designNetworkWorld } from "../../features/network-analysis/design-fixtures";
import { createDesignContactCardService } from "../../features/contacts/card-service";
import { GET as designFixtureGet } from "../../app/api/dev/network-design-fixture/route.dev";

test("PX1 contacts page and summary read the selected analysis world for the signed-in actor", async () => {
  const before = process.env.ORBIT_REDESIGN_MOCK;
  process.env.ORBIT_REDESIGN_MOCK = "network,network-analysis";
  try {
    installNetworkFixtureWorld(designNetworkWorld("locked5"));
    const handler = createContactCardGetHandler({ resolveActor: async () => ({ id: "px1-actor", workspaceId: "base" }) as never });
    const page = await handler(new Request("http://localhost/api/contacts/page?limit=30"));
    const summary = await createContactCardGetHandler({ summary: true, resolveActor: async () => ({ id: "px1-actor", workspaceId: "base" }) as never })(new Request("http://localhost/api/contacts/summary"));
    assert.equal(page.status, 200);
    assert.equal(summary.status, 200);
    const pageBody = await page.json();
    const summaryBody = await summary.json();
    assert.equal(pageBody.data.items.length, 5);
    assert.equal(summaryBody.data.total, 5);
    assert.deepEqual(summaryBody.data.tabCounts, { goalRelated: 2, needsFollowUp: 0 });
    assert.equal(activeNetworkFixture().variant, "locked5");
  } finally {
    installNetworkFixtureWorld(null);
    if (before === undefined) delete process.env.ORBIT_REDESIGN_MOCK;
    else process.env.ORBIT_REDESIGN_MOCK = before;
  }
});

test("PX1 design contact reads are unavailable in production", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousMock = process.env.ORBIT_REDESIGN_MOCK;
  process.env.NODE_ENV = "production";
  process.env.ORBIT_REDESIGN_MOCK = "network,network-analysis";
  try {
    installNetworkFixtureWorld(designNetworkWorld("locked5"));
    assert.equal(await createDesignContactCardService({ id: "px1-actor", workspaceId: "base" }), null);
    const response = await designFixtureGet(new Request("http://localhost/api/dev/network-design-fixture?contacts=1"));
    assert.equal(response.status, 404);
  } finally {
    installNetworkFixtureWorld(null);
    process.env.NODE_ENV = previousNodeEnv;
    if (previousMock === undefined) delete process.env.ORBIT_REDESIGN_MOCK;
    else process.env.ORBIT_REDESIGN_MOCK = previousMock;
  }
});
