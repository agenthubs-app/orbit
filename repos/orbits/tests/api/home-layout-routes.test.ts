import assert from "node:assert/strict";
import test from "node:test";

import { createHomeLayoutLiveHandlers } from "../../features/home-layout/handlers";
import { createHomeLayoutService } from "../../features/home-layout/service";
import { redesignContractRoute } from "../../features/redesign-contracts/route";
import { DEFAULT_HOME_LAYOUT, homeLayoutSchema } from "../../shared/api-schema/home-layout";
import { databaseTest, withNetworkDatabase, WORKSPACE } from "../support/network-analysis-harness";

const actor = "actor:home-layout-routes";
const request = (body: unknown) => new Request("http://localhost/api/home/layout", {
  method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});

test("live home layout route authenticates and reports unconfigured storage", async () => {
  const noSession = createHomeLayoutLiveHandlers({ resolveActor: async () => null, service: null });
  const unconfigured = createHomeLayoutLiveHandlers({ resolveActor: async () => ({ id: actor }), service: null });
  const unauthorized = await noSession.get();
  assert.ok("error" in unauthorized);
  assert.equal(unauthorized.error.code, "UNAUTHORIZED");
  const unavailable = await unconfigured.get();
  assert.ok("error" in unavailable);
  assert.equal(unavailable.error.code, "SERVICE_UNAVAILABLE");
  assert.equal(unavailable.context?.reason, "HOME_LAYOUT_UNCONFIGURED");
});

test("live route wraps actor-scoped PostgreSQL layout and returns the full 409 snapshot", databaseTest, async () => {
  await withNetworkDatabase(async ({ client }) => {
    const handlers = createHomeLayoutLiveHandlers({
      resolveActor: async () => ({ id: actor, workspaceId: WORKSPACE }),
      service: createHomeLayoutService({ client, workspaceId: WORKSPACE }),
    });
    const get = redesignContractRoute("home-layout", homeLayoutSchema, () => handlers.get());
    const put = redesignContractRoute("home-layout", homeLayoutSchema, (req) => handlers.put(req));
    const first = await get(new Request("http://localhost/api/home/layout"));
    assert.equal(first.status, 200);
    assert.deepEqual((await first.json()).data, DEFAULT_HOME_LAYOUT);
    assert.equal((await put(request({ expectedRevision: 0, mutationId: "bad", app: [], web: [], extra: true }))).status, 400);
    const input = { expectedRevision: 0, mutationId: "first", app: [], web: DEFAULT_HOME_LAYOUT.web };
    const saved = await put(request(input));
    assert.equal(saved.status, 200);
    assert.deepEqual((await saved.json()).data, { revision: 1, app: [], web: DEFAULT_HOME_LAYOUT.web });
    const replay = await put(request(input));
    assert.equal(replay.status, 200);
    const reused = await put(request({ ...input, app: DEFAULT_HOME_LAYOUT.app }));
    assert.equal(reused.status, 409);
    assert.equal((await reused.json()).error.context.reason, "MUTATION_REUSED");
    const stale = await put(request({ ...input, mutationId: "stale" }));
    assert.equal(stale.status, 409);
    const context = (await stale.json()).error.context;
    assert.equal(context.currentRevision, "1");
    assert.deepEqual(JSON.parse(context.currentLayout), { revision: 1, app: [], web: DEFAULT_HOME_LAYOUT.web });
  });
});
