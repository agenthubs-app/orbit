import assert from "node:assert/strict";
import test from "node:test";

import type * as AuthFactory from "../../features/auth/service-factory";

test("mock auth registrations survive separate server module instances", async () => {
  const moduleUrl = new URL(
    "../../features/auth/service-factory.ts",
    import.meta.url,
  ).href;
  const registerBundle = (await import(
    `${moduleUrl}?bundle=register`
  )) as typeof AuthFactory;
  const authorizeBundle = (await import(
    `${moduleUrl}?bundle=authorize`
  )) as typeof AuthFactory;
  const email = `cross-bundle-${Date.now()}@example.test`;
  const password = "orbit-cross-bundle-password";

  const registered = await registerBundle
    .resolveAuthUserService("mock")
    .registerUser({ email, password });
  const verified = await authorizeBundle
    .resolveAuthUserService("mock")
    .verifyCredentials({ email, password });

  assert.equal(registered.state, "success");
  assert.equal(verified.state, "success");
  if (registered.state === "success" && verified.state === "success") {
    assert.equal(verified.data.user.id, registered.data.user.id);
  }
});
