import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadAppProfileRouteViewModel } from "../../app/(app)/app/profile/compose-app-profile-from-previously-approved-mock-first-capabilities/profile-route-view-model";
import { resolveAppProfileRouteServices } from "../../app/(app)/app/profile/compose-app-profile-from-previously-approved-mock-first-capabilities/profile-service-factory";
import { profileRouteToOrbitProfileViewModel } from "../../app/(app)/app/profile/compose-app-profile-from-previously-approved-mock-first-capabilities/profile-view-model-adapter";
import { profileReadbackMatches } from "../../app/(app)/app/profile/profile-0918/use-profile-editor-session";
import type {
  ManualProfileUpdateInput,
  ProfilePayload,
} from "../../features/profile/contract";

const liveDatabaseEnvKeys = [
  "ORBIT_EVENT_DATABASE_URL",
  "ORBIT_LIVE_DATABASE_URL",
  "ORBIT_DATABASE_URL",
] as const;
const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

async function withUnconfiguredLiveProfile<T>(
  run: () => Promise<T>,
): Promise<T> {
  const previousMode = process.env.ORBIT_MODULE_MODE;
  const previousDatabaseEnv = new Map<string, string | undefined>(
    liveDatabaseEnvKeys.map((key) => [key, process.env[key]]),
  );

  try {
    process.env.ORBIT_MODULE_MODE = "live";
    for (const key of liveDatabaseEnvKeys) {
      delete process.env[key];
    }

    return await run();
  } finally {
    if (previousMode === undefined) {
      delete process.env.ORBIT_MODULE_MODE;
    } else {
      process.env.ORBIT_MODULE_MODE = previousMode;
    }

    for (const key of liveDatabaseEnvKeys) {
      const previousValue = previousDatabaseEnv.get(key);

      if (previousValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previousValue;
      }
    }
  }
}

async function withMockProfile<T>(run: () => Promise<T>): Promise<T> {
  const previousMode = process.env.ORBIT_MODULE_MODE;

  try {
    process.env.ORBIT_MODULE_MODE = "mock";

    return await run();
  } finally {
    if (previousMode === undefined) {
      delete process.env.ORBIT_MODULE_MODE;
    } else {
      process.env.ORBIT_MODULE_MODE = previousMode;
    }
  }
}

test("app profile route service bundle resolves all child services in live mode", () => {
  const resolution = resolveAppProfileRouteServices("live");

  assert.equal(
    resolution.success,
    true,
    resolution.success === false ? resolution.error.message : "",
  );
  assert.equal(resolution.mode, "live");
});

test("app profile route loader returns a controlled live failure when storage is unconfigured", async () => {
  await withUnconfiguredLiveProfile(async () => {
    const viewModel = await loadAppProfileRouteViewModel({
      displayName: "Live profile test actor",
      id: "account:live-profile-test",
    });

    assert.equal(viewModel.state, "route-state");

    if (viewModel.state === "route-state") {
      assert.equal(viewModel.routeState.scenario, "failure");
      assert.equal(
        viewModel.routeState.errorCode,
        "PROFILE_LIVE_STORE_UNCONFIGURED",
      );
      assert.match(
        viewModel.routeState.evidenceIds.join(" "),
        /PROFILE_LIVE_STORE_UNCONFIGURED|evidence:profile_live_store_unconfigured/,
      );
      assert.equal(
        viewModel.routeState.copy.description,
        "资料暂时无法加载，请稍后重试。 / Your profile is temporarily unavailable. Please try again later.",
      );
      assert.equal(
        viewModel.routeState.copy.guardrail,
        "返回会重新读取资料，不会提交资料修改或接受建议。 / Returning reloads the profile without submitting edits or accepting suggestions.",
      );
      assert.equal(
        viewModel.routeState.copy.nextStep,
        "请重新打开资料页重试；若需要登录，请先登录。 / Reopen your profile to try again. Sign in if prompted.",
      );
      assert.equal(
        viewModel.routeState.copy.purpose,
        "显示资料加载的恢复方式。 / Show how to retry loading the profile.",
      );
      assert.equal(viewModel.routeState.recoveryActions[0]?.id, "profile-failure-return");
      assert.equal(viewModel.routeState.recoveryActions[0]?.href, "/app/profile");
      assert.equal(
        viewModel.routeState.recoveryActions[0]?.label,
        "重试加载资料 / Retry loading profile",
      );
      assert.equal(
        viewModel.routeState.recoveryActions[0]?.recoveryCopy,
        "重新打开资料页，重试读取；此操作不会保存修改。 / Reopen the profile page to retry loading it. This action does not save edits.",
      );
    }
  });
});

test("/app/profile page renders the real Orbit profile editor", () => {
  const pageSource = source("app/(app)/app/profile/page.tsx");
  const profileSource = source("app/(app)/app/profile/orbit-real-profile.tsx");
  const editorAdapterSource = source("app/(app)/app/profile/profile-editor-adapter.ts");
  const profileModelSource = source(
    "app/(app)/app/orbit-profile-route-view-model.ts",
  );
  const routeSource = source(
    "app/(app)/app/profile/compose-app-profile-from-previously-approved-mock-first-capabilities/profile-route-view-model.ts",
  );

  assert.match(pageSource, /loadAppProfileRouteViewModel/);
  assert.match(pageSource, /profileRouteToOrbitProfileEditorViewModel/);
  assert.match(pageSource, /OrbitRealProfile/);
  assert.match(pageSource, /StateView/);
  assert.doesNotMatch(pageSource, /AppProfileCommandCenter/);
  assert.match(profileSource, /data-orbit-real-page="profile"/);
  assert.match(pageSource, /searchParams/);
  assert.match(pageSource, /onboardingNext/);
  assert.doesNotMatch(routeSource, /readSearchParam/);
  assert.doesNotMatch(routeSource, /complete-profile-field/);
  assert.doesNotMatch(routeSource, /AppProfileActionViewModel/);
  assert.doesNotMatch(
    profileModelSource,
    /getOrbitProfileViewModel|getOrbitHybridRouteData/,
  );
});

test("app profile route scenarios are available only through explicit internal controls", async () => {
  const viewModel = await loadAppProfileRouteViewModel(undefined, {
    scenario: "empty",
  });

  assert.equal(viewModel.state, "route-state");
  if (viewModel.state === "route-state") {
    assert.equal(viewModel.routeState.scenario, "empty");
  }
});

test("internal failure route copy stays owner neutral", async () => {
  const viewModel = await loadAppProfileRouteViewModel(undefined, {
    scenario: "failure",
  });

  assert.equal(viewModel.state, "route-state");
  if (viewModel.state === "route-state") {
    const visibleCopy = [
      viewModel.routeState.copy.description,
      viewModel.routeState.copy.guardrail,
      viewModel.routeState.copy.nextStep,
      viewModel.routeState.copy.purpose,
      ...viewModel.routeState.recoveryActions.flatMap((action) => [
        action.label,
        action.recoveryCopy,
      ]),
    ].join(" ");

    assert.match(visibleCopy, /Your profile is temporarily unavailable/);
    assert.doesNotMatch(visibleCopy, /Ari/);
    assert.equal(viewModel.routeState.errorCode, "PROFILE_SIGNAL_REVIEW_QUEUE_FAILED");
  }
});

test("profile editor uses API extraction and save readback instead of timed success", () => {
  const profileSource = source("app/(app)/app/profile/orbit-real-profile.tsx");
  // Session logic (load / save / readback / extraction) lives in the hook since 个人中心 task 1.
  const sessionSource = source("app/(app)/app/profile/profile-0918/use-profile-editor-session.ts");
  const editorAdapterSource = source("app/(app)/app/profile/profile-editor-adapter.ts");

  assert.match(sessionSource, /fetch\("\/api\/profile"/);
  assert.match(sessionSource, /method: "PUT"/);
  assert.match(sessionSource, /cache: "no-store"/);
  assert.match(sessionSource, /profileReadbackMatches/);
  assert.match(editorAdapterSource, /sameHandles/);
  assert.match(editorAdapterSource, /sameList\(saved\.offering/);
  assert.match(sessionSource, /\/api\/profile\/extractions\/resume/);
  assert.match(profileSource, /Structured text extract/);
  assert.match(profileSource, /href="\/app\/contacts\/new"/);
  assert.doesNotMatch(profileSource, /type="file"/);
  assert.doesNotMatch(profileSource, /AI text extract/);
  assert.match(sessionSource, /Your profile was not changed/);
  assert.doesNotMatch(profileSource, /fakeExtract|window\.setTimeout/);
  assert.doesNotMatch(sessionSource, /fakeExtract|window\.setTimeout/);
  assert.doesNotMatch(profileSource, /setMessage\(t\(\{ en: "Saved\."/);
  assert.doesNotMatch(sessionSource, /setMessage\(t\(\{ en: "Saved\."/);
});

test("profile editor exposes structured industries and custom tag entry", () => {
  const profileSource = source("app/(app)/app/profile/orbit-real-profile.tsx");

  assert.match(profileSource, /Primary industry/);
  assert.match(profileSource, /Secondary industry/);
  assert.match(profileSource, /Existing industry text is preserved/);
  assert.doesNotMatch(profileSource, /en: "Industry", zh: "行业"/);
  assert.match(profileSource, /listSecondaryIndustries/);
  assert.match(profileSource, /Enter a specific item/);
  assert.match(profileSource, /添加\$\{label\}项目/);
  assert.match(profileSource, /const allOptions = Array\.from\(new Set/);
  assert.match(profileSource, /maxLength=\{80\}/);
});

test("profile save verification rejects a partial readback", () => {
  const update: ManualProfileUpdateInput = {
    bio: "中文多词资料",
    displayName: "审计甲",
    handles: {
      email: "audit@example.invalid",
      lineId: "audit-line",
      wechatId: "audit-wechat",
    },
    headline: "验证刷新回读",
    homeMarket: "东京企业软件",
    industry: "企业软件",
    primaryIndustryId: "technology_internet",
    secondaryIndustryId: "technology_internet.enterprise_software",
    offering: ["跨端验证"],
    organization: "轨道质量实验室",
    preferredFollowUpWindow: "",
    preferredIntroChannels: ["书面引荐"],
    relationshipGoal: "验证账户隔离",
    role: "质量负责人",
    seeking: ["设计伙伴"],
    targetRelationshipTypes: ["产品负责人"],
    topics: ["数据完整性"],
  };
  const payload = {
    profile: {
      ...update,
      id: "profile:audit",
      updatedAt: "2026-07-28T00:00:00.000Z",
    },
  } as ProfilePayload;

  assert.equal(profileReadbackMatches(update, payload), true);
  assert.equal(
    profileReadbackMatches(update, {
      ...payload,
      profile: { ...payload.profile!, secondaryIndustryId: "technology_internet.cybersecurity" },
    }),
    false,
  );
  assert.equal(
    profileReadbackMatches(update, {
      ...payload,
      profile: {
        ...payload.profile!,
        handles: { ...payload.profile!.handles, wechatId: undefined },
      },
    }),
    false,
  );
  assert.equal(
    profileReadbackMatches(update, {
      ...payload,
      profile: { ...payload.profile!, topics: [] },
    }),
    false,
  );
});

test("/app/profile maps actor-scoped profile data without hardcoded founder identity", () => {
  const pageSource = source("app/(app)/app/profile/page.tsx");
  const adapterSource = source(
    "app/(app)/app/profile/compose-app-profile-from-previously-approved-mock-first-capabilities/profile-view-model-adapter.ts",
  );

  assert.match(pageSource, /profileRouteToOrbitProfileEditorViewModel/);
  assert.match(adapterSource, /fullName: profile\.displayName/);
  assert.match(adapterSource, /const offering = \[\.\.\.\(profile\.offering/);
  assert.match(adapterSource, /const seeking = \[\.\.\.\(profile\.seeking/);
  assert.match(adapterSource, /topics: profileTopics/);
  assert.doesNotMatch(adapterSource, /const seekingTags = Array\.from/);
  assert.doesNotMatch(adapterSource, /const topics = Array\.from/);
  assert.doesNotMatch(pageSource, /buildFounderProfileViewModel/);
  assert.doesNotMatch(
    `${pageSource}\n${adapterSource}`,
    /Orbit 的创始人|結城 航太郎|有真实 AI 导入需求的企业/,
  );
});

test("profile adapter does not mix relationship goals or markets into editable tag fields", async () => {
  await withMockProfile(async () => {
    const routeModel = await loadAppProfileRouteViewModel({
      displayName: "Audit Actor",
      email: "audit.actor@example.invalid",
      id: "account:audit-actor",
    });

    assert.equal(routeModel.state, "success");
    if (routeModel.state !== "success") return;

    const viewModel = profileRouteToOrbitProfileViewModel(routeModel);

    assert.deepEqual(viewModel.profile.offering, []);
    assert.deepEqual(viewModel.profile.seeking, []);
    assert.deepEqual(viewModel.profile.topics, []);
    assert.deepEqual(viewModel.offeringTags, []);
    assert.deepEqual(viewModel.seekingTags, []);
    assert.deepEqual(viewModel.topics, []);
  });
});

test("app profile success model keeps editable identity fields for the real profile UI", async () => {
  await withMockProfile(async () => {
    const viewModel = await loadAppProfileRouteViewModel({
      displayName: "Audit Actor",
      email: "audit.actor@example.invalid",
      id: "account:audit-actor",
    });

    assert.equal(viewModel.state, "success");

    if (viewModel.state === "success") {
      const profile = viewModel.profile.profile as Record<string, unknown>;

      assert.equal(typeof profile.organization, "string");
      assert.equal(typeof profile.role, "string");
      assert.deepEqual(profile.handles, {
        email: "audit.actor@example.invalid",
      });
      assert.ok(Array.isArray(profile.targetRelationshipTypes));
      assert.ok(Array.isArray(profile.preferredIntroChannels));
    }
  });
});
