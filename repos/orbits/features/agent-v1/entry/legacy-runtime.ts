/**
 * AG01 hands processing to the existing runtime, read-only (agent-design AG01 易错边界 4).
 *
 * What the protocol-2 route checks before sending (references, page context) is checked here,
 * at processing time (设计稿 §3.7). The model's write proposals (proposedActionRequests,
 * proposedEntityDraft) are dropped: this entry never calls applyTaskInteraction, applyEntityDraft
 * or persistNaturalLanguageActionProposals, so it shows no card and writes no business data.
 */
import type { FeatureMode } from "../../../shared/config/feature-mode";
import { createAgentFeedbackService } from "../../agent/feedback/service-factory";
import { createAgentMemoryService } from "../../agent/memory/service-factory";
import { createContactCardService } from "../../contacts/card-service";
import { createContactDetailTagStatusService } from "../../contacts/service-factory";
import { AiSessionReferenceAuthorizationError, authorizeAiSessionContactReferences } from "../../orbit-ai/ai-session-reference-authorization";
import type { OrbitAgentSendMessageInput } from "../../orbit-ai/conversation-contract";
import { AiPageContextError, authorizeAiPageContext } from "../../orbit-ai/page-context";
import { createOrbitAgentConversationServiceForActor } from "../../orbit-ai/service-factory";
import { ORBIT_AGENT_CHAT_HISTORY_WINDOW, type OrbitAgentChatSessionProvider } from "../../orbit-ai/storage/orbit-agent-chat-session-live-record-provider";
import { AgentEntryExecutionError, type AgentEntryExecutor, type AgentEntrySessionWriter } from "./service";

export function createLegacyRuntimeExecutor(mode: FeatureMode): AgentEntryExecutor {
  return async ({ actorId, fetchImplementation, history, input }) => {
    try {
      await authorizeAiSessionContactReferences({ actorId, references: input.references, service: createContactDetailTagStatusService() });
    } catch (error) {
      if (error instanceof AiSessionReferenceAuthorizationError) throw new AgentEntryExecutionError(error.code === "REFERENCE_NOT_ACCESSIBLE" ? "REFERENCE_NOT_ACCESSIBLE" : "REFERENCE_UNVERIFIED");
      throw error;
    }
    let pageContext: OrbitAgentSendMessageInput["pageContext"];
    if (input.pageContext) {
      try {
        pageContext = await authorizeAiPageContext({
          actorId,
          countContacts: async (id, filters) => (await createContactCardService({ id }).summary({ industryFilters: filters.industry }, id)).total,
          proposed: input.pageContext,
        });
      } catch (error) {
        if (error instanceof AiPageContextError) throw new AgentEntryExecutionError(error.code);
        throw new AgentEntryExecutionError("PAGE_CONTEXT_UNVERIFIED");
      }
    }
    const memoryService = createAgentMemoryService({ actorId, mode });
    const feedbackService = createAgentFeedbackService({ actorId, mode });
    const pageMemory = pageContext ? [{ category: "page_context", content: JSON.stringify(pageContext) }] : [];
    const service = createOrbitAgentConversationServiceForActor(actorId, undefined, { fetchImplementation });
    const result = await service.sendMessage({
      history: [...history],
      locale: input.locale,
      memory: [...((await memoryService.context()) ?? []), ...pageMemory],
      message: input.message,
      outcomes: await feedbackService.context(),
      ...(pageContext ? { pageContext } : {}),
    });
    if (result.success === false) throw new AgentEntryExecutionError(result.error.code === "ORBIT_AGENT_MESSAGE_REQUIRED" ? "MESSAGE_REQUIRED" : "MODEL_UNAVAILABLE");
    const assistant = [...result.data.messages].reverse().find((message) => message.role === "assistant" && message.content.trim());
    const text = result.data.assistantMessage.trim() || assistant?.content.trim() || "";
    return { sourceRefs: [...new Set(result.data.provenance?.evidenceIds ?? [])].filter((id) => typeof id === "string" && id.trim()), text };
  };
}

/** Appends the turn to the chat session so its history (and later turns) see it; idempotent by message id. */
export function createSessionWriter(provider: OrbitAgentChatSessionProvider): AgentEntrySessionWriter {
  return {
    async history(sessionId) {
      const session = await provider.getSession(sessionId, { limit: ORBIT_AGENT_CHAT_HISTORY_WINDOW });
      return (session?.messages ?? []).slice(-ORBIT_AGENT_CHAT_HISTORY_WINDOW).map(({ role, text }) => ({ content: text, role }));
    },
    async appendUser(sessionId, record, createdAt) {
      const origin = record.input.origin;
      await provider.appendMessages(sessionId, {
        create: {
          createdAt,
          origin: origin
            ? { ...origin, firstSentText: record.input.message, firstUserMessageId: record.clientMessageId, recordedAt: createdAt, references: record.input.references, schemaVersion: 1 }
            : undefined,
          title: record.input.message.slice(0, 120),
        },
        messages: [{ createdAt, id: record.clientMessageId, references: record.input.references, role: "user", text: record.input.message }],
        updatedAt: createdAt,
      });
    },
    async appendAssistant(sessionId, record, text, createdAt) {
      await provider.appendMessages(sessionId, {
        messages: [{ createdAt, id: `assistant:${record.requestId}`, role: "assistant", text }],
        updatedAt: createdAt,
      });
    },
  };
}
