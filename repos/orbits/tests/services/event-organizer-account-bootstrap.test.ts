import assert from "node:assert/strict";
import test from "node:test";

import {
  applyOrganizerAccountBootstrapPlan,
  buildOrganizerAccountBootstrapPlan,
  type OrganizerAccountBootstrapDependencies,
} from "../../features/events/organizer-accounts/bootstrap";
import { createAuthUserService } from "../../features/auth/auth-user-service";
import {
  authUserRecordId,
  createStorageAuthUserProvider,
} from "../../features/auth/storage/auth-user-live-record-provider";
import { createStorageAuthAccountProvisioningProvider } from "../../features/auth/storage/auth-account-provisioning-provider";
import { createStorageContactActorLinkProvider } from "../../features/contacts/contact-actor-links/storage-provider";
import {
  createMemoryLiveRecordStore,
  type LiveRecord,
} from "../../shared/storage/live-record-store";

const workspaceId = "workspace:event-organizer-bootstrap";
const xiaoyuUserId = "user_mry5y200_58jpi8";
const xiaoyuAccountId = "account_orbit_generated";
const xiaoyuProfileId = "profile_orbit_generated_operator";
const timestamp = "2026-08-19T00:00:00.000Z";

function record(
  collectionName: string,
  recordId: string,
  payload: Record<string, unknown>,
  userId: string | null = null,
): LiveRecord<Record<string, unknown>> {
  return {
    workspaceId,
    collectionName,
    recordId,
    userId,
    sourceType: "manual",
    sourceId: `test:${collectionName}:${recordId}`,
    evidenceIds: ["evidence:test"],
    lifecycleState: "active",
    createdAt: timestamp,
    updatedAt: timestamp,
    payload,
  };
}

function createDependencies(options: { xiaoyuProvider?: "credentials" | "google" } = {}) {
  const store = createMemoryLiveRecordStore([
    record("auth_users", authUserRecordId("agenthubs@example.com"), {
      id: xiaoyuUserId,
      email: "agenthubs@example.com",
      displayName: "agenthubs",
      provider: options.xiaoyuProvider ?? "google",
      passwordHash: null,
      providerAccountId: "google-agenthubs",
      createdAt: timestamp,
      updatedAt: timestamp,
    }, xiaoyuUserId),
    record("accounts", xiaoyuAccountId, {
      id: xiaoyuAccountId,
      name: "Xiaoyu's Orbit",
      createdAt: timestamp,
      updatedAt: timestamp,
    }, xiaoyuAccountId),
    record("profiles", xiaoyuProfileId, {
      id: xiaoyuProfileId,
      accountId: xiaoyuAccountId,
      displayName: "小雨运营者",
      timezone: "Asia/Tokyo",
      createdAt: timestamp,
      updatedAt: timestamp,
    }, xiaoyuAccountId),
    ...["contact_090", "contact_005", "contact_003", "contact_085", "contact_066", "contact_027"].map((contactId) =>
      record("contacts", contactId, { id: contactId }, xiaoyuAccountId),
    ),
  ]);
  const authUserProvider = createStorageAuthUserProvider({ store, workspaceId });
  const accountProvisioner = createStorageAuthAccountProvisioningProvider({ store, workspaceId });

  return {
    dependencies: {
      accountProvisioner,
      authUserProvider,
      authUserService: createAuthUserService({
        accountProvisioner,
        provider: authUserProvider,
        now: () => new Date(timestamp),
      }),
      contactActorLinkProvider: createStorageContactActorLinkProvider({ store, workspaceId }),
      store,
      workspaceId,
    } satisfies OrganizerAccountBootstrapDependencies,
    store,
  };
}

test("builds a stable reviewed 20-item plan without writes and replays it idempotently", async () => {
  const { dependencies, store } = createDependencies();
  const before = store.listRecords({ workspaceId }).length;
  const plan = await buildOrganizerAccountBootstrapPlan({
    dependencies,
    xiaoyuAuthUserId: xiaoyuUserId,
  });

  assert.equal(plan.accountCount, 13);
  assert.equal(plan.contactLinkCount, 6);
  assert.equal(plan.xiaoyuIdentityBindingCount, 1);
  assert.equal(plan.items.length, 20);
  assert.equal(plan.manifestVersion, "event-organizers-v1");
  assert.match(plan.hash, /^[a-f0-9]{64}$/);
  assert.equal(store.listRecords({ workspaceId }).length, before);

  const first = await applyOrganizerAccountBootstrapPlan({
    expectedCount: 20,
    expectedPlanHash: plan.hash,
    password: "organizer-password",
    plan,
  }, dependencies);
  assert.equal(first.newAccountCount, 13);
  assert.equal(first.newContactLinkCount, 6);
  assert.equal(first.newXiaoyuIdentityBindingCount, 1);
  assert.equal(store.listRecords({ workspaceId, collectionName: "accounts" }).length, 14);
  assert.equal(store.listRecords({ workspaceId, collectionName: "contact_actor_links" }).length, 6);
  const membership = store.listRecords({ workspaceId, collectionName: "profiles" }).find((item) => item.payload.id === xiaoyuUserId);
  assert.equal(membership?.payload.accountId, xiaoyuAccountId);
  assert.equal(membership?.recordId, `profile:auth-membership:${xiaoyuUserId}`);
  assert.equal(membership?.sourceId, `auth-membership:${xiaoyuUserId}`);
  assert.deepEqual(membership?.evidenceIds, ["evidence:organizer-account-manifest:v1"]);
  assert.equal(store.getRecord({ workspaceId, collectionName: "profiles", recordId: xiaoyuProfileId })?.payload.displayName, "小雨运营者");

  const replay = await applyOrganizerAccountBootstrapPlan({
    expectedCount: 20,
    expectedPlanHash: plan.hash,
    password: "organizer-password",
    plan,
  }, dependencies);
  assert.equal(replay.newAccountCount, 0);
  assert.equal(replay.newContactLinkCount, 0);
  assert.equal(replay.newXiaoyuIdentityBindingCount, 0);
  assert.equal(store.getRecord({ workspaceId, collectionName: "accounts", recordId: xiaoyuUserId }), null);
  assert.equal(store.getRecord({ workspaceId, collectionName: "profiles", recordId: `profile:${xiaoyuUserId}` }), null);
});

test("fails closed for an invalid Xiaoyu identity and before a reviewed apply mismatch", async () => {
  const missing = createDependencies();
  missing.store.upsertRecord({
    ...missing.store.getRecord({
      workspaceId,
      collectionName: "auth_users",
      recordId: authUserRecordId("agenthubs@example.com"),
    })!,
    payload: {
      id: "user_not_xiaoyu",
      email: "agenthubs@example.com",
      displayName: "agenthubs",
      provider: "google",
      passwordHash: null,
      providerAccountId: "google-agenthubs",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  });
  await assert.rejects(
    buildOrganizerAccountBootstrapPlan({
      dependencies: missing.dependencies,
      xiaoyuAuthUserId: xiaoyuUserId,
    }),
    /Google.*agenthubs/i,
  );

  const invalid = createDependencies({ xiaoyuProvider: "credentials" });
  await assert.rejects(
    buildOrganizerAccountBootstrapPlan({
      dependencies: invalid.dependencies,
      xiaoyuAuthUserId: xiaoyuUserId,
    }),
    /Google.*agenthubs/i,
  );

  const valid = createDependencies();
  const plan = await buildOrganizerAccountBootstrapPlan({
    dependencies: valid.dependencies,
    xiaoyuAuthUserId: xiaoyuUserId,
  });
  const before = valid.store.listRecords({ workspaceId }).length;
  await assert.rejects(
    applyOrganizerAccountBootstrapPlan({
      expectedCount: 19,
      expectedPlanHash: plan.hash,
      password: "organizer-password",
      plan,
    }, valid.dependencies),
    /reviewed organizer account plan mismatch/i,
  );
  assert.equal(valid.store.listRecords({ workspaceId }).length, before);
});

test("reuses a matching organizer identity and rejects a conflicting existing one", async () => {
  const matching = createDependencies();
  await matching.dependencies.authUserService.registerUser({
    email: "yuhang-wei@organizers.orbit.example.test",
    displayName: "魏宇航",
    password: "organizer-password",
  });
  const plan = await buildOrganizerAccountBootstrapPlan({
    dependencies: matching.dependencies,
    xiaoyuAuthUserId: xiaoyuUserId,
  });
  const result = await applyOrganizerAccountBootstrapPlan({
    expectedCount: 20,
    expectedPlanHash: plan.hash,
    password: "organizer-password",
    plan,
  }, matching.dependencies);
  assert.equal(result.newAccountCount, 12);

  const conflicting = createDependencies();
  await conflicting.dependencies.authUserService.registerUser({
    email: "yuhang-wei@organizers.orbit.example.test",
    displayName: "Wrong Name",
    password: "organizer-password",
  });
  await assert.rejects(
    buildOrganizerAccountBootstrapPlan({
      dependencies: conflicting.dependencies,
      xiaoyuAuthUserId: xiaoyuUserId,
    }),
    /conflicting organizer/i,
  );
});
