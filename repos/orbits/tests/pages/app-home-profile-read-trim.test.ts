/**
 * W0040：首页读资料时跳过「资料更新建议」（profile signal graph 的整 workspace 读取）。
 *
 * - SC-01：首页（有／无 rawSubject）`listUpdateSuggestions` 0 次。
 * - SC-02：以资料默认路径（include）为对照，首页账户卡与失败页逐项不变；
 *   signal／extraction／profile 服务解析失败仍让首页失败，建议运行时抛错仍成功。
 * - SC-03：资料页默认路径仍调用建议恰好 1 次、参数不变，三字段不变；编辑页与管理台不传开关。
 *
 * 全部在 mock module mode 下跑，不连数据库。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

import { PROFILE_ERROR_DEFINITIONS } from "../../features/profile/contract";
import {
  profileDocumentExtractionServiceFactory,
  profileServiceFactory,
  profileSignalReviewQueueServiceFactory,
} from "../../features/profile/service-factory";
import { createNotImplementedFailure } from "../../shared/services/module-mode";
import {
  loadAppHomeRouteViewModel,
  type AppHomeActor,
  type AppHomeRouteStateViewModel,
} from "../../app/(app)/app/home/compose-app-home-from-previously-approved-mock-first-capabilities/home-route-view-model";
import {
  loadAppProfileRouteViewModel,
  type AppProfileRouteViewModel,
} from "../../app/(app)/app/profile/compose-app-profile-from-previously-approved-mock-first-capabilities/profile-route-view-model";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

type SignalSetup = "many" | "none" | "throw" | "unresolved";
type ProfileSetup = "persisted" | "no-profile" | "throw" | "fail" | "onboarding-invalid" | "unresolved";
interface Setup {
  extraction?: "unresolved";
  profile?: ProfileSetup;
  signal?: SignalSetup;
}

const withSubject: AppHomeActor = {
  displayName: "Trim Owner",
  email: "owner@example.invalid",
  id: "account:w0040-owner",
  rawSubject: "subject:w0040-owner",
};
const noSubject: AppHomeActor = {
  displayName: "Trim Owner",
  email: "owner@example.invalid",
  id: "account:w0040-owner",
};
const ACTORS = { withSubject, noSubject, none: undefined } as const;

function useMockMode(t: TestContext) {
  const previousModule = process.env.ORBIT_MODULE_MODE;
  const previousFeature = process.env.ORBIT_FEATURE_MODE;
  process.env.ORBIT_MODULE_MODE = "mock";
  delete process.env.ORBIT_FEATURE_MODE;
  t.after(() => {
    if (previousModule === undefined) delete process.env.ORBIT_MODULE_MODE;
    else process.env.ORBIT_MODULE_MODE = previousModule;
    if (previousFeature === undefined) delete process.env.ORBIT_FEATURE_MODE;
    else process.env.ORBIT_FEATURE_MODE = previousFeature;
  });
}

/**
 * 替换三个 feature factory。"unresolved" 只让第一次解析失败（route 自己的服务组合），
 * 失败页随后以 mock 解析服务——与 live 解析失败时的真实顺序一致。
 * 每次调用 `arm()` 重新装填一次失败并清零计数。
 */
function stubProfileServices(t: TestContext, setup: Setup) {
  const signalCalls: unknown[] = [];
  const pending = { extraction: false, profile: false, signal: false };
  const arm = () => {
    signalCalls.length = 0;
    pending.extraction = setup.extraction === "unresolved";
    pending.profile = setup.profile === "unresolved";
    pending.signal = setup.signal === "unresolved";
  };
  const signalCreate = profileSignalReviewQueueServiceFactory.create;
  const profileCreate = profileServiceFactory.create;
  const extractionCreate = profileDocumentExtractionServiceFactory.create;

  t.mock.method(profileSignalReviewQueueServiceFactory, "create", (mode?: string) => {
    if (pending.signal) {
      pending.signal = false;
      return createNotImplementedFailure("profile-signal-review-queue", "mock", ["live"]);
    }
    const resolution = signalCreate(mode);
    if (!resolution.success) return resolution;
    const service = resolution.service;
    return {
      ...resolution,
      service: {
        ...service,
        listUpdateSuggestions(input: Parameters<typeof service.listUpdateSuggestions>[0] = {}) {
          signalCalls.push(input);
          if (setup.signal === "throw") throw new Error("optional suggestions exploded");
          return service.listUpdateSuggestions(
            setup.signal === "none" ? { ...input, scenario: "empty" } : input,
          );
        },
      },
    };
  });
  t.mock.method(profileDocumentExtractionServiceFactory, "create", (mode?: string) => {
    if (pending.extraction) {
      pending.extraction = false;
      return createNotImplementedFailure("profile-document-extraction", "mock", ["live"]);
    }
    return extractionCreate(mode);
  });
  t.mock.method(profileServiceFactory, "create", (mode?: string) => {
    if (pending.profile) {
      pending.profile = false;
      return createNotImplementedFailure("profile", "mock", ["live"]);
    }
    const resolution = profileCreate(mode);
    if (!resolution.success) return resolution;
    const service = resolution.service;
    return {
      ...resolution,
      service: {
        ...service,
        getProfile(options: Parameters<typeof service.getProfile>[0] = {}) {
          if (setup.profile === "throw") throw new Error("getProfile exploded");
          if (setup.profile === "fail") {
            return {
              success: false as const,
              error: {
                ...PROFILE_ERROR_DEFINITIONS.PROFILE_VERSION_CONFLICT,
                state: "failure" as const,
                provenance: { evidenceIds: ["evidence:w0040-profile-fail"] },
                evidenceIds: ["evidence:w0040-profile-fail"],
              },
            } as unknown as ReturnType<typeof service.getProfile>;
          }
          const result = service.getProfile(
            setup.profile === "no-profile" ? { ...options, scenario: "empty" } : options,
          );
          if (setup.profile === "onboarding-invalid") {
            return Promise.resolve(result).then((value) =>
              value.success ? { ...value, data: { ...value.data, onboarding: undefined } } : value,
            ) as ReturnType<typeof service.getProfile>;
          }
          return result;
        },
      },
    };
  });
  arm();
  return { arm, signalCalls };
}

function profileActor(actor: AppHomeActor | undefined) {
  return actor ? { displayName: actor.displayName, email: actor.email, id: actor.id } : actor;
}

async function home(actor: AppHomeActor | undefined) {
  return loadAppHomeRouteViewModel(undefined, actor, {
    readCanonicalParticipantEventJourneys: async () => [],
  });
}

/** 首页账户卡由资料的 14 个字段 + fullName／initial 组成（`homeViewModel`）。 */
function expectedAccount(model: AppProfileRouteViewModel) {
  assert.equal(model.state, "success");
  if (model.state !== "success") throw new Error("unreachable");
  const profile = model.profile.profile;
  const fullName = profile.displayName || "Orbit operator";
  return {
    fullName,
    headline: profile.headline,
    initial: fullName.slice(0, 1) || "O",
    role: profile.role,
    organization: profile.organization,
    industry: profile.industry,
    homeMarket: profile.homeMarket,
    relationshipGoal: profile.relationshipGoal,
    bio: profile.bio,
    offering: profile.offering,
    seeking: profile.seeking,
    topics: profile.topics,
    targetRelationshipTypes: profile.targetRelationshipTypes,
    preferredIntroChannels: profile.preferredIntroChannels,
    preferredFollowUpWindow: profile.preferredFollowUpWindow,
  };
}

/** 资料子路由失败时首页的 route-state（`childRouteState` 的 profile 分支）。 */
function expectedProfileFailure(model: AppProfileRouteViewModel): AppHomeRouteStateViewModel {
  assert.equal(model.state, "route-state");
  if (model.state !== "route-state") throw new Error("unreachable");
  return {
    copy: {
      description: "Profile source data is not available, so the personal home summary is paused.",
      emptyState:
        "Home needs events, contacts, and profile route payloads before it can show the personal hub.",
      eyebrow: "Home",
      guardrail:
        "This page did not create contacts, update events, send messages, or contact outside providers.",
      nextStep:
        "Reload Home after the blocked source route is configured, or open the source route directly.",
      purpose:
        "Keep the personal hub tied to the same sourced route payloads used by the underlying feature pages.",
      title: "Home could not load",
    },
    evidenceIds: model.routeState.evidenceIds,
    recoveryActions: [
      { href: "/app/home", label: "Reload Home" },
      { href: "/app/profile", label: "Open Profile" },
    ],
    source: "profile",
  };
}

/* ── SC-01：首页 0 次 ─────────────────────────────────────────────── */

for (const [actorName, actor] of [["with rawSubject", withSubject], ["without rawSubject", noSubject]] as const) {
  for (const profile of ["persisted", "no-profile"] as const) {
    test(`SC-01 home (${actorName}, ${profile}) never asks for profile update suggestions`, async (t) => {
      useMockMode(t);
      const { signalCalls } = stubProfileServices(t, { profile, signal: "many" });
      const result = await home(actor);
      assert.equal(result.state, "success");
      assert.equal(signalCalls.length, 0);
    });
  }
}

/* ── SC-02 (a)：成功路径，账户卡与 include 对照逐项相等 ─────────────── */

const SUCCESS_SETUPS: Array<[string, Setup]> = [
  ["persisted profile, many suggestions", { profile: "persisted", signal: "many" }],
  ["persisted profile, no suggestions", { profile: "persisted", signal: "none" }],
  ["persisted profile, suggestions throw at runtime", { profile: "persisted", signal: "throw" }],
  ["no persisted profile (actor onboarding seed), many suggestions", { profile: "no-profile", signal: "many" }],
  ["no persisted profile, suggestions throw at runtime", { profile: "no-profile", signal: "throw" }],
];

for (const [name, setup] of SUCCESS_SETUPS) {
  test(`SC-02 home account card is unchanged: ${name}`, async (t) => {
    useMockMode(t);
    const { arm, signalCalls } = stubProfileServices(t, setup);
    for (const actor of [withSubject, noSubject]) {
      arm();
      const reference = await loadAppProfileRouteViewModel(profileActor(actor));
      assert.equal(signalCalls.length, 1, "the include reference really computed suggestions");
      arm();
      const result = await home(actor);
      assert.equal(signalCalls.length, 0);
      assert.equal(result.state, "success");
      if (result.state !== "success") return;
      assert.deepEqual(result.home.account, expectedAccount(reference));
    }
  });
}

/* ── SC-02 (b)：失败路径，route-state 与 include 对照逐项相等 ────────── */

const FAILURE_SETUPS: Array<[string, Setup, keyof typeof ACTORS]> = [
  ["signal service resolution failure", { signal: "unresolved" }, "withSubject"],
  ["extraction service resolution failure", { extraction: "unresolved" }, "withSubject"],
  ["profile service resolution failure", { profile: "unresolved" }, "withSubject"],
  ["getProfile throws", { profile: "throw" }, "withSubject"],
  ["getProfile returns success:false", { profile: "fail" }, "withSubject"],
  ["onboarding policy unreadable", { profile: "onboarding-invalid" }, "withSubject"],
  ["no actor and no persisted profile", { profile: "no-profile" }, "none"],
];

for (const [name, setup, actorName] of FAILURE_SETUPS) {
  test(`SC-02 home failure page is unchanged: ${name}`, async (t) => {
    useMockMode(t);
    const actor = ACTORS[actorName];
    const { arm, signalCalls } = stubProfileServices(t, setup);
    arm();
    const include = await loadAppProfileRouteViewModel(profileActor(actor));
    arm();
    const skip = await loadAppProfileRouteViewModel(profileActor(actor), { suggestions: "skip" });
    assert.deepEqual(skip, include, "skip keeps the profile failure byte-for-byte");
    arm();
    const result = await home(actor);
    assert.equal(signalCalls.length, 0);
    assert.equal(result.state, "route-state");
    if (result.state !== "route-state") return;
    assert.deepEqual(result.routeState, expectedProfileFailure(include));
  });
}

test("SC-02 a resolution failure still fails home even though home never uses the signal service", async (t) => {
  useMockMode(t);
  for (const setup of [{ signal: "unresolved" }, { extraction: "unresolved" }] as const) {
    const { arm } = stubProfileServices(t, setup);
    arm();
    const result = await home(withSubject);
    assert.equal(result.state, "route-state");
    if (result.state !== "route-state") return;
    assert.deepEqual(result.routeState.evidenceIds, [
      "PROFILE_ROUTE_FAILURE",
      "evidence:profile-route-service-resolution-failure",
    ]);
    t.mock.restoreAll();
  }
});

/* ── SC-03：资料页默认路径不变 ─────────────────────────────────────── */

test("SC-03 the profile route default path still lists suggestions exactly once with { actorId }", async (t) => {
  useMockMode(t);
  const { arm, signalCalls } = stubProfileServices(t, { profile: "persisted", signal: "many" });
  for (const controls of [undefined, {}, { suggestions: "include" as const }]) {
    arm();
    const route = await loadAppProfileRouteViewModel({ displayName: "Owner", id: "account:owner" }, controls);
    assert.equal(route.state, "success");
    assert.deepEqual(signalCalls, [{ actorId: "account:owner" }]);
  }
});

test("SC-03 suggestion fields on the default path: many / none / runtime throw", async (t) => {
  useMockMode(t);
  const expectations: Array<[SignalSetup, number, boolean]> = [
    ["many", 3, true],
    ["none", 0, false],
    ["throw", 0, false],
  ];
  for (const [signal, count, hasFirst] of expectations) {
    stubProfileServices(t, { profile: "persisted", signal });
    const route = await loadAppProfileRouteViewModel({ displayName: "Owner", id: "account:owner" });
    assert.equal(route.state, "success");
    if (route.state !== "success") return;
    assert.equal(route.profile.suggestionCount, count, signal);
    assert.equal(route.profile.firstSuggestion !== null, hasFirst, signal);
    if (signal === "throw") {
      assert.match(route.profile.reviewSummary, /suggestions are unavailable/);
    } else {
      assert.doesNotMatch(route.profile.reviewSummary, /suggestions are unavailable/);
    }
    t.mock.restoreAll();
  }
});

test("SC-03 skip only blanks the three suggestion fields; everything else matches the default path", async (t) => {
  useMockMode(t);
  for (const profile of ["persisted", "no-profile"] as const) {
    const { arm, signalCalls } = stubProfileServices(t, { profile, signal: "many" });
    arm();
    const include = await loadAppProfileRouteViewModel({ displayName: "Owner", id: "account:owner" });
    arm();
    const skip = await loadAppProfileRouteViewModel({ displayName: "Owner", id: "account:owner" }, { suggestions: "skip" });
    assert.equal(signalCalls.length, 0);
    assert.equal(include.state, "success");
    assert.equal(skip.state, "success");
    if (include.state !== "success" || skip.state !== "success") return;
    assert.equal(include.profile.suggestionCount, 3);
    const { firstSuggestion, reviewSummary, suggestionCount, ...rest } = skip.profile;
    const { firstSuggestion: _f, reviewSummary: _r, suggestionCount: _c, ...includeRest } = include.profile;
    assert.deepEqual(rest, includeRest, profile);
    assert.equal(firstSuggestion, null);
    assert.equal(suggestionCount, 0);
    assert.match(reviewSummary, /Optional profile suggestions are unavailable/);
    t.mock.restoreAll();
  }
});

test("SC-03 the profile editor page and the admin console do not opt out of suggestions", () => {
  const callers = [
    "app/(app)/app/profile/profile-0918/load-profile-editor-page.tsx",
    "app/(app)/app/admin/compose-app-admin-platform-from-previously-approved-mock-first-capabilities/admin-platform-route-view-model.ts",
  ];
  for (const path of callers) {
    const source = readFileSync(join(projectRoot, path), "utf8");
    assert.match(source, /loadAppProfileRouteViewModel\(/, path);
    assert.doesNotMatch(source, /suggestions:\s*"skip"/, path);
  }
  const homeSource = readFileSync(
    join(projectRoot, "app/(app)/app/home/compose-app-home-from-previously-approved-mock-first-capabilities/home-route-view-model.tsx"),
    "utf8",
  );
  assert.match(homeSource, /loadAppProfileRouteViewModel\(actor, \{ suggestions: "skip" \}\)/);
});
