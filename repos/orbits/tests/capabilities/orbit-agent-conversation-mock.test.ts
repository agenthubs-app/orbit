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
    `${pathFromRoot} must exist for the Orbit Agent conversation mock`,
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

test("Orbit Agent conversation contract exposes a free-form conversation boundary", async () => {
  const contract = await importProjectModule<{
    ORBIT_AGENT_CONVERSATION_ERROR_CODES: readonly string[];
    ORBIT_AGENT_CONVERSATION_ERROR_DEFINITIONS: Record<
      string,
      { appCode: string; message: string; recovery: string }
    >;
  }>("features/orbit-ai/conversation-contract.ts");
  const serviceSource = readFileSync(
    join(projectRoot, "features/orbit-ai/service.ts"),
    "utf8",
  );
  const factorySource = readFileSync(
    join(projectRoot, "features/orbit-ai/service-factory.ts"),
    "utf8",
  );

  assert.deepEqual(contract.ORBIT_AGENT_CONVERSATION_ERROR_CODES, [
    "ORBIT_AGENT_MESSAGE_REQUIRED",
    "ORBIT_AGENT_CONVERSATION_NOT_FOUND",
    "ORBIT_AGENT_CONVERSATION_EMPTY",
    "ORBIT_AGENT_CONVERSATION_PENDING",
    "ORBIT_AGENT_CONVERSATION_MOCK_FAILED",
    "ORBIT_AGENT_PROVIDER_API_KEY_MISSING",
    "ORBIT_AGENT_PROVIDER_REQUEST_FAILED",
    "ORBIT_AGENT_PROVIDER_SCHEMA_INVALID",
    "ORBIT_AGENT_GEMINI_API_KEY_MISSING",
    "ORBIT_AGENT_GEMINI_REQUEST_FAILED",
    "ORBIT_AGENT_GEMINI_SCHEMA_INVALID",
  ]);
  assert.equal(
    contract.ORBIT_AGENT_CONVERSATION_ERROR_DEFINITIONS
      .ORBIT_AGENT_MESSAGE_REQUIRED.appCode,
    "VALIDATION_ERROR",
  );
  assert.match(serviceSource, /interface OrbitAgentConversationService/);
  assert.match(serviceSource, /sendMessage/);
  assert.match(factorySource, /createOrbitAgentConversationService/);
  assert.match(factorySource, /orbit-agent-conversation/);
});

test("mock Orbit Agent conversation accepts natural language without forcing a tool call", async () => {
  const serviceModule = await importProjectModule<{
    createMockOrbitAgentConversationService: () => {
      listConversations: (input?: { scenario?: string | null }) => {
        success: boolean;
        data?: {
          state: string;
          conversations: readonly unknown[];
          messages: readonly { role: string; content: string }[];
          provenance: {
            safety: {
              domainToolCallsExecuted: false;
              externalSideEffectsExecuted: false;
            };
          };
        };
      };
      sendMessage: (input: {
        message?: string | null;
        scenario?: string | null;
      }) => {
        success: boolean;
        data?: {
          state: string;
          messages: readonly { role: string; content: string }[];
          assistantMessage: string;
          artifacts: readonly unknown[];
          proposedToolIntents: readonly {
            toolFamily: string;
            requiresUserConfirmation: boolean;
          }[];
          provenance: {
            safety: {
              domainToolCallsExecuted: false;
              externalSideEffectsExecuted: false;
              aiProviderRequested: false;
              liveDatabaseWriteExecuted: false;
            };
          };
        };
        error?: { code: string; appCode: string };
      };
    };
  }>("features/orbit-ai/mock-conversation-service.ts");

  const service = serviceModule.createMockOrbitAgentConversationService();
  const listResult = service.listConversations();

  assert.equal(listResult.success, true);
  assert.equal(listResult.data?.state, "success");
  assert.equal(listResult.data?.conversations.length, 1);
  assert.equal(
    listResult.data?.provenance.safety.domainToolCallsExecuted,
    false,
  );

  const generalTurn = service.sendMessage({
    message: "我想先聊一下这个产品怎么帮我规划关系。",
  });

  assert.equal(generalTurn.success, true);
  assert.equal(generalTurn.data?.messages.at(-2)?.role, "user");
  assert.equal(generalTurn.data?.messages.at(-1)?.role, "assistant");
  assert.equal(generalTurn.data?.artifacts.length, 0);
  assert.equal(generalTurn.data?.proposedToolIntents.length, 0);
  assert.match(generalTurn.data?.assistantMessage ?? "", /自然语言|联系人|活动|跟进/);
  assert.equal(
    generalTurn.data?.provenance.safety.domainToolCallsExecuted,
    false,
  );
  assert.equal(
    generalTurn.data?.provenance.safety.externalSideEffectsExecuted,
    false,
  );
  assert.equal(generalTurn.data?.provenance.safety.aiProviderRequested, false);
  assert.equal(
    generalTurn.data?.provenance.safety.liveDatabaseWriteExecuted,
    false,
  );
});

test("mock Orbit Agent conversation can orchestrate an artifact for event recommendations", async () => {
  const serviceModule = await importProjectModule<{
    createMockOrbitAgentConversationService: () => {
      sendMessage: (input: { message?: string | null }) => {
        success: boolean;
        data?: {
          artifacts: readonly {
            result: {
              generatedView: {
                sections: readonly {
                  items: readonly {
                    actions: readonly { requiresConfirmation: boolean }[];
                    title: string;
                  }[];
                }[];
              } | null;
              presentation: { preferredSurface: string };
              provenance: {
                sourceModules: readonly string[];
                toolCalls: readonly { status: string; toolName: string }[];
              };
              safety: {
                aiProviderRequested: false;
                externalSideEffectsExecuted: false;
              };
              status: string;
            };
            task: {
              kind: string;
              status: string;
              subAgent: string;
            };
          }[];
          assistantMessage: string;
          proposedToolIntents: readonly {
            toolFamily: string;
            requiresUserConfirmation: boolean;
          }[];
          provenance: {
            safety: {
              domainToolCallsExecuted: false;
              externalSideEffectsExecuted: false;
            };
          };
        };
        error?: { code: string; appCode: string };
      };
    };
  }>("features/orbit-ai/mock-conversation-service.ts");

  const service = serviceModule.createMockOrbitAgentConversationService();
  const result = service.sendMessage({
    message: "帮我推荐下周适合见 Maya 的活动。",
  });

  assert.equal(result.success, true);
  assert.equal(result.data?.proposedToolIntents[0]?.toolFamily, "relationship_chat");
  assert.equal(result.data?.proposedToolIntents[0]?.requiresUserConfirmation, true);
  assert.match(result.data?.assistantMessage ?? "", /活动推荐|侧边栏|确认/);
  assert.equal(result.data?.artifacts.length, 1);
  assert.equal(result.data?.artifacts[0]?.task.kind, "event_recommendations");
  assert.equal(
    result.data?.artifacts[0]?.task.subAgent,
    "event_recommendation_agent",
  );
  assert.equal(result.data?.artifacts[0]?.result.status, "ready");
  assert.equal(
    result.data?.artifacts[0]?.result.presentation.preferredSurface,
    "side_panel",
  );
  assert.equal(
    result.data?.artifacts[0]?.result.generatedView?.sections[0]?.items[0]
      ?.actions[0]?.requiresConfirmation,
    true,
  );
  assert.equal(
    result.data?.artifacts[0]?.result.provenance.sourceModules.includes("events"),
    true,
  );
  assert.equal(
    result.data?.artifacts[0]?.result.provenance.toolCalls[0]?.toolName,
    "events.recommend",
  );
  assert.equal(
    result.data?.artifacts[0]?.result.provenance.toolCalls[0]?.status,
    "completed",
  );
  assert.equal(
    result.data?.artifacts[0]?.result.safety.aiProviderRequested,
    false,
  );
  assert.equal(
    result.data?.artifacts[0]?.result.safety.externalSideEffectsExecuted,
    false,
  );
  assert.equal(
    result.data?.provenance.safety.domainToolCallsExecuted,
    false,
  );
  assert.equal(
    result.data?.provenance.safety.externalSideEffectsExecuted,
    false,
  );
});

test("mock Orbit Agent conversation routes contact and follow-up intents into artifacts", async () => {
  const serviceModule = await importProjectModule<{
    createMockOrbitAgentConversationService: () => {
      sendMessage: (input: { message?: string | null }) => {
        success: boolean;
        data?: {
          artifacts: readonly {
            result: {
              provenance: {
                sourceModules: readonly string[];
                toolCalls: readonly { toolName: string }[];
              };
            };
            task: { kind: string; subAgent: string };
          }[];
        };
      };
    };
  }>("features/orbit-ai/mock-conversation-service.ts");

  const service = serviceModule.createMockOrbitAgentConversationService();
  const contactResult = service.sendMessage({
    message: "帮我推荐几个应该联系的人脉。",
  });
  const followupResult = service.sendMessage({
    message: "帮我看看今天应该跟进谁。",
  });

  assert.equal(contactResult.success, true);
  assert.equal(contactResult.data?.artifacts[0]?.task.kind, "contact_recommendations");
  assert.equal(
    contactResult.data?.artifacts[0]?.task.subAgent,
    "contact_recommendation_agent",
  );
  assert.equal(
    contactResult.data?.artifacts[0]?.result.provenance.sourceModules.includes("contacts"),
    true,
  );
  assert.equal(
    contactResult.data?.artifacts[0]?.result.provenance.toolCalls[0]?.toolName,
    "contacts.recommend",
  );

  assert.equal(followupResult.success, true);
  assert.equal(followupResult.data?.artifacts[0]?.task.kind, "followup_queue");
  assert.equal(
    followupResult.data?.artifacts[0]?.task.subAgent,
    "followup_review_agent",
  );
  assert.equal(
    followupResult.data?.artifacts[0]?.result.provenance.sourceModules.includes("followups"),
    true,
  );
  assert.equal(
    followupResult.data?.artifacts[0]?.result.provenance.toolCalls[0]?.toolName,
    "followups.reviewQueue",
  );
});

test("mock Orbit Agent conversation validates blank input and keeps live providers unused", async () => {
  const serviceModule = await importProjectModule<{
    createMockOrbitAgentConversationService: () => {
      sendMessage: (input: { message?: string | null }) => {
        success: boolean;
        error?: { code: string; appCode: string };
      };
    };
  }>("features/orbit-ai/mock-conversation-service.ts");

  const service = serviceModule.createMockOrbitAgentConversationService();
  const result = service.sendMessage({ message: "   " });

  assert.equal(result.success, false);
  assert.equal(result.error?.code, "ORBIT_AGENT_MESSAGE_REQUIRED");
  assert.equal(result.error?.appCode, "VALIDATION_ERROR");
  assertNoLiveProviderCalls("features/orbit-ai/mock-conversation-service.ts");
});

test("Orbit Agent conversation API routes return traceable envelopes", async () => {
  const conversationRoute = await importProjectModule<{
    GET: (request: Request) => Promise<Response>;
    POST: (request: Request) => Promise<Response>;
  }>("app/api/ai/conversations/route.ts");
  const conversationByIdRoute = await importProjectModule<{
    GET: (
      request: Request,
      context: { params: Promise<{ id: string }> },
    ) => Promise<Response>;
    POST: (
      request: Request,
      context: { params: Promise<{ id: string }> },
    ) => Promise<Response>;
  }>("app/api/ai/conversations/[id]/route.ts");

  const listResponse = await conversationRoute.GET(
    new Request("https://orbit.local/api/ai/conversations"),
  );
  const listEnvelope = await listResponse.json();

  assert.equal(listResponse.status, 200);
  assert.equal(listResponse.headers.get("Cache-Control"), "no-store");
  assert.equal(
    listResponse.headers.get("X-Orbit-Runtime-Boundary"),
    "developer-admin",
  );
  assert.equal(listEnvelope.success, true);
  assert.equal(
    listEnvelope.data.conversations[0].conversationId,
    "demo-orbit-agent-conversation-1",
  );
  assert.equal(
    listEnvelope.data.provenance.safety.externalSideEffectsExecuted,
    false,
  );

  const promptResponse = await conversationRoute.POST(
    new Request("https://orbit.local/api/ai/conversations", {
      body: JSON.stringify({
        message: "帮我推荐下周适合见 Maya 的活动",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
  );
  const promptEnvelope = await promptResponse.json();

  assert.equal(promptResponse.status, 200);
  assert.match(promptResponse.headers.get("Server-Timing") ?? "", /orbit-total;dur=/);
  assert.match(promptResponse.headers.get("Server-Timing") ?? "", /orbit-read-body;dur=/);
  assert.match(promptResponse.headers.get("Server-Timing") ?? "", /orbit-service;dur=/);
  assert.match(promptResponse.headers.get("Server-Timing") ?? "", /orbit-serialize;dur=/);
  assert.equal(promptEnvelope.success, true);
  assert.equal(promptEnvelope.data.artifacts[0].task.kind, "event_recommendations");
  assert.equal(
    promptEnvelope.data.artifacts[0].result.presentation.preferredSurface,
    "side_panel",
  );
  assert.equal(
    promptEnvelope.data.proposedToolIntents.some(
      (intent: { toolFamily: string; requiresUserConfirmation: boolean }) =>
        intent.toolFamily === "events" && intent.requiresUserConfirmation,
    ),
    true,
  );

  const lookupResponse = await conversationByIdRoute.GET(
    new Request(
      "https://orbit.local/api/ai/conversations/demo-orbit-agent-conversation-1",
    ),
    {
      params: Promise.resolve({ id: "demo-orbit-agent-conversation-1" }),
    },
  );
  const lookupEnvelope = await lookupResponse.json();

  assert.equal(lookupResponse.status, 200);
  assert.equal(lookupEnvelope.success, true);
  assert.equal(
    lookupEnvelope.data.activeConversationId,
    "demo-orbit-agent-conversation-1",
  );

  const missingResponse = await conversationByIdRoute.GET(
    new Request("https://orbit.local/api/ai/conversations/missing-agent-chat"),
    {
      params: Promise.resolve({ id: "missing-agent-chat" }),
    },
  );
  const missingEnvelope = await missingResponse.json();

  assert.equal(missingResponse.status, 404);
  assert.equal(missingEnvelope.success, false);
  assert.equal(missingEnvelope.error.code, "NOT_FOUND");
  assert.match(missingEnvelope.error.context.recovery, /Start a new local/i);

  const blankResponse = await conversationByIdRoute.POST(
    new Request(
      "https://orbit.local/api/ai/conversations/demo-orbit-agent-conversation-1",
      {
        body: JSON.stringify({ message: "   " }),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    ),
    {
      params: Promise.resolve({ id: "demo-orbit-agent-conversation-1" }),
    },
  );
  const blankEnvelope = await blankResponse.json();

  assert.equal(blankResponse.status, 400);
  assert.equal(blankEnvelope.success, false);
  assert.equal(blankEnvelope.error.code, "VALIDATION_ERROR");
  assert.match(blankEnvelope.error.context.recovery, /Keep the conversation/i);
});
