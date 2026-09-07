import assert from "node:assert/strict";
import test from "node:test";

import { compare, hash } from "bcryptjs";

import { createStorageAuthAccountProvisioningProvider } from "../../features/auth/storage/auth-account-provisioning-provider";
import {
  createStorageAuthUserProvider,
  type StoredAuthUser,
} from "../../features/auth/storage/auth-user-live-record-provider";
import {
  ensurePrimaryTestAccount,
  PRIMARY_TEST_ACCOUNT,
} from "../../scripts/lib/primary-test-account";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

test("primary test account preserves its existing actor and data union", async () => {
  const workspaceId = "workspace:primary-qa";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const provider = createStorageAuthUserProvider({ store, workspaceId });
  const existing: StoredAuthUser = {
    id: "user_existing_qa",
    email: PRIMARY_TEST_ACCOUNT.email,
    displayName: "Old QA Name",
    provider: "credentials",
    passwordHash: await hash("old-password", 4),
    providerAccountId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  await provider.saveUser(existing);
  await store.upsertRecord({
    workspaceId,
    collectionName: "contacts",
    recordId: "contact:user-authored",
    userId: existing.id,
    sourceType: "manual",
    sourceId: "manual:user-authored",
    sourceLabel: "User-authored QA data",
    evidenceIds: [],
    occurredAt: existing.createdAt,
    createdAt: existing.createdAt,
    updatedAt: existing.updatedAt,
    lifecycleState: "active",
    searchText: "preserve me",
    payload: { id: "contact:user-authored" },
  });

  const result = await ensurePrimaryTestAccount({
    accountProvisioner: createStorageAuthAccountProvisioningProvider({
      store,
      workspaceId,
    }),
    now: () => new Date("2026-08-25T10:00:00.000Z"),
    password: "new-primary-password",
    provider,
  });

  assert.equal(result.id, existing.id);
  assert.equal(result.email, PRIMARY_TEST_ACCOUNT.email);
  assert.equal(result.createdAt, existing.createdAt);
  assert.ok(
    store.getRecord({
      workspaceId,
      collectionName: "contacts",
      recordId: "contact:user-authored",
    }),
  );
  assert.ok(
    store.getRecord({
      workspaceId,
      collectionName: "accounts",
      recordId: existing.id,
    }),
  );
  const stored = await provider.getUserByEmail(PRIMARY_TEST_ACCOUNT.email);
  assert.ok(stored?.passwordHash);
  assert.equal(await compare("new-primary-password", stored.passwordHash), true);
});

test("primary test account uses a deterministic actor in a fresh store", async () => {
  const workspaceId = "workspace:fresh-primary-qa";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const provider = createStorageAuthUserProvider({ store, workspaceId });

  const result = await ensurePrimaryTestAccount({
    accountProvisioner: createStorageAuthAccountProvisioningProvider({
      store,
      workspaceId,
    }),
    now: () => new Date("2026-08-25T10:00:00.000Z"),
    password: "fresh-primary-password",
    provider,
  });

  assert.equal(result.id, PRIMARY_TEST_ACCOUNT.fallbackActorId);
  assert.equal(result.email, PRIMARY_TEST_ACCOUNT.email);
});
