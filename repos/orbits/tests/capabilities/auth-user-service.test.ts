import assert from "node:assert/strict";
import test from "node:test";

import { createAuthUserService } from "../../features/auth/auth-user-service";
import { resolveAuthUserService } from "../../features/auth/service-factory";
import { createStorageAuthUserProvider } from "../../features/auth/storage/auth-user-live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

function serviceWithMemoryStore() {
  return createAuthUserService({
    provider: createStorageAuthUserProvider({
      store: createMemoryLiveRecordStore(),
      workspaceId: "workspace:test",
    }),
  });
}

test("register then verify round-trips a credentials user", async () => {
  const service = serviceWithMemoryStore();

  const registered = await service.registerUser({
    email: "Xin@Example.com",
    password: "orbit-demo-1",
    displayName: "小雨",
  });

  assert.equal(registered.state, "success");
  if (registered.state !== "success") return;
  assert.equal(registered.data.user.email, "xin@example.com");
  assert.equal(registered.data.user.displayName, "小雨");
  assert.equal(registered.data.user.provider, "credentials");
  // DTO 绝不携带密码材料
  assert.ok(!("passwordHash" in registered.data.user));

  const verified = await service.verifyCredentials({
    email: "xin@example.com",
    password: "orbit-demo-1",
  });

  assert.equal(verified.state, "success");
  if (verified.state !== "success") return;
  assert.equal(verified.data.user.id, registered.data.user.id);
});

test("duplicate email registration fails with AUTH_EMAIL_TAKEN", async () => {
  const service = serviceWithMemoryStore();

  await service.registerUser({ email: "a@b.co", password: "12345678" });
  const second = await service.registerUser({
    email: "A@B.CO",
    password: "87654321",
  });

  assert.equal(second.state, "failure");
  if (second.state !== "failure") return;
  assert.equal(second.error.code, "AUTH_EMAIL_TAKEN");
});

test("wrong password and unknown email both return AUTH_INVALID_CREDENTIALS", async () => {
  const service = serviceWithMemoryStore();

  await service.registerUser({ email: "a@b.co", password: "12345678" });

  const wrongPassword = await service.verifyCredentials({
    email: "a@b.co",
    password: "wrong-password",
  });
  const unknownEmail = await service.verifyCredentials({
    email: "nobody@b.co",
    password: "12345678",
  });

  assert.equal(wrongPassword.state, "failure");
  assert.equal(unknownEmail.state, "failure");
  if (wrongPassword.state !== "failure" || unknownEmail.state !== "failure") return;
  // 不区分两种失败,避免账号枚举
  assert.equal(wrongPassword.error.code, "AUTH_INVALID_CREDENTIALS");
  assert.equal(unknownEmail.error.code, "AUTH_INVALID_CREDENTIALS");
});

test("registration input validation rejects bad email and short password", async () => {
  const service = serviceWithMemoryStore();

  const badEmail = await service.registerUser({
    email: "not-an-email",
    password: "12345678",
  });
  const shortPassword = await service.registerUser({
    email: "a@b.co",
    password: "1234567",
  });

  assert.equal(badEmail.state, "failure");
  assert.equal(shortPassword.state, "failure");
  if (badEmail.state !== "failure" || shortPassword.state !== "failure") return;
  assert.equal(badEmail.error.code, "AUTH_INVALID_INPUT");
  assert.equal(shortPassword.error.code, "AUTH_INVALID_INPUT");
});

test("oauth sign-in reuses an existing same-email account instead of forking", async () => {
  const service = serviceWithMemoryStore();

  const registered = await service.registerUser({
    email: "a@b.co",
    password: "12345678",
    displayName: "Credentials Name",
  });
  assert.equal(registered.state, "success");
  if (registered.state !== "success") return;

  const oauth = await service.getOrCreateOAuthUser({
    email: "A@b.co",
    displayName: "Google Name",
    provider: "google",
    providerAccountId: "google-account-1",
  });

  assert.equal(oauth.state, "success");
  if (oauth.state !== "success") return;
  assert.equal(oauth.data.user.id, registered.data.user.id);
  assert.equal(oauth.data.user.displayName, "Credentials Name");
});

test("oauth sign-in creates a passwordless user when email is new", async () => {
  const service = serviceWithMemoryStore();

  const oauth = await service.getOrCreateOAuthUser({
    email: "new@b.co",
    displayName: "Google User",
    provider: "google",
    providerAccountId: "google-account-2",
  });

  assert.equal(oauth.state, "success");
  if (oauth.state !== "success") return;
  assert.equal(oauth.data.user.provider, "google");

  // 该用户没有密码,凭证登录必须失败
  const verify = await service.verifyCredentials({
    email: "new@b.co",
    password: "anything-at-all",
  });
  assert.equal(verify.state, "failure");
});

test("unconfigured live store fails closed", async () => {
  const service = createAuthUserService({ provider: null });

  const result = await service.registerUser({
    email: "a@b.co",
    password: "12345678",
  });

  assert.equal(result.state, "failure");
  if (result.state !== "failure") return;
  assert.equal(result.error.code, "AUTH_LIVE_STORE_UNCONFIGURED");
});

test("mock service resolution preserves users across register and login requests", async () => {
  const email = `factory-${Date.now()}@example.com`;
  const registered = await resolveAuthUserService("mock").registerUser({
    email,
    password: "12345678",
  });
  const verified = await resolveAuthUserService("mock").verifyCredentials({
    email,
    password: "12345678",
  });

  assert.equal(registered.state, "success");
  assert.equal(verified.state, "success");
});
