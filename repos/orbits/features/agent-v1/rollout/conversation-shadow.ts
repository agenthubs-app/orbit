/**
 * The conversation engine's shadow records (ORBIT_AGENT_CONVERSATION=shadow|on; conversation/run.ts): per turn, what the
 * engine read differently from the agent — references, follow-up class, merged request, ask / go, shelving, a cancel —
 * and (on) what it changed. Same machinery as the AG18 shadow comparison (rollout/shadow.ts): the workspace's record
 * store, one partition per account (userId), keyed by the request id, written after the response, never throwing; the
 * report (rollout/shadow-report.ts) has a section for them. Its own collection, so the AG18 counts are not touched.
 */
import { createHash } from "node:crypto";
import { after } from "next/server";

import { createConfiguredPostgresLiveRecordStore } from "../../../shared/storage/configured-live-record-store";
import type { LiveRecord } from "../../../shared/storage/live-record-store";
import type { Applied, ConversationDiff } from "../conversation/apply";
import { emitTrace } from "../observability/trace";

export const CONVERSATION_SHADOW_COLLECTION = "agentV1ConversationShadow";

export interface ConversationShadowRecord {
  schemaVersion: 1;
  workspaceId: string;
  actorId: string;
  requestId: string;
  sessionId: string;
  mode: "shadow" | "on";
  message: string;
  comparedAt: string;
  /** compared: the engine ran; error / over_budget: it did not count (the agent went on as legacy). */
  status: "compared" | "error" | "over_budget";
  error: string | null;
  ms: number;
  diffs: ConversationDiff[];
  applied: Applied[];
}

export interface ConversationShadowStore {
  workspaceId: string;
  put(record: ConversationShadowRecord): Promise<void>;
  list(actorId: string, limit?: number): Promise<ConversationShadowRecord[]>;
}

function recordId(actorId: string, requestId: string): string {
  return `agent-v1-conversation-shadow:${createHash("sha256").update(`${actorId}\u0000${requestId}`).digest("hex").slice(0, 40)}`;
}

export function createLiveConversationShadowStore(): ConversationShadowStore | null {
  const configured = createConfiguredPostgresLiveRecordStore<Record<string, unknown>>();
  if (!configured) return null;
  const { store, workspaceId } = configured;
  return {
    workspaceId,
    async put(record) {
      const row: LiveRecord<Record<string, unknown>> = {
        collectionName: CONVERSATION_SHADOW_COLLECTION,
        createdAt: record.comparedAt,
        evidenceIds: [],
        lifecycleState: "active",
        payload: { ...record } as unknown as Record<string, unknown>,
        recordId: recordId(record.actorId, record.requestId),
        sourceId: record.requestId,
        sourceType: "agent_v1_conversation_shadow",
        updatedAt: record.comparedAt,
        userId: record.actorId,
        workspaceId,
      };
      await store.upsertRecord(row);
    },
    async list(actorId, limit = 500) {
      const rows = await store.listRecords({ collectionName: CONVERSATION_SHADOW_COLLECTION, limit, userId: actorId, workspaceId });
      return rows.map((row) => row.payload as unknown as ConversationShadowRecord).filter((item) => item.actorId === actorId).sort((left, right) => left.comparedAt.localeCompare(right.comparedAt));
    },
  };
}

export function createMemoryConversationShadowStore(workspaceId = "workspace:test"): ConversationShadowStore & { all(): ConversationShadowRecord[] } {
  const rows = new Map<string, ConversationShadowRecord>();
  return {
    workspaceId,
    all: () => [...rows.values()],
    async list(actorId) {
      return [...rows.values()].filter((item) => item.actorId === actorId).sort((left, right) => left.comparedAt.localeCompare(right.comparedAt));
    },
    async put(record) {
      rows.set(recordId(record.actorId, record.requestId), structuredClone(record));
    },
  };
}

let configured: ConversationShadowStore | null | undefined;

/** Writes the record after the response (as scheduleShadowComparison does); a failure is traced, never thrown. */
export function scheduleConversationShadow(record: Omit<ConversationShadowRecord, "workspaceId">, store?: ConversationShadowStore | null): void {
  const task = async () => {
    try {
      if (store === undefined) configured ??= createLiveConversationShadowStore();
      const target = store === undefined ? configured : store;
      if (!target) return;
      await target.put({ ...record, workspaceId: target.workspaceId });
    } catch (error) {
      emitTrace({ error: error instanceof Error ? error.message : String(error), forRequestId: record.requestId, type: "error", where: "conversation.shadow_store" });
    }
  };
  try {
    after(task);
  } catch {
    void task();
  }
}
