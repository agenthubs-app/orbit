import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";

import { loadAppFollowupsRouteViewModel } from "../../app/(app)/app/followups/compose-app-followups-from-previously-approved-mock-first-capabilities/followups-route-view-model";
import { resolveAppFollowupsRouteServices } from "../../app/(app)/app/followups/compose-app-followups-from-previously-approved-mock-first-capabilities/followups-service-factory";
import { followupsRouteToOrbitScheduleViewModel } from "../../app/(app)/app/followups/compose-app-followups-from-previously-approved-mock-first-capabilities/followups-view-model-adapter";

const liveDatabaseEnvKeys = [
  "ORBIT_EVENT_DATABASE_URL",
  "ORBIT_LIVE_DATABASE_URL",
  "ORBIT_DATABASE_URL",
] as const;
const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

async function withUnconfiguredLiveFollowups<T>(
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

test("app followups route service bundle resolves all child services in live mode", () => {
  const resolution = resolveAppFollowupsRouteServices("live");

  assert.equal(
    resolution.success,
    true,
    resolution.success === false ? resolution.error.message : "",
  );
  assert.equal(resolution.mode, "live");
});

test("app followups route loader returns a controlled live failure when storage is unconfigured", async () => {
  await withUnconfiguredLiveFollowups(async () => {
    const viewModel = await loadAppFollowupsRouteViewModel();

    assert.equal(viewModel.state, "route-state");

    if (viewModel.state === "route-state") {
      assert.equal(viewModel.routeState.scenario, "failure");
      assert.equal(
        viewModel.routeState.errorCode,
        "FOLLOWUP_TASK_GENERATION_LIVE_STORE_UNCONFIGURED",
      );
      assert.match(
        viewModel.routeState.evidenceIds.join(" "),
        /evidence:followups-live-store-empty|FOLLOWUP_TASK_GENERATION_LIVE_STORE_UNCONFIGURED/,
      );
    }
  });
});

test("/app/followups page renders the live-capable product schedule UI", async () => {
  const pageSource = source("app/(app)/app/followups/page.tsx");

  assert.match(pageSource, /OrbitRealSchedule/);
  assert.match(pageSource, /followupsRouteToOrbitScheduleViewModel/);
  assert.doesNotMatch(pageSource, /AppFollowupsCommandCenter/);

  await withUnconfiguredLiveFollowups(async () => {
    const Page = (await import("../../app/(app)/app/followups/page")).default;
    const html = renderToStaticMarkup(await Page());

    assert.match(html, /shared-ui-state-view/);
    assert.match(html, /Follow-ups could not load/);
  });
});

test("/app/schedule compatibility route renders the same live schedule UI", async () => {
  const scheduleRoutePath = "app/(app)/app/schedule/page.tsx";

  assert.equal(
    existsSync(join(projectRoot, scheduleRoutePath)),
    true,
    "/app/schedule should remain a working product route for the schedule entry point",
  );

  const pageSource = source(scheduleRoutePath);
  assert.match(pageSource, /AppFollowupsPage/);
  assert.doesNotMatch(pageSource, /AppFollowupsCommandCenter/);

  await withUnconfiguredLiveFollowups(async () => {
    const Page = (await import("../../app/(app)/app/schedule/page")).default;
    const html = renderToStaticMarkup(await Page());

    assert.match(html, /shared-ui-state-view/);
    assert.match(html, /Follow-ups could not load/);
  });
});

test("app followups live storage providers reuse the configured postgres record store", () => {
  const providerSources = [
    source("features/followups/storage/followup-live-record-provider.ts"),
    source("features/notifications/storage/reminder-notification-live-record-provider.ts"),
  ];

  for (const providerSource of providerSources) {
    assert.match(providerSource, /createConfiguredPostgresLiveRecordStore/);
    assert.doesNotMatch(providerSource, /createPgLiveRecordSqlClient/);
    assert.doesNotMatch(providerSource, /createPostgresLiveRecordStore/);
  }
});

test("followups product schedule adapter keeps duplicate source ids unique for React rows", () => {
  const schedule = followupsRouteToOrbitScheduleViewModel({
    state: "success",
    workspace: {
      actionResult: null,
      ledger: {
        draftCount: 0,
        dueTodayCount: 2,
        reminderCount: 2,
        taskCount: 0,
      },
      priority: null,
      reminderQueue: {
        entries: [],
        evidenceIds: [],
      },
      workflowCards: [
        {
          body: "First notification",
          due: "Due today",
          evidenceIds: [],
          id: "notification_001",
          recordIds: [],
          relationship: "山崎 美穂 · Aoba Technologies",
          reviewStatus: "Held for review",
          sourceContext: "notification",
          stepLabel: "Reminder",
          title: "In-app reminder",
        },
        {
          body: "Second notification",
          due: "Due today",
          evidenceIds: [],
          id: "notification_001",
          recordIds: [],
          relationship: "山崎 美穂 · Aoba Technologies",
          reviewStatus: "Held for review",
          sourceContext: "notification",
          stepLabel: "Queue",
          title: "Push reminder",
        },
      ],
    },
  });

  assert.deepEqual(
    schedule.schedules.map((item) => item.id),
    ["notification_001:0", "notification_001:1"],
  );
});
