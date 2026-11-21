/**
 * agent-design AG18-2 — shadow mode (设计稿 §8 第 5 步「按账号分组进行只读影子运行」; ORBIT_AGENT_V1_MODE=shadow).
 *
 * The user is answered by the old path, exactly as before. After that answer has been sent, the new flow runs the same
 * message read-only and the two results are compared by structure; only the comparison record is written:
 *
 * - read-only by construction: the card access only notes what would have been frozen (no ledger row), the checkpoint
 *   is in memory, the session state is read but never written, the public web is off, and the entry store, inbox, push
 *   and memory learning are never reached (runAgentGraph is called directly, not the entry or the executor);
 * - per account: each record is stored under the workspace and the account (userId) and keyed by the request id; the
 *   report reads one account's records with that account only;
 * - it never touches the user's answer: it runs after the response, under its own trace request id (`shadow:<id>`, so its
 *   model calls are counted in their own column), and a failure becomes one divergence (`error`) with the request id.
 *
 * Wording is not compared (both texts are kept); a divergence is a structural difference: a card or not, the card's
 * operations (operation, target, values), the records cited, records read that the account may not read, a question
 * asked or not, an error on one side.
 */
import { createHash } from "node:crypto";
import { MemorySaver } from "@langchain/langgraph";
import { after } from "next/server";

import type { FeatureMode } from "../../../shared/config/feature-mode";
import { createConfiguredPostgresLiveRecordStore } from "../../../shared/storage/configured-live-record-store";
import type { LiveRecord } from "../../../shared/storage/live-record-store";
import { createAgentMemoryService } from "../../agent/memory/service-factory";
import { createAgentAutomationService } from "../../agent/automations/service-factory";
import type { CardOperationIntent } from "../../agent/runtime/card-operations";
import { configuredAgentSessionStateStore } from "../context/session-state";
import { configuredRecordAccess } from "../domains/configured";
import { ruleSnapshotOf } from "../domains/rule/apply";
import type { RuleSnapshot } from "../domains/rule/ops";
import type { DomainReader } from "../domains/types";
import { referenceAuthorizer, CONTEXT_READ_LIMIT } from "../graph/executor";
import { runAgentGraph } from "../graph/build";
import type { AgentGraphDependencies, AgentRecordAccess } from "../graph/deps";
import { createOrbitAgentChatSessionProvider } from "../../orbit-ai/storage/orbit-agent-chat-session-provider-factory";
import type { ContextMessage } from "../context/build";
import { emitTrace, runWithTraceContext, takeEvalFault } from "../observability/trace";

export const SHADOW_COLLECTION = "agentV1ShadowComparisons";

export interface ShadowCardOp {
  op: string;
  target: string | null;
  set: Record<string, unknown>;
}

export interface ShadowSide {
  status: "answered" | "failed";
  error: string | null;
  /** Kept for reading, never compared. */
  text: string;
  card: { ops: ShadowCardOp[] } | null;
  /** Record ids the answer cites ("note:…", "contact:…"), sorted. */
  cited: string[];
  /** Records read (the new side only; the old pipeline does not report its reads). */
  reads: string[];
  /** Cited or read records the account may not read now (should always be empty). */
  outside: string[];
  /** A question back to the user instead of an answer. */
  clarification: boolean;
}

export type ShadowDivergenceField = "card" | "card_ops" | "cited" | "outside" | "clarification" | "error";

export interface ShadowDivergence {
  field: ShadowDivergenceField;
  old: unknown;
  new: unknown;
}

export interface ShadowComparisonRecord {
  schemaVersion: 1;
  workspaceId: string;
  actorId: string;
  requestId: string;
  shadowRequestId: string;
  sessionId: string;
  message: string;
  comparedAt: string;
  old: ShadowSide;
  new: ShadowSide;
  divergences: ShadowDivergence[];
  /** Main-model calls the shadow pass made (paid like any real call; reported in their own column). */
  modelCalls: number;
}

export interface ShadowStore {
  /** The deployment's workspace the records are kept in. */
  workspaceId: string;
  put(record: ShadowComparisonRecord): Promise<void>;
  /** One account's records (the account's own partition only). */
  list(actorId: string, limit?: number): Promise<ShadowComparisonRecord[]>;
}

const sortedUnique = (values: readonly string[]) => [...new Set(values.filter(Boolean))].sort();
/**
 * The ids of the user's records (a memo, contact, to-do, event, schedule item, «我去过»). The old path also lists
 * where its answer came from ("orbit-agent:model-provider"), which is not a record and is not compared.
 */
const RECORD_ID = /^(note|contact|task|event|personal|private_event|attendance|schedule|connection):[^:]/u;
const recordIds = (ids: readonly string[]) => sortedUnique(ids.filter((id) => RECORD_ID.test(id)));
/** "memo:note:abc" → "note:abc"; "note:abc" stays. */
export const recordIdOfRef = (ref: string) => (ref.split(":").length >= 3 ? ref.slice(ref.indexOf(":") + 1) : ref);

/** The old path's result, as the user got it (after its own pipeline). */
export function oldSideOf(result: { success: boolean; data?: unknown; error?: unknown }, cardOps: readonly ShadowCardOp[] = []): ShadowSide {
  if (!result.success || !result.data) {
    const code = (result.error as { code?: unknown } | undefined)?.code ?? (result as { code?: unknown }).code;
    return { card: null, cited: [], clarification: false, error: typeof code === "string" ? code : "OLD_PATH_FAILED", outside: [], reads: [], status: "failed", text: "" };
  }
  const data = result.data as Record<string, any>;
  const ops: ShadowCardOp[] = [...cardOps];
  const draft = data.entityDraft as { kind?: string; fields?: Record<string, unknown>; status?: string } | undefined;
  if (draft?.kind) ops.push({ op: `${draft.kind === "task" ? "todo" : draft.kind}.create`, set: { ...(draft.fields ?? {}) }, target: null });
  const interaction = data.taskInteraction as { state?: string; title?: string; taskId?: string } | undefined;
  if (interaction?.state === "created" || interaction?.state === "suggested") ops.push({ op: "todo.create", set: { ...(interaction.title ? { title: interaction.title } : {}) }, target: interaction.taskId ?? null });
  const evidence = Array.isArray(data.provenance?.evidenceIds) ? (data.provenance.evidenceIds as unknown[]).filter((id): id is string => typeof id === "string") : [];
  return {
    card: ops.length ? { ops } : null,
    cited: recordIds(evidence.map(recordIdOfRef)),
    clarification: data.routingDecision?.intent === "clarification",
    error: null,
    outside: [],
    reads: [],
    status: "answered",
    text: typeof data.assistantMessage === "string" ? data.assistantMessage : "",
  };
}

/** The old path's ledger cards of this turn (its action ids), as operations: capability, target, values. */
export async function oldCardOpsOf(runtime: { getAction(actionId: string): Promise<unknown> }, actionIds: readonly string[]): Promise<ShadowCardOp[]> {
  const ops: ShadowCardOp[] = [];
  for (const actionId of actionIds) {
    const action = (await runtime.getAction(actionId).catch(() => null)) as { operations?: Record<string, unknown>[] } | null;
    for (const operation of action?.operations ?? []) {
      const target = operation.targetRef as { id?: string } | undefined;
      const after = (operation.after ?? operation.input ?? {}) as Record<string, unknown>;
      ops.push({ op: String(operation.capability ?? operation.operationType ?? "action"), set: typeof after === "object" && after ? { ...after } : {}, target: target?.id ?? null });
    }
  }
  return ops;
}

/** The new side's card, from the intents it would have frozen. */
export function cardOpsOfIntents(intents: readonly CardOperationIntent[]): ShadowCardOp[] {
  return intents.map((intent) => {
    const loose = intent as unknown as { capability?: string; targetId?: string | null; set?: Record<string, unknown> };
    return { op: String(loose.capability ?? "unknown"), set: { ...(loose.set ?? {}) }, target: loose.targetId ?? null };
  });
}

const opKey = (op: ShadowCardOp) => JSON.stringify([op.op, op.target, Object.fromEntries(Object.entries(op.set).sort(([a], [b]) => (a < b ? -1 : 1)))]);

/** Structural differences only (wording is not one). */
export function compareSides(old: ShadowSide, neu: ShadowSide): ShadowDivergence[] {
  const found: ShadowDivergence[] = [];
  if (old.error || neu.error) found.push({ field: "error", new: neu.error, old: old.error });
  if (Boolean(old.card) !== Boolean(neu.card)) found.push({ field: "card", new: Boolean(neu.card), old: Boolean(old.card) });
  else if (old.card && neu.card) {
    const left = old.card.ops.map(opKey).sort();
    const right = neu.card.ops.map(opKey).sort();
    if (JSON.stringify(left) !== JSON.stringify(right)) found.push({ field: "card_ops", new: neu.card.ops, old: old.card.ops });
  }
  if (!neu.error && !old.error && JSON.stringify(old.cited) !== JSON.stringify(neu.cited)) found.push({ field: "cited", new: neu.cited, old: old.cited });
  if (old.outside.length || neu.outside.length) found.push({ field: "outside", new: neu.outside, old: old.outside });
  if (!neu.error && !old.error && old.clarification !== neu.clarification) found.push({ field: "clarification", new: neu.clarification, old: old.clarification });
  return found;
}

/** The reader the shadow pass reads through: the same reads, each noted (ids only). */
export function notingReader(reader: DomainReader, noted: string[]): DomainReader {
  return {
    async read(kind, scope, query) {
      const result = await reader.read(kind, scope, query);
      for (const item of result.items) noted.push(item.ref);
      return result;
    },
  };
}

/** The session's messages up to (not including) this message: the old path has already stored its own turn. */
export function messagesBefore(messages: readonly ContextMessage[], message: string): ContextMessage[] {
  const at = messages.map((item) => item.role === "user" && item.text.trim() === message.trim()).lastIndexOf(true);
  return at >= 0 ? messages.slice(0, at) : [...messages];
}

export interface ShadowRunDeps {
  /** The graph's dependencies, already read-only (the card access is replaced here). */
  graph: Omit<AgentGraphDependencies, "cards">;
  records: AgentRecordAccess | null;
  store: ShadowStore | null;
  workspaceId: string;
  now: () => string;
  /** The graph run (runAgentGraph; a stub in tests). */
  runGraph?: typeof runAgentGraph;
}

export interface ShadowRunInput {
  actorId: string;
  requestId: string;
  sessionId: string;
  message: string;
  locale: string;
  /** The old path's result as delivered, and the operations of any ledger card it made. */
  old: { success: boolean; data?: unknown; error?: unknown };
  oldCardOps?: readonly ShadowCardOp[];
}

export const shadowRequestIdOf = (requestId: string) => `shadow:${requestId}`;

/** One shadow pass: the new flow read-only on the same message, then the comparison record. Never throws. */
export async function runShadowComparison(deps: ShadowRunDeps, input: ShadowRunInput): Promise<ShadowComparisonRecord | null> {
  const shadowRequestId = shadowRequestIdOf(input.requestId);
  return runWithTraceContext({ requestId: shadowRequestId }, async () => {
    const old = oldSideOf(input.old, input.oldCardOps);
    const reads: string[] = [];
    const frozen: CardOperationIntent[][] = [];
    let neu: ShadowSide;
    let modelCalls = 0;
    emitTrace({ forRequestId: input.requestId, sessionId: input.sessionId, type: "shadow.started" });
    try {
      // Eval fault point `shadow` (CMP-004): the new side fails this once; the user's answer is already out.
      const fault = takeEvalFault("shadow");
      if (fault) throw new Error(`eval fault ${fault.where}/${fault.kind}: the shadow pass failed`);
      const records = deps.records ? { ...deps.records, reader: notingReader(deps.records.reader, reads) } : null;
      const result = await (deps.runGraph ?? runAgentGraph)({
        ...deps.graph,
        ...(records ? { records } : {}),
        // Read-only: what the card would hold is noted; nothing is frozen in the ledger.
        cards: { async freeze(freezeInput) { frozen.push([...freezeInput.intents]); return null; } },
      }, { actorId: input.actorId, cardPrepared: false, locale: input.locale, message: input.message, references: [], requestId: shadowRequestId, sessionId: input.sessionId });
      modelCalls = result.modelCalls;
      const intents = frozen.flat();
      neu = {
        card: intents.length ? { ops: cardOpsOfIntents(intents) } : null,
        cited: recordIds(result.sourceRefs.map(recordIdOfRef)),
        clarification: result.clarifications.some((set) => set.state === "open" && set.kind !== "entry"),
        error: null,
        outside: [],
        reads: sortedUnique(reads),
        status: "answered",
        text: result.text,
      };
    } catch (error) {
      neu = { card: null, cited: [], clarification: false, error: error instanceof Error ? error.message : String(error), outside: [], reads: sortedUnique(reads), status: "failed", text: "" };
    }
    // Records the new side read that the account may not read now (typed refs, checked by the same visibility rule).
    if (deps.records && neu.reads.length) {
      try {
        const visible = await deps.records.visible(input.actorId, neu.reads);
        neu.outside = neu.reads.filter((ref) => !visible.has(ref));
      } catch {
        // the visibility check is best effort; a failure leaves `outside` empty and is traced
        emitTrace({ type: "error", where: "shadow.visible" });
      }
    }
    const record: ShadowComparisonRecord = {
      actorId: input.actorId,
      comparedAt: deps.now(),
      divergences: compareSides(old, neu),
      message: input.message,
      modelCalls,
      new: neu,
      old,
      requestId: input.requestId,
      schemaVersion: 1,
      sessionId: input.sessionId,
      shadowRequestId,
      workspaceId: deps.workspaceId,
    };
    try {
      await deps.store?.put(record);
    } catch (error) {
      emitTrace({ error: error instanceof Error ? error.message : String(error), forRequestId: input.requestId, type: "error", where: "shadow.store" });
      return null;
    }
    emitTrace({ divergences: record.divergences.map((item) => item.field), forRequestId: input.requestId, newError: neu.error, type: "shadow.compared" });
    return record;
  });
}

function shadowRecordId(actorId: string, requestId: string): string {
  return `agent-v1-shadow:${createHash("sha256").update(`${actorId}\u0000${requestId}`).digest("hex").slice(0, 40)}`;
}

/** The comparison records in the workspace's record store, one partition per account (userId). */
export function createLiveShadowStore(): ShadowStore | null {
  const configured = createConfiguredPostgresLiveRecordStore<Record<string, unknown>>();
  if (!configured) return null;
  const { store, workspaceId } = configured;
  return {
    workspaceId,
    async put(record) {
      const row: LiveRecord<Record<string, unknown>> = {
        collectionName: SHADOW_COLLECTION,
        createdAt: record.comparedAt,
        evidenceIds: [],
        lifecycleState: "active",
        payload: { ...record } as unknown as Record<string, unknown>,
        recordId: shadowRecordId(record.actorId, record.requestId),
        sourceId: record.requestId,
        sourceType: "agent_v1_shadow",
        updatedAt: record.comparedAt,
        userId: record.actorId,
        workspaceId,
      };
      await store.upsertRecord(row);
    },
    async list(actorId, limit = 500) {
      const rows = await store.listRecords({ collectionName: SHADOW_COLLECTION, limit, userId: actorId, workspaceId });
      return rows.map((row) => row.payload as unknown as ShadowComparisonRecord).filter((item) => item.actorId === actorId).sort((left, right) => left.comparedAt.localeCompare(right.comparedAt));
    },
  };
}

export function createMemoryShadowStore(workspaceId = "workspace:test"): ShadowStore & { all(): ShadowComparisonRecord[] } {
  const rows = new Map<string, ShadowComparisonRecord>();
  return {
    workspaceId,
    all: () => [...rows.values()],
    async list(actorId) {
      return [...rows.values()].filter((item) => item.actorId === actorId).sort((left, right) => left.comparedAt.localeCompare(right.comparedAt));
    },
    async put(record) {
      rows.set(shadowRecordId(record.actorId, record.requestId), structuredClone(record));
    },
  };
}

/** The read-only graph dependencies of the deployment (same reads as the new entry; nothing that writes). */
export function configuredShadowDeps(mode: FeatureMode, actorId: string): ShadowRunDeps {
  const records = configuredRecordAccess() ?? null;
  const sessionState = configuredAgentSessionStateStore(mode);
  const store = createLiveShadowStore();
  const now = () => new Date().toISOString();
  return {
    graph: {
      authorizeReferences: referenceAuthorizer(records),
      checkpointer: new MemorySaver(),
      judgment: { apiKey: process.env.ORBIT_GEMINI_DECISION_API_KEY?.trim() || null },
      loadMessages: async (sessionId) => {
        const provider = createOrbitAgentChatSessionProvider(mode, actorId);
        const session = await provider?.getSession(sessionId, { limit: CONTEXT_READ_LIMIT });
        return (session?.messages ?? []).map((message): ContextMessage => ({ role: message.role, text: message.text, ...(typeof message.createdAt === "string" ? { createdAt: message.createdAt } : {}) }));
      },
      memory: { snapshot: (id) => createAgentMemoryService({ actorId: id, mode }).snapshot() },
      now,
      rules: { list: async (id) => (await createAgentAutomationService({ actorId: id, mode }).list()).map(ruleSnapshotOf).filter((rule): rule is RuleSnapshot => rule !== null) },
      // Read, never written: the shadow pass leaves the conversation's state as the old path left it.
      sessionState: { get: (id, sessionId) => sessionState.get(id, sessionId), put: async () => undefined },
      timeZone: process.env.ORBIT_DEFAULT_TIME_ZONE ?? "Asia/Tokyo",
      // web: absent — the shadow pass sends nothing to the public web.
    },
    now,
    records,
    store,
    workspaceId: store?.workspaceId ?? "",
  };
}

/**
 * The old path has answered (the response is being sent); the shadow pass runs after it. Nothing here can change
 * the user's answer: errors end in the comparison record or the trace.
 */
export function scheduleShadowComparison(mode: FeatureMode, input: ShadowRunInput, deps?: ShadowRunDeps, oldCardOps?: () => Promise<ShadowCardOp[]>): void {
  const task = async () => {
    try {
      const configured = deps ?? configuredShadowDeps(mode, input.actorId);
      const withHistory: ShadowRunDeps = { ...configured, graph: { ...configured.graph, loadMessages: async (sessionId) => messagesBefore(await configured.graph.loadMessages(sessionId), input.message) } };
      const ops = oldCardOps ? await oldCardOps().catch(() => []) : [];
      await runShadowComparison(withHistory, { ...input, oldCardOps: [...(input.oldCardOps ?? []), ...ops] });
    } catch (error) {
      emitTrace({ error: error instanceof Error ? error.message : String(error), forRequestId: input.requestId, type: "error", where: "shadow.schedule" });
    }
  };
  try {
    after(task);
  } catch {
    void task();
  }
}
