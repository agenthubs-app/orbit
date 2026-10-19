import assert from "node:assert/strict";
import test from "node:test";

import { createContactCardGetHandler } from "../../app/api/contacts/page/handler";
import { activeNetworkFixture, installNetworkFixtureWorld } from "../../features/network-analysis/analysis-fixtures";
import { designNetworkWorld } from "../../features/network-analysis/design-fixtures";
import { createDesignContactCardService } from "../../features/contacts/card-service";
import { GET as designFixtureGet, createNetworkDesignFixtureHandlers } from "../../app/api/dev/network-design-fixture/route.dev";

test("PX1 contacts page and summary read the selected analysis world for the signed-in actor", async () => {
  const before = process.env.ORBIT_REDESIGN_MOCK;
  process.env.ORBIT_REDESIGN_MOCK = "network,network-analysis";
  try {
    installNetworkFixtureWorld("px1-actor", designNetworkWorld("locked5"));
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
    assert.equal(activeNetworkFixture("px1-actor").variant, "locked5");
  } finally {
    installNetworkFixtureWorld("px1-actor", null);
    if (before === undefined) delete process.env.ORBIT_REDESIGN_MOCK;
    else process.env.ORBIT_REDESIGN_MOCK = before;
  }
});

test("PX1 design contact reads are unavailable in production", async () => {
  const mutableEnv = process.env as Record<string, string | undefined>;
  const previousNodeEnv = mutableEnv.NODE_ENV;
  const previousMock = process.env.ORBIT_REDESIGN_MOCK;
  mutableEnv.NODE_ENV = "production";
  process.env.ORBIT_REDESIGN_MOCK = "network,network-analysis";
  try {
    installNetworkFixtureWorld("px1-actor", designNetworkWorld("locked5"));
    assert.equal(await createDesignContactCardService({ id: "px1-actor", workspaceId: "base" }), null);
    const response = await designFixtureGet(new Request("http://localhost/api/dev/network-design-fixture?contacts=1"));
    assert.equal(response.status, 404);
  } finally {
    installNetworkFixtureWorld("px1-actor", null);
    mutableEnv.NODE_ENV = previousNodeEnv;
    if (previousMock === undefined) delete process.env.ORBIT_REDESIGN_MOCK;
    else process.env.ORBIT_REDESIGN_MOCK = previousMock;
  }
});

test("PX1 variant switching requires authentication and never changes another actor's contacts or analysis", async () => {
  const before = process.env.ORBIT_REDESIGN_MOCK;
  process.env.ORBIT_REDESIGN_MOCK = "network,network-analysis";
  const url = "http://localhost/api/dev/network-design-fixture";
  const post = (variant: string) => new Request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ variant }) });
  let actorId: string | null = null;
  const { GET, POST } = createNetworkDesignFixtureHandlers(async () => actorId ? { id: actorId, workspaceId: "base" } : null);
  try {
    assert.equal((await GET(new Request(url))).status, 401);
    assert.equal((await POST(post("locked5"))).status, 401);
    actorId = "actor-a";
    assert.equal((await POST(post("locked5"))).status, 200);
    actorId = "actor-b";
    assert.equal((await GET(new Request(url))).status, 200);
    assert.equal((await (await GET(new Request(url))).json()).variant, null);
    assert.equal((await POST(post("few14"))).status, 200);
    const bContacts = await GET(new Request(`${url}?contacts=1`));
    assert.equal((await bContacts.json()).data.rows.length, 14);
    assert.equal(await (await createContactCardGetHandler({ resolveActor: async () => ({ id: "actor-b", workspaceId: "base" }) as never })(new Request("http://localhost/api/contacts/page"))).json().then((body) => body.data.items.length), 14);
    actorId = "actor-a";
    assert.equal((await (await GET(new Request(url))).json()).variant, "locked5");
    assert.equal((await (await GET(new Request(`${url}?contacts=1`))).json()).data.rows.length, 5);
    assert.equal(await (await createContactCardGetHandler({ resolveActor: async () => ({ id: "actor-a", workspaceId: "base" }) as never })(new Request("http://localhost/api/contacts/page"))).json().then((body) => body.data.items.length), 5);
    assert.equal(await (await import("../../features/network-analysis/analysis-fixtures")).fixtureNetworkAnalysisReadDeps().readTotal({ id: "actor-a" }), 5);
    assert.equal(await (await import("../../features/network-analysis/analysis-fixtures")).fixtureNetworkAnalysisReadDeps().readTotal({ id: "actor-b" }), 14);
  } finally {
    installNetworkFixtureWorld("actor-a", null);
    installNetworkFixtureWorld("actor-b", null);
    if (before === undefined) delete process.env.ORBIT_REDESIGN_MOCK;
    else process.env.ORBIT_REDESIGN_MOCK = before;
  }
});
