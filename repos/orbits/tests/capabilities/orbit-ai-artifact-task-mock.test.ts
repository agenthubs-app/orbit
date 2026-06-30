import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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
    `${pathFromRoot} must exist for the Orbit Agent artifact task mock`,
  );

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

function assertNoLiveProviderCalls(filePath: string): void {
  const source = readFileSync(join(projectRoot, filePath), "utf8");

  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /Supabase|createClient|OAuth/i);
  assert.doesNotMatch(source, /XMLHttpRequest|WebSocket|EventSource/);
  assert.doesNotMatch(source, /navigator|mediaDevices|localStorage|indexedDB/);
  assert.doesNotMatch(source, /from ["']node:net["']|from ["']node:http/);
  assert.doesNotMatch(source, /Anthropic|DeepSeek|OpenAI|Pinecone|Weaviate|Qdrant/);
  assert.doesNotMatch(source, /sendgrid|postmark|gmail|calendar\.google/i);
}

function countJsonStringifyCalls<TValue>(
  run: () => TValue,
): { count: number; value: TValue } {
  const originalStringify = JSON.stringify;
  let count = 0;

  JSON.stringify = ((...args: Parameters<typeof JSON.stringify>) => {
    count += 1;
    return originalStringify(...args);
  }) as typeof JSON.stringify;

  try {
    const value = run();

    return { count, value };
  } finally {
    JSON.stringify = originalStringify;
  }
}

test("Orbit Agent artifact task service is registered behind the module factory", async () => {
  const factoryModule = await importProjectModule<{
    createOrbitAgentArtifactTaskService: (mode?: string) => {
      createArtifactTask: (input: {
        kind: string;
        query: string;
      }) => { success: boolean };
      getArtifactTask: (input: { artifactId: string }) => { success: boolean };
    };
    orbitAgentArtifactTaskServiceFactory: {
      availableModes: readonly string[];
      capabilityId: string;
    };
  }>("features/orbit-ai/service-factory.ts");

  assert.equal(
    factoryModule.orbitAgentArtifactTaskServiceFactory.capabilityId,
    "orbit-agent-artifact-task",
  );
  assert.deepEqual(
    factoryModule.orbitAgentArtifactTaskServiceFactory.availableModes,
    ["mock"],
  );

  const service = factoryModule.createOrbitAgentArtifactTaskService("mock");
  assert.equal(typeof service.createArtifactTask, "function");
  assert.equal(typeof service.getArtifactTask, "function");
});

test("mock artifact task creates a traceable ready event recommendation view", async () => {
  const serviceModule = await importProjectModule<{
    createMockOrbitAgentArtifactTaskService: () => {
      createArtifactTask: (input: {
        conversationId?: string | null;
        kind: string;
        presentation?: { preferredSurface?: string; title?: string };
        query: string;
      }) => {
        success: boolean;
        data?: {
          result: {
            generatedView: {
              sections: readonly {
                items: readonly {
                  actions: readonly { requiresConfirmation: boolean }[];
                  evidenceIds: readonly string[];
                  title: string;
                }[];
              }[];
              summary: string;
            } | null;
            kind: string;
            presentation: { preferredSurface: string; title: string };
            provenance: {
              generationMethod: string;
              sourceModules: readonly string[];
              toolCalls: readonly { status: string; toolName: string }[];
            };
            safety: {
              aiProviderRequested: false;
              domainWritesExecuted: false;
              externalSideEffectsExecuted: false;
              liveDatabaseReadExecuted: false;
            };
            status: string;
          };
          task: {
            artifactId: string;
            conversationId: string | null;
            kind: string;
            status: string;
            subAgent: string;
          };
        };
      };
    };
  }>("features/orbit-ai/mock-artifact-task-service.ts");

  const service = serviceModule.createMockOrbitAgentArtifactTaskService();
  const result = service.createArtifactTask({
    conversationId: "demo-orbit-agent-conversation-1",
    kind: "event_recommendations",
    presentation: {
      preferredSurface: "side_panel",
      title: "Events for Maya",
    },
    query: "推荐下周适合见 Maya 的活动",
  });

  assert.equal(result.success, true);
  assert.equal(result.data?.task.status, "ready");
  assert.equal(result.data?.task.kind, "event_recommendations");
  assert.equal(result.data?.task.subAgent, "event_recommendation_agent");
  assert.equal(result.data?.result.status, "ready");
  assert.equal(result.data?.result.generatedView?.sections[0]?.items[0]?.actions[0]?.requiresConfirmation, true);
  assert.equal(result.data?.result.presentation.preferredSurface, "side_panel");
  assert.equal(result.data?.result.presentation.title, "Events for Maya");
  assert.equal(result.data?.result.provenance.generationMethod, "sub-agent-generated-view");
  assert.equal(result.data?.result.provenance.sourceModules.includes("events"), true);
  assert.equal(result.data?.result.provenance.toolCalls[0]?.toolName, "events.recommend");
  assert.equal(result.data?.result.provenance.toolCalls[0]?.status, "completed");
  assert.equal(result.data?.result.safety.aiProviderRequested, false);
  assert.equal(result.data?.result.safety.domainWritesExecuted, false);
  assert.equal(result.data?.result.safety.externalSideEffectsExecuted, false);
  assert.equal(result.data?.result.safety.liveDatabaseReadExecuted, false);
});

test("preview artifact task service does not deep-clone fresh generated payloads", async () => {
  const serviceModule = await importProjectModule<{
    createOrbitAgentArtifactPreviewService: () => {
      createArtifactTask: (input: {
        kind: string;
        query: string;
      }) => {
        data?: { result: { presentation: { title: string } } };
        success: boolean;
      };
    };
  }>("features/orbit-ai/artifact-task-preview-service.ts");

  const service = serviceModule.createOrbitAgentArtifactPreviewService();
  const { count, value: result } = countJsonStringifyCalls(() =>
    service.createArtifactTask({
      kind: "event_recommendations",
      query: "推荐下周适合认识投资人的活动",
    }),
  );

  assert.equal(result.success, true);
  assert.equal(result.data?.result.presentation.title, "Event recommendations");
  assert.equal(count, 0);
});

test("mock artifact task supports contact chat and follow-up generated views", async () => {
  const serviceModule = await importProjectModule<{
    createMockOrbitAgentArtifactTaskService: () => {
      createArtifactTask: (input: { kind: string; query: string }) => {
        success: boolean;
        data?: {
          result: {
            generatedView: { summary: string } | null;
            provenance: {
              sourceModules: readonly string[];
              toolCalls: readonly { toolName: string }[];
            };
          };
          task: { subAgent: string };
        };
      };
    };
  }>("features/orbit-ai/mock-artifact-task-service.ts");

  const service = serviceModule.createMockOrbitAgentArtifactTaskService();
  const contactResult = service.createArtifactTask({
    kind: "contact_recommendations",
    query: "帮我推荐该联系的人",
  });
  const chatResult = service.createArtifactTask({
    kind: "relationship_chat_context",
    query: "帮我整理回复上下文",
  });
  const followupResult = service.createArtifactTask({
    kind: "followup_queue",
    query: "帮我看看今天该跟进谁",
  });

  assert.equal(contactResult.success, true);
  assert.equal(contactResult.data?.task.subAgent, "contact_recommendation_agent");
  assert.equal(contactResult.data?.result.provenance.sourceModules.includes("contacts"), true);
  assert.equal(contactResult.data?.result.provenance.toolCalls[0]?.toolName, "contacts.recommend");

  assert.equal(chatResult.success, true);
  assert.equal(chatResult.data?.task.subAgent, "relationship_chat_review_agent");
  assert.equal(chatResult.data?.result.provenance.sourceModules.includes("chat"), true);
  assert.equal(chatResult.data?.result.provenance.toolCalls[0]?.toolName, "chat.context");

  assert.equal(followupResult.success, true);
  assert.equal(followupResult.data?.task.subAgent, "followup_review_agent");
  assert.equal(followupResult.data?.result.provenance.sourceModules.includes("followups"), true);
  assert.equal(followupResult.data?.result.provenance.toolCalls[0]?.toolName, "followups.reviewQueue");
});

test("mock artifact task can return pending state without generated view", async () => {
  const serviceModule = await importProjectModule<{
    createMockOrbitAgentArtifactTaskService: () => {
      createArtifactTask: (input: {
        kind: string;
        query: string;
        scenario?: string;
      }) => {
        success: boolean;
        data?: {
          result: {
            generatedView: unknown;
            nextAction: string;
            provenance: { generationMethod: string; toolCalls: readonly { status: string }[] };
            status: string;
          };
          task: { status: string };
        };
      };
    };
  }>("features/orbit-ai/mock-artifact-task-service.ts");

  const service = serviceModule.createMockOrbitAgentArtifactTaskService();
  const result = service.createArtifactTask({
    kind: "event_recommendations",
    query: "推荐活动",
    scenario: "pending",
  });

  assert.equal(result.success, true);
  assert.equal(result.data?.task.status, "pending");
  assert.equal(result.data?.result.status, "pending");
  assert.equal(result.data?.result.generatedView, null);
  assert.equal(result.data?.result.provenance.generationMethod, "rule-based-artifact-task");
  assert.equal(result.data?.result.provenance.toolCalls[0]?.status, "planned");
  assert.match(result.data?.result.nextAction ?? "", /loading|do not execute/i);
});

test("mock artifact task validates input and keeps live providers unused", async () => {
  const serviceModule = await importProjectModule<{
    createMockOrbitAgentArtifactTaskService: () => {
      createArtifactTask: (input: {
        kind: string;
        query: string;
        scenario?: string;
      }) => { success: boolean; error?: { appCode: string; code: string } };
      getArtifactTask: (input: {
        artifactId: string;
        scenario?: string;
      }) => { success: boolean; error?: { appCode: string; code: string } };
    };
  }>("features/orbit-ai/mock-artifact-task-service.ts");

  const service = serviceModule.createMockOrbitAgentArtifactTaskService();
  const blankQuery = service.createArtifactTask({
    kind: "event_recommendations",
    query: "   ",
  });
  const unsupportedKind = service.createArtifactTask({
    kind: "unknown_kind",
    query: "recommend something",
  });
  const missingArtifact = service.getArtifactTask({
    artifactId: "artifact:missing:demo",
  });
  const controlledFailure = service.createArtifactTask({
    kind: "event_recommendations",
    query: "recommend events",
    scenario: "failure",
  });

  assert.equal(blankQuery.success, false);
  assert.equal(blankQuery.error?.code, "ORBIT_AGENT_ARTIFACT_QUERY_REQUIRED");
  assert.equal(blankQuery.error?.appCode, "VALIDATION_ERROR");
  assert.equal(unsupportedKind.success, false);
  assert.equal(
    unsupportedKind.error?.code,
    "ORBIT_AGENT_ARTIFACT_UNSUPPORTED_KIND",
  );
  assert.equal(missingArtifact.success, false);
  assert.equal(missingArtifact.error?.code, "ORBIT_AGENT_ARTIFACT_NOT_FOUND");
  assert.equal(controlledFailure.success, false);
  assert.equal(
    controlledFailure.error?.code,
    "ORBIT_AGENT_ARTIFACT_MOCK_FAILED",
  );

  assertNoLiveProviderCalls("features/orbit-ai/mock-artifact-task-service.ts");
});
