/**
 * The entry's `execute` from AG03 on: the request graph (graph/build.ts) inside the AG02
 * confirmation boundary (entry/confirm-boundary.ts), which stays around it: a bare typed "确认" while
 * a card waits is answered without the graph, a card of this request is shown, typed agreement
 * never decides a card. The graph itself proposes no writes in this sprint.
 */
import type { FeatureMode } from "../../../shared/config/feature-mode";
import { createOrbitAgentRuntimeService } from "../../agent/runtime/service-factory";
import type { AgentRuntimeService } from "../../agent/runtime/service";
import { createOrbitAgentChatSessionProvider } from "../../orbit-ai/storage/orbit-agent-chat-session-provider-factory";
import type { AgentAnswerBlockContract, AgentResultDocument } from "../../../shared/contract/agent-v1";
import { textBlocks } from "../answer/blocks";
import type { ContextMessage } from "../context/build";
import { configuredAgentSessionStateStore } from "../context/session-state";
import { configuredRecordAccess } from "../domains/configured";
import { configuredAgentEntryStore } from "../entry/configured-store";
import { conversationCardId, runWithConfirmBoundary } from "../entry/confirm-boundary";
import { keepEarlierBasis } from "../entry/resume-basis";
import type { AgentEntryExecuteInput, AgentEntryExecutor } from "../entry/service";
import { authorizeReferences } from "../references/authorize";
import type { AgentEntryAmendment, AgentEntryStore } from "../entry/store";
import { emitTrace } from "../observability/trace";
import { GraphNotPausedError, resumeAgentGraph, runAgentGraph, type AgentGraphResult } from "./build";
import { configuredCheckpointer } from "./checkpointer";
import type { AgentGraphDependencies, AgentGraphInput, AgentRecordAccess, ReferenceHandle } from "./deps";
import type { GraphResolution } from "./state";
import { agentCardPreview } from "../../agent/runtime/card-view";
import { cardLocale } from "../../agent/runtime/todo-operations";
import type { AgentCardAccess } from "./deps";
import { configuredWebAccess } from "../web/factory";
import { reviseImportByWords } from "../entry/import-revision";
import { createAgentMemoryService } from "../../agent/memory/service-factory";
import { createAgentAutomationService } from "../../agent/automations/service-factory";
import { ruleSnapshotOf } from "../domains/rule/apply";
import type { RuleSnapshot } from "../domains/rule/ops";
import { reviseCardByWords } from "../entry/card-revision";
import { entryTimeZone } from "../entry/time-zone";
import { isProposalsPausedError } from "../rollout/rollback";

/**
 * AG06: the graph's card is the request's card in the ledger (conversationCardId), frozen through
 * runtime.freezeCard — idempotent per request — and shown as the ledger's one preview.
 */
export function ledgerCardAccess(runtime: AgentRuntimeService, now: () => string): AgentCardAccess {
  return {
    async freeze(input) {
      if (!runtime.freezeCard) return null;
      const frozen = await runtime.freezeCard({ actionId: conversationCardId(input.requestId), intents: input.intents, locale: cardLocale(input.locale), origin: { conversationId: input.sessionId, kind: "conversation", requestId: input.requestId } });
      if (!frozen.action) return null;
      return agentCardPreview(frozen.action, await runtime.getRun(frozen.action.runId), now());
    },
  };
}

/** AG19: the confirmation boundary may add lines after the graph's text (a reminder, a closed card); they follow as paragraphs. */
export function withBoundaryTail(blocks: readonly AgentAnswerBlockContract[], graphText: string, deliveredText: string, language: "zh" | "ja" | "en"): AgentAnswerBlockContract[] {
  if (deliveredText === graphText || !graphText || !deliveredText.startsWith(graphText)) return [...blocks];
  return [...blocks, ...textBlocks(deliveredText.slice(graphText.length), language)];
}

/** How many stored messages are read to find the latest ten answered ones. */
export const CONTEXT_READ_LIMIT = 30;

/**
 * AG05 (设计稿 §3.6, references/authorize.ts): each of the six kinds of @ reference is authorized on its
 * own through the read adapters. One that cannot be opened comes back `accessible: false` (no name) — the
 * part that needs it asks to choose again and the rest of the turn goes on; the turn never fails for it.
 * Replaces AG04's type-only handling of @ notes and events and the contact-only check that threw on the
 * first failure (the old path keeps that check: entry/legacy-runtime.ts).
 */
export function referenceAuthorizer(records: AgentRecordAccess | null): AgentGraphDependencies["authorizeReferences"] {
  return async (actorId, references) => {
    if (!records) return references.map((reference) => ({ accessible: false, id: reference.id, name: "", type: reference.type === "note" ? "memo" : reference.type }));
    const authorized = await authorizeReferences(records.reader, records.scope(actorId), references);
    emitTrace({ references: authorized.map((item) => ({ accessible: item.accessible, id: item.id, reason: item.reason ?? null, type: item.type, ...(item.marks ? { marks: item.marks } : {}) })), type: "references.authorized" });
    return authorized.map((item): ReferenceHandle => ({ id: item.id, name: item.name ?? "", type: item.type, ...(item.accessible ? {} : { accessible: false }), ...(item.marks ? { marks: item.marks } : {}) }));
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
      // AG14: the message's own id, so an answer made with a memory entry changed or deleted since can be told apart.
      ...(typeof message.id === "string" ? { id: message.id } : {}),
    }));
  };
}

export interface GraphExecutorOverrides extends Omit<Partial<AgentGraphDependencies>, "records"> {
  /** AG05: the record access (configured from the database by default; null: none). */
  records?: AgentRecordAccess | null;
  runtime?: AgentRuntimeService;
  /** AG04: where earlier requests are written back (the entry's own store by default). */
  entryStore?: AgentEntryStore | null;
}

export function createGraphExecutor(mode: FeatureMode, overrides: GraphExecutorOverrides = {}): AgentEntryExecutor {
  return async (execution) => {
    const entryStore = overrides.entryStore === undefined ? configuredAgentEntryStore(mode) : overrides.entryStore;
    const runtime = overrides.runtime ?? createOrbitAgentRuntimeService(mode, { actorId: execution.actorId });
    const records = overrides.records === undefined ? configuredRecordAccess() : overrides.records;
    const now = overrides.now ?? (() => new Date().toISOString());
    const deps: AgentGraphDependencies = {
      authorizeReferences: overrides.authorizeReferences ?? referenceAuthorizer(records ?? null),
      cards: overrides.cards ?? ledgerCardAccess(runtime, now),
      checkpointer: overrides.checkpointer ?? (await configuredCheckpointer(mode)),
      ...(records ? { records } : {}),
      fetchImplementation: overrides.fetchImplementation ?? execution.fetchImplementation,
      loadMessages: overrides.loadMessages ?? sessionMessagesLoader(mode, execution.actorId),
      now,
      sessionState: overrides.sessionState ?? configuredAgentSessionStateStore(mode),
      // AG20a (decision 8, §3.1): the device's zone when it sent a real one; else the deployment's, as before.
      timeZone: overrides.timeZone ?? entryTimeZone(execution.input.timeZone, process.env.ORBIT_DEFAULT_TIME_ZONE ?? "Asia/Tokyo").zone,
      ...(overrides.modelCallLimit !== undefined ? { modelCallLimit: overrides.modelCallLimit } : {}),
      ...(execution.onStage ? { onStage: execution.onStage } : {}),
      // AG08: the judgment model, through the same stoppable fetch as the main model; no key: unavailable.
      judgment: overrides.judgment ?? { apiKey: process.env.ORBIT_GEMINI_DECISION_API_KEY?.trim() || null, fetchImplementation: overrides.fetchImplementation ?? execution.fetchImplementation },
      // AG09: the public web, through the same stoppable fetch; switched off or no key: not one web request.
      web: overrides.web ?? configuredWebAccess(mode, overrides.fetchImplementation ?? execution.fetchImplementation),
      // AG14: the account's saved memory (the same canonical account as the settings page; one read per turn).
      memory: overrides.memory ?? { snapshot: (actorId) => createAgentMemoryService({ actorId, mode }).snapshot() },
      // AG15: the account's own scheduled tasks, read through the automation service (the next period comes from the due index).
      rules: overrides.rules ?? { list: async (actorId) => (await createAgentAutomationService({ actorId, mode }).list()).map(ruleSnapshotOf).filter((rule): rule is RuleSnapshot => rule !== null) },
    };
    if (execution.resume) {
      // AG04: a click resumes this request's paused thread; no message, no confirmation boundary, no model.
      const resumed = await resumeAgentGraph(deps, graphInputOf(execution.actorId, execution.requestId, execution.sessionId, execution.input, false), { clarificationId: execution.resume.clarificationId, kind: "select", optionId: execution.resume.optionId }, { names: namesIn(execution.document), previousClarifications: execution.document?.clarifications ?? null });
      // AG07 repair 2 (AE-XL-003): the read answered before the pause is still in the answer; its basis line and links stay.
      const kept = keepEarlierBasis(execution.document ?? null, resumed);
      return { ...(resumed.actionPreview ? { actionPreview: resumed.actionPreview } : {}), basis: kept.basis, ...(resumed.blocks.length ? { blocks: resumed.blocks } : {}), ...(resumed.memoryUse.length ? { memoryUse: resumed.memoryUse } : {}), ...(resumed.cardLine && resumed.text.includes(resumed.cardLine) ? { cardLine: resumed.cardLine } : {}), clarifications: resumed.clarifications, partResults: resumed.partResults, sourceRefs: kept.sourceRefs, status: resumed.status, text: resumed.text, web: resumed.web };
    }
    // AG12-4: words about the rows of this conversation's waiting import card give its next revision (code, no model).
    // AG18 rollback: with proposals paused no card gets a new revision; the turn goes on to the graph (which says why).
    const importRevision = await reviseImportByWords({ actorId: execution.actorId, message: execution.input.message, now: deps.now, runtime, sessionId: execution.sessionId, store: entryStore ?? null }).catch((error: unknown) => {
      if (isProposalsPausedError(error)) return null;
      throw error;
    });
    if (importRevision) return importRevision;
    // AG20a R1 (§5.1, §5.2): words about the items of this conversation's waiting card (drop one, a new day or time, this
    // time or the series) give its next revision (code, no model); the earlier revision can no longer be confirmed.
    const cardRevision = await reviseCardByWords({
      actorId: execution.actorId,
      message: execution.input.message,
      now: deps.now,
      ...(records ? { readSchedule: async (id: string) => { const view = (await records.reader.read("schedule", records.scope(execution.actorId), { id })).items[0]; return view && typeof view.fields.startsAt === "string" ? { endsAt: typeof view.fields.endsAt === "string" ? view.fields.endsAt : null, recurrence: typeof view.fields.recurrence === "string" ? view.fields.recurrence : null, startsAt: view.fields.startsAt, timeZone: typeof view.fields.timeZone === "string" ? view.fields.timeZone : null } : null; } } : {}),
      runtime,
      sessionId: execution.sessionId,
      store: entryStore ?? null,
      timeZone: deps.timeZone ?? "Asia/Tokyo",
    }).catch((error: unknown) => {
      emitTrace({ error: error instanceof Error ? error.message : String(error), type: "error", where: "executor.card_revision" });
      return null;
    });
    if (cardRevision) return cardRevision;
    const cardPrepared = Boolean(await runtime.getAction(conversationCardId(execution.requestId)).catch(() => null));
    let graph: AgentGraphResult | null = null;
    const boundary = await runWithConfirmBoundary({ now: deps.now, runtime }, {
      locale: execution.input.locale,
      message: execution.input.message,
      requestId: execution.requestId,
      run: async () => {
        graph = await runAgentGraph(deps, graphInputOf(execution.actorId, execution.requestId, execution.sessionId, execution.input, cardPrepared));
        // AG06: the graph wrote its card line itself (from the frozen preview); the boundary does not add another.
        return { cardShown: Boolean(graph.actionPreview), reply: graph.text, sourceRefs: graph.sourceRefs };
      },
      sessionId: execution.sessionId,
    });
    const settled = graph as AgentGraphResult | null;
    if (!settled) return { actionPreview: boundary.actionPreview, sourceRefs: boundary.sourceRefs, text: boundary.text };
    if (settled.earlier.length && entryStore) await writeBackEarlier(deps, entryStore, execution.actorId, settled.earlier, deps.now);
    const operationId = boundary.actionPreview?.operations[0]?.operationId;
    const partResults = settled.partResults.map((part) => (part.status === "awaiting_confirmation" && operationId && !part.operationId ? { ...part, operationId } : part));
    return {
      ...(boundary.actionPreview ? { actionPreview: boundary.actionPreview } : {}),
      ...(settled.clarifications.length ? { clarifications: settled.clarifications } : {}),
      // AG07: the basis follows the delivered citations (the boundary keeps the graph's sourceRefs as they are).
      ...(settled.basis ? { basis: settled.basis } : {}),
      // AG19: the graph's blocks; what the boundary said after the graph's text follows as paragraphs.
      ...(settled.blocks.length ? { blocks: withBoundaryTail(settled.blocks, settled.text, boundary.text, settled.state.language) } : {}),
      // AG14 UI: the memory chips at the start of the answer.
      ...(settled.memoryUse.length ? { memoryUse: settled.memoryUse } : {}),
      ...(settled.cardLine && boundary.text.includes(settled.cardLine) ? { cardLine: settled.cardLine } : {}),
      partResults,
      sourceRefs: boundary.sourceRefs,
      status: settled.status,
      text: boundary.text,
      web: settled.web,
    };
  };
}
