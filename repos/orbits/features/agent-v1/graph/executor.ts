/**
 * The entry's `execute` from AG03 on: the request graph (graph/build.ts) inside the AG02
 * confirmation boundary (entry/confirm-boundary.ts), which stays around it: a bare typed "确认" while
 * a card waits is answered without the graph, a card of this request is shown, typed agreement
 * never decides a card. The graph itself proposes no writes in this sprint.
 */
import type { AiSessionReferenceContract } from "../../../shared/contract/ai-sessions";
import type { FeatureMode } from "../../../shared/config/feature-mode";
import { createOrbitAgentRuntimeService } from "../../agent/runtime/service-factory";
import type { AgentRuntimeService } from "../../agent/runtime/service";
import { createContactDetailTagStatusService } from "../../contacts/service-factory";
import { AiSessionReferenceAuthorizationError, authorizeAiSessionContactReferences } from "../../orbit-ai/ai-session-reference-authorization";
import { createOrbitAgentChatSessionProvider } from "../../orbit-ai/storage/orbit-agent-chat-session-provider-factory";
import type { ContextMessage } from "../context/build";
import { configuredAgentSessionStateStore, type NamedRecordRef } from "../context/session-state";
import { conversationCardId, runWithConfirmBoundary } from "../entry/confirm-boundary";
import { AgentEntryExecutionError, type AgentEntryExecutor } from "../entry/service";
import { runAgentGraph, type AgentGraphResult } from "./build";
import { configuredCheckpointer } from "./checkpointer";
import type { AgentGraphDependencies } from "./deps";

/** How many stored messages are read to find the latest ten answered ones. */
export const CONTEXT_READ_LIMIT = 30;

/** Authorizes the @ contacts (the existing check) and keeps their names; other kinds wait for AG05. */
export function contactReferenceAuthorizer(service: Parameters<typeof authorizeAiSessionContactReferences>[0]["service"] = createContactDetailTagStatusService()): AgentGraphDependencies["authorizeReferences"] {
  return async (actorId, references) => {
    const names = new Map<string, string>();
    try {
      await authorizeAiSessionContactReferences({
        actorId,
        references,
        service: {
          async getContactDetail(lookup) {
            const result = await service.getContactDetail(lookup);
            if (result.success !== false && result.data.contact) names.set(result.data.contact.id, result.data.contact.displayName);
            return result;
          },
        },
      });
    } catch (error) {
      if (error instanceof AiSessionReferenceAuthorizationError) throw new AgentEntryExecutionError(error.code === "REFERENCE_NOT_ACCESSIBLE" ? "REFERENCE_NOT_ACCESSIBLE" : "REFERENCE_UNVERIFIED");
      throw error;
    }
    return references
      .filter((reference: AiSessionReferenceContract) => reference.type === "contact" && names.has(reference.id))
      .map((reference): NamedRecordRef => ({ id: reference.id, name: names.get(reference.id)!, type: "contact" }));
  };
}

function sessionMessagesLoader(mode: FeatureMode, actorId: string): AgentGraphDependencies["loadMessages"] {
  return async (sessionId) => {
    const provider = createOrbitAgentChatSessionProvider(mode, actorId);
    const session = await provider?.getSession(sessionId, { limit: CONTEXT_READ_LIMIT });
    return (session?.messages ?? []).map((message): ContextMessage => ({
      role: message.role,
      text: message.text,
      ...(typeof message.createdAt === "string" ? { createdAt: message.createdAt } : {}),
      ...(Array.isArray(message.recordRefs) ? { recordRefs: message.recordRefs.filter((ref): ref is string => typeof ref === "string") } : {}),
    }));
  };
}

export interface GraphExecutorOverrides extends Partial<AgentGraphDependencies> {
  runtime?: AgentRuntimeService;
}

export function createGraphExecutor(mode: FeatureMode, overrides: GraphExecutorOverrides = {}): AgentEntryExecutor {
  return async (execution) => {
    const runtime = overrides.runtime ?? createOrbitAgentRuntimeService(mode, { actorId: execution.actorId });
    const deps: AgentGraphDependencies = {
      authorizeReferences: overrides.authorizeReferences ?? contactReferenceAuthorizer(),
      checkpointer: overrides.checkpointer ?? (await configuredCheckpointer(mode)),
      fetchImplementation: overrides.fetchImplementation ?? execution.fetchImplementation,
      loadMessages: overrides.loadMessages ?? sessionMessagesLoader(mode, execution.actorId),
      now: overrides.now ?? (() => new Date().toISOString()),
      sessionState: overrides.sessionState ?? configuredAgentSessionStateStore(mode),
      timeZone: overrides.timeZone ?? process.env.ORBIT_DEFAULT_TIME_ZONE ?? "Asia/Tokyo",
      ...(overrides.modelCallLimit !== undefined ? { modelCallLimit: overrides.modelCallLimit } : {}),
    };
    const cardPrepared = Boolean(await runtime.getAction(conversationCardId(execution.requestId)).catch(() => null));
    let graph: AgentGraphResult | null = null;
    const boundary = await runWithConfirmBoundary({ now: deps.now, runtime }, {
      locale: execution.input.locale,
      message: execution.input.message,
      requestId: execution.requestId,
      run: async () => {
        graph = await runAgentGraph(deps, {
          actorId: execution.actorId,
          cardPrepared,
          locale: execution.input.locale,
          message: execution.input.message,
          references: execution.input.references,
          requestId: execution.requestId,
          sessionId: execution.sessionId,
        });
        return { reply: graph.text, sourceRefs: [] };
      },
      sessionId: execution.sessionId,
    });
    const settled = graph as AgentGraphResult | null;
    if (!settled) return { actionPreview: boundary.actionPreview, sourceRefs: boundary.sourceRefs, text: boundary.text };
    const operationId = boundary.actionPreview?.operations[0]?.operationId;
    const partResults = settled.partResults.map((part) => (part.status === "awaiting_confirmation" && operationId ? { ...part, operationId } : part));
    return {
      ...(boundary.actionPreview ? { actionPreview: boundary.actionPreview } : {}),
      partResults,
      sourceRefs: boundary.sourceRefs,
      status: settled.status,
      text: boundary.text,
    };
  };
}
