import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";

import {
  applyOrganizerAccountBootstrapPlan,
  buildOrganizerAccountBootstrapPlan,
  XIAOYU_AUTH_USER_ID,
  type OrganizerAccountBootstrapDependencies,
  type OrganizerAccountBootstrapOwnershipWriter,
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

function createDependencies(options: {
  canonicalOwnerId?: string | null;
  xiaoyuProvider?: "credentials" | "google";
} = {}) {
  const canonicalOwnerId = options.canonicalOwnerId === undefined
    ? null
    : options.canonicalOwnerId;
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
    }, canonicalOwnerId),
    record("profiles", xiaoyuProfileId, {
      id: xiaoyuProfileId,
      accountId: xiaoyuAccountId,
      displayName: "小雨运营者",
      timezone: "Asia/Tokyo",
      createdAt: timestamp,
      updatedAt: timestamp,
    }, canonicalOwnerId),
    ...["contact_090", "contact_005", "contact_003", "contact_085", "contact_066", "contact_027"].map((contactId) =>
      record("contacts", contactId, { id: contactId }, xiaoyuAccountId),
    ),
  ]);
  const authUserProvider = createStorageAuthUserProvider({ store, workspaceId });
  const accountProvisioner = createStorageAuthAccountProvisioningProvider({ store, workspaceId });
  const membershipWriter = {
    async insertIfAbsent(next: LiveRecord<Record<string, unknown>>) {
      const existing = await store.getRecord({
        workspaceId,
        collectionName: next.collectionName,
        recordId: next.recordId,
        includeDeleted: true,
      });
      if (existing) return "existing" as const;
      await store.upsertRecord(next);
      return "inserted" as const;
    },
  };
  const ownershipWriter: OrganizerAccountBootstrapOwnershipWriter = {
    async setOwnerIfAbsent(input) {
      const existing = await store.getRecord({
        workspaceId: input.workspaceId,
        collectionName: input.collectionName,
        recordId: input.recordId,
        includeDeleted: true,
      });
      if (!existing || existing.userId !== null) return "existing";
      await store.upsertRecord({ ...existing, userId: input.ownerActorId });
      return "updated";
    },
  };

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
      membershipWriter,
      ownershipWriter,
      store,
      workspaceId,
    } satisfies OrganizerAccountBootstrapDependencies,
    store,
  };
}

test("builds a stable reviewed 22-item plan, repairs only canonical owners, and replays idempotently", async () => {
  const { dependencies, store } = createDependencies();
  const before = store.listRecords({ workspaceId }).length;
  const legacyAccount = store.getRecord({
    workspaceId,
    collectionName: "accounts",
    recordId: xiaoyuAccountId,
    includeDeleted: true,
  })!;
  const legacyProfile = store.getRecord({
    workspaceId,
    collectionName: "profiles",
    recordId: xiaoyuProfileId,
    includeDeleted: true,
  })!;
  const plan = await buildOrganizerAccountBootstrapPlan({
    dependencies,
    xiaoyuAuthUserId: xiaoyuUserId,
  });

  assert.equal(plan.accountCount, 13);
  assert.equal(plan.contactLinkCount, 6);
  assert.equal(plan.xiaoyuCanonicalOwnershipRepairCount, 2);
  assert.equal(plan.xiaoyuIdentityBindingCount, 1);
  assert.equal(plan.items.length, 22);
  assert.equal(plan.manifestVersion, "event-organizers-v1");
  assert.match(plan.hash, /^[a-f0-9]{64}$/);
  assert.equal(store.listRecords({ workspaceId }).length, before);

  const first = await applyOrganizerAccountBootstrapPlan({
    expectedCount: 22,
    expectedPlanHash: plan.hash,
    password: "organizer-password",
    plan,
  }, dependencies);
  assert.equal(first.newAccountCount, 13);
  assert.equal(first.newContactLinkCount, 6);
  assert.equal(first.newXiaoyuIdentityBindingCount, 1);
  assert.equal(first.newXiaoyuCanonicalOwnershipRepairCount, 2);
  assert.equal(store.listRecords({ workspaceId, collectionName: "accounts" }).length, 14);
  assert.equal(store.listRecords({ workspaceId, collectionName: "contact_actor_links" }).length, 6);
  const membership = store.listRecords({ workspaceId, collectionName: "profiles" }).find((item) => item.payload.id === xiaoyuUserId);
  assert.equal(membership?.payload.accountId, xiaoyuAccountId);
  assert.equal(membership?.recordId, `profile:auth-membership:${xiaoyuUserId}`);
  assert.equal(membership?.sourceId, `auth-membership:${xiaoyuUserId}`);
  assert.deepEqual(membership?.evidenceIds, ["evidence:organizer-account-manifest:v1"]);
  assert.equal(store.getRecord({ workspaceId, collectionName: "profiles", recordId: xiaoyuProfileId })?.payload.displayName, "小雨运营者");
  assert.deepEqual(
    store.getRecord({ workspaceId, collectionName: "accounts", recordId: xiaoyuAccountId, includeDeleted: true }),
    { ...legacyAccount, userId: xiaoyuAccountId },
  );
  assert.deepEqual(
    store.getRecord({ workspaceId, collectionName: "profiles", recordId: xiaoyuProfileId, includeDeleted: true }),
    { ...legacyProfile, userId: xiaoyuAccountId },
  );

  const replay = await applyOrganizerAccountBootstrapPlan({
    expectedCount: 22,
    expectedPlanHash: plan.hash,
    password: "organizer-password",
    plan,
  }, dependencies);
  assert.equal(replay.newAccountCount, 0);
  assert.equal(replay.newContactLinkCount, 0);
  assert.equal(replay.newXiaoyuIdentityBindingCount, 0);
  assert.equal(replay.newXiaoyuCanonicalOwnershipRepairCount, 0);
  assert.equal(store.getRecord({ workspaceId, collectionName: "accounts", recordId: xiaoyuUserId }), null);
  assert.equal(store.getRecord({ workspaceId, collectionName: "profiles", recordId: `profile:${xiaoyuUserId}` }), null);
});

test("fails dry-run for a non-null conflicting canonical owner", async () => {
  const { dependencies } = createDependencies({ canonicalOwnerId: "account_conflicting" });

  await assert.rejects(
    buildOrganizerAccountBootstrapPlan({
      dependencies,
      xiaoyuAuthUserId: xiaoyuUserId,
    }),
    /canonical account\/profile chain/i,
  );
});

test("preserves a conflicting owner won by a concurrent repair writer", async () => {
  const { dependencies, store } = createDependencies();
  const plan = await buildOrganizerAccountBootstrapPlan({
    dependencies,
    xiaoyuAuthUserId: xiaoyuUserId,
  });
  dependencies.ownershipWriter = {
    async setOwnerIfAbsent(input) {
      const existing = await store.getRecord({
        workspaceId,
        collectionName: input.collectionName,
        recordId: input.recordId,
        includeDeleted: true,
      });
      if (existing) {
        await store.upsertRecord({ ...existing, userId: "account_concurrent" });
      }
      return "existing";
    },
  };

  await assert.rejects(
    applyOrganizerAccountBootstrapPlan({
      expectedCount: 22,
      expectedPlanHash: plan.hash,
      password: "organizer-password",
      plan,
    }, dependencies),
    /canonical ownership repair/i,
  );
  assert.equal(
    store.getRecord({ workspaceId, collectionName: "accounts", recordId: xiaoyuAccountId, includeDeleted: true })?.userId,
    "account_concurrent",
  );
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

test("pins Xiaoyu to the reviewed auth user ID", async () => {
  const { dependencies } = createDependencies();

  await assert.rejects(
    buildOrganizerAccountBootstrapPlan({
      dependencies,
      xiaoyuAuthUserId: "user_not_xiaoyu",
    }),
    /reviewed Xiaoyu auth user ID/i,
  );
  assert.equal(XIAOYU_AUTH_USER_ID, xiaoyuUserId);
});

test("fails closed when a deterministic Xiaoyu membership record exists but differs", async () => {
  const { dependencies, store } = createDependencies();
  const plan = await buildOrganizerAccountBootstrapPlan({
    dependencies,
    xiaoyuAuthUserId: xiaoyuUserId,
  });
  const recordId = `profile:auth-membership:${xiaoyuUserId}`;
  store.upsertRecord(record("profiles", recordId, {
    id: xiaoyuUserId,
    accountId: xiaoyuAccountId,
    displayName: "agenthubs",
    timezone: "Asia/Tokyo",
    createdAt: timestamp,
    updatedAt: timestamp,
  }, xiaoyuAccountId));

  await assert.rejects(
    applyOrganizerAccountBootstrapPlan({
      expectedCount: 22,
      expectedPlanHash: plan.hash,
      password: "organizer-password",
      plan,
    }, dependencies),
    /membership conflicts/i,
  );
  assert.equal(store.getRecord({ workspaceId, collectionName: "profiles", recordId })?.sourceId, `test:profiles:${recordId}`);
});

test("fails closed when the deterministic Xiaoyu membership was deleted", async () => {
  const { dependencies, store } = createDependencies();
  const plan = await buildOrganizerAccountBootstrapPlan({
    dependencies,
    xiaoyuAuthUserId: xiaoyuUserId,
  });
  const recordId = `profile:auth-membership:${xiaoyuUserId}`;
  const deleted = record("profiles", recordId, {
    id: xiaoyuUserId,
    accountId: xiaoyuAccountId,
    displayName: "agenthubs",
    timezone: "Asia/Tokyo",
    createdAt: timestamp,
    updatedAt: timestamp,
  }, xiaoyuAccountId);
  store.upsertRecord({ ...deleted, lifecycleState: "deleted", deletedAt: timestamp });

  await assert.rejects(
    applyOrganizerAccountBootstrapPlan({
      expectedCount: 22,
      expectedPlanHash: plan.hash,
      password: "organizer-password",
      plan,
    }, dependencies),
    /membership conflicts/i,
  );
  assert.equal(store.getRecord({ workspaceId, collectionName: "profiles", recordId }), null);
  assert.equal(store.getRecord({ workspaceId, collectionName: "profiles", recordId, includeDeleted: true })?.lifecycleState, "deleted");
});

test("replays the deterministic membership after Postgres null normalization", async () => {
  const { dependencies, store } = createDependencies();
  const plan = await buildOrganizerAccountBootstrapPlan({
    dependencies,
    xiaoyuAuthUserId: xiaoyuUserId,
  });
  await applyOrganizerAccountBootstrapPlan({
    expectedCount: 22,
    expectedPlanHash: plan.hash,
    password: "organizer-password",
    plan,
  }, dependencies);
  const recordId = `profile:auth-membership:${xiaoyuUserId}`;
  const membership = store.getRecord({ workspaceId, collectionName: "profiles", recordId })!;
  store.upsertRecord({
    ...membership,
    deletedAt: null,
    targetId: null,
    targetType: null,
  });

  const replay = await applyOrganizerAccountBootstrapPlan({
    expectedCount: 22,
    expectedPlanHash: plan.hash,
    password: "organizer-password",
    plan,
  }, dependencies);
  assert.equal(replay.newXiaoyuIdentityBindingCount, 0);
});

test("rejects a second active Xiaoyu membership profile", async () => {
  const { dependencies, store } = createDependencies();
  const plan = await buildOrganizerAccountBootstrapPlan({
    dependencies,
    xiaoyuAuthUserId: xiaoyuUserId,
  });
  store.upsertRecord(record("profiles", "profile:another-membership", {
    id: xiaoyuUserId,
    accountId: xiaoyuAccountId,
    displayName: "agenthubs",
    timezone: "Asia/Tokyo",
    createdAt: timestamp,
    updatedAt: timestamp,
  }, xiaoyuAccountId));

  await assert.rejects(
    applyOrganizerAccountBootstrapPlan({
      expectedCount: 22,
      expectedPlanHash: plan.hash,
      password: "organizer-password",
      plan,
    }, dependencies),
    /membership is ambiguous/i,
  );
});

test("rejects and preserves a deterministic membership inserted concurrently by the writer", async () => {
  const { dependencies, store } = createDependencies();
  const plan = await buildOrganizerAccountBootstrapPlan({
    dependencies,
    xiaoyuAuthUserId: xiaoyuUserId,
  });
  dependencies.membershipWriter = {
    async insertIfAbsent(next) {
      await store.upsertRecord({ ...next, sourceId: "race:conflicting-membership" });
      return "existing";
    },
  };

  await assert.rejects(
    applyOrganizerAccountBootstrapPlan({
      expectedCount: 22,
      expectedPlanHash: plan.hash,
      password: "organizer-password",
      plan,
    }, dependencies),
    /membership conflicts/i,
  );
  assert.equal(
    store.getRecord({
      workspaceId,
      collectionName: "profiles",
      recordId: `profile:auth-membership:${xiaoyuUserId}`,
      includeDeleted: true,
    })?.sourceId,
    "race:conflicting-membership",
  );
});

test("repairs only absent organizer account/profile records", async () => {
  const { dependencies } = createDependencies();
  await dependencies.authUserProvider.saveUser({
    id: "user_missing_organizer_chain",
    email: "yuhang-wei@organizers.orbit.example.test",
    displayName: "魏宇航",
    provider: "credentials",
    passwordHash: "unused-in-bootstrap-test",
    providerAccountId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  const plan = await buildOrganizerAccountBootstrapPlan({
    dependencies,
    xiaoyuAuthUserId: xiaoyuUserId,
  });
  const result = await applyOrganizerAccountBootstrapPlan({
    expectedCount: 22,
    expectedPlanHash: plan.hash,
    password: "organizer-password",
    plan,
  }, dependencies);

  assert.equal(result.newAccountCount, 12);
});

test("fails dry-run for a malformed present organizer profile", async () => {
  const { dependencies, store } = createDependencies();
  await dependencies.authUserProvider.saveUser({
    id: "user_malformed_organizer_chain",
    email: "yuhang-wei@organizers.orbit.example.test",
    displayName: "魏宇航",
    provider: "credentials",
    passwordHash: "unused-in-bootstrap-test",
    providerAccountId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  store.upsertRecord(record("profiles", "profile:user_malformed_organizer_chain", {
    id: "profile:user_malformed_organizer_chain",
    accountId: "user_malformed_organizer_chain",
    displayName: "Wrong Name",
    timezone: "Asia/Tokyo",
    createdAt: timestamp,
    updatedAt: timestamp,
  }, "user_malformed_organizer_chain"));

  await assert.rejects(
    buildOrganizerAccountBootstrapPlan({
      dependencies,
      xiaoyuAuthUserId: xiaoyuUserId,
    }),
    /conflicting organizer account\/profile chain/i,
  );
});

test("rejects a self-consistent forged organizer plan", async () => {
  const { dependencies } = createDependencies();
  const reviewed = await buildOrganizerAccountBootstrapPlan({
    dependencies,
    xiaoyuAuthUserId: xiaoyuUserId,
  });
  const items = reviewed.items.map((item, index) => index === 0
    ? { ...item, email: "forged@organizers.orbit.example.test" }
    : item,
  );
  const plan = {
    ...reviewed,
    hash: createHash("sha256")
      .update(JSON.stringify({ items, manifestVersion: reviewed.manifestVersion }))
      .digest("hex"),
    items,
  };

  await assert.rejects(
    applyOrganizerAccountBootstrapPlan({
      expectedCount: 22,
      expectedPlanHash: plan.hash,
      password: "organizer-password",
      plan,
    }, dependencies),
    /reviewed organizer account plan mismatch/i,
  );
});

test("fails closed when Xiaoyu canonical account or rich profile is archived or deleted", async () => {
  for (const lifecycleState of ["archived", "deleted"] as const) {
    for (const collectionName of ["accounts", "profiles"] as const) {
      const { dependencies, store } = createDependencies();
      const recordId = collectionName === "accounts" ? xiaoyuAccountId : xiaoyuProfileId;
      const existing = store.getRecord({ workspaceId, collectionName, recordId })!;
      store.upsertRecord({ ...existing, lifecycleState, ...(lifecycleState === "deleted" ? { deletedAt: timestamp } : {}) });

      await assert.rejects(
        buildOrganizerAccountBootstrapPlan({
          dependencies,
          xiaoyuAuthUserId: xiaoyuUserId,
        }),
        /canonical account\/profile chain/i,
      );
    }
  }
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
    expectedCount: 22,
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
