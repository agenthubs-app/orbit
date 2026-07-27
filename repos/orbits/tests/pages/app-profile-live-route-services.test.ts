import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadAppProfileRouteViewModel } from "../../app/(app)/app/profile/compose-app-profile-from-previously-approved-mock-first-capabilities/profile-route-view-model";
import { resolveAppProfileRouteServices } from "../../app/(app)/app/profile/compose-app-profile-from-previously-approved-mock-first-capabilities/profile-service-factory";

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
  assert.match(profileSource, /\/api\/profile\/extractions\/resume/);
  assert.match(profileSource, /\/api\/profile\/extractions\/business-card/);
  assert.match(profileSource, /type="file"/);
  assert.match(profileSource, /Your profile was not changed/);
  assert.doesNotMatch(profileSource, /fakeExtract|window\.setTimeout/);
  assert.doesNotMatch(profileSource, /setMessage\(t\(\{ en: "Saved\."/);
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
  assert.doesNotMatch(pageSource, /buildFounderProfileViewModel/);
  assert.doesNotMatch(
    `${pageSource}\n${adapterSource}`,
    /Orbit 的创始人|結城 航太郎|有真实 AI 导入需求的企业/,
  );
});

test("app profile success model keeps editable identity fields for the real profile UI", async () => {
  await withMockProfile(async () => {
    const viewModel = await loadAppProfileRouteViewModel();

    assert.equal(viewModel.state, "success");

    if (viewModel.state === "success") {
      const profile = viewModel.profile.profile as Record<string, unknown>;

      assert.equal(typeof profile.organization, "string");
      assert.equal(typeof profile.role, "string");
      assert.ok(Array.isArray(profile.targetRelationshipTypes));
      assert.ok(Array.isArray(profile.preferredIntroChannels));
    }
  });
});
