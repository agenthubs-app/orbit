/**
 * Orbit AI artifact contract 测试。
 *
 * 验证 artifact request/result 形状、mock artifact service 和 UI 可复核输出。
 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

async function importProjectModule<TModule>(
  pathFromRoot: string,
): Promise<TModule> {
  const absolutePath = join(projectRoot, pathFromRoot);

  assert.equal(
    existsSync(absolutePath),
    true,
    `${pathFromRoot} must exist for the Orbit AI artifact contract`,
  );

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

test("Orbit AI artifact contract exports supported kinds statuses surfaces and sub-agents", async () => {
  const contract = await importProjectModule<{
    ORBIT_AGENT_ARTIFACT_ERROR_CODES: readonly string[];
    ORBIT_AGENT_ARTIFACT_KINDS: readonly string[];
    ORBIT_AGENT_ARTIFACT_STATUSES: readonly string[];
    ORBIT_AGENT_ARTIFACT_SUB_AGENTS: readonly string[];
    ORBIT_AGENT_ARTIFACT_SURFACES: readonly string[];
  }>("features/orbit-ai/artifact-contract.ts");

  assert.deepEqual(contract.ORBIT_AGENT_ARTIFACT_KINDS, [
    "event_recommendations",
    "contact_recommendations",
    "email_context",
    "followup_queue",
    "relationship_chat_context",
    "generic",
  ]);
  assert.deepEqual(contract.ORBIT_AGENT_ARTIFACT_STATUSES, [
    "pending",
    "ready",
    "failed",
  ]);
  assert.deepEqual(contract.ORBIT_AGENT_ARTIFACT_SURFACES, [
    "side_panel",
    "inline_card",
    "full_page",
  ]);
  assert.deepEqual(contract.ORBIT_AGENT_ARTIFACT_SUB_AGENTS, [
    "event_recommendation_agent",
    "contact_recommendation_agent",
    "followup_review_agent",
    "relationship_chat_review_agent",
  ]);
  assert.deepEqual(contract.ORBIT_AGENT_ARTIFACT_ERROR_CODES, [
    "ORBIT_AGENT_ARTIFACT_QUERY_REQUIRED",
    "ORBIT_AGENT_ARTIFACT_NOT_FOUND",
    "ORBIT_AGENT_ARTIFACT_UNSUPPORTED_KIND",
    "ORBIT_AGENT_ARTIFACT_PENDING",
    "ORBIT_AGENT_ARTIFACT_MOCK_FAILED",
  ]);
});

test("Orbit AI artifact contract supports traceable generated views and safe actions", async () => {
  const contract = await importProjectModule<{
    ORBIT_AGENT_ARTIFACT_FIXTURE_SOURCE: string;
  }>("features/orbit-ai/artifact-contract.ts");
  type ArtifactContract = typeof import("../../features/orbit-ai/artifact-contract");
  type OrbitAgentArtifactPayload = ArtifactContract["OrbitAgentArtifactPayload"];

  const payload: OrbitAgentArtifactPayload = {
    result: {
      artifactId: "artifact:event-recommendations:demo",
      generatedView: {
        sections: [
          {
            items: [
              {
                actions: [
                  {
                    actionId: "event:review-demo",
                    label: "Review event",
                    requiresConfirmation: true,
                  },
                ],
                body: "Good fit for relationship goals.",
                confidenceLabel: "High confidence",
                evidenceIds: ["evidence:event:demo"],
                id: "event-demo-1",
                metadata: [{ label: "When", value: "Next week" }],
                reason: "Matches the user's request for event recommendations.",
                subtitle: "Tokyo",
                title: "Tokyo founder roundtable",
              },
            ],
            title: "Recommended events",
          },
        ],
        summary:
          "The event recommendation sub-agent generated a compact side-panel view.",
      },
      kind: "event_recommendations",
      nextAction: "Ask the user to confirm before taking any event action.",
      presentation: {
        preferredSurface: "side_panel",
        title: "Recommended events",
        widthHint: "half",
      },
      provenance: {
        evidenceIds: ["evidence:event:demo"],
        generatedAt: "2026-06-27T00:00:00.000Z",
        generationMethod: "sub-agent-generated-view",
        source: contract.ORBIT_AGENT_ARTIFACT_FIXTURE_SOURCE,
        sourceModules: ["orbit-ai", "events"],
        toolCalls: [
          {
            evidenceIds: ["evidence:event:demo"],
            reason: "Fetch candidate event recommendations.",
            status: "completed",
            toolCallId: "toolcall:event-recommendations:demo",
            toolName: "events.recommend",
          },
        ],
      },
      safety: {
        actionsRequireConfirmation: true,
        aiProviderRequested: false,
        calendarProviderRequested: false,
        domainWritesExecuted: false,
        emailProviderRequested: false,
        externalNetworkRequested: false,
        externalSideEffectsExecuted: false,
        liveDatabaseReadExecuted: false,
        liveDatabaseWriteExecuted: false,
        notificationDelivered: false,
      },
      status: "ready",
      taskId: "task:event-recommendations:demo",
    },
    task: {
      artifactId: "artifact:event-recommendations:demo",
      conversationId: "demo-orbit-agent-conversation-1",
      createdAt: "2026-06-27T00:00:00.000Z",
      kind: "event_recommendations",
      presentation: {
        preferredSurface: "side_panel",
        title: "Recommended events",
        widthHint: "half",
      },
      query: "Recommend events for next week",
      status: "ready",
      subAgent: "event_recommendation_agent",
      taskId: "task:event-recommendations:demo",
      updatedAt: "2026-06-27T00:00:01.000Z",
    },
  };

  assert.equal(payload.task.status, "ready");
  assert.equal(payload.result.presentation.preferredSurface, "side_panel");
  assert.equal(payload.result.generatedView?.sections[0]?.items[0]?.actions[0]?.requiresConfirmation, true);
  assert.equal(payload.result.provenance.sourceModules.includes("events"), true);
  assert.equal(payload.result.provenance.toolCalls[0]?.status, "completed");
  assert.equal(payload.result.safety.externalSideEffectsExecuted, false);
  assert.equal(payload.result.safety.domainWritesExecuted, false);
});

test("Orbit AI artifact contract maps failures into app errors and runtime context", async () => {
  const contract = await importProjectModule<{
    ORBIT_AGENT_ARTIFACT_ERROR_DEFINITIONS: Record<
      string,
      { appCode: string; code: string; message: string; recovery: string }
    >;
    orbitAgentArtifactFailureContext: (
      result: {
        success: false;
        error: {
          artifactId?: string;
          appCode: string;
          code: string;
          evidenceIds: readonly string[];
          message: string;
          recovery: string;
          state: "failure";
        };
      },
      mode: "mock",
    ) => Record<string, string>;
    orbitAgentArtifactFailureToAppError: (
      result: {
        success: false;
        error: {
          appCode: string;
          code: string;
          evidenceIds: readonly string[];
          message: string;
          recovery: string;
          state: "failure";
        };
      },
    ) => Error & { code?: string };
  }>("features/orbit-ai/artifact-contract.ts");

  const definition =
    contract.ORBIT_AGENT_ARTIFACT_ERROR_DEFINITIONS
      .ORBIT_AGENT_ARTIFACT_QUERY_REQUIRED;
  const failure = {
    success: false as const,
    error: {
      ...definition,
      artifactId: "artifact:missing-query",
      evidenceIds: ["evidence:artifact:validation"],
      state: "failure" as const,
    },
  };
  const appError = contract.orbitAgentArtifactFailureToAppError(failure);
  const context = contract.orbitAgentArtifactFailureContext(failure, "mock");

  assert.equal(definition.appCode, "VALIDATION_ERROR");
  assert.equal(appError.code, "VALIDATION_ERROR");
  assert.equal(context.artifactId, "artifact:missing-query");
  assert.equal(context.orbitFeatureMode, "mock");
  assert.match(context.recovery, /recommendation|artifact/i);
});
