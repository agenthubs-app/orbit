import assert from "node:assert/strict";
import test from "node:test";

import { createProfileRouteHandlers } from "../../app/api/profile/handlers";
import { createAccountDesignFixtureStore } from "../../features/profile/design-fixtures/service";

function route(actorId: string | null, enabled = true) {
  return createProfileRouteHandlers({
    resolveActor: async () => actorId ? { id: actorId } : null,
    designFixtureStore: createAccountDesignFixtureStore(() => "2026-10-18T00:00:00.000Z"),
    designFixturesEnabled: enabled,
  });
}

test("authenticated design GET and PUT round-trip through the same actor-scoped profile API", async () => {
  const handlers = route("actor:one");
  const beforeResponse = await handlers.GET(new Request("https://orbit.local/api/profile?design=25"));
  assert.equal(beforeResponse.status, 200);
  assert.equal(beforeResponse.headers.get("Cache-Control"), "no-store");
  const before = (await beforeResponse.json()).data;
  assert.equal(before.completeness.card.score, 25);
  assert.equal(before.profile.id, "actor:one");

  const putResponse = await handlers.PUT(new Request("https://orbit.local/api/profile?design=25", {
    method: "PUT", headers: { "content-type": "application/json" },
    body: JSON.stringify({ expectedUpdatedAt: before.profile.updatedAt, mutationId: "route-mutation-1", offering: ["工場 DX の導入支援"] }),
  }));
  assert.equal(putResponse.status, 200);
  const saved = (await putResponse.json()).data;
  assert.equal(saved.completeness.card.score, 50);
  assert.equal(saved.mutationId, "route-mutation-1");

  const again = (await (await handlers.GET(new Request("https://orbit.local/api/profile?design=25"))).json()).data;
  assert.deepEqual(again.profile, saved.profile);
});

test("design query never bypasses authentication or the production fixture gate", async () => {
  const denied = await route(null).GET(new Request("https://orbit.local/api/profile?design=100"));
  assert.equal(denied.status, 401);

  const productionLike = route("actor:one", false);
  const response = await productionLike.GET(new Request("https://orbit.local/api/profile?design=25"));
  const body = await response.json();
  assert.notEqual(body.data?.sample, true);
  assert.notEqual(body.data?.provenance?.source, "r18a-design-fixture");
});
