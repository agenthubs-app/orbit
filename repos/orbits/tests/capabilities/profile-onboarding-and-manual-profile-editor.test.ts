/**
 * Profile onboarding 与手动编辑 mock 的契约测试。
 *
 * 锁住 profile 读取、编辑输入、错误码和页面可视化。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  PROFILE_ERROR_CODES,
  PROFILE_ERROR_DEFINITIONS,
} from "../../features/profile/contract";
import {
  mockEmptyProfileFixture,
  mockProfileFixture,
  mockProfileUpdateInput,
} from "../../features/profile/fixtures";
import { createMockProfileService } from "../../features/profile/mock-service";
import * as profileOnboardingDebugViewModule from "../../features/profile/profile-onboarding-and-manual-profile-editor/debug-view";
import * as profileRoute from "../../app/api/profile/route";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");
const profileOnboardingDebugView =
  profileOnboardingDebugViewModule["module.exports"] ??
  profileOnboardingDebugViewModule.default ??
  profileOnboardingDebugViewModule;
const {
  ProfileOnboardingCapabilityDemo,
  PROFILE_ONBOARDING_CAPABILITY_SLUG,
} = profileOnboardingDebugView;

test("profile contract exposes onboarding, update, completeness, and controlled error definitions", () => {
  const service = createMockProfileService();
  const onboarding = service.getProfile();
  const empty = service.getProfile({ scenario: "empty" });
  const pending = service.getPendingManualReview();
  const failure = service.updateProfile({ displayName: "" });

  assert.deepEqual(PROFILE_ERROR_CODES, [
    "PROFILE_REQUIRED",
    "PROFILE_VALIDATION_FAILED",
    "PROFILE_UPDATE_PENDING",
    "PROFILE_LIVE_STORE_UNCONFIGURED",
  ]);
  assert.equal(
    PROFILE_ERROR_DEFINITIONS.PROFILE_VALIDATION_FAILED.appCode,
    "VALIDATION_ERROR",
  );

  assert.equal(onboarding.success, true);
  assert.equal(onboarding.data.state, "success");
  assert.equal(onboarding.data.profile.id, mockProfileFixture.profile.id);
  assert.equal(onboarding.data.profile.displayName, "Ari Lane");
  assert.equal(onboarding.data.completeness.score, 83);
  assert.deepEqual(onboarding.data.completeness.missingFields, [
    "preferredIntroChannels",
  ]);
  assert.deepEqual(onboarding.data.provenance.evidenceIds, [
    "evidence:profile-manual-onboarding",
    "evidence:profile-editor-demo-save",
  ]);

  assert.equal(empty.success, true);
  assert.equal(empty.data.state, "empty");
  assert.equal(empty.data.profile, null);
  assert.equal(empty.data.completeness.score, 0);
  assert.equal(
    empty.data.provenance.source,
    mockEmptyProfileFixture.provenance.source,
  );

  assert.equal(pending.success, true);
  assert.equal(pending.data.state, "pending");
  assert.equal(pending.data.profile.displayName, "Ari Lane");

  assert.equal(failure.success, false);
  assert.equal(failure.error.code, "PROFILE_VALIDATION_FAILED");
  assert.equal(failure.error.appCode, "VALIDATION_ERROR");
});

test("mock profile service is deterministic and never calls external providers", () => {
  const service = createMockProfileService();

  assert.deepEqual(service.getProfile(), service.getProfile());
  assert.deepEqual(
    service.updateProfile(mockProfileUpdateInput),
    service.updateProfile(mockProfileUpdateInput),
  );
  assert.deepEqual(
    service.getProfile({ scenario: "unknown-scenario" }),
    service.getProfile(),
  );

  for (const filePath of [
    "features/profile/contract.ts",
    "features/profile/fixtures.ts",
    "features/profile/service.ts",
    "features/profile/mock-service.ts",
  ]) {
    const source = readFileSync(join(projectRoot, filePath), "utf8");

    assert.doesNotMatch(source, /\bfetch\s*\(/);
    assert.doesNotMatch(source, /Supabase|createClient|oauth/i);
    assert.doesNotMatch(source, /XMLHttpRequest|WebSocket|EventSource/);
    assert.doesNotMatch(source, /navigator|localStorage|indexedDB/);
    assert.doesNotMatch(source, /calendar|email|notification|provider call/i);
    assert.doesNotMatch(source, /openai|anthropic|ai provider/i);
  }
});

test("profile API routes return stable envelopes for GET and PUT probes", async () => {
  const getResponse = await profileRoute.GET(
    new Request("https://orbit.local/api/profile"),
  );
  const putResponse = await profileRoute.PUT(
    new Request("https://orbit.local/api/profile", {
      method: "PUT",
      body: JSON.stringify(mockProfileUpdateInput),
      headers: {
        "content-type": "application/json",
      },
    }),
  );

  assert.equal(getResponse.status, 200);
  assert.equal(getResponse.headers.get("cache-control"), "no-store");
  assert.equal(getResponse.headers.get("x-orbit-feature-mode"), "mock");
  assert.deepEqual(await getResponse.json(), {
    success: true,
    data: createMockProfileService().getProfile().data,
  });

  assert.equal(putResponse.status, 200);
  assert.equal(putResponse.headers.get("cache-control"), "no-store");
  assert.deepEqual(await putResponse.json(), {
    success: true,
    data: createMockProfileService().updateProfile(mockProfileUpdateInput).data,
  });
});

test("profile API routes document empty and controlled failure paths", async () => {
  const emptyResponse = await profileRoute.GET(
    new Request("https://orbit.local/api/profile?scenario=empty"),
  );
  const failureResponse = await profileRoute.PUT(
    new Request("https://orbit.local/api/profile", {
      method: "PUT",
      body: JSON.stringify({ displayName: "" }),
      headers: {
        "content-type": "application/json",
      },
    }),
  );

  assert.equal(emptyResponse.status, 200);
  assert.deepEqual(await emptyResponse.json(), {
    success: true,
    data: createMockProfileService().getProfile({ scenario: "empty" }).data,
  });

  assert.equal(failureResponse.status, 400);
  assert.deepEqual(await failureResponse.json(), {
    success: false,
    error: {
      code: "VALIDATION_ERROR",
      message: "A display name is required before the mock profile can save.",
      context: {
        boundary: "developer-admin",
        mode: "mock",
        privacy: "no-relationship-data",
        profileErrorCode: "PROFILE_VALIDATION_FAILED",
        provenance:
          "Mock profile failure came from deterministic fixture rules.",
        service: "profile-onboarding-and-manual-profile-editor",
      },
    },
  });
});

test("profile onboarding debug route renders success, empty, pending, and failure states", () => {
  const html = renderToStaticMarkup(
    React.createElement(ProfileOnboardingCapabilityDemo),
  );
  const pageSource = readFileSync(
    join(projectRoot, "app/dev/capabilities/[slug]/page.tsx"),
    "utf8",
  );

  assert.equal(
    PROFILE_ONBOARDING_CAPABILITY_SLUG,
    "profile-onboarding-and-manual-profile-editor",
  );
  assert.match(pageSource, /PROFILE_ONBOARDING_CAPABILITY_SLUG/);
  assert.match(pageSource, /ProfileOnboardingCapabilityDemo/);

  assert.match(html, /Profile onboarding and manual profile editor/);
  assert.match(html, /Success state/);
  assert.match(html, /Empty state/);
  assert.match(html, /Pending state/);
  assert.match(html, /Failure state/);
  assert.match(html, /Ari Lane/);
  assert.match(html, /relationship operating system/);
  assert.match(html, /83% complete/);
  assert.match(html, /PROFILE_VALIDATION_FAILED/);
  assert.match(html, /Mock manual profile editor controls/);
  assert.match(html, /name="displayName"/);
  assert.match(html, /name="relationshipGoal"/);
  assert.match(html, /name="preferredFollowUpWindow"/);
  assert.match(html, /Profile-informed follow-up/);
  assert.match(html, /48 hours/);
  assert.match(html, /warm intro/);
  assert.match(html, /GET \/api\/profile/);
  assert.match(html, /PUT \/api\/profile/);
  assert.match(
    html,
    /features\/profile\/profile-onboarding-and-manual-profile-editor\/LIVE_IMPLEMENTATION\.md/,
  );
});

test("profile live handoff covers replacement requirements", () => {
  const doc = readFileSync(
    join(
      projectRoot,
      "features/profile/profile-onboarding-and-manual-profile-editor/LIVE_IMPLEMENTATION.md",
    ),
    "utf8",
  );

  assert.match(doc, /Live service and provider files/i);
  assert.match(doc, /Switch mechanism/i);
  assert.match(doc, /Required env vars and permissions/i);
  assert.match(doc, /Privacy and provenance constraints/i);
  assert.match(doc, /Replacement tests/i);
  assert.match(doc, /features\/profile\/service\.ts/);
  assert.match(doc, /features\/profile\/mock-service\.ts/);
  assert.match(doc, /app\/api\/profile\/route\.ts/);
  assert.match(doc, /ORBIT_PROFILE_DATABASE_URL/);
  assert.match(doc, /source and evidence provenance/i);
});
