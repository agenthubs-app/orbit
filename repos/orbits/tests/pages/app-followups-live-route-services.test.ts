import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";

import type {
  FollowupTask,
  FollowupTaskGenerationPayload,
  FollowupTaskGenerationProvenance,
} from "../../features/followups/contract";
import type {
  ReminderScheduleNotificationPayload,
  ReminderScheduleNotificationProvenance,
} from "../../features/notifications/contract";
import { loadAppFollowupsRouteViewModel } from "../../app/(app)/app/followups/compose-app-followups-from-previously-approved-mock-first-capabilities/followups-route-view-model";
import {
  resolveAppFollowupsRouteServices,
  type AppFollowupsRouteServices,
} from "../../app/(app)/app/followups/compose-app-followups-from-previously-approved-mock-first-capabilities/followups-service-factory";
import { followupsRouteToOrbitScheduleViewModel } from "../../app/(app)/app/followups/compose-app-followups-from-previously-approved-mock-first-capabilities/followups-view-model-adapter";
import { defaultMockFixtures } from "../../shared/mock/fixtures";

const liveDatabaseEnvKeys = [
  "ORBIT_EVENT_DATABASE_URL",
  "ORBIT_LIVE_DATABASE_URL",
  "ORBIT_DATABASE_URL",
] as const;
const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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

const testFollowupProvenance: FollowupTaskGenerationProvenance = {
  aiProviderRequested: false,
  backgroundSchedulerRequested: false,
  calendarProviderRequested: false,
  collectedAt: "2026-07-09T00:00:00.000Z",
  deviceRequested: false,
  emailProviderRequested: false,
  evidenceIds: [],
  externalNetworkRequested: false,
  generationMethod: "live-store-query",
  liveDatabaseReadExecuted: true,
  liveDatabaseWriteExecuted: false,
  liveTaskPersistenceRequested: false,
  notificationDelivered: false,
  privacy: "live-followup-task-generation",
  productionAuditLogWriteExecuted: false,
  source: "test:followups-diverse-calendar",
  sourceLabel: "Followups diverse calendar test",
};

const testNotificationProvenance: ReminderScheduleNotificationProvenance = {
  collectedAt: "2026-07-09T00:00:00.000Z",
  cronJobRequested: false,
  deviceRequested: false,
  emailDeliveryRequested: false,
  evidenceIds: [],
  externalNetworkRequested: false,
  generationMethod: "live-store-query",
  liveDatabaseReadExecuted: true,
  liveDatabaseWriteExecuted: false,
  notificationProviderRequested: false,
  privacy: "live-reminder-schedule-notification-preview",
  productionAuditLogWriteExecuted: false,
  pushNotificationRequested: false,
  smsDeliveryRequested: false,
  source: "test:followups-diverse-calendar-notifications",
  sourceLabel: "Followups diverse calendar test",
};

function testTask(input: {
  dueInDays: number;
  index: number;
  name: string;
  organization: string;
}): FollowupTask {
  const id = String(input.index + 1).padStart(2, "0");

  return {
    aiProviderRequested: false,
    audit: {
      providerBoundary: "scheduler false, AI false, persistence false",
      sourceLabel: "Followups diverse calendar test",
      verificationAction: "Verify evidence",
    },
    backgroundSchedulerRequested: false,
    calendarProviderRequested: false,
    connectionId: `connection:diverse:${id}`,
    contactName: input.name,
    dueInDays: input.dueInDays,
    emailProviderRequested: false,
    evidenceIds: [`evidence:followups-diverse:${id}`],
    externalNetworkRequested: false,
    generatedBy: "live-store-query",
    liveDatabaseWriteExecuted: false,
    liveTaskPersistenceRequested: false,
    notificationDelivered: false,
    organization: input.organization,
    priority: input.dueInDays <= 7 ? "today" : input.dueInDays <= 28 ? "this_week" : "nurture",
    productionAuditLogWriteExecuted: false,
    rationale: `${input.name} has a sourced follow-up path for review.`,
    recommendedAction: `Review the next relationship step with ${input.name}.`,
    source: {
      generatedBy: "live-store-query",
      id: `source:followups-diverse:${id}`,
      label: "Followups diverse calendar test",
      providerRecordId: `source:followups-diverse:${id}`,
      type: "manual",
    },
    taskId: `task:followups-diverse:${id}`,
    title: `Review follow-up with ${input.name}`,
    triggerKind: "event_encounter",
  };
}

function followupPayload(tasks: readonly FollowupTask[]): FollowupTaskGenerationPayload {
  return {
    nextAction: "Review diverse relationship tasks before scheduling external actions.",
    provenance: {
      ...testFollowupProvenance,
      evidenceIds: tasks.flatMap((task) => task.evidenceIds),
    },
    state: "success",
    summary: "Diverse follow-up tasks for schedule rendering.",
    tasks,
    triggers: [],
  };
}

function emptyNotificationPayload(): ReminderScheduleNotificationPayload {
  return {
    groupedLowPriorityReminders: [],
    nextAction: "No reminders needed for this schedule rendering test.",
    notificationQueue: [],
    provenance: testNotificationProvenance,
    reminders: [],
    state: "success",
    summary: "No notifications.",
  };
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

test("app followups route loader starts task and notification reads in parallel", async () => {
  const delayMs = 80;
  let taskStartedAt: number | null = null;
  let notificationStartedAt: number | null = null;
  const services: AppFollowupsRouteServices = {
    draftService: {
      createDraft: () => ({
        success: true,
        data: {
          drafts: [],
          nextAction: "No draft needed for the parallel loader test.",
          provenance: {
            aiProviderRequested: false,
            calendarProviderRequested: false,
            collectedAt: "2026-07-07T00:00:00.000Z",
            deviceRequested: false,
            emailProviderRequested: false,
            evidenceIds: [],
            externalNetworkRequested: false,
            externalSendRequested: false,
            generationMethod: "rule-based-state",
            liveDatabaseReadExecuted: false,
            liveDatabaseWriteExecuted: false,
            notificationDelivered: false,
            privacy: "demo-message-draft-generator-only",
            productionAuditLogWriteExecuted: false,
            source: "test:followups-parallel-draft",
            sourceLabel: "Followups parallel loader test",
          },
          state: "success",
          summary: "No drafts.",
        },
      }),
      updateDraft: () => {
        throw new Error("updateDraft should not be called by the route loader");
      },
    },
    notificationService: {
      generateReminders: () => {
        throw new Error(
          "generateReminders should not be called by the route loader",
        );
      },
      listNotifications: async () => {
        notificationStartedAt = performance.now();
        await delay(delayMs);

        return {
          success: true,
          data: {
            groupedLowPriorityReminders: [],
            nextAction: "No notifications needed for the parallel loader test.",
            notificationQueue: [],
            provenance: {
              collectedAt: "2026-07-07T00:00:00.000Z",
              cronJobRequested: false,
              deviceRequested: false,
              emailDeliveryRequested: false,
              evidenceIds: [],
              externalNetworkRequested: false,
              generationMethod: "rule-based-state",
              liveDatabaseReadExecuted: false,
              liveDatabaseWriteExecuted: false,
              notificationProviderRequested: false,
              privacy: "demo-reminder-schedule-notification-only",
              productionAuditLogWriteExecuted: false,
              pushNotificationRequested: false,
              smsDeliveryRequested: false,
              source: "test:followups-parallel-notifications",
              sourceLabel: "Followups parallel loader test",
            },
            reminders: [],
            state: "success",
            summary: "No notifications.",
          },
        };
      },
    },
    taskService: {
      generateTasks: () => {
        throw new Error("generateTasks should not be called by the route loader");
      },
      listTasks: async () => {
        taskStartedAt = performance.now();
        await delay(delayMs);

        return {
          success: true,
          data: {
            nextAction: "No tasks needed for the parallel loader test.",
            provenance: {
              aiProviderRequested: false,
              backgroundSchedulerRequested: false,
              calendarProviderRequested: false,
              collectedAt: "2026-07-07T00:00:00.000Z",
              deviceRequested: false,
              emailProviderRequested: false,
              evidenceIds: [],
              externalNetworkRequested: false,
              generationMethod: "rule-based-state",
              liveDatabaseReadExecuted: false,
              liveDatabaseWriteExecuted: false,
              liveTaskPersistenceRequested: false,
              notificationDelivered: false,
              privacy: "demo-followup-task-generation-only",
              productionAuditLogWriteExecuted: false,
              source: "test:followups-parallel-tasks",
              sourceLabel: "Followups parallel loader test",
            },
            state: "success",
            summary: "No tasks.",
            tasks: [],
            triggers: [],
          },
        };
      },
    },
  };

  const viewModel = await loadAppFollowupsRouteViewModel(undefined, services);

  assert.equal(viewModel.state, "success");

  if (taskStartedAt === null || notificationStartedAt === null) {
    throw new Error("Injected task and notification services must both run");
  }

  assert.ok(
    Math.abs(notificationStartedAt - taskStartedAt) < delayMs / 2,
    "task and notification reads should start in the same async window",
  );
});

test("generated follow-up seed tasks cover a dense next-three-month calendar", () => {
  const tasks = defaultMockFixtures.tasks;
  const dueDates = tasks
    .map((task) => task.dueAt)
    .filter((dueAt): dueAt is string => Boolean(dueAt));
  const dueDays = new Set(dueDates.map((dueAt) => dueAt.slice(0, 10)));
  const dueMonths = new Set(dueDates.map((dueAt) => dueAt.slice(0, 7)));
  const contactIds = new Set(tasks.map((task) => task.contactId));

  assert.equal(tasks.length, 80);
  assert.ok(contactIds.size >= 40);
  assert.ok(dueDays.size >= 70);
  assert.ok(dueMonths.has("2026-07"));
  assert.ok(dueMonths.has("2026-08"));
  assert.ok(dueMonths.has("2026-09"));
  assert.ok(
    dueDates.every((dueAt) => dueAt >= "2026-07-10T00:00:00+09:00"),
    "generated follow-up tasks should start after the current July 9 demo date",
  );
  assert.ok(
    dueDates.every((dueAt) => dueAt <= "2026-10-09T23:59:59+09:00"),
    "generated follow-up tasks should stay inside the next three months",
  );
});

test("app followups route renders a diverse dense schedule from more than the top task", async () => {
  const tasks = [
    testTask({ dueInDays: 1, index: 0, name: "山崎 美穂", organization: "Aoba Technologies" }),
    testTask({ dueInDays: 5, index: 1, name: "橋本 夏美", organization: "Kyoto Retail Lab" }),
    testTask({ dueInDays: 12, index: 2, name: "前田 祐介", organization: "Kansai Logistics" }),
    testTask({ dueInDays: 24, index: 3, name: "梁佳怡", organization: "Shanghai Market Link" }),
    testTask({ dueInDays: 38, index: 4, name: "中野 葵", organization: "Osaka Brand Works" }),
    testTask({ dueInDays: 51, index: 5, name: "唐天宇", organization: "Hangzhou Commerce Cloud" }),
    testTask({ dueInDays: 64, index: 6, name: "郑思远", organization: "Tokyo AI Partners" }),
    testTask({ dueInDays: 77, index: 7, name: "鈴木 翔太", organization: "Nagoya Manufacturing DX" }),
    testTask({ dueInDays: 88, index: 8, name: "高橋 智子", organization: "Kobe Food Export" }),
  ];
  const services: AppFollowupsRouteServices = {
    draftService: {
      createDraft: () => ({
        success: true,
        data: {
          drafts: [],
          nextAction: "No draft needed for the diverse schedule test.",
          provenance: {
            aiProviderRequested: false,
            calendarProviderRequested: false,
            collectedAt: "2026-07-09T00:00:00.000Z",
            deviceRequested: false,
            emailProviderRequested: false,
            evidenceIds: [],
            externalNetworkRequested: false,
            externalSendRequested: false,
            generationMethod: "rule-based-state",
            liveDatabaseReadExecuted: false,
            liveDatabaseWriteExecuted: false,
            notificationDelivered: false,
            privacy: "demo-message-draft-generator-only",
            productionAuditLogWriteExecuted: false,
            source: "test:followups-diverse-calendar-draft",
            sourceLabel: "Followups diverse calendar test",
          },
          state: "success",
          summary: "No drafts.",
        },
      }),
      updateDraft: () => {
        throw new Error("updateDraft should not be called by the route loader");
      },
    },
    notificationService: {
      generateReminders: () => {
        throw new Error(
          "generateReminders should not be called by the route loader",
        );
      },
      listNotifications: () => ({
        success: true,
        data: emptyNotificationPayload(),
      }),
    },
    taskService: {
      generateTasks: () => {
        throw new Error("generateTasks should not be called by the route loader");
      },
      listTasks: () => ({
        success: true,
        data: followupPayload(tasks),
      }),
    },
  };

  const viewModel = await loadAppFollowupsRouteViewModel(undefined, services);

  assert.equal(viewModel.state, "success");

  if (viewModel.state !== "success") {
    return;
  }

  const schedule = followupsRouteToOrbitScheduleViewModel(viewModel);
  const uniqueContacts = new Set(schedule.connections.map((connection) => connection.displayName));
  const months = new Set(schedule.schedules.map((item) => item.date.slice(0, 7)));

  assert.ok(schedule.schedules.length >= tasks.length);
  assert.ok(uniqueContacts.size >= 8);
  assert.ok(months.size >= 3);
  assert.ok(
    schedule.schedules.some((item) => item.topic.includes("橋本 夏美")),
  );
  assert.ok(
    schedule.schedules.some((item) => item.topic.includes("高橋 智子")),
  );
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
  const realPageSource = source(
    "app/(app)/app/schedule/orbit-real-schedule-page.tsx",
  );
  assert.match(pageSource, /loadAppScheduleRouteViewModel/);
  assert.match(realPageSource, /AppScheduleSuccessView/);
  assert.doesNotMatch(pageSource, /AppFollowupsCommandCenter/);

  await withUnconfiguredLiveFollowups(async () => {
    const Page = (await import("../../app/(app)/app/schedule/page")).default;
    const html = renderToStaticMarkup(await Page());

    assert.match(html, /data-orbit-route="app-schedule-route"/);
    assert.match(html, /关系安排|Schedule/);
    assert.doesNotMatch(html, /Follow-ups could not load/);
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
