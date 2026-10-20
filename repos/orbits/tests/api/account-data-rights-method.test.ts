import assert from "node:assert/strict";
import test from "node:test";

test("deletion method endpoint returns only the signed-in account's login method", async () => {
  const { createAccountDeletionMethodHandler } = await import("../../features/account/data-rights/method-handler");
  const handler = createAccountDeletionMethodHandler({
    resolveActor: async () => ({ id: "actor", userId: "user", email: "person@example.com" }),
    readMethod: async (_actorId, userId) => userId === "user" ? "google" : null,
  });
  const response = await handler();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { method: "google" });
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});
