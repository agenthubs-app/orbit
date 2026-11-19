/**
 * Session-level state of the new Agent (设计稿 §3.10, agent-design AG03).
 *
 * What a session remembers between rounds is references and names only: the list shown last (in
 * display order), the record of each kind mentioned last, the open items (an unanswered question,
 * an alternative waiting for acceptance, …) and how many unrelated messages came after each. Record
 * bodies never enter this state; when a body is needed it is read again by its id under the current
 * permissions (AG05).
 *
 * Stored as one record per (account, session) in the generic record table, collection
 * `agent_v1_session_states`. The session is the unit here; the graph's thread is the request.
 */
import { createConfiguredPostgresLiveRecordStore } from "../../../shared/storage/configured-live-record-store";
import type { LiveRecord } from "../../../shared/storage/live-record-store";
import type { FeatureMode } from "../../../shared/config/feature-mode";
import type { RuleAskState } from "../rule/state";

export const SESSION_STATE_COLLECTION = "agent_v1_session_states";

/** A record by reference: its type (contact, todo, memo …), the product id and a display name. */
export interface NamedRecordRef {
  type: string;
  id: string;
  name: string;
  at?: string;
  /** AG06: what tells it apart in a question (a person's company and role); never stored in session state. */
  detail?: string;
}

export type OpenItemKind = "clarification" | "alternative" | "card" | "pending_external";

export interface SessionOpenItem {
  ref: string;
  kind: OpenItemKind;
  /** One plain sentence for the first layer ("定期留意 Orbit 活动目录里「摄影主题的活动」"). */
  summary: string;
  requestId: string;
  partId: string;
  createdAt: string;
  /** Messages since this item was opened that did not continue it (§3.10: shelved after two). */
  unrelatedMessages: number;
  /** For an alternative: the capability its acceptance leads to (rule.create …). */
  leadsTo?: string;
  /** AG04: the user's words of the part it was opened for (to say later what is still missing). */
  quote?: string;
  /** AG04: what the question asked for, and whether the part would change a record. */
  asks?: "intent" | "object" | "person" | "reading";
  writes?: boolean;
  /** AG05: the part's object clues as the user said them (a reply that continues the matter reads the same person). */
  clues?: { entity: string; text: string }[];
  /** AG10: a ranking that asked "按什么来挑": its domain, dates and count (a reply such as "随便" goes on with them). */
  rank?: { domain: "event" | "contact" | "todo"; count?: number; from?: string; to?: string };
  /** AG15: a scheduled task that asked "按什么来挑": its schedule, scope, count and end day (codes, ids and names only). */
  rule?: RuleAskState;
}

export interface AgentSessionState {
  sessionId: string;
  shownList: { items: NamedRecordRef[]; shownAt: string } | null;
  lastMentioned: NamedRecordRef[];
  openItems: SessionOpenItem[];
  updatedAt: string;
}

export function emptySessionState(sessionId: string, now: string): AgentSessionState {
  return { lastMentioned: [], openItems: [], sessionId, shownList: null, updatedAt: now };
}

export interface AgentSessionStateStore {
  get(actorId: string, sessionId: string): Promise<AgentSessionState | null>;
  put(actorId: string, state: AgentSessionState): Promise<void>;
}

function stateRecordId(actorId: string, sessionId: string): string {
  return `agent-v1-session-state:${encodeURIComponent(actorId)}:${encodeURIComponent(sessionId)}`;
}

function normalizeState(sessionId: string, value: unknown): AgentSessionState | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<AgentSessionState>;
  return {
    lastMentioned: Array.isArray(raw.lastMentioned) ? raw.lastMentioned.filter((item) => item && typeof item.id === "string") : [],
    openItems: Array.isArray(raw.openItems) ? raw.openItems.filter((item) => item && typeof item.ref === "string") : [],
    sessionId,
    shownList: raw.shownList && Array.isArray(raw.shownList.items) ? { items: raw.shownList.items, shownAt: String(raw.shownList.shownAt ?? "") } : null,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
  };
}

export function createMemoryAgentSessionStateStore(): AgentSessionStateStore {
  const states = new Map<string, AgentSessionState>();
  return {
    async get(actorId, sessionId) {
      const found = states.get(stateRecordId(actorId, sessionId));
      return found ? structuredClone(found) : null;
    },
    async put(actorId, state) {
      states.set(stateRecordId(actorId, state.sessionId), structuredClone(state));
    },
  };
}

export function createLiveAgentSessionStateStore(): AgentSessionStateStore | null {
  const configured = createConfiguredPostgresLiveRecordStore<Record<string, unknown>>();
  if (!configured) return null;
  const { store, workspaceId } = configured;
  return {
    async get(actorId, sessionId) {
      const record = await store.getRecord({ collectionName: SESSION_STATE_COLLECTION, recordId: stateRecordId(actorId, sessionId), userId: actorId, workspaceId });
      return record ? normalizeState(sessionId, record.payload) : null;
    },
    async put(actorId, state) {
      const record: LiveRecord<Record<string, unknown>> = {
        collectionName: SESSION_STATE_COLLECTION,
        createdAt: state.updatedAt,
        evidenceIds: [],
        lifecycleState: "active",
        payload: { ...state } as unknown as Record<string, unknown>,
        recordId: stateRecordId(actorId, state.sessionId),
        sourceId: state.sessionId,
        sourceType: "agent_v1_session",
        updatedAt: state.updatedAt,
        userId: actorId,
        workspaceId,
      };
      await store.upsertRecord(record);
    },
  };
}

let memoryStore: AgentSessionStateStore | null = null;

export function configuredAgentSessionStateStore(mode: FeatureMode): AgentSessionStateStore {
  if (mode === "mock" || mode === "hybrid") {
    memoryStore ??= createMemoryAgentSessionStateStore();
    return memoryStore;
  }
  const live = createLiveAgentSessionStateStore();
  if (!live) {
    memoryStore ??= createMemoryAgentSessionStateStore();
    return memoryStore;
  }
  return live;
}
