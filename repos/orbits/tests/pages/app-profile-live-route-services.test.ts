import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadAppProfileRouteViewModel } from "../../app/(app)/app/profile/compose-app-profile-from-previously-approved-mock-first-capabilities/profile-route-view-model";
import { resolveAppProfileRouteServices } from "../../app/(app)/app/profile/compose-app-profile-from-previously-approved-mock-first-capabilities/profile-service-factory";
import { profileRouteToOrbitProfileViewModel } from "../../app/(app)/app/profile/compose-app-profile-from-previously-approved-mock-first-capabilities/profile-view-model-adapter";
import { profileReadbackMatches } from "../../app/(app)/app/profile/orbit-real-profile";
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
    const viewModel = await loadAppProfileRouteViewModel(undefined, {
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
    }
  });
});

test("/app/profile page renders the real Orbit profile editor", () => {
  const pageSource = source("app/(app)/app/profile/page.tsx");
  const profileSource = source("app/(app)/app/profile/orbit-real-profile.tsx");

  assert.match(pageSource, /loadAppProfileRouteViewModel/);
  assert.match(pageSource, /profileRouteToOrbitProfileViewModel/);
  assert.match(pageSource, /OrbitRealProfile/);
  assert.match(pageSource, /StateView/);
  assert.doesNotMatch(pageSource, /AppProfileCommandCenter/);
  assert.match(profileSource, /data-orbit-real-page="profile"/);
});

test("profile editor uses API extraction and save readback instead of timed success", () => {
  const profileSource = source("app/(app)/app/profile/orbit-real-profile.tsx");

  assert.match(profileSource, /fetch\("\/api\/profile"/);
  assert.match(profileSource, /method: "PUT"/);
  assert.match(profileSource, /cache: "no-store"/);
  assert.match(profileSource, /profileReadbackMatches/);
  assert.match(profileSource, /saved\.handles\?\.wechatId/);
  assert.match(profileSource, /sameList\(saved\.offering/);
  assert.match(profileSource, /\/api\/profile\/extractions\/resume/);
  assert.match(profileSource, /Structured text extract/);
  assert.match(profileSource, /href="\/app\/contacts\/new"/);
  assert.doesNotMatch(profileSource, /type="file"/);
  assert.doesNotMatch(profileSource, /AI text extract/);
  assert.match(profileSource, /Your profile was not changed/);
  assert.doesNotMatch(profileSource, /fakeExtract|window\.setTimeout/);
  assert.doesNotMatch(profileSource, /setMessage\(t\(\{ en: "Saved\."/);
});

test("profile editor exposes free-text industry and custom tag entry", () => {
  const profileSource = source("app/(app)/app/profile/orbit-real-profile.tsx");

  assert.doesNotMatch(profileSource, /<select/);
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

  assert.match(pageSource, /profileRouteToOrbitProfileViewModel/);
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
    const routeModel = await loadAppProfileRouteViewModel(undefined, {
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
    const viewModel = await loadAppProfileRouteViewModel(undefined, {
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
