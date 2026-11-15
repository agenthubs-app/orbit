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
import type { OrbitAgentArtifactPayload } from "../../orbit-ai/artifact-contract";
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
    const reply = result.data.assistantMessage.trim() || assistant?.content.trim() || "";
    // The runtime's reply assumes its result cards are shown under it (gemini-provider synthesis
    // instruction: "do not list those records again in prose"). The result document has no cards,
    // so the cards' content is written into the delivered text; otherwise the records are lost.
    const text = [reply, cardsAsText(result.data.artifacts ?? [], input.locale)].filter(Boolean).join("\n\n");
    return { sourceRefs: [...new Set(result.data.provenance?.evidenceIds ?? [])].filter((id) => typeof id === "string" && id.trim()), text };
  };
}

const CARD_HEADER: Record<string, string> = { en: "Result cards:", ja: "結果カード：", zh: "结果卡片：" };

/** The runtime's result cards (artifact generated views) as plain text, in the order it returned them. */
export function cardsAsText(artifacts: readonly OrbitAgentArtifactPayload[], locale: string): string {
  const blocks: string[] = [];
  for (const artifact of artifacts) {
    const view = artifact.result?.generatedView;
    const sections = (view?.sections ?? []).filter((section) => section.items?.length);
    if (!sections.length) continue;
    const lines: string[] = [];
    for (const section of sections) {
      if (section.title?.trim()) lines.push(`${section.title.trim()}`);
      for (const item of section.items.slice(0, 10)) {
        lines.push(`- ${item.title}${item.subtitle ? `（${item.subtitle}）` : ""}`);
        for (const field of (item.metadata ?? []).slice(0, 8)) lines.push(`  ${field.label}: ${field.value}`);
        if (item.body?.trim()) lines.push(`  ${item.body.trim().slice(0, 500)}`);
      }
    }
    blocks.push(lines.join("\n"));
  }
  return blocks.length ? `${CARD_HEADER[locale] ?? CARD_HEADER.en}\n${blocks.join("\n\n")}` : "";
}

/** Appends the turn to the chat session so its history (and later turns) see it; idempotent by message id. */
export function createSessionWriter(provider: OrbitAgentChatSessionProvider): AgentEntrySessionWriter {
  return {
    async history(sessionId) {
      const session = await provider.getSession(sessionId, { limit: ORBIT_AGENT_CHAT_HISTORY_WINDOW });
      const messages = (session?.messages ?? []).slice(-ORBIT_AGENT_CHAT_HISTORY_WINDOW);
      // A user turn with no reply after it was stopped (or failed) before anything was delivered;
      // the next turn answers its own message, so the stopped one is left out of the model's context.
      return messages
        .filter((message, index) => message.role !== "user" || messages[index + 1]?.role === "assistant")
        .map(({ role, text }) => ({ content: text, role }));
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
