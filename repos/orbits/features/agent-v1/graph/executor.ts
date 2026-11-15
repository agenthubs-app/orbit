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
import type { AgentResultDocument } from "../../../shared/contract/agent-v1";
import type { ContextMessage } from "../context/build";
import { configuredAgentSessionStateStore, type NamedRecordRef } from "../context/session-state";
import { configuredAgentEntryStore } from "../entry/configured-store";
import { conversationCardId, runWithConfirmBoundary } from "../entry/confirm-boundary";
import { AgentEntryExecutionError, type AgentEntryExecuteInput, type AgentEntryExecutor } from "../entry/service";
import type { AgentEntryAmendment, AgentEntryStore } from "../entry/store";
import { emitTrace } from "../observability/trace";
import { GraphNotPausedError, resumeAgentGraph, runAgentGraph, type AgentGraphResult } from "./build";
import { configuredCheckpointer } from "./checkpointer";
import type { AgentGraphDependencies, AgentGraphInput } from "./deps";
import type { GraphResolution } from "./state";

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
    // AG04: an @ note or event is kept by its kind only — it picks the most likely reading (笔记看摘要) —
    // and is neither read nor named until AG05 authorizes those references (references/authorize.ts).
    return references
      .filter((reference: AiSessionReferenceContract) => (reference.type === "contact" && names.has(reference.id)) || reference.type === "note" || reference.type === "event")
      .map((reference): NamedRecordRef => (reference.type === "contact"
        ? { id: reference.id, name: names.get(reference.id)!, type: "contact" }
        : { id: reference.id, name: "", type: reference.type === "note" ? "memo" : "event" }));
  };
}

/** The labels and names a resumed request shows come from its result document, never from the checkpoint. */
function namesIn(document: AgentResultDocument | undefined): Record<string, string> {
  const names: Record<string, string> = {};
  for (const set of document?.clarifications ?? []) for (const option of set.options) if (option.ref?.id && option.ref.name) names[option.ref.id] = option.ref.name;
  return names;
}

const graphInputOf = (actorId: string, requestId: string, sessionId: string, input: AgentEntryExecuteInput["input"], cardPrepared: boolean): AgentGraphInput => ({
  actorId,
  cardPrepared,
  locale: input.locale,
  message: input.message,
  references: input.references,
  requestId,
  sessionId,
  ...(input.pageContext ? { pageContext: input.pageContext } : {}),
});

/**
 * AG04 (AG03 open item 2): an earlier request that this round answered, or whose question was shelved,
 * is resumed from its pause and its result document written back — the part from where it was continued
 * (or unfinished when shelved), the question answered or shelved. No model is called.
 */
async function writeBackEarlier(deps: AgentGraphDependencies, store: AgentEntryStore, actorId: string, earlier: AgentGraphResult["earlier"], now: () => string): Promise<void> {
  for (const { requestId, resolution } of earlier) {
    const record = await store.get(actorId, requestId).catch(() => null);
    if (!record) continue;
    let amendment: AgentEntryAmendment;
    try {
      const resumed = await resumeAgentGraph(deps, graphInputOf(actorId, requestId, record.sessionId, record.input, false), resolution, { names: namesIn(record.document), previousClarifications: record.document.clarifications ?? null });
      amendment = { clarifications: resumed.clarifications, partResults: resumed.partResults, status: resumed.status };
    } catch (error) {
      if (!(error instanceof GraphNotPausedError)) {
        emitTrace({ error: error instanceof Error ? error.message : String(error), requestId, type: "error", where: "executor.write_back" });
      }
      amendment = patchDocument(record.document, resolution);
    }
    await store.amend({ actorId, amendment, now: now(), requestId });
    emitTrace({ kind: resolution.kind, partResults: amendment.partResults.map((part) => ({ partId: part.partId, status: part.status })), requestId, status: amendment.status, type: "request.written_back" });
  }
}

/** Without a paused thread (an older request): the same write-back applied to the document directly. */
function patchDocument(document: AgentResultDocument, resolution: GraphResolution): AgentEntryAmendment {
  const set = (document.clarifications ?? []).find((item) => item.clarificationId === resolution.clarificationId);
  const clarifications = (document.clarifications ?? []).map((item) => (item === set ? { ...item, ...(resolution.kind === "continued" ? { answeredBy: resolution.requestId, state: "answered" as const } : { state: "shelved" as const }) } : item));
  const partResults = document.partResults.map((part) => {
    if (!set || part.partId !== set.partId) return part;
    if (resolution.kind === "continued") return { ...part, status: resolution.status, ...(resolution.reason ? { reason: resolution.reason } : {}), ...(resolution.route ? { route: resolution.route } : {}) };
    if (resolution.kind === "shelve" && part.status === "awaiting_clarification") return { ...part, reason: "shelved", status: "unfinished" as const };
    return part;
  });
  const status = partResults.some((part) => part.status === "awaiting_acceptance" || part.status === "awaiting_clarification") ? "waiting_user" : "completed";
  return { clarifications, partResults, status };
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
  /** AG04: where earlier requests are written back (the entry's own store by default). */
  entryStore?: AgentEntryStore | null;
}

export function createGraphExecutor(mode: FeatureMode, overrides: GraphExecutorOverrides = {}): AgentEntryExecutor {
  return async (execution) => {
    const entryStore = overrides.entryStore === undefined ? configuredAgentEntryStore(mode) : overrides.entryStore;
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
    if (execution.resume) {
      // AG04: a click resumes this request's paused thread; no message, no confirmation boundary, no model.
      const resumed = await resumeAgentGraph(deps, graphInputOf(execution.actorId, execution.requestId, execution.sessionId, execution.input, false), { clarificationId: execution.resume.clarificationId, kind: "select", optionId: execution.resume.optionId }, { names: namesIn(execution.document), previousClarifications: execution.document?.clarifications ?? null });
      return { clarifications: resumed.clarifications, partResults: resumed.partResults, sourceRefs: [], status: resumed.status, text: resumed.text };
    }
    const cardPrepared = Boolean(await runtime.getAction(conversationCardId(execution.requestId)).catch(() => null));
    let graph: AgentGraphResult | null = null;
    const boundary = await runWithConfirmBoundary({ now: deps.now, runtime }, {
      locale: execution.input.locale,
      message: execution.input.message,
      requestId: execution.requestId,
      run: async () => {
        graph = await runAgentGraph(deps, graphInputOf(execution.actorId, execution.requestId, execution.sessionId, execution.input, cardPrepared));
        return { reply: graph.text, sourceRefs: [] };
      },
      sessionId: execution.sessionId,
    });
    const settled = graph as AgentGraphResult | null;
    if (!settled) return { actionPreview: boundary.actionPreview, sourceRefs: boundary.sourceRefs, text: boundary.text };
    if (settled.earlier.length && entryStore) await writeBackEarlier(deps, entryStore, execution.actorId, settled.earlier, deps.now);
    const operationId = boundary.actionPreview?.operations[0]?.operationId;
    const partResults = settled.partResults.map((part) => (part.status === "awaiting_confirmation" && operationId ? { ...part, operationId } : part));
    return {
      ...(boundary.actionPreview ? { actionPreview: boundary.actionPreview } : {}),
      ...(settled.clarifications.length ? { clarifications: settled.clarifications } : {}),
      partResults,
      sourceRefs: boundary.sourceRefs,
      status: settled.status,
      text: boundary.text,
    };
  };
}
