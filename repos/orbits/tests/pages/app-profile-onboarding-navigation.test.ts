import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module, { createRequire } from "node:module";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { transformSync } from "esbuild";

import { createLiveProfileService } from "../../features/profile/live-service";
import {
  createStorageProfileProvider,
} from "../../features/profile/storage/profile-live-record-provider";
import {
  createMemoryLiveRecordStore,
  type LiveRecord,
} from "../../shared/storage/live-record-store";

import {
  normalizeProfileAuthReturnPath,
  normalizeProfileOnboardingNext,
  profileContinuationPath,
  profileOnboardingPath,
} from "../../app/(app)/app/profile/profile-onboarding-navigation";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");
const testRequire = createRequire(import.meta.url);

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

const profileFixtureWorkspace = "workspace:profile-onboarding-navigation";
const profileFixtureTime = "2026-09-17T00:00:00.000Z";

function liveRecord(
  collectionName: string,
  recordId: string,
  payload: Record<string, unknown>,
  userId?: string,
): LiveRecord<Record<string, unknown>> {
  return {
    workspaceId: profileFixtureWorkspace,
    collectionName,
    recordId,
    userId,
    sourceType: "manual",
    sourceId: `source:${recordId}`,
    sourceLabel: "Profile onboarding navigation test",
    evidenceIds: [`evidence:${recordId}`],
    createdAt: profileFixtureTime,
    updatedAt: profileFixtureTime,
    lifecycleState: "active",
    payload,
  };
}

function profileMembershipFixture() {
  const accountId = "account:canonical-navigation";
  const profileId = "profile:external-navigation";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>([
    liveRecord("accounts", accountId, {
      id: accountId,
      name: "Canonical Navigation Account",
      createdAt: profileFixtureTime,
      updatedAt: profileFixtureTime,
    }, accountId),
    liveRecord("profiles", profileId, {
      id: profileId,
      accountId,
      displayName: "Canonical Navigation Profile",
      createdAt: profileFixtureTime,
      updatedAt: profileFixtureTime,
    }, accountId),
  ]);

  return { accountId, profileId, store };
}

async function withProfileEnvironment<T>(
  run: () => Promise<T> | T,
  mode?: "live" | "mock",
  nodeEnvironment: "test" | "production" = "test",
): Promise<T> {
  const keys = ["NODE_ENV", "ORBIT_MODULE_MODE", "ORBIT_FEATURE_MODE"] as const;
  const previous = new Map(keys.map((key) => [key, process.env[key]]));
  const env = process.env as Record<string, string | undefined>;

  try {
    env.NODE_ENV = nodeEnvironment;
    delete process.env.ORBIT_MODULE_MODE;
    delete process.env.ORBIT_FEATURE_MODE;
    if (mode) process.env.ORBIT_MODULE_MODE = mode;
    return await run();
  } finally {
    for (const key of keys) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else env[key] = value;
    }
  }
}

type ProfileContinueOptions = {
  actor?: Record<string, unknown> | null;
  actorThrows?: boolean;
  profileService: { getProfile: (input: { actorId: string }) => unknown };
  signedIn?: boolean;
};

function loadProfileContinuePage(
  t: { after: (callback: () => void) => void },
  options: ProfileContinueOptions,
) {
  const calls: Array<{ operation: string; input?: unknown }> = [];
  const redirected = new Error("Test redirect");
  const onboardingAccessPath = join(
    projectRoot,
    "app/(app)/app/profile/profile-onboarding-access.server.ts",
  );
  const modules: Record<string, unknown> = {
    "next/navigation": {
      redirect: (href: string) => {
        calls.push({ operation: "redirect", input: href });
        throw redirected;
      },
    },
    [join(projectRoot, "auth.ts")]: {
      auth: async () => {
        calls.push({ operation: "auth" });
        return options.signedIn === false
          ? null
          : {
              user: {
                id: "profile:external-navigation",
                email: "navigation@example.test",
                name: "External Navigation",
              },
            };
      },
    },
    [join(projectRoot, "app/api/_shared/authenticated-actor.ts")]: {
      resolveAuthenticatedApiActorFromSession: async (input: unknown) => {
        calls.push({ operation: "resolveActor", input });
        if (options.actorThrows) {
          throw new Error("test membership lookup failure");
        }
        return options.actor === undefined
          ? {
              id: "account:canonical-navigation",
              accountId: "account:canonical-navigation",
              profileId: "profile:external-navigation",
              userId: "profile:external-navigation",
            }
          : options.actor;
      },
    },
    [join(projectRoot, "features/profile/service-factory.ts")]: {
      createProfileService: (mode?: string) => {
        calls.push({ operation: "createProfileService", input: mode });
        return options.profileService;
      },
    },
  };
  const pagePath = join(projectRoot, "app/(app)/app/profile/continue/page.tsx");
  const ids = [...Object.keys(modules), pagePath, onboardingAccessPath].map((id) => testRequire.resolve(id));
  const previous = new Map(ids.map((id) => [id, testRequire.cache[id]]));

  t.after(() => {
    for (const [id, cached] of previous) {
      if (cached) testRequire.cache[id] = cached;
      else delete testRequire.cache[id];
    }
  });

  for (const [id, exports] of Object.entries(modules)) {
    const resolved = testRequire.resolve(id);
    const replacement = new Module(resolved);
    replacement.filename = resolved;
    replacement.loaded = true;
    replacement.exports = exports;
    testRequire.cache[resolved] = replacement;
  }
  const onboardingAccessResolved = testRequire.resolve(onboardingAccessPath);
  const onboardingAccessCompiled = transformSync(
    readFileSync(onboardingAccessPath, "utf8"),
    {
      format: "cjs",
      loader: "ts",
      platform: "node",
      supported: { "dynamic-import": false },
    },
  );
  const onboardingAccessModule = new Module(onboardingAccessResolved);
  onboardingAccessModule.filename = onboardingAccessResolved;
  onboardingAccessModule.loaded = true;
  onboardingAccessModule.exports = {};
  new Function("require", "module", "exports", onboardingAccessCompiled.code)(
    createRequire(onboardingAccessResolved),
    onboardingAccessModule,
    onboardingAccessModule.exports,
  );
  testRequire.cache[onboardingAccessResolved] = onboardingAccessModule;
  delete testRequire.cache[testRequire.resolve(pagePath)];

  const page = testRequire(pagePath).default as (input?: {
    searchParams?: Promise<{ next?: string | string[] }>;
  }) => Promise<never>;
  return { calls, page, redirected };
}

test("profile onboarding next preserves an in-app deep link and rejects loops", () => {
  const deepLink = "/app/contacts?from=w1#contact-list";
  assert.equal(normalizeProfileOnboardingNext(deepLink), deepLink);
  assert.equal(
    profileContinuationPath(deepLink),
    "/app/profile/continue?next=%2Fapp%2Fcontacts%3Ffrom%3Dw1%23contact-list",
  );
  assert.equal(
    profileOnboardingPath(deepLink),
    "/app/profile?onboarding=1&next=%2Fapp%2Fcontacts%3Ffrom%3Dw1%23contact-list",
  );

  for (const unsafeNext of [
    "/app/profile",
    "/app/profile/continue",
    "/app/profile/%70rofile",
    "/app/%70rofile/continue",
    "/app/%61ccount/login",
    "/app/account/login",
    "https://evil.example/steal",
    "//evil.example/steal",
    "/app/contacts\\evil",
  ]) {
    assert.equal(normalizeProfileOnboardingNext(unsafeNext), "/app/home", unsafeNext);
  }
  assert.equal(
    normalizeProfileOnboardingNext("https://evil.example/next", "/app/profile"),
    "/app/home",
  );
});

test("auth client unwraps exactly one known proxy continuation wrapper", () => {
  const deepLink = "/app/contacts?from=w1#contact-list";
  const wrapped = profileContinuationPath(deepLink);
  assert.equal(normalizeProfileAuthReturnPath(wrapped), deepLink);
  assert.equal(
    normalizeProfileAuthReturnPath(
      "/app/profile/continue?next=%2Fapp%2Fprofile%2Fcontinue%3Fnext%3D%252Fapp%252Fcontacts",
    ),
    "/app/home",
  );
  assert.equal(
    normalizeProfileAuthReturnPath("/app/profile/continue", "/app/profile"),
    "/app/home",
  );
  assert.equal(
    normalizeProfileAuthReturnPath(
      "/app/profile/continue?next=%2Fapp%2F%2561ccount%2Flogin",
    ),
    "/app/home",
  );
});

test("profile continuation reads authoritative profile onboarding without optional services", () => {
  const continuationSource = source(
    "app/(app)/app/profile/continue/page.tsx",
  );

  assert.match(continuationSource, /const session = await auth\(\)/);
  assert.match(continuationSource, /readProfileOnboardingAccess/);
  assert.doesNotMatch(continuationSource, /resolveAuthenticatedApiActorFromSession/);
  assert.doesNotMatch(continuationSource, /createProfileService\("live"\)/);
  assert.doesNotMatch(continuationSource, /createProfileDocumentExtractionService/);
  assert.doesNotMatch(continuationSource, /createProfileSignalReviewQueueService/);
  assert.doesNotMatch(continuationSource, /extractResume|listUpdateSuggestions/);
});

test("continuation reads the live profile with the canonical actor and preserves the destination", async (t) => {
  const { accountId, store } = profileMembershipFixture();
  const service = createLiveProfileService({
    provider: createStorageProfileProvider({
      store,
      workspaceId: profileFixtureWorkspace,
    }),
  });
  const saved = await service.updateProfile(
    {
      birthDate: "2000-02-29",
      displayName: "Canonical Navigation Profile",
      primaryIndustryId: "technology_internet",
      secondaryIndustryId: "technology_internet.enterprise_software",
    },
    { actorId: accountId },
  );
  assert.equal(saved.success, true);
  const reads: Array<{ actorId: string }> = [];
  const liveService = {
    getProfile: async (input: { actorId: string }) => {
      reads.push(input);
      return service.getProfile(input);
    },
  };

  await withProfileEnvironment(async () => {
    const { calls, page, redirected } = loadProfileContinuePage(t, {
      profileService: liveService,
    });
    await assert.rejects(
      page({
        searchParams: Promise.resolve({
          next: "/app/contacts?from=continuation#kept",
        }),
      }),
      (error) => error === redirected,
    );
    assert.equal(calls.find((call) => call.operation === "createProfileService")?.input, "live");
    assert.deepEqual(reads, [{ actorId: accountId }]);
    assert.equal(
      calls.find((call) => call.operation === "redirect")?.input,
      "/app/contacts?from=continuation#kept",
    );
  }, "live");
});

test("continuation sends missing or failed membership back to profile onboarding", async (t) => {
  await withProfileEnvironment(async () => {
    const { calls, page, redirected } = loadProfileContinuePage(t, {
      actor: null,
      profileService: {
        getProfile: async () => {
          throw new Error("profile service must not run without membership");
        },
      },
    });
    await assert.rejects(page(), (error) => error === redirected);
    assert.deepEqual(calls.map((call) => call.operation), [
      "auth",
      "resolveActor",
      "redirect",
    ]);
    assert.equal(calls.at(-1)?.input, "/app/profile/onboarding?next=%2Fapp%2Fhome");
  }, "live");
});

test("continuation sends actor resolution errors back to profile onboarding", async (t) => {
  await withProfileEnvironment(async () => {
    const { calls, page, redirected } = loadProfileContinuePage(t, {
      actorThrows: true,
      profileService: {
        getProfile: async () => {
          throw new Error("profile service must not run after membership failure");
        },
      },
    });
    await assert.rejects(page(), (error) => error === redirected);
    assert.deepEqual(calls.map((call) => call.operation), [
      "auth",
      "resolveActor",
      "redirect",
    ]);
  }, "live");
});

test("continuation keeps an incomplete real store profile on onboarding in production", async (t) => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const service = createLiveProfileService({
    provider: createStorageProfileProvider({
      store,
      workspaceId: profileFixtureWorkspace,
    }),
  });

  await withProfileEnvironment(async () => {
    const { calls, page, redirected } = loadProfileContinuePage(t, {
      profileService: service,
    });
    await assert.rejects(
      page({ searchParams: Promise.resolve({ next: "/app/contacts?from=prod" }) }),
      (error) => error === redirected,
    );
    assert.equal(calls.find((call) => call.operation === "createProfileService")?.input, "live");
    assert.equal(
      calls.find((call) => call.operation === "redirect")?.input,
      "/app/profile/onboarding?next=%2Fapp%2Fcontacts%3Ffrom%3Dprod",
    );
  }, undefined, "production");
});

test("continuation returns a failed real store to onboarding in production", async (t) => {
  const baseStore = createMemoryLiveRecordStore<Record<string, unknown>>();
  const failingStore = {
    ...baseStore,
    listRecords: async () => {
      throw new Error("test continuation store failure");
    },
  };
  const service = createLiveProfileService({
    provider: createStorageProfileProvider({
      store: failingStore,
      workspaceId: profileFixtureWorkspace,
    }),
  });

  await withProfileEnvironment(async () => {
    const { calls, page, redirected } = loadProfileContinuePage(t, {
      profileService: service,
    });
    await assert.rejects(page(), (error) => error === redirected);
    assert.equal(calls.find((call) => call.operation === "createProfileService")?.input, "live");
    assert.equal(
      calls.find((call) => call.operation === "redirect")?.input,
      "/app/profile/onboarding?next=%2Fapp%2Fhome",
    );
  }, undefined, "production");
});

test("continuation does not construct a profile service when no feature mode is configured", async (t) => {
  await withProfileEnvironment(async () => {
    const { calls, page, redirected } = loadProfileContinuePage(t, {
      profileService: {
        getProfile: async () => {
          throw new Error("profile service must not run in non-live mode");
        },
      },
    });
    await assert.rejects(page(), (error) => error === redirected);
    assert.deepEqual(calls.map((call) => call.operation), ["auth", "redirect"]);
    assert.equal(calls[1]?.input, "/app/profile/onboarding?next=%2Fapp%2Fhome");
  });
});
