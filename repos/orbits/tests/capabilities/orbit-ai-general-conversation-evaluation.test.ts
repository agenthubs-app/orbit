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
    `${pathFromRoot} must exist for Sprint 88 general conversation evaluation`,
  );

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

interface GeneralConversationCase {
  expectedIntent: string;
  expectedNeedsTool: boolean;
  id: string;
  locale?: "en" | "zh";
  message: string;
  history?: readonly { content: string; role: "assistant" | "user" }[];
}

interface GeneralConversationResult {
  decision: {
    detectedToolFamilies: readonly string[];
    intent: string;
    needsTool: boolean;
    reason: string;
    safety: {
      externalSideEffectsAllowed: false;
      toolCallsExecuted: false;
    };
  };
  reply: {
    contextReferences: readonly string[];
    message: string;
  };
}

test("general conversation router evaluates ten named no-tool and context cases", async () => {
  const module = await importProjectModule<{
    ORBIT_AI_GENERAL_CONVERSATION_CONTEXT_MEMORY_THRESHOLD: number;
    ORBIT_AI_GENERAL_CONVERSATION_EVALUATION_CASES: readonly GeneralConversationCase[];
    ORBIT_AI_GENERAL_CONVERSATION_NO_TOOL_THRESHOLD: number;
    createOrbitAiGeneralConversationService: () => {
      evaluateCases: () => {
        contextMemoryAccuracy: number;
        noToolAccuracy: number;
        results: readonly (GeneralConversationResult & { id: string })[];
      };
      generateReply: (input: GeneralConversationCase) => GeneralConversationResult;
      routeTurn: (input: GeneralConversationCase) => GeneralConversationResult["decision"];
    };
  }>("features/orbit-ai/general-conversation-service.ts");

  assert.deepEqual(
    module.ORBIT_AI_GENERAL_CONVERSATION_EVALUATION_CASES.map(
      (item) => item.id,
    ),
    [
      "greeting",
      "preference_memory",
      "clarification",
      "unsafe_side_effect_refusal",
      "bilingual_context",
      "pronoun_reference",
      "followup_continuation",
      "event_continuation",
      "off_topic_small_talk",
      "no_tool_boundary",
    ],
  );

  const service = module.createOrbitAiGeneralConversationService();
  const evaluation = service.evaluateCases();

  assert.equal(evaluation.results.length, 10);
  assert.ok(
    evaluation.noToolAccuracy >=
      module.ORBIT_AI_GENERAL_CONVERSATION_NO_TOOL_THRESHOLD,
    "ordinary and unsafe-boundary prompts must avoid tool execution",
  );
  assert.ok(
    evaluation.contextMemoryAccuracy >=
      module.ORBIT_AI_GENERAL_CONVERSATION_CONTEXT_MEMORY_THRESHOLD,
    "context-memory prompts must preserve recent preferences and references",
  );

  for (const evaluationCase of module.ORBIT_AI_GENERAL_CONVERSATION_EVALUATION_CASES) {
    const result = service.generateReply(evaluationCase);

    assert.equal(
      result.decision.intent,
      evaluationCase.expectedIntent,
      `${evaluationCase.id} should expose an inspectable routing decision`,
    );
    assert.equal(
      result.decision.needsTool,
      evaluationCase.expectedNeedsTool,
      `${evaluationCase.id} should make the no-tool/tool boundary explicit`,
    );
    assert.equal(result.decision.safety.externalSideEffectsAllowed, false);
    assert.equal(result.decision.safety.toolCallsExecuted, false);
    assert.ok(result.decision.reason.length > 8);
    assert.ok(result.reply.message.length > 12);
  }
});

test("router distinguishes ordinary chat from contact, event, follow-up, calendar, and to-do intents", async () => {
  const module = await importProjectModule<{
    createOrbitAiGeneralConversationService: () => {
      routeTurn: (input: {
        history?: readonly { content: string; role: "assistant" | "user" }[];
        message: string;
      }) => {
        detectedToolFamilies: readonly string[];
        intent: string;
        needsTool: boolean;
      };
    };
  }>("features/orbit-ai/general-conversation-service.ts");
  const service = module.createOrbitAiGeneralConversationService();
  const cases = [
    {
      expectedFamily: null,
      expectedIntent: "general_conversation",
      message: "Good morning, how are you?",
    },
    {
      expectedFamily: "contacts",
      expectedIntent: "contact_discovery",
      message: "Who can introduce me to a Japan SaaS channel partner?",
    },
    {
      expectedFamily: "events",
      expectedIntent: "event_discovery",
      message: "Recommend events where I can meet enterprise AI buyers.",
    },
    {
      expectedFamily: "followups",
      expectedIntent: "followup_context",
      message: "What follow-up should I review for Akari this week?",
    },
    {
      expectedFamily: "followups",
      expectedIntent: "followup_context",
      message: "总结和Aoba的关系上下文",
    },
    {
      expectedFamily: "calendar",
      expectedIntent: "calendar_staging",
      message: "Help stage a calendar hold for next Tuesday.",
    },
    {
      expectedFamily: "todo",
      expectedIntent: "todo_synthesis",
      message: "Turn my relationship notes into a to-do list.",
    },
  ];

  for (const item of cases) {
    const decision = service.routeTurn({ message: item.message });

    assert.equal(decision.intent, item.expectedIntent, item.message);
    assert.equal(
      decision.detectedToolFamilies.includes(item.expectedFamily ?? ""),
      Boolean(item.expectedFamily),
      item.message,
    );
  }
});

test("router uses embedded recent context without treating old tool words as the current intent", async () => {
  const module = await importProjectModule<{
    createOrbitAiGeneralConversationService: () => {
      routeTurn: (input: { message: string }) => {
        detectedToolFamilies: readonly string[];
        intent: string;
        needsTool: boolean;
      };
    };
  }>("features/orbit-ai/general-conversation-service.ts");
  const service = module.createOrbitAiGeneralConversationService();

  const ordinaryDecision = service.routeTurn({
    message:
      "Recent conversation context:\nassistant: We were comparing AI events for founder fundraising.\n\nCurrent user message:\nThanks, normal chat for now.",
  });
  const continuationDecision = service.routeTurn({
    message:
      "Recent conversation context:\nassistant: We were comparing AI events for founder fundraising.\n\nCurrent user message:\nContinue with that event option.",
  });

  assert.equal(ordinaryDecision.intent, "general_conversation");
  assert.equal(ordinaryDecision.needsTool, false);
  assert.deepEqual(ordinaryDecision.detectedToolFamilies, []);
  assert.equal(continuationDecision.intent, "event_discovery");
  assert.equal(continuationDecision.needsTool, true);
  assert.deepEqual(continuationDecision.detectedToolFamilies, ["events"]);
});

test("mock and live conversation services expose general routing decisions without tool artifacts", async () => {
  const mockModule = await importProjectModule<{
    createMockOrbitAgentConversationService: () => {
      sendMessage: (input: {
        history?: readonly { content: string; role: "assistant" | "user" }[];
        locale?: "en" | "zh";
        message?: string | null;
      }) => {
        success: boolean;
        data?: {
          artifacts: readonly unknown[];
          assistantMessage: string;
          proposedToolIntents: readonly unknown[];
          routingDecision?: { intent: string; needsTool: boolean };
          provenance: { safety: { domainToolCallsExecuted: boolean } };
        };
      };
    };
  }>("features/orbit-ai/mock-conversation-service.ts");
  const liveModule = await importProjectModule<{
    createLiveOrbitAgentConversationService: (config?: {
      apiKey?: string | null;
      fetchImplementation?: typeof fetch;
      model?: string;
      provider?: string;
    }) => {
      sendMessage: (input: {
        history?: readonly { content: string; role: "assistant" | "user" }[];
        locale?: "en" | "zh";
        message?: string | null;
      }) => Promise<{
        success: boolean;
        data?: {
          artifacts: readonly unknown[];
          assistantMessage: string;
          proposedToolIntents: readonly unknown[];
          routingDecision?: { intent: string; needsTool: boolean };
          provenance: { safety: { aiProviderRequested: boolean; domainToolCallsExecuted: boolean } };
        };
      }>;
    };
  }>("features/orbit-ai/live-conversation-service.ts");

  const input = {
    history: [
      { content: "I prefer concise English summaries.", role: "user" as const },
      { content: "Noted for this chat.", role: "assistant" as const },
    ],
    locale: "en" as const,
    message: "What style did I prefer?",
  };

  // Mock path stays rule-based and provider-free: it answers general chat
  // locally and never invokes a model.
  const mockResult = mockModule
    .createMockOrbitAgentConversationService()
    .sendMessage(input);

  assert.equal(mockResult.success, true);
  assert.equal(mockResult.data?.routingDecision?.intent, "general_conversation");
  assert.equal(mockResult.data?.routingDecision?.needsTool, false);
  assert.equal(mockResult.data?.artifacts.length, 0);
  assert.equal(mockResult.data?.proposedToolIntents.length, 0);
  assert.equal(mockResult.data?.provenance.safety.domainToolCallsExecuted, false);
  assert.match(mockResult.data?.assistantMessage ?? "", /concise English/i);

  // Live path now routes intent through the model. A general_chat intent
  // returns the model's free-form reply with no tools and no domain tool
  // execution, but it DID invoke the model provider for routing + reply.
  const modelReply = "You preferred concise English summaries for this chat.";
  const liveResult = await liveModule
    .createLiveOrbitAgentConversationService({
      apiKey: "test-key",
      fetchImplementation: (async () =>
        new Response(
          JSON.stringify({
            steps: [
              {
                content: [
                  {
                    text: JSON.stringify({
                      assistantMessage: modelReply,
                      intent: "general_chat",
                      toolRequests: [],
                    }),
                    type: "text",
                  },
                ],
                type: "model_output",
              },
            ],
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        )) as typeof fetch,
      model: "gemini-test-model",
      provider: "gemini",
    })
    .sendMessage(input);

  assert.equal(liveResult.success, true);
  assert.equal(liveResult.data?.routingDecision?.intent, "general_conversation");
  assert.equal(liveResult.data?.routingDecision?.needsTool, false);
  assert.equal(liveResult.data?.artifacts.length, 0);
  assert.equal(liveResult.data?.proposedToolIntents.length, 0);
  assert.equal(liveResult.data?.provenance.safety.domainToolCallsExecuted, false);
  assert.match(liveResult.data?.assistantMessage ?? "", /concise English/i);
  assert.equal(
    liveResult.data?.provenance.safety.aiProviderRequested,
    true,
    "live general chat now routes intent and reply through the model provider",
  );
});

test("general conversation documentation records evaluation loop and thresholds", () => {
  const docPath = join(
    projectRoot,
    "features/orbit-ai/GENERAL_CONVERSATION_EVALUATION.md",
  );

  assert.equal(existsSync(docPath), true);

  const source = readFileSync(docPath, "utf8");

  assert.match(source, /design-evaluation-analysis loop/i);
  assert.match(source, /no-tool correctness/i);
  assert.match(source, /context-memory correctness/i);
  assert.match(source, /100%/);
  assert.match(source, /80%/);
});
