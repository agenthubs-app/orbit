import assert from "node:assert/strict";
import test from "node:test";

import { createLiveAppBootstrapService } from "../../features/bootstrap/live-service";
import { createAppBootstrapService } from "../../features/bootstrap/service-factory";
import { createStorageAppBootstrapProvider } from "../../features/bootstrap/storage/bootstrap-live-record-provider";
import {
  createMemoryLiveRecordStore,
  type LiveRecord,
} from "../../shared/storage/live-record-store";

const WORKSPACE_ID = "workspace:bootstrap-live-test";
const NOW = "2026-07-01T12:00:00.000Z";

function record(
  collectionName: string,
  payload: Record<string, unknown>,
): LiveRecord<Record<string, unknown>> {
  const recordId =
    typeof payload.id === "string" ? payload.id : `${collectionName}:unknown`;
  const evidenceIds = Array.isArray(payload.evidenceIds)
    ? payload.evidenceIds.filter((item): item is string => typeof item === "string")
    : [`evidence:${collectionName}:${recordId}`];

  return {
    workspaceId: WORKSPACE_ID,
    collectionName,
    recordId,
    userId: null,
    sourceType: "system",
    sourceId: `source:${collectionName}:${recordId}`,
    sourceLabel: `Live ${collectionName} seed`,
    provider: "live-bootstrap-test",
    providerRecordId: recordId,
    evidenceIds,
    targetType: null,
    targetId: null,
    occurredAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    lifecycleState: "active",
    searchText: JSON.stringify(payload),
    payload,
  };
}

function createSeedStore() {
  return createMemoryLiveRecordStore<Record<string, unknown>>([
    record("accounts", {
      id: "account_live_workspace",
      name: "Live Bootstrap Workspace",
      createdAt: NOW,
      updatedAt: NOW,
    }),
    record("profiles", {
      id: "profile_live_operator",
      accountId: "account_live_workspace",
      displayName: "高橋 凛",
      role: "Founder",
      timezone: "Asia/Tokyo",
      relationshipGoal: "Prepare source-backed follow-ups from live storage.",
      homeMarket: "Tokyo",
      preferredFollowUpWindow: "24 hours",
      createdAt: NOW,
      updatedAt: NOW,
    }),
    record("contacts", {
      id: "contact_live_akari",
      displayName: "森 あかり",
      organization: "Sakura Ventures",
      role: "Partner",
      location: "Tokyo",
      stage: "active",
      source: {
        type: "event_import",
        id: "source:contact:akari",
        label: "Live attendee import",
      },
      evidenceIds: ["evidence:contact:akari"],
      createdAt: NOW,
      updatedAt: NOW,
    }),
    record("contacts", {
      id: "contact_live_mina",
      displayName: "Mina Chen",
      organization: "Orbit Labs",
      role: "Community lead",
      location: "Tokyo",
      stage: "nurture",
      source: {
        type: "manual",
        id: "source:contact:mina",
        label: "Live manual contact",
      },
      evidenceIds: ["evidence:contact:mina"],
      createdAt: NOW,
      updatedAt: NOW,
    }),
    record("connections", {
      id: "connection_live_akari",
      accountId: "account_live_workspace",
      contactId: "contact_live_akari",
      stage: "active",
      valueTypes: ["commercial_opportunity"],
      summary: "Akari is a high-fit investor relationship.",
      relationshipStrength: 82,
      businessRelevanceScore: 88,
      source: {
        type: "event_import",
        id: "source:connection:akari",
        label: "Live relationship evidence",
      },
      evidenceIds: ["evidence:connection:akari"],
      createdAt: NOW,
      updatedAt: NOW,
    }),
    record("events", {
      id: "event_live_roundtable",
      name: "Tokyo AI Founders Roundtable",
      location: "Shibuya",
      startsAt: "2026-07-03T09:00:00.000Z",
      endsAt: "2026-07-03T11:00:00.000Z",
      source: {
        type: "event_import",
        id: "source:event:roundtable",
        label: "Live imported event",
      },
      evidenceIds: ["evidence:event:roundtable"],
    }),
    record("tasks", {
      id: "task_live_followup",
      title: "Send Akari the investor intro memo",
      status: "open",
      contactId: "contact_live_akari",
      dueAt: "2026-07-02T12:00:00.000Z",
      source: {
        type: "agent_action",
        id: "source:task:akari",
        label: "Live task source",
      },
      evidenceIds: ["evidence:task:akari"],
      createdAt: NOW,
      updatedAt: NOW,
    }),
    record("tasks", {
      id: "task_live_completed",
      title: "Archive completed bootstrap task",
      status: "completed",
      contactId: "contact_live_mina",
      source: {
        type: "manual",
        id: "source:task:completed",
        label: "Live completed task source",
      },
      evidenceIds: ["evidence:task:completed"],
      createdAt: NOW,
      updatedAt: NOW,
    }),
    record("agentActions", {
      id: "agent_action_live_intro",
      type: "draft_message",
      status: "awaiting_confirmation",
      confirmationRequired: true,
      source: {
        type: "agent_action",
        id: "source:agent-action:intro",
        label: "Live agent action",
      },
      evidenceIds: ["evidence:agent-action:intro"],
      createdAt: NOW,
      updatedAt: NOW,
    }),
    record("permissions", {
      id: "permission_live_event_data",
      capability: "relationship_local_remote_database",
      state: "requested",
      updatedAt: NOW,
      source: {
        type: "system",
        id: "source:permission:event-data",
        label: "Live permission source",
      },
      evidenceIds: ["evidence:permission:event-data"],
    }),
    record("notifications", {
      id: "notification_live_followup",
      channel: "in_app",
      title: "Follow up with Akari",
      body: "Draft the memo before tomorrow's event.",
      status: "pending",
      source: {
        type: "agent_action",
        id: "source:notification:akari",
        label: "Live notification source",
      },
      evidenceIds: ["evidence:notification:akari"],
      createdAt: NOW,
    }),
    record("evidence", {
      id: "evidence:bootstrap:live",
      sourceType: "system",
      sourceId: "source:bootstrap:live",
      summary: "Live bootstrap graph seed.",
      occurredAt: NOW,
      confidence: 1,
      createdBy: "profile_live_operator",
    }),
  ]);
}

test("app bootstrap live service aggregates first-screen data from live storage", async () => {
  const provider = createStorageAppBootstrapProvider({
    store: createSeedStore(),
    workspaceId: WORKSPACE_ID,
  });
  const service = createLiveAppBootstrapService({ provider });

  const result = await service.getAppBootstrap({ taskLimit: 1 });

  assert.equal(result.success, true);
  assert.equal(result.data.state, "success");
  assert.equal(result.data.account?.workspaceName, "Live Bootstrap Workspace");
  assert.equal(result.data.account?.plan, "live-relationship-os");
  assert.equal(result.data.profile?.displayName, "高橋 凛");
  assert.equal(result.data.profile?.relationshipGoal, "Prepare source-backed follow-ups from live storage.");
  assert.equal(result.data.upcomingEvents[0]?.title, "Tokyo AI Founders Roundtable");
  assert.equal(result.data.connectionSummary.totalContacts, 2);
  assert.equal(result.data.connectionSummary.totalConnections, 1);
  assert.equal(result.data.connectionSummary.highValueRelationships, 1);
  assert.equal(result.data.connectionSummary.dormantContacts, 1);
  assert.equal(result.data.pendingTasks.length, 1);
  assert.equal(result.data.pendingTasks[0]?.contactName, "森 あかり");
  assert.equal(result.data.topAgentActions[0]?.confirmationRequired, true);
  assert.deepEqual(result.data.permissionSummary.stagedPermissions, [
    "relationship_local_remote_database",
  ]);
  assert.equal(result.data.notificationSummary.pendingDeliveryCount, 1);
  assert.equal(result.data.notificationSummary.latestNotification, "Follow up with Akari");
  assert.equal(result.data.provenance.privacy, "live-app-bootstrap");
  assert.equal(result.data.provenance.sourceLabel, "Bootstrap shared live storage");
  assert.equal(result.data.provenance.generationMethod, "live-store-task-limit");
  assert.equal(result.data.provenance.databaseReadExecuted, true);
  assert.equal(result.data.provenance.liveDatabaseAggregationExecuted, true);
  assert.equal(result.data.provenance.databaseWriteExecuted, false);
});

test("app bootstrap live service fails closed when live storage is unconfigured", async () => {
  const service = createLiveAppBootstrapService({
    now: () => NOW,
    provider: null,
  });

  const result = await service.getAppBootstrap();

  assert.equal(result.success, false);
  assert.equal(result.error.code, "APP_BOOTSTRAP_LIVE_STORE_UNCONFIGURED");
  assert.equal(result.error.appCode, "SERVICE_UNAVAILABLE");
  assert.equal(result.error.provenance.privacy, "live-app-bootstrap");
  assert.equal(result.error.provenance.liveDatabaseAggregationExecuted, true);
});

test("app bootstrap service factory exposes live mode without breaking default mock", async () => {
  const previousModuleMode = process.env.ORBIT_MODULE_MODE;
  const previousFeatureMode = process.env.ORBIT_FEATURE_MODE;
  const previousEventDatabaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
  const previousLiveDatabaseUrl = process.env.ORBIT_LIVE_DATABASE_URL;
  const previousDatabaseUrl = process.env.ORBIT_DATABASE_URL;

  try {
    delete process.env.ORBIT_MODULE_MODE;
    delete process.env.ORBIT_FEATURE_MODE;
    delete process.env.ORBIT_EVENT_DATABASE_URL;
    delete process.env.ORBIT_LIVE_DATABASE_URL;
    delete process.env.ORBIT_DATABASE_URL;

    const mock = await createAppBootstrapService().getAppBootstrap();
    const live = await createAppBootstrapService("live").getAppBootstrap();

    assert.equal(mock.success, true);
    assert.equal(live.success, false);
    assert.equal(live.error.code, "APP_BOOTSTRAP_LIVE_STORE_UNCONFIGURED");
  } finally {
    process.env.ORBIT_MODULE_MODE = previousModuleMode;
    process.env.ORBIT_FEATURE_MODE = previousFeatureMode;
    process.env.ORBIT_EVENT_DATABASE_URL = previousEventDatabaseUrl;
    process.env.ORBIT_LIVE_DATABASE_URL = previousLiveDatabaseUrl;
    process.env.ORBIT_DATABASE_URL = previousDatabaseUrl;
  }
});

test("app bootstrap API resolves ORBIT_MODULE_MODE=live and returns a live envelope", async () => {
  const previousModuleMode = process.env.ORBIT_MODULE_MODE;
  const previousFeatureMode = process.env.ORBIT_FEATURE_MODE;
  const previousEventDatabaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
  const previousLiveDatabaseUrl = process.env.ORBIT_LIVE_DATABASE_URL;
  const previousDatabaseUrl = process.env.ORBIT_DATABASE_URL;

  try {
    process.env.ORBIT_MODULE_MODE = "live";
    delete process.env.ORBIT_FEATURE_MODE;
    delete process.env.ORBIT_EVENT_DATABASE_URL;
    delete process.env.ORBIT_LIVE_DATABASE_URL;
    delete process.env.ORBIT_DATABASE_URL;

    const route = await import("../../app/api/app/bootstrap/route");
    const response = await route.GET(
      new Request("https://orbit.local/api/app/bootstrap"),
    );
    const body = await response.json();

    assert.equal(response.status, 503);
    assert.equal(response.headers.get("x-orbit-feature-mode"), "live");
    assert.equal(body.success, false);
    assert.equal(
      body.error.context.appBootstrapErrorCode,
      "APP_BOOTSTRAP_LIVE_STORE_UNCONFIGURED",
    );
    assert.equal(body.error.context.service, "app-bootstrap-live");
  } finally {
    process.env.ORBIT_MODULE_MODE = previousModuleMode;
    process.env.ORBIT_FEATURE_MODE = previousFeatureMode;
    process.env.ORBIT_EVENT_DATABASE_URL = previousEventDatabaseUrl;
    process.env.ORBIT_LIVE_DATABASE_URL = previousLiveDatabaseUrl;
    process.env.ORBIT_DATABASE_URL = previousDatabaseUrl;
  }
});
