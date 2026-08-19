import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { OrbitTodayPreEventBrief } from "../../app/(app)/app/today/orbit-today-pre-event-brief";
import { todaySectionForEntry } from "../../app/(app)/app/today/compose-app-today-from-agent-ledger/today-route-view-model";
import { createAgentSchedulerRouteHandler } from "../../app/api/internal/agent/scheduler/route-handler";
import { agentActionToLedgerEntry } from "../../features/agent/ledger/runtime-adapter";
import { createStorageContactArchiveActionWriter } from "../../features/contacts/action-writer";
import { createAgentDomainExecutors } from "../../features/agent/runtime/domain-executors";
import { createAgentExecutorRegistry } from "../../features/agent/runtime/executor-registry";
import { createAgentRuntimeService } from "../../features/agent/runtime/service";
import { createMemoryAgentRuntimeRepository } from "../../features/agent/runtime/repository";
import {
  createOrbitAgentRuntimeService,
  resetOrbitAgentRuntimeServicesForTests,
} from "../../features/agent/runtime/service-factory";
import { createStorageEventActionWriter } from "../../features/events/action-writer";
import { createEventMatchmakingService } from "../../features/events/matchmaking/service";
import { createStorageFollowupActionWriter } from "../../features/followups/action-writer";
import { shouldSendPreEventNudge } from "../../features/notifications/push-adapter";
import { createStorageNotificationDeliveryService } from "../../features/notifications/delivery-service";
import { createStorageReminderActionWriter } from "../../features/notifications/action-writer";
import { readPreEventBriefFromAction } from "../../features/agent/ledger/pre-event-brief";
import {
  createAgentWorkflowScheduler,
  type ScheduledBriefCandidate,
} from "../../features/orbit-ai/workflows/scheduler";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

function createHarness() {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const workspaceId = "pre-event-brief-delivery";
  const runtime = createAgentRuntimeService({
    repository: createMemoryAgentRuntimeRepository(),
    executors: createAgentExecutorRegistry(
      createAgentDomainExecutors({
        contacts: createStorageContactArchiveActionWriter({
          store,
          workspaceId,
        }),
        events: createStorageEventActionWriter({ store, workspaceId }),
        followups: createStorageFollowupActionWriter({ store, workspaceId }),
        notifications: createStorageReminderActionWriter({
          store,
          workspaceId,
        }),
        matchmaking: createEventMatchmakingService({ store, workspaceId }),
      }),
    ),
    now: () => "2026-07-25T01:00:00.000Z",
    id: (() => {
      let value = 0;
      return () => `brief-delivery-${++value}`;
    })(),
  });
  return { runtime, store, workspaceId };
}

function candidate() {
  return {
    eventId: "event-brief-delivery",
    title: "Tokyo Climate Founder Dinner",
    startsAt: "2026-07-25T02:30:00.000Z",
    endsAt: "2026-07-25T04:00:00.000Z",
    location: "Marunouchi, Tokyo",
    attendees: [
      {
        contactId: "aiko",
        displayName: "Aiko Mori",
        organization: "Grid Labs",
        whyWorthMeeting: "Owns the storage pilot decision.",
        lastInteraction: "2026-07-10",
        evidenceIds: ["e:aiko:note", "e:aiko:event"],
        evidenceSummaries: [
          "7 月 10 日讨论过储能试点",
          "参加过 Osaka Demo Day",
        ],
        suggestedTopics: ["Pilot scope", "Decision timeline"],
        openCommitments: ["Send deployment case study"],
      },
      {
        contactId: "kenji",
        displayName: "Kenji Watanabe",
        whyWorthMeeting: "Can introduce the procurement lead.",
        evidenceIds: ["e:kenji"],
        suggestedTopics: ["Procurement process"],
        openCommitments: [],
      },
      {
        contactId: "maya",
        displayName: "Maya Singh",
        whyWorthMeeting: "Has relevant market-entry experience.",
        evidenceIds: ["e:maya"],
        suggestedTopics: ["Japan expansion"],
        openCommitments: ["Share market map"],
      },
      {
        contactId: "low",
        displayName: "Low Signal",
        whyWorthMeeting: "One weak signal.",
        evidenceIds: [],
        suggestedTopics: [],
        openCommitments: [],
      },
    ],
    preparationGaps: ["准备一句试点价值主张", "确认案例可公开范围"],
    costlyMiss: true,
    pushEnabled: true,
    pushToken: "expo-token",
  } as const;
}

function fixedCollector(candidates: readonly ScheduledBriefCandidate[]) {
  return {
    async collect() {
      return candidates;
    },
  };
}

test("scheduled brief is complete, stays prepared until viewed, and viewed state gates push", async () => {
  const harness = createHarness();
  const sent: string[] = [];
  const scheduler = createAgentWorkflowScheduler({
    collector: fixedCollector([candidate()]),
    runtime: harness.runtime,
    push: {
      async send(message) {
        sent.push(message.data.deliveryId);
        return { receiptId: `receipt-${sent.length}` };
      },
    },
    now: () => "2026-07-25T01:00:00.000Z",
    preferences: {
      preEventBriefPushEnabled: true,
      quietHours: { start: "22:15", end: "07:45" },
      timeZone: "Asia/Tokyo",
    },
  });

  const first = await scheduler.tick();
  assert.equal(first.generated.length, 1);
  assert.equal(first.pushed.length, 1);
  const briefAction = first.generated[0].actions.find((action) =>
    action.operations.some(
      (operation) => operation.operationType === "generate_meeting_brief",
    ),
  );
  assert.ok(briefAction);
  const brief = readPreEventBriefFromAction(briefAction);
  assert.ok(brief);
  assert.equal(brief.people.length, 3);
  assert.equal(brief.location, "Marunouchi, Tokyo");
  assert.equal(brief.people[0].displayName, "Aiko Mori");
  assert.deepEqual(brief.people[0].evidenceSummaries, [
    "7 月 10 日讨论过储能试点",
    "参加过 Osaka Demo Day",
  ]);

  const beforeView = agentActionToLedgerEntry(
    briefAction,
    await harness.runtime.getRun(briefAction.runId),
  );
  assert.equal(todaySectionForEntry(beforeView), "prepared");

  const viewed = await harness.runtime.markActionViewed(briefAction.actionId);
  const afterView = agentActionToLedgerEntry(
    viewed,
    await harness.runtime.getRun(viewed.runId),
  );
  assert.equal(todaySectionForEntry(afterView), "recent");

  const second = await scheduler.tick();
  assert.equal(second.pushed.length, 0);
  assert.deepEqual(sent, ["legacy:event:event-brief-delivery"]);

  const html = renderToStaticMarkup(<OrbitTodayPreEventBrief brief={brief} />);
  assert.match(html, /本场目标/);
  assert.match(html, /准备缺口/);
  assert.match(html, /Aiko Mori/);
  assert.match(html, /上次互动/);
  assert.match(html, /7 月 10 日讨论过储能试点/);
  assert.match(html, /建议话题/);
  assert.match(html, /未完成承诺/);
});

test("event goal remains editable until confirmation and executes the edited value", async () => {
  const harness = createHarness();
  const scheduler = createAgentWorkflowScheduler({
    collector: fixedCollector([candidate()]),
    runtime: harness.runtime,
    push: null,
    now: () => "2026-07-25T01:00:00.000Z",
  });
  const result = await scheduler.tick();
  const goalAction = result.generated[0].actions.find((action) =>
    action.operations.some(
      (operation) => operation.operationType === "save_event_goal",
    ),
  );
  assert.ok(goalAction);
  const operation = goalAction.operations[0];
  await harness.runtime.updateDraft({
    actionId: goalAction.actionId,
    operationId: operation.operationId,
    draftText: "确认储能试点的决策人，并约定下周三评审。",
  });
  await harness.runtime.approveAction({
    actionId: goalAction.actionId,
    actorLabel: "Orbit user",
  });
  await harness.runtime.processOutbox({ actionId: goalAction.actionId });

  const goals = await harness.store.listRecords({
    workspaceId: harness.workspaceId,
    collectionName: "eventGoals",
  });
  assert.equal(goals.length, 1);
  assert.equal(
    goals[0].payload.goal,
    "确认储能试点的决策人，并约定下周三评审。",
  );
});

test("quiet hours use minute precision in the user's IANA time zone", () => {
  const base = {
    startsAt: "2026-07-25T15:00:00.000Z",
    costlyMiss: true,
    pushEnabled: true,
    quietHours: { start: "22:15", end: "07:45" },
    timeZone: "Asia/Tokyo",
  };
  assert.equal(
    shouldSendPreEventNudge({
      ...base,
      now: "2026-07-25T13:14:00.000Z",
    }),
    true,
  );
  assert.equal(
    shouldSendPreEventNudge({
      ...base,
      now: "2026-07-25T13:15:00.000Z",
    }),
    false,
  );
  assert.equal(
    shouldSendPreEventNudge({
      ...base,
      now: "2026-07-25T13:30:00.000Z",
      timeZone: "UTC",
    }),
    true,
  );
  assert.equal(
    shouldSendPreEventNudge({
      ...base,
      now: "2026-07-25T13:30:00.000Z",
      timeZone: "Not/A_Time_Zone",
    }),
    false,
  );
});

test("scheduler materializes a durable delivery when a delivery service is supplied", async () => {
  const harness = createHarness();
  const delivery = createStorageNotificationDeliveryService({
    actorId: "actor:brief-delivery",
    now: () => "2026-07-25T01:00:00.000Z",
    store: harness.store as never,
    workspaceId: harness.workspaceId,
  });
  const sent: string[] = [];
  const scheduler = createAgentWorkflowScheduler({
    collector: fixedCollector([candidate()]),
    delivery,
    runtime: harness.runtime,
    push: {
      async send() {
        sent.push("inline");
        return { receiptId: "must-not-send-inline" };
      },
    },
    now: () => "2026-07-25T01:00:00.000Z",
    preferences: {
      preEventBriefPushEnabled: true,
      quietHours: { end: "07:45", start: "22:15" },
      timeZone: "Asia/Tokyo",
    },
  });
  const result = await scheduler.tick();
  assert.equal(result.pushed.length, 1);
  assert.deepEqual(sent, []);
  const deliveryId = result.pushed[0].deliveryId;
  assert.ok(deliveryId);
  assert.equal((await delivery.get(deliveryId))?.status, "scheduled");
});

test("pre-event scheduler honors the production proactive reminder allowlist", async () => {
  const harness = createHarness();
  const scheduler = createAgentWorkflowScheduler({
    collector: fixedCollector([candidate()]),
    env: {
      NODE_ENV: "production",
      ORBIT_EVENT_PILOT_ENABLED: "true",
      ORBIT_EVENT_PILOT_PROACTIVE_REMINDERS_ENABLED: "true",
      ORBIT_EVENT_PILOT_EVENT_IDS: "event:not-this-one",
    },
    runtime: harness.runtime,
    push: null,
    now: () => "2026-07-25T01:00:00.000Z",
  });
  const result = await scheduler.tick();
  assert.deepEqual(result.generated, []);
  assert.deepEqual(result.pushed, []);
  assert.deepEqual(result.skipped, ["event-brief-delivery"]);
});

test("scheduler route collects server-owned candidates for its authenticated actor", async () => {
  resetOrbitAgentRuntimeServicesForTests();
  const actorId = "actor:brief-route";
  const routeCandidate = {
    ...candidate(),
    eventId: "event-brief-route",
    startsAt: new Date(Date.now() + 90 * 60_000).toISOString(),
    endsAt: new Date(Date.now() + 150 * 60_000).toISOString(),
    pushToken: undefined,
  };
  const runtime = createOrbitAgentRuntimeService("mock", { actorId });
  const runScheduler = createAgentSchedulerRouteHandler({
    authorize: () => true,
    collectorForActor(resolvedActorId) {
      assert.equal(resolvedActorId, actorId);
      return fixedCollector([routeCandidate]);
    },
    preferences: async () => ({
      preEventBriefPushEnabled: true,
      quietHours: { start: "22:00", end: "08:00" },
      timeZone: "Asia/Tokyo",
    }),
    push: () => null,
    resolveActorId: () => actorId,
    resolveMode: () => "mock",
    runtimeForActor(resolvedActorId) {
      assert.equal(resolvedActorId, actorId);
      return runtime;
    },
  });
  const response = await runScheduler(
    new Request("http://localhost/api/internal/agent/scheduler", {
      method: "POST",
    }),
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    data: {
      generated: readonly {
        actions: readonly {
          actionId: string;
          operations: readonly { operationType: string }[];
        }[];
      }[];
    };
  };
  const briefAction = body.data.generated[0].actions.find((action) =>
    action.operations.some(
      (operation) => operation.operationType === "generate_meeting_brief",
    ),
  );
  assert.ok(briefAction);
  await runtime.markActionViewed(briefAction.actionId);
  const persisted = (await runtime.listActions({})).find(
    (action) => action.actionId === briefAction.actionId,
  );
  assert.ok(persisted?.viewedAt);
  resetOrbitAgentRuntimeServicesForTests();
});
