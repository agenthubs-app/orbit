/**
 * live-conversation-service.ts
 *
 * 这是 Orbit Agent live conversation 的 service 外壳。
 * AI Agent 执行链在 live-agent-runtime.ts 中维护，dev trace 也复用同一 runtime。
 */
import {
  type OrbitAgentConversationInput,
  type OrbitAgentConversationResult,
  type OrbitAgentConversationService,
  type OrbitAgentSendMessageInput,
} from "./conversation-contract";
import {
  createLiveOrbitAgentRuntime,
  failure,
  liveConversationId,
  normalizeScenario,
  readText,
  runLiveOrbitAgentRuntime,
  safetyLedger,
  scenarioResult,
  statePayload,
  success,
  type LiveOrbitAgentRuntimeConfig,
} from "./live-agent-runtime";

export interface LiveOrbitAgentConversationServiceConfig
  extends LiveOrbitAgentRuntimeConfig {}

function readyState(): OrbitAgentConversationResult {
  return success(
    statePayload({
      assistantMessage: "Orbit Agent is ready for a natural-language request.",
      safety: safetyLedger({
        aiProviderRequested: false,
        externalNetworkRequested: false,
      }),
      state: "success",
    }),
  );
}

function scenarioFor(
  scenario?: OrbitAgentConversationInput["scenario"],
): OrbitAgentConversationResult | null {
  return scenarioResult(normalizeScenario(scenario));
}

export function createLiveOrbitAgentConversationService(
  config: LiveOrbitAgentConversationServiceConfig = {},
): OrbitAgentConversationService {
  const runtime = createLiveOrbitAgentRuntime({
    ...config,
    defaultMaxLoopSteps: 2,
  });

  return {
    getConversation(input): OrbitAgentConversationResult {
      const scenario = scenarioFor(input.scenario);

      if (scenario) {
        return scenario;
      }

      if (readText(input.conversationId) !== liveConversationId) {
        return failure(
          "ORBIT_AGENT_CONVERSATION_NOT_FOUND",
          safetyLedger({
            aiProviderRequested: false,
            externalNetworkRequested: false,
          }),
        );
      }

      return readyState();
    },

    listConversations(input = {}): OrbitAgentConversationResult {
      const scenario = scenarioFor(input.scenario);

      return scenario ?? readyState();
    },

    async sendMessage(
      input: OrbitAgentSendMessageInput,
    ): Promise<OrbitAgentConversationResult> {
      const scenario = scenarioFor(input.scenario);

      if (scenario) {
        return scenario;
      }

      const runtimeResult = await runLiveOrbitAgentRuntime(runtime, input);

      switch (runtimeResult.state) {
        case "message_required":
        case "planner_failure":
          return runtimeResult.failureResult;
        case "local_boundary":
          return success(runtimeResult.boundaryPayload);
        case "completed":
          return success(runtimeResult.conversation);
      }
    },
  };
}
