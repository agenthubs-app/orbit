import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

import type { PublicEventRecordCatalogueSnapshot } from "../../features/events/core/public-catalogue";
import type { EventRecord } from "../../features/events/event-crud-and-import/contract";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const testRequire = createRequire(import.meta.url);
const runtimePath = join(
  projectRoot,
  "features/events/public-goal-recommendations-runtime.ts",
);
const profileFactoryPath = join(projectRoot, "features/profile/service-factory.ts");
const catalogueRuntimePath = join(
  projectRoot,
  "features/events/core/public-catalogue-runtime.ts",
);
const operationsRepositoryPath = join(
  projectRoot,
  "features/events/event-operations/repository.ts",
);

const NOW = new Date("2026-09-17T00:00:00.000Z");
const ACCOUNT_ID = "account:canonical";

function event(id = "event:runtime"): EventRecord {
  const source = {
    calendarSyncRequested: false as const,
    captureMethod: "organizer_feed" as const,
    externalNetworkRequested: false as const,
    id: `source:${id}`,
    importedAt: NOW.toISOString(),
    label: "runtime-fixture",
    liveDatabaseWriteExecuted: false,
    organizerFeedRequested: false as const,
    provider: "runtime-fixture",
    providerRecordId: id,
    type: "event_import" as const,
  };
  return {
    aiProviderRequested: false,
    calendarProviderRequested: false,
    calendarSyncRequested: false,
    description: "AI founders meet to exchange practical lessons.",
    emailProviderRequested: false,
    endsAt: "2026-09-20T12:00:00.000Z",
    evidence: [
      {
        capturedAt: NOW.toISOString(),
        createdBy: "runtime-test",
        evidenceId: `evidence:${id}`,
        excerpt: "AI founders meet to exchange practical lessons.",
        source,
      },
    ],
    externalNetworkRequested: false,
    id,
    liveDatabaseWriteExecuted: false,
    nextAction: "Register for the event.",
    notificationDelivered: false,
    organizerFeedRequested: false,
    recommendedPreparation: "Review the event details.",
    relationshipContext: "A runtime fixture.",
    sourceMetadata: source,
    startsAt: "2026-09-20T10:00:00.000Z",
    status: "imported",
    title: "AI Founders Circle",
    venue: "Runtime Room",
  };
}

function snapshot(records: readonly EventRecord[] = [event()]): PublicEventRecordCatalogueSnapshot {
  return {
    generatedAt: NOW.toISOString(),
    organizerIds: Object.fromEntries(
      records.map((record) => [record.id, "account:organizer"]),
    ),
    participantCounts: Object.fromEntries(
      records.map((record) => [record.id, 0]),
    ),
    publicCodes: Object.fromEntries(
      records.map((record) => [record.id, `public-${record.id}`]),
    ),
    records,
  };
}

interface RuntimeOptions {
  catalogueError?: Error;
  catalogueNull?: boolean;
  catalogueSnapshot?: PublicEventRecordCatalogueSnapshot;
  factoryError?: Error;
  goal?: string | null;
  membershipError?: Error;
  memberships?: readonly { eventId: string; status: "cancelled" | "rsvped"; userId: string }[];
  operationsNull?: boolean;
  profileError?: Error;
  profileFailure?: boolean;
}

function loadRuntime(
  t: TestContext,
  options: RuntimeOptions = {},
): {
  calls: {
    catalogue: Date[];
    membership: Array<{ eventIds: readonly string[]; userId: string }>;
    operations: number;
    profile: Array<{ actorId: string | null | undefined; mode: unknown }>;
  };
  runtime: ReturnType<
    typeof import("../../features/events/public-goal-recommendations-runtime").createConfiguredPublicGoalRecommendationsRuntime
  >;
} {
  const calls = {
    catalogue: [] as Date[],
    membership: [] as Array<{ eventIds: readonly string[]; userId: string }>,
    operations: 0,
    profile: [] as Array<{ actorId: string | null | undefined; mode: unknown }>,
  };
  const modules: Record<string, unknown> = {
    [profileFactoryPath]: {
      createProfileService: (mode: unknown) => {
        calls.profile.push({ actorId: undefined, mode });
        if (options.factoryError) throw options.factoryError;
        return {
          getProfile: async (input?: { actorId?: string | null }) => {
            calls.profile[calls.profile.length - 1]!.actorId = input?.actorId;
            if (options.profileError) throw options.profileError;
            if (options.profileFailure) {
              return { success: false, error: { message: "profile unavailable" } };
            }
            return {
              success: true,
              data: {
                profile: { relationshipGoal: options.goal ?? "AI founders" },
              },
            };
          },
        };
      },
    },
    [catalogueRuntimePath]: {
      createConfiguredCanonicalPublicEventCatalogue: (input: { now: Date }) => {
        calls.catalogue.push(input.now);
        if (options.catalogueNull) return null;
        return {
          readRecords: async () => {
            if (options.catalogueError) throw options.catalogueError;
            return options.catalogueSnapshot ?? snapshot();
          },
        };
      },
    },
    [operationsRepositoryPath]: {
      createConfiguredEventOperationsRepository: () => {
        calls.operations += 1;
        if (options.operationsNull) return null;
        return {
          listCanonicalRegistrationsForUser: async (
            userId: string,
            eventIds: readonly string[],
          ) => {
            calls.membership.push({ eventIds, userId });
            if (options.membershipError) throw options.membershipError;
            return options.memberships ?? [];
          },
        };
      },
    },
  };
  const tracked = [runtimePath, ...Object.keys(modules)];
  const previous = new Map(tracked.map((path) => [path, testRequire.cache[path]]));
  t.after(() => {
    for (const [path, cached] of previous) {
      if (cached) testRequire.cache[path] = cached;
      else delete testRequire.cache[path];
    }
  });
  for (const [path, exports] of Object.entries(modules)) {
    const replacement = new Module(path);
    replacement.filename = path;
    replacement.loaded = true;
    replacement.exports = exports;
    testRequire.cache[path] = replacement;
  }
  delete testRequire.cache[runtimePath];
  const runtimeModule = testRequire(runtimePath) as typeof import("../../features/events/public-goal-recommendations-runtime");
  return {
    calls,
    runtime: runtimeModule.createConfiguredPublicGoalRecommendationsRuntime({
      now: () => NOW,
    }),
  };
}

test("runtime composes the live profile, canonical public catalogue, and one account-scoped membership batch", async (t) => {
  const { calls, runtime } = loadRuntime(t, {
    memberships: [],
  });

  const result = await runtime.recommend({ accountId: ACCOUNT_ID });

  assert.equal(result.state, "success");
  assert.deepEqual(result.items.map((item) => item.eventId), ["event:runtime"]);
  assert.deepEqual(calls.profile, [{ actorId: ACCOUNT_ID, mode: "live" }]);
  assert.deepEqual(calls.catalogue, [NOW]);
  assert.equal(calls.operations, 1);
  assert.deepEqual(calls.membership, [
    { eventIds: ["event:runtime"], userId: ACCOUNT_ID },
  ]);
});

test("W0036 runtime: no goal is still needs_goal, but the catalogue and memberships are read once for the recent-events fallback", async (t) => {
  const { calls, runtime } = loadRuntime(t, { goal: "" });

  const result = await runtime.recommend({ accountId: ACCOUNT_ID });
  assert.equal(result.state, "needs_goal");
  assert.deepEqual(result.items, []);
  assert.deepEqual(result.upcoming.map((item) => item.eventId), ["event:runtime"]);
  assert.deepEqual(calls.catalogue, [NOW]);
  assert.equal(calls.operations, 1);
  assert.equal(calls.membership.length, 1);
});

test("runtime fails closed for missing account, profile failure, or profile factory failure", async (t) => {
  const noAccount = loadRuntime(t);
  assert.deepEqual(
    await noAccount.runtime.recommend({ accountId: null }),
    { state: "unavailable", items: [], upcoming: [] },
  );
  assert.equal(noAccount.calls.profile.length, 0);

  // W0036：读目标失败仍是 unavailable、不出目标匹配；目录与报名照读一次，近期活动兜底。
  for (const [label, options] of [
    ["profile failure", { profileFailure: true }],
    ["profile throw", { profileError: new Error("profile read failed") }],
    ["profile factory failure", { factoryError: new Error("live mode unavailable") }],
  ] as const) {
    const loaded = loadRuntime(t, options);
    const result = await loaded.runtime.recommend({ accountId: ACCOUNT_ID });
    assert.equal(result.state, "unavailable", label);
    assert.deepEqual(result.items, [], label);
    assert.deepEqual(result.upcoming.map((item) => item.eventId), ["event:runtime"], label);
    assert.equal(loaded.calls.catalogue.length, 1, label);
    assert.equal(loaded.calls.membership.length, 1, label);
  }
});

test("runtime fails closed when the canonical catalogue or operations repository is unavailable", async (t) => {
  const catalogueMissing = loadRuntime(t, { catalogueNull: true });
  assert.deepEqual(
    await catalogueMissing.runtime.recommend({ accountId: ACCOUNT_ID }),
    { state: "unavailable", items: [], upcoming: [] },
  );

  const catalogueFailure = loadRuntime(t, {
    catalogueError: new Error("catalogue read failed"),
  });
  assert.deepEqual(
    await catalogueFailure.runtime.recommend({ accountId: ACCOUNT_ID }),
    { state: "unavailable", items: [], upcoming: [] },
  );

  const operationsMissing = loadRuntime(t, { operationsNull: true });
  assert.deepEqual(
    await operationsMissing.runtime.recommend({ accountId: ACCOUNT_ID }),
    { state: "unavailable", items: [], upcoming: [] },
  );

  const membershipFailure = loadRuntime(t, {
    membershipError: new Error("membership read failed"),
  });
  assert.deepEqual(
    await membershipFailure.runtime.recommend({ accountId: ACCOUNT_ID }),
    { state: "unavailable", items: [], upcoming: [] },
  );
});
