/**
 * The web record of one request, kept per account (设计稿 §3.4 "按账号留存", "结果与写入"; agent-design AG09-5).
 *
 * One document per (account, requestId) in the generic record table, collection `agent_v1_web_evidence`:
 * - every call as it was reserved and how it ended — call key `agent-web:<requestId>#search-<n>` / `#fetch-<n>`, the
 *   query or URL sent, the time, the provider, both gates' results, and what came back (search results; a page's
 *   title, excerpt and date);
 * - blocked queries by rule number only, never their words;
 * - a query waiting for the user's click (rule 4), exactly as shown.
 *
 * It is also the request's web budget: a call is reserved here before the HTTP goes out (先扣后发), so a resume, a
 * re-run node or another part of the same request counts it, and the same query or URL is answered from the call
 * already made (调用键复用) instead of being sent again. Web text lives here, never in the graph's checkpoint.
 */
import { createConfiguredPostgresLiveRecordStore } from "../../../shared/storage/configured-live-record-store";
import type { LiveRecord } from "../../../shared/storage/live-record-store";
import type { FeatureMode } from "../../../shared/config/feature-mode";
import type { SearchResultItem, WebToolFailure } from "./deepseek-tools";
import type { QueryToken } from "./query";

export const WEB_EVIDENCE_COLLECTION = "agent_v1_web_evidence";

/** Calls per request (设计稿 §3.4 预算与停止条件): shared by every part, a resume and a re-run node. */
export const WEB_BUDGET = { fetch: 2, search: 2 } as const;
/** How much of a fetched page is kept as the excerpt (the answer step gets it; the checkpoint never does). */
export const EXCERPT_LIMIT = 6000;

export type WebCallKind = "search" | "fetch";
export type ReadStatus = "ok" | "empty" | "timeout" | "provider_error";

export interface WebCall {
  key: string;
  kind: WebCallKind;
  partId: string;
  query?: string;
  url?: string;
  status: "reserved" | ReadStatus;
  failure?: WebToolFailure;
  httpStatus?: number | null;
  provider: "deepseek";
  /** Gate 1 (code) passed for every call that is here; gate 2 is asked for searches only. */
  gates: { code: "passed"; judgment: "passed" | "not_asked" };
  reservedAt: string;
  finishedAt?: string;
  results?: SearchResultItem[];
  page?: { title: string; excerpt: string; sourceDate: string | null };
}

export interface WebLedger {
  requestId: string;
  calls: WebCall[];
  blocked: { partId: string; rules: (number | "judgment")[]; at: string }[];
  pending: { partId: string; text: string; tokens: QueryToken[]; at: string }[];
}

export const emptyLedger = (requestId: string): WebLedger => ({ blocked: [], calls: [], pending: [], requestId });

export const callKeyOf = (requestId: string, kind: WebCallKind, n: number) => `agent-web:${requestId}#${kind}-${n}`;

export function budgetLeft(ledger: WebLedger): { search: number; fetch: number } {
  const used = (kind: WebCallKind) => ledger.calls.filter((call) => call.kind === kind).length;
  return { fetch: Math.max(0, WEB_BUDGET.fetch - used("fetch")), search: Math.max(0, WEB_BUDGET.search - used("search")) };
}

export interface WebEvidenceStore {
  get(actorId: string, requestId: string): Promise<WebLedger | null>;
  put(actorId: string, ledger: WebLedger): Promise<void>;
}

const recordIdOf = (actorId: string, requestId: string) => `agent-v1-web:${encodeURIComponent(actorId)}:${encodeURIComponent(requestId)}`;

function normalize(requestId: string, value: unknown): WebLedger {
  const raw = value && typeof value === "object" ? (value as Partial<WebLedger>) : {};
  return { blocked: Array.isArray(raw.blocked) ? raw.blocked : [], calls: Array.isArray(raw.calls) ? raw.calls : [], pending: Array.isArray(raw.pending) ? raw.pending : [], requestId };
}

export function createMemoryWebEvidenceStore(): WebEvidenceStore & { all(): Map<string, WebLedger> } {
  const ledgers = new Map<string, WebLedger>();
  return {
    all: () => ledgers,
    async get(actorId, requestId) {
      const found = ledgers.get(recordIdOf(actorId, requestId));
      return found ? structuredClone(found) : null;
    },
    async put(actorId, ledger) {
      ledgers.set(recordIdOf(actorId, ledger.requestId), structuredClone(ledger));
    },
  };
}

export function createLiveWebEvidenceStore(): WebEvidenceStore | null {
  const configured = createConfiguredPostgresLiveRecordStore<Record<string, unknown>>();
  if (!configured) return null;
  const { store, workspaceId } = configured;
  return {
    async get(actorId, requestId) {
      const record = await store.getRecord({ collectionName: WEB_EVIDENCE_COLLECTION, recordId: recordIdOf(actorId, requestId), userId: actorId, workspaceId });
      return record ? normalize(requestId, record.payload) : null;
    },
    async put(actorId, ledger) {
      const now = new Date().toISOString();
      const record: LiveRecord<Record<string, unknown>> = {
        collectionName: WEB_EVIDENCE_COLLECTION,
        createdAt: now,
        evidenceIds: [],
        lifecycleState: "active",
        payload: { ...ledger } as unknown as Record<string, unknown>,
        recordId: recordIdOf(actorId, ledger.requestId),
        sourceId: ledger.requestId,
        sourceType: "agent_v1_request",
        updatedAt: now,
        userId: actorId,
        workspaceId,
      };
      await store.upsertRecord(record);
    },
  };
}

let memoryStore: (WebEvidenceStore & { all(): Map<string, WebLedger> }) | null = null;

export function configuredWebEvidenceStore(mode: FeatureMode): WebEvidenceStore {
  if (mode === "mock" || mode === "hybrid") return (memoryStore ??= createMemoryWebEvidenceStore());
  return createLiveWebEvidenceStore() ?? (memoryStore ??= createMemoryWebEvidenceStore());
}
