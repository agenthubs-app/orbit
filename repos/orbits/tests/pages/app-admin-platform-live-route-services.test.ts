import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const liveDatabaseEnvKeys = [
  "ORBIT_EVENT_DATABASE_URL",
  "ORBIT_LIVE_DATABASE_URL",
  "ORBIT_DATABASE_URL",
] as const;
const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

async function withUnconfiguredLiveAdminPlatform<T>(
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

async function withMockAdminPlatform<T>(run: () => Promise<T>): Promise<T> {
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

test("/app/admin and /app/platform routes use a live-capable admin-platform loader", () => {
  const adminSource = source("app/(app)/app/admin/page.tsx");
  const adminEventsSource = source("app/(app)/app/admin/events/page.tsx");
  const platformSource = source("app/(app)/app/platform/page.tsx");
  const sharedModelSource = source(
    "app/(app)/app/orbit-admin-platform-route-view-model.ts",
  );

  for (const pageSource of [adminSource, adminEventsSource, platformSource]) {
    assert.match(pageSource, /loadAppAdminPlatformRouteViewModel/);
    assert.match(pageSource, /StateView/);
    assert.match(pageSource, /await auth\(\)/);
    assert.match(pageSource, /redirect\("\/app\/account\/login/);
    assert.match(pageSource, /id: session\.user\.id/);
    assert.doesNotMatch(pageSource, /searchParams/);
    assert.doesNotMatch(pageSource, /getOrbitAdminViewModel/);
    assert.doesNotMatch(pageSource, /getOrbitPlatformViewModel/);
  }

  assert.doesNotMatch(
    sharedModelSource,
    /getOrbitAdminViewModel|getOrbitPlatformViewModel|getOrbitHybridRouteData/,
  );
});

test("admin only renders sourced records and platform fails closed without a provider", () => {
  const adminSource = source("app/(app)/app/admin/orbit-real-admin.tsx");
  const platformPageSource = source("app/(app)/app/platform/page.tsx");
  const routeModelSource = source(
    "app/(app)/app/admin/compose-app-admin-platform-from-previously-approved-mock-first-capabilities/admin-platform-route-view-model.ts",
  );
  const adminDashboardSource = adminSource.slice(
    adminSource.indexOf("function AdminDashContent"),
    adminSource.indexOf("function MemberRow"),
  );

  assert.match(adminDashboardSource, /Source records · read only/);
  assert.match(adminDashboardSource, /Data boundary/);
  assert.doesNotMatch(
    adminDashboardSource,
    /Registration funnel|Live activity|Total registered|Checked in|Matched|Capacity|Run AI matching|Export|Invite/,
  );
  assert.doesNotMatch(
    routeModelSource,
    /ownerEmail|platformViewModel|reviewQueue|adminFeed|totalRegistered|totalCheckedIn|totalMatched/,
  );
  assert.match(
    routeModelSource,
    /PLATFORM_ADMIN_PROVIDER_UNAVAILABLE/,
  );
  assert.match(routeModelSource, /platform-admin-role:unverified/);
  assert.doesNotMatch(platformPageSource, /OrbitRealPlatform|routeModel\.platform/);
  assert.equal(
    existsSync(
      join(projectRoot, "app/(app)/app/platform/orbit-real-platform.tsx"),
    ),
    false,
  );
});

test("admin entry and event management do not claim unexecuted email or writes", () => {
  const adminSource = source("app/(app)/app/admin/orbit-real-admin.tsx");

  assert.match(adminSource, /Continue to secure sign in/);
  assert.match(adminSource, /actor-scoped event source records/);
  assert.match(adminSource, /dedicated providers are connected/);
  assert.match(
    adminSource,
    /\/app\/account\/login\?next=\$\{encodeURIComponent\(dest\)\}/,
  );
  assert.match(adminSource, /Source events · read only/);
  assert.doesNotMatch(
    adminSource,
    /Login email sent|Send sign-in email|Enter admin \(demo\)|Skip · enter admin directly \(demo\)/,
  );
  assert.doesNotMatch(
    adminSource,
    /function CreateEventModal|Create event|Invite member/,
  );
  assert.doesNotMatch(
    adminSource,
    /Manage registration, check-in|Review events, manage organizer accounts|访问管理|活动配置/,
  );
});

test("admin returns actor-scoped source records while platform remains unavailable in mock mode", async () => {
  await withMockAdminPlatform(async () => {
    const { loadAppAdminPlatformRouteViewModel } = await import(
      "../../app/(app)/app/admin/compose-app-admin-platform-from-previously-approved-mock-first-capabilities/admin-platform-route-view-model"
    );
    const routeModel = await loadAppAdminPlatformRouteViewModel({
      actor: {
        displayName: "Admin test actor",
        email: "admin@example.invalid",
        id: "actor:admin-platform-test",
      },
    });

    assert.equal(routeModel.state, "success");

    if (routeModel.state === "success") {
      assert.equal(routeModel.admin.adminEvents[0]?.name, "Climate founders dinner");
      assert.deepEqual(
        routeModel.admin.adminStats.map((stat) => stat.label),
        ["活动记录", "即将开始", "进行中", "已结束"],
      );
      assert.ok(routeModel.admin.adminAccount.name);
      assert.doesNotMatch(routeModel.admin.adminAccount.email, /@orbit\.local$/);
      assert.equal("adminFunnel" in routeModel.admin, false);
      assert.equal("adminFeed" in routeModel.admin, false);
      assert.equal("adminMembers" in routeModel.admin, false);
      assert.ok(
        routeModel.admin.adminEvents.every(
          (event) =>
            !("registered" in event) &&
            !("checkedin" in event) &&
            !("matched" in event) &&
            !("cap" in event),
        ),
      );
    }

    const platformModel = await loadAppAdminPlatformRouteViewModel({
      actor: {
        displayName: "Admin test actor",
        email: "admin@example.invalid",
        id: "actor:admin-platform-test",
      },
      surface: "platform",
    });

    assert.equal(platformModel.state, "route-state");
    assert.equal(
      platformModel.routeState.errorCode,
      "PLATFORM_ADMIN_PROVIDER_UNAVAILABLE",
    );
    assert.match(platformModel.routeState.copy.title, /Platform admin is unavailable/);
  });
});

test("admin and platform loaders fail visibly when live storage is unconfigured", async () => {
  await withUnconfiguredLiveAdminPlatform(async () => {
    const { loadAppAdminPlatformRouteViewModel } = await import(
      "../../app/(app)/app/admin/compose-app-admin-platform-from-previously-approved-mock-first-capabilities/admin-platform-route-view-model"
    );
    for (const surface of ["admin", "platform"] as const) {
      const routeModel = await loadAppAdminPlatformRouteViewModel({
        actor: {
          displayName: "Admin test actor",
          email: "admin@example.invalid",
          id: "actor:admin-platform-live-test",
        },
        surface,
      });

      assert.equal(routeModel.state, "route-state");
      if (routeModel.state === "route-state") {
        assert.equal(routeModel.routeState.scenario, "failure");
        assert.match(
          routeModel.routeState.copy.title,
          surface === "platform"
            ? /Platform admin is unavailable/
            : /Admin workspace could not load/,
        );
        if (surface === "platform") {
          assert.equal(
            routeModel.routeState.errorCode,
            "PLATFORM_ADMIN_PROVIDER_UNAVAILABLE",
          );
        }
      }
    }
  });
});

test("admin-platform public query values cannot select Event fixtures or acceptance", async () => {
  await withMockAdminPlatform(async () => {
    const module = await import(
      "../../app/(app)/app/admin/compose-app-admin-platform-from-previously-approved-mock-first-capabilities/admin-platform-route-view-model"
    );
    const actor = {
      displayName: "Admin test actor",
      email: "admin@example.invalid",
      id: "actor:admin-platform-query-test",
    };
    const publicInput = {
      actor,
      action: "accept-top-event",
      scenario: "failure",
    } as unknown as Parameters<
      typeof module.loadAppAdminPlatformRouteViewModel
    >[0];
    const publicResult =
      await module.loadAppAdminPlatformRouteViewModel(publicInput);
    const controlledResult = await module.loadAppAdminPlatformRouteViewModel({
      actor,
      controls: { scenario: "empty" },
    });

    assert.equal(publicResult.state, "success");
    assert.equal(controlledResult.state, "route-state");
    if (controlledResult.state === "route-state") {
      assert.equal(controlledResult.routeState.scenario, "empty");
    }
  });
});
