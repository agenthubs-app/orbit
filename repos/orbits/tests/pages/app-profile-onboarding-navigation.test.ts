import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module, { createRequire } from "node:module";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { transformSync } from "esbuild";
import type { ReactElement } from "react";

import {
  resolveAuthenticatedApiActorIdentity,
} from "../../app/api/_shared/authenticated-actor";
import { createLiveProfileService } from "../../features/profile/live-service";
import { createProfileService } from "../../features/profile/service-factory";
import {
  createStorageAccountSessionProvider,
} from "../../features/account/storage/account-live-record-provider";
import {
  createStorageProfileProvider,
} from "../../features/profile/storage/profile-live-record-provider";
import { resolveFeatureMode } from "../../shared/config/feature-mode";
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

type ProfilePageOptions = {
  actor?: Record<string, unknown> | null;
  actualRouteLoader?: boolean;
  actorThrows?: boolean;
  mockProfileService?: unknown;
  profileService?: unknown;
  signedIn?: boolean;
  loader?: (input: unknown) => Promise<unknown>;
};

function loadProfilePage(
  t: { after: (callback: () => void) => void },
  options: ProfilePageOptions = {},
) {
  const calls: Array<{ operation: string; input?: unknown }> = [];
  const redirected = new Error("Test redirect");
  const defaultRouteModel = {
    state: "success" as const,
    profile: {},
  };
  const routeViewModelPath = join(
    projectRoot,
    "app/(app)/app/profile/compose-app-profile-from-previously-approved-mock-first-capabilities/profile-route-view-model.ts",
  );
  const featureServiceFactoryPath = join(
    projectRoot,
    "features/profile/service-factory.ts",
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
        if (options.actor === undefined) {
          return {
            id: "account:canonical-navigation",
            accountId: "account:canonical-navigation",
            profileId: "profile:external-navigation",
            userId: "profile:external-navigation",
            email: "canonical@example.test",
            name: "Canonical Navigation",
          };
        }
        return options.actor;
      },
    },
    [join(projectRoot, "app/(app)/app/profile/orbit-real-profile.tsx")]: {
      OrbitRealProfile: function OrbitRealProfile() {
        return null;
      },
    },
    [join(projectRoot, "app/(app)/app/orbit-reference-styles.tsx")]: {
      OrbitReferenceStyles: function OrbitReferenceStyles() {
        return null;
      },
    },
    [join(projectRoot, "app/(app)/app/orbit-visual-freeze-runtime.tsx")]: {
      OrbitVisualFreezeRuntime: function OrbitVisualFreezeRuntime() {
        return null;
      },
    },
    [join(projectRoot, "shared/ui/state-view.tsx")]: {
      StateView: function StateView() {
        return null;
      },
    },
  };
  if (options.actualRouteLoader) {
    modules[featureServiceFactoryPath] = {
      createProfileService: (mode?: string) => {
        calls.push({ operation: "createProfileService", input: mode });
        return mode === "mock"
          ? options.mockProfileService ?? options.profileService
          : options.profileService;
      },
      createProfileDocumentExtractionService: () => ({}),
      createProfileSignalReviewQueueService: () => ({
        listUpdateSuggestions: async () => ({
          success: true,
          data: { summary: "", suggestions: [] },
        }),
      }),
    };
  } else {
    modules[join(projectRoot, "app/(app)/app/profile/profile-editor-adapter.ts")] = {
      profileRouteToOrbitProfileEditorViewModel: () => ({}),
    };
    modules[routeViewModelPath] = {
      loadAppProfileRouteViewModel: async (input: unknown) => {
        calls.push({ operation: "loadProfile", input });
        return options.loader
          ? options.loader(input)
          : defaultRouteModel;
      },
    };
  }
  const pagePath = join(projectRoot, "app/(app)/app/profile/page.tsx");
  const ids = [
    ...Object.keys(modules),
    pagePath,
    ...(options.actualRouteLoader
      ? [
          routeViewModelPath,
          join(
            projectRoot,
            "app/(app)/app/profile/compose-app-profile-from-previously-approved-mock-first-capabilities/profile-service-factory.ts",
          ),
        ]
      : []),
  ].map((id) => testRequire.resolve(id));
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
  if (options.actualRouteLoader) {
    delete testRequire.cache[testRequire.resolve(routeViewModelPath)];
    delete testRequire.cache[
      testRequire.resolve(
        join(
          projectRoot,
          "app/(app)/app/profile/compose-app-profile-from-previously-approved-mock-first-capabilities/profile-service-factory.ts",
        ),
      )
    ];
  }
  delete testRequire.cache[testRequire.resolve(pagePath)];

  const page = testRequire(pagePath).default as (input?: {
    searchParams?: Promise<Record<string, string | string[]>>;
  }) => Promise<ReactElement>;
  return { calls, page, redirected };
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

test("profile page exposes continuation only for the onboarding flow", () => {
  const profilePageSource = source("app/(app)/app/profile/page.tsx");

  assert.match(profilePageSource, /searchParams\?: Promise<AppProfileSearchParams>/);
  assert.match(profilePageSource, /onboardingNext/);
  assert.match(profilePageSource, /profileContinuationPath\(onboardingNext\)/);
  assert.match(profilePageSource, /resolveAuthenticatedApiActorFromSession/);
  assert.match(profilePageSource, /resolveFeatureMode\(\) === "live"/);
  assert.match(profilePageSource, /PROFILE_LIVE_MODE_REQUIRED/);
});

test("live profile pages resolve the raw session subject to the canonical account owner", async () => {
  const { accountId, profileId, store } = profileMembershipFixture();
  const accountProvider = createStorageAccountSessionProvider({
    requireIdentity: true,
    store,
    workspaceId: profileFixtureWorkspace,
  });
  const graph = await accountProvider.readAccountSessionGraph({
    userId: profileId,
  });
  const actor = resolveAuthenticatedApiActorIdentity({
    graph,
    mode: "live",
    session: { userId: profileId, email: "navigation@example.test" },
    workspaceId: profileFixtureWorkspace,
  });

  assert.equal(actor?.id, accountId);
  assert.equal(actor?.profileId, profileId);
  assert.notEqual(actor?.id, profileId);

  const service = createLiveProfileService({
    provider: createStorageProfileProvider({
      store,
      workspaceId: profileFixtureWorkspace,
    }),
  });
  const rawSubjectRead = await service.getProfile({ actorId: profileId });
  const canonicalAccountRead = await service.getProfile({ actorId: actor!.id });

  assert.equal(rawSubjectRead.success, true);
  assert.equal(canonicalAccountRead.success, true);
  if (!rawSubjectRead.success || !canonicalAccountRead.success) {
    throw new Error("Expected live profile reads to succeed");
  }
  assert.equal(rawSubjectRead.data.profile, null);
  assert.equal(canonicalAccountRead.data.profile?.id, profileId);
});

test("live actor resolution fails closed when persisted membership is missing", async () => {
  const accountId = "account:membership-required";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>([
    liveRecord("accounts", accountId, {
      id: accountId,
      name: "Membership Required",
      createdAt: profileFixtureTime,
      updatedAt: profileFixtureTime,
    }, accountId),
  ]);
  const provider = createStorageAccountSessionProvider({
    requireIdentity: true,
    store,
    workspaceId: profileFixtureWorkspace,
  });
  const graph = await provider.readAccountSessionGraph({
    userId: "profile:missing-membership",
  });

  assert.deepEqual(graph.profiles, []);
  assert.equal(
    resolveAuthenticatedApiActorIdentity({
      graph,
      mode: "live",
      session: { userId: "profile:missing-membership" },
      workspaceId: profileFixtureWorkspace,
    }),
    null,
  );
});

test("profile page does not enter the mock editor when no feature mode is configured", async (t) => {
  await withProfileEnvironment(async () => {
    assert.equal(resolveFeatureMode(), "mock");
    const mockService = createProfileService();
    const mockRead = await mockService.getProfile();
    assert.equal(mockRead.success, true);

    const { calls, page } = loadProfilePage(t, {
      loader: async () => {
        throw new Error("profile loader must not run in non-live mode");
      },
    });
    const rendered = await page({
      searchParams: Promise.resolve({
        onboarding: "1",
        next: "/app/contacts?from=mode-test#w1",
      }),
    });

    assert.deepEqual(calls.map((call) => call.operation), ["auth"]);
    const children = rendered.props.children as readonly ReactElement[];
    const routeBoundary = children[2] as ReactElement<any>;
    const stateBoundary = (routeBoundary.type as (props: any) => ReactElement)(
      routeBoundary.props,
    );
    const stateView = stateBoundary.props.children as ReactElement<any>;
    assert.match(stateView.props.description, /Your profile is temporarily unavailable/);
  });
});

test("production profile page stays live when mode variables are missing", async (t) => {
  await withProfileEnvironment(async () => {
    const { calls, page } = loadProfilePage(t, {
      loader: async (input) => ({
        state: "success",
        profile: { profile: { displayName: String((input as { id: string }).id) } },
      }),
    });
    await page();
    assert.deepEqual(calls.map((call) => call.operation), [
      "auth",
      "resolveActor",
      "loadProfile",
    ]);
  }, undefined, "production");
});

test("production profile page ignores an explicit mock mode and stays live", async (t) => {
  await withProfileEnvironment(async () => {
    const { calls, page } = loadProfilePage(t, {
      loader: async () => ({
        state: "success",
        profile: { profile: { displayName: "Canonical Navigation" } },
      }),
    });
    await page();
    assert.deepEqual(calls.map((call) => call.operation), [
      "auth",
      "resolveActor",
      "loadProfile",
    ]);
  }, "mock", "production");
});

test("profile page passes the canonical actor to the live route loader", async (t) => {
  await withProfileEnvironment(async () => {
    const { calls, page } = loadProfilePage(t);
    await page();
    const load = calls.find((call) => call.operation === "loadProfile");
    assert.equal((load?.input as { id: string }).id, "account:canonical-navigation");
    assert.deepEqual(calls.map((call) => call.operation), [
      "auth",
      "resolveActor",
      "loadProfile",
    ]);
  }, "live");
});

test("profile page keeps missing membership in a controlled state", async (t) => {
  await withProfileEnvironment(async () => {
    const { calls, page } = loadProfilePage(t, {
      actor: null,
      loader: async () => {
        throw new Error("profile loader must not run without membership");
      },
    });
    const rendered = await page();
    assert.deepEqual(calls.map((call) => call.operation), ["auth", "resolveActor"]);
    assert.ok(rendered);
  }, "live");
});

test("profile page keeps membership lookup errors in a controlled state", async (t) => {
  await withProfileEnvironment(async () => {
    const { calls, page } = loadProfilePage(t, {
      actorThrows: true,
      loader: async () => {
        throw new Error("profile loader must not run after membership failure");
      },
    });
    const rendered = await page();
    assert.deepEqual(calls.map((call) => call.operation), ["auth", "resolveActor"]);
    assert.ok(rendered);
  }, "live");
});

test("profile page renders a canonical first-create editor from an empty live record", async (t) => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const service = createLiveProfileService({
    provider: createStorageProfileProvider({
      store,
      workspaceId: profileFixtureWorkspace,
    }),
  });

  await withProfileEnvironment(async () => {
    const { calls, page } = loadProfilePage(t, {
      actualRouteLoader: true,
      profileService: service,
    });
    const rendered = await page();
    const children = rendered.props.children as readonly ReactElement[];

    const editor = children[2] as ReactElement<any>;
    assert.equal(editor.type.toString().includes("OrbitRealProfile"), true);
    assert.equal(editor.props.viewModel.profile.hasPersistedProfile, false);
    assert.equal(editor.props.viewModel.profile.expectedUpdatedAt, null);
    assert.ok(
      calls.some(
        (call) =>
          call.operation === "createProfileService" && call.input === "live",
      ),
    );
  }, "live");
});

test("profile page keeps an existing canonical live record in the editor", async (t) => {
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
      displayName: "Existing Canonical Profile",
      primaryIndustryId: "technology_internet",
      secondaryIndustryId: "technology_internet.enterprise_software",
    },
    { actorId: accountId },
  );
  assert.equal(saved.success, true);

  await withProfileEnvironment(async () => {
    const { page } = loadProfilePage(t, {
      actualRouteLoader: true,
      profileService: service,
    });
    const rendered = await page();
    const children = rendered.props.children as readonly ReactElement[];

    const editor = children[2] as ReactElement<any>;
    assert.equal(editor.type.toString().includes("OrbitRealProfile"), true);
    assert.equal(editor.props.viewModel.profile.hasPersistedProfile, true);
    assert.equal(typeof editor.props.viewModel.profile.expectedUpdatedAt, "string");
    assert.equal(editor.props.viewModel.profile.fullName, "Existing Canonical Profile");
  }, "live");
});

test("profile page renders a controlled route failure when the live store throws", async (t) => {
  const baseStore = createMemoryLiveRecordStore<Record<string, unknown>>();
  const failingStore = {
    ...baseStore,
    listRecords: async () => {
      throw new Error("test live store failure");
    },
  };
  const service = createLiveProfileService({
    provider: createStorageProfileProvider({
      store: failingStore,
      workspaceId: profileFixtureWorkspace,
    }),
  });

  await withProfileEnvironment(async () => {
    const { page } = loadProfilePage(t, {
      actualRouteLoader: true,
      mockProfileService: createProfileService(),
      profileService: service,
    });
    const rendered = await page();
    const children = rendered.props.children as readonly ReactElement[];
    const routeBoundary = children[2] as ReactElement<any>;

    assert.equal(routeBoundary.type.toString().includes("ProfileRouteStateBoundary"), true);
    assert.equal(routeBoundary.props.routeState.scenario, "failure");
    const stateBoundary = (routeBoundary.type as (props: any) => ReactElement)(
      routeBoundary.props,
    );
    const stateView = stateBoundary.props.children as ReactElement<any>;
    assert.match(stateView.props.title, /资料准备度无法加载|Profile readiness could not load/);
    assert.equal(
      stateView.props.description,
      "资料暂时无法加载，请稍后重试。 / Your profile is temporarily unavailable. Please try again later.",
    );
    assert.equal(
      stateView.props.nextStep,
      "请重新打开资料页重试；若需要登录，请先登录。 / Reopen your profile to try again. Sign in if prompted.",
    );
    assert.equal(stateView.props.recoveryActions[0].id, "profile-failure-return");
    assert.equal(
      stateView.props.recoveryActions[0].label,
      "重试加载资料 / Retry loading profile",
    );
    assert.equal(
      stateView.props.recoveryActions[0].recoveryCopy,
      "重新打开资料页，重试读取；此操作不会保存修改。 / Reopen the profile page to retry loading it. This action does not save edits.",
    );
    assert.doesNotMatch(
      `${stateView.props.description} ${stateView.props.nextStep} ${stateView.props.recoveryActions[0].label} ${stateView.props.recoveryActions[0].recoveryCopy}`,
      /Ari/,
    );
  }, "live");
});

test("profile page renders owner-neutral failure copy for an unknown onboarding policy without an editor", async (t) => {
  const { page } = loadProfilePage(t, {
    actualRouteLoader: true,
    profileService: {
      getProfile: async () => ({
        success: true,
        data: {
          onboarding: {
            policyVersion: 99,
            status: "incomplete",
            missingFields: ["birthDate"],
          },
        },
      }),
    },
  });

  await withProfileEnvironment(async () => {
    const rendered = await page();
    const children = rendered.props.children as readonly ReactElement[];
    const routeBoundary = children[2] as ReactElement<any>;
    assert.equal(routeBoundary.type.toString().includes("ProfileRouteStateBoundary"), true);
    assert.equal(routeBoundary.props.routeState.errorCode, "PROFILE_ONBOARDING_UNAVAILABLE");

    const stateBoundary = (routeBoundary.type as (props: any) => ReactElement)(
      routeBoundary.props,
    );
    const stateView = stateBoundary.props.children as ReactElement<any>;
    assert.equal(
      stateView.props.description,
      "资料暂时无法加载，请稍后重试。 / Your profile is temporarily unavailable. Please try again later.",
    );
    assert.equal(stateView.props.recoveryActions[0].id, "profile-failure-return");
    assert.equal(stateView.props.recoveryActions[0].href, "/app/profile");
    assert.equal(stateView.props.children, undefined);
  }, "live");
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
    assert.equal(calls.at(-1)?.input, "/app/profile?onboarding=1&next=%2Fapp%2Fhome");
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
      "/app/profile?onboarding=1&next=%2Fapp%2Fcontacts%3Ffrom%3Dprod",
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
      "/app/profile?onboarding=1&next=%2Fapp%2Fhome",
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
    assert.equal(calls[1]?.input, "/app/profile?onboarding=1&next=%2Fapp%2Fhome");
  });
});
