import assert from "node:assert/strict";
import test from "node:test";
import { hash } from "bcryptjs";

import { createAuthUserService } from "../../features/auth/auth-user-service";
import { resolveAuthUserService } from "../../features/auth/service-factory";
import { createStorageAuthUserProvider } from "../../features/auth/storage/auth-user-live-record-provider";
import { createStorageAuthAccountProvisioningProvider } from "../../features/auth/storage/auth-account-provisioning-provider";
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

test("live auth provisioning creates one account and profile and preserves them on login", async () => {
  const store = createMemoryLiveRecordStore();
  const workspaceId = "workspace:auth-account-provisioning";
  const service = createAuthUserService({
    accountProvisioner: createStorageAuthAccountProvisioningProvider({
      store,
      workspaceId,
    }),
    provider: createStorageAuthUserProvider({
      store,
      workspaceId,
    }),
  });
  const registered = await service.registerUser({
    email: "member@example.com",
    password: "orbit-demo-1",
    displayName: "Member",
  });

  assert.equal(registered.state, "success");
  if (registered.state !== "success") return;

  const userId = registered.data.user.id;
  assert.equal(
    store.getRecord({
      workspaceId,
      collectionName: "accounts",
      recordId: userId,
    })?.userId,
    userId,
  );
  assert.equal(
    store.getRecord({
      workspaceId,
      collectionName: "profiles",
      recordId: `profile:${userId}`,
    })?.payload.accountId,
    userId,
  );

  await service.verifyCredentials({
    email: "member@example.com",
    password: "orbit-demo-1",
  });

  assert.equal(
    store.listRecords({ workspaceId, collectionName: "accounts" }).length,
    1,
  );
  assert.equal(
    store.listRecords({ workspaceId, collectionName: "profiles" }).length,
    1,
  );
});

test("existing auth membership is honored on repeated Google provisioning without a shadow account", async () => {
  const store = createMemoryLiveRecordStore();
  const workspaceId = "workspace:auth-membership";
  const userId = "user_mry5y200_58jpi8";
  const accountId = "account_orbit_generated";
  const timestamp = "2026-08-19T00:00:00.000Z";
  const provider = createStorageAuthUserProvider({ store, workspaceId });
  const provisioner = createStorageAuthAccountProvisioningProvider({ store, workspaceId });
  await provider.saveUser({
    id: userId,
    email: "agenthubs@example.com",
    displayName: "agenthubs",
    provider: "google",
    passwordHash: null,
    providerAccountId: "google-agenthubs",
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  store.upsertRecord({
    workspaceId,
    collectionName: "accounts",
    recordId: accountId,
    userId: accountId,
    sourceType: "manual",
    sourceId: "test:xiaoyu-account",
    evidenceIds: ["evidence:test"],
    lifecycleState: "active",
    createdAt: timestamp,
    updatedAt: timestamp,
    payload: { id: accountId, name: "Xiaoyu", createdAt: timestamp, updatedAt: timestamp },
  });
  store.upsertRecord({
    workspaceId,
    collectionName: "profiles",
    recordId: "profile_orbit_generated_operator",
    userId: accountId,
    sourceType: "manual",
    sourceId: "test:xiaoyu-profile",
    evidenceIds: ["evidence:test"],
    lifecycleState: "active",
    createdAt: timestamp,
    updatedAt: timestamp,
    payload: { id: "profile_orbit_generated_operator", accountId, displayName: "小雨", timezone: "Asia/Tokyo", createdAt: timestamp, updatedAt: timestamp },
  });
  store.upsertRecord({
    workspaceId,
    collectionName: "profiles",
    recordId: `profile:auth-membership:${userId}`,
    userId: accountId,
    sourceType: "manual",
    sourceId: `auth-membership:${userId}`,
    evidenceIds: ["evidence:organizer-account-manifest:v1"],
    lifecycleState: "active",
    createdAt: timestamp,
    updatedAt: timestamp,
    payload: { id: userId, accountId, displayName: "agenthubs", timezone: "Asia/Tokyo", createdAt: timestamp, updatedAt: timestamp },
  });
  const service = createAuthUserService({ accountProvisioner: provisioner, provider });

  const first = await service.getOrCreateOAuthUser({
    email: "agenthubs@example.com",
    displayName: "agenthubs",
    provider: "google",
    providerAccountId: "google-agenthubs",
  });
  const second = await service.getOrCreateOAuthUser({
    email: "agenthubs@example.com",
    displayName: "agenthubs",
    provider: "google",
    providerAccountId: "google-agenthubs",
  });

  assert.equal(first.state, "success");
  assert.equal(second.state, "success");
  assert.equal(store.getRecord({ workspaceId, collectionName: "accounts", recordId: userId }), null);
  assert.equal(store.getRecord({ workspaceId, collectionName: "profiles", recordId: `profile:${userId}` }), null);
  assert.equal(store.getRecord({ workspaceId, collectionName: "accounts", recordId: accountId })?.payload.id, accountId);

  const credentialUserId = "user_membership_credentials";
  const credentialAccountId = "account_membership_credentials";
  await provider.saveUser({
    id: credentialUserId,
    email: "credentials-membership@example.com",
    displayName: "Credentials Membership",
    provider: "credentials",
    passwordHash: await hash("membership-password", 12),
    providerAccountId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  store.upsertRecord({
    workspaceId,
    collectionName: "accounts",
    recordId: credentialAccountId,
    userId: credentialAccountId,
    sourceType: "manual",
    sourceId: "test:credential-membership-account",
    evidenceIds: ["evidence:test"],
    lifecycleState: "active",
    createdAt: timestamp,
    updatedAt: timestamp,
    payload: { id: credentialAccountId, name: "Credentials Membership", createdAt: timestamp, updatedAt: timestamp },
  });
  store.upsertRecord({
    workspaceId,
    collectionName: "profiles",
    recordId: `profile:auth-membership:${credentialUserId}`,
    userId: credentialAccountId,
    sourceType: "manual",
    sourceId: `auth-membership:${credentialUserId}`,
    evidenceIds: ["evidence:test"],
    lifecycleState: "active",
    createdAt: timestamp,
    updatedAt: timestamp,
    payload: { id: credentialUserId, accountId: credentialAccountId, displayName: "Credentials Membership", timezone: "Asia/Tokyo", createdAt: timestamp, updatedAt: timestamp },
  });
  const credentialFirst = await service.verifyCredentials({
    email: "credentials-membership@example.com",
    password: "membership-password",
  });
  const credentialSecond = await service.verifyCredentials({
    email: "credentials-membership@example.com",
    password: "membership-password",
  });
  assert.equal(credentialFirst.state, "success");
  assert.equal(credentialSecond.state, "success");
  assert.equal(store.getRecord({ workspaceId, collectionName: "accounts", recordId: credentialUserId }), null);
  assert.equal(store.getRecord({ workspaceId, collectionName: "profiles", recordId: `profile:${credentialUserId}` }), null);
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
