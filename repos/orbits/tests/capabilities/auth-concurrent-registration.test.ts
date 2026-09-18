import assert from "node:assert/strict";
import test from "node:test";
import { createAuthUserService } from "../../features/auth/auth-user-service";
import { createStorageAuthUserProvider } from "../../features/auth/storage/auth-user-live-record-provider";
import { createStorageAuthAccountProvisioningProvider } from "../../features/auth/storage/auth-account-provisioning-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

test("concurrent same-email registrations cannot overwrite the winning identity", async () => {
  const store = createMemoryLiveRecordStore();
  const provider = createStorageAuthUserProvider({ store, workspaceId: "w" });
  const service = createAuthUserService({ provider, accountProvisioner: createStorageAuthAccountProvisioningProvider({ store, workspaceId: "w" }) });
  const outcomes = await Promise.all([
    service.registerUser({ email: "race@example.test", password: "password-one", displayName: "One" }),
    service.registerUser({ email: "race@example.test", password: "password-two", displayName: "Two" }),
  ]);
  assert.equal(outcomes.filter(result => result.state === "success").length, 1);
  const user = await provider.getUserByEmail("race@example.test");
  assert.ok(user);
  assert.equal(store.listRecords({ limit: "unbounded", workspaceId: "w", collectionName: "accounts" }).length, 1);
  assert.equal(store.listRecords({ limit: "unbounded", workspaceId: "w", collectionName: "profiles" }).length, 1);
  const login = await service.verifyCredentials({ email: user.email, password: user.displayName === "One" ? "password-one" : "password-two" });
  assert.equal(login.state, "success");
});
