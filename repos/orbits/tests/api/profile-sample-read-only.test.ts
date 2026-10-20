import assert from "node:assert/strict";
import test from "node:test";

import { createProfileRouteHandlers } from "../../app/api/profile/handlers";

test("sample profile PUT returns 403 before loading fixtures or the profile service", async () => {
  let serviceCalls = 0;
  const handlers = createProfileRouteHandlers({
    resolveActor: async () => ({ id: "alice" }),
    designFixturesEnabled: false,
    profileService: () => { serviceCalls += 1; throw new Error("must not load profile service"); },
  });
  const response = await handlers.PUT(new Request("https://orbit.test/api/profile", {
    method: "PUT", body: JSON.stringify({ relationshipGoal: "sample" }),
    headers: { "content-type": "application/json", "x-orbit-sample": "1" },
  }));
  assert.equal(response.status, 403);
  assert.equal(serviceCalls, 0);
});
