import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

async function importProjectModule<TModule>(
  pathFromRoot: string,
): Promise<TModule> {
  const absolutePath = join(projectRoot, pathFromRoot);

  assert.equal(
    existsSync(absolutePath),
    true,
    `${pathFromRoot} must exist for Orbit AI live trace storage`,
  );

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status,
  });
}

function geminiTextResponse(text: string): Response {
  return jsonResponse({
    steps: [
      {
        content: [{ text, type: "text" }],
        type: "model_output",
      },
    ],
  });
}

test("Orbit AI live trace reads selected tool collections from live record storage", async () => {
  const { createMemoryLiveRecordStore } = await importProjectModule<{
    createMemoryLiveRecordStore: (seed: readonly Record<string, unknown>[]) => {
      listRecords: (query: Record<string, unknown>) => readonly Record<string, unknown>[];
    };
  }>("shared/storage/live-record-store.ts");
  const { createLiveOrbitAgentTrace } = await importProjectModule<{
    createLiveOrbitAgentTrace: (config: Record<string, unknown>) => {
      traceMessage: (input: Record<string, unknown>) => Promise<{
        data?: {
          fullChain: {
            databaseInteractions: readonly {
              adapterKind: string;
              collections: readonly {
                collectionName: string;
                recordCount: number;
                selectedForTools: boolean;
              }[];
              liveDatabaseReadExecuted: boolean;
              liveDatabaseWriteExecuted: boolean;
              operation: string;
              source: string;
              storageKey: string;
              summary: string;
            }[];
          };
        };
        success: boolean;
      }>;
    };
  }>("features/orbit-ai/live-conversation-trace.ts");
  const workspaceId = "workspace:orbit-ai-live-trace-test";
  const now = "2026-07-02T00:00:00.000Z";
  const liveRecordStore = createMemoryLiveRecordStore([
    {
      collectionName: "events",
      createdAt: now,
      evidenceIds: ["evidence:event:01"],
      lifecycleState: "active",
      payload: { id: "event_01", name: "Tokyo Inbound Restaurant Growth Forum" },
      recordId: "event_01",
      searchText: "Tokyo Inbound Restaurant Growth Forum",
      sourceId: "event_01",
      sourceLabel: "Generated event",
      sourceType: "event",
      updatedAt: now,
      workspaceId,
    },
    {
      collectionName: "contacts",
      createdAt: now,
      evidenceIds: ["evidence:contact:01"],
      lifecycleState: "active",
      payload: { displayName: "佐藤 健一", id: "contact_001" },
      recordId: "contact_001",
      searchText: "佐藤 健一",
      sourceId: "contact_001",
      sourceLabel: "Generated contact",
      sourceType: "contact",
      updatedAt: now,
      workspaceId,
    },
    {
      collectionName: "recommendationTests",
      createdAt: now,
      evidenceIds: ["evidence:event:01"],
      lifecycleState: "active",
      payload: { id: "recommendation_test_001", eventId: "event_01" },
      recordId: "recommendation_test_001",
      searchText: "event_01 recommendation",
      sourceId: "recommendation_test_001",
      sourceLabel: "Generated recommendation test",
      sourceType: "ai_analysis",
      updatedAt: now,
      workspaceId,
    },
    {
      collectionName: "evidence",
      createdAt: now,
      evidenceIds: ["evidence:event:01"],
      lifecycleState: "active",
      payload: { id: "evidence:event:01", targetId: "event_01" },
      recordId: "evidence:event:01",
      searchText: "source evidence",
      sourceId: "evidence:event:01",
      sourceLabel: "Generated evidence",
      sourceType: "evidence",
      updatedAt: now,
      workspaceId,
    },
  ]);
  const plannerOutput = JSON.stringify({
    assistantMessage: "我会从活动和人脉上下文里准备一个可复核推荐。",
    intent: "event_recommendations",
    toolRequests: [
      {
        arguments: { topic: "interesting events" },
        requiresUserConfirmation: true,
        toolName: "events.recommend",
      },
    ],
  });
  let fetchCount = 0;
  const trace = createLiveOrbitAgentTrace({
    apiKey: "test-gemini-key",
    fetchImplementation: (async () => {
      fetchCount += 1;

      return geminiTextResponse(plannerOutput);
    }) as typeof fetch,
    liveRecordStore,
    liveRecordWorkspaceId: workspaceId,
    maxLoopSteps: 1,
  });
  const result = await trace.traceMessage({
    locale: "zh",
    message: "帮我看看有什么值得参加的活动",
  });
  const databaseInteraction = result.data?.fullChain.databaseInteractions[0];

  assert.equal(result.success, true);
  assert.equal(fetchCount, 1);
  assert.equal(databaseInteraction?.adapterKind, "remote");
  assert.equal(databaseInteraction?.storageKey, "orbit_records");
  assert.equal(databaseInteraction?.operation, "read");
  assert.equal(databaseInteraction?.liveDatabaseReadExecuted, true);
  assert.equal(databaseInteraction?.liveDatabaseWriteExecuted, false);
  assert.match(databaseInteraction?.source ?? "", /live-record-store/);
  assert.match(databaseInteraction?.summary ?? "", /remote live/i);
  assert.deepEqual(
    Object.fromEntries(
      (databaseInteraction?.collections ?? []).map((collection) => [
        collection.collectionName,
        {
          recordCount: collection.recordCount,
          selectedForTools: collection.selectedForTools,
        },
      ]),
    ),
    {
      accounts: { recordCount: 0, selectedForTools: true },
      attendees: { recordCount: 0, selectedForTools: true },
      connections: { recordCount: 0, selectedForTools: true },
      contacts: { recordCount: 1, selectedForTools: true },
      eventParticipantIntents: { recordCount: 0, selectedForTools: true },
      events: { recordCount: 1, selectedForTools: true },
      evidence: { recordCount: 1, selectedForTools: true },
      matchRecommendations: { recordCount: 0, selectedForTools: true },
      profiles: { recordCount: 0, selectedForTools: true },
      recommendationTests: { recordCount: 1, selectedForTools: true },
    },
  );
});
