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
  /** AG20b (R13): the records a question offered (id, kind, label as shown), so a typed answer naming one picks it. */
  options?: { id: string; type: string; label: string }[];
  /** AG10: a ranking that asked "按什么来挑": its domain, dates and count (a reply such as "随便" goes on with them). */
  rank?: { domain: "event" | "contact" | "todo"; count?: number; from?: string; to?: string };
  /** AG15: a scheduled task that asked "按什么来挑": its schedule, scope, count and end day (codes, ids and names only). */
  rule?: RuleAskState;
  /**
   * AG21a (R26): a write question's part as it was asked — its words, its operations as offsets into them, its clues and
   * picks — so a typed answer naming an option goes on with that part (propose/asked.ts). The user's words and ids only.
   */
  resume?: import("../propose/asked").AskedResume;
}

/**
 * AG20a (owner's decision 2, 2026-11-20): the profile fields the last answer said are out of date and the values it took
 * from the user's own record (a short value and that record's id). Kept for the next turn's "那把她的资料也更新了"; the record
 * is read again under the current permissions before a card is made, and the value must still be in it.
 */
export interface StaleProfile {
  contactId: string;
  name: string;
  field: "organization" | "role";
  value: string;
  sourceType: string;
  sourceId: string;
  at: string;
}

export interface AgentSessionState {
  sessionId: string;
  shownList: { items: NamedRecordRef[]; shownAt: string } | null;
  lastMentioned: NamedRecordRef[];
  openItems: SessionOpenItem[];
  /** AG20a: set by an answer that found a profile out of date; replaced (or cleared) by the next turn. */
  staleProfiles?: StaleProfile[];
  updatedAt: string;
  /**
   * AG14 (设计稿 §6 "恢复的旧会话须按最新版本重建"): the memory version this session's last turn saw, and the saved
   * entries its answers used (ids and revisions only, never their words). A turn that finds an entry changed or
   * deleted since leaves the answers made with it out of the model's context.
   */
  memoryVersion?: number;
  memoryUses?: { requestId: string; memories: { memoryId: string; revision: number }[] }[];
  /** AG14: what the last ranking of this session used (ids and codes), for "为什么排第一" and "这次看……". */
  lastRanking?: {
    requestId: string;
    domain: "event" | "contact" | "todo";
    at: string;
    from?: string;
    to?: string;
    count?: number;
    listed: string[];
    memories: { memoryId: string; revision: number }[];
    turnBasis: boolean;
    topic: boolean;
  };
  /** AG20b (TRIAGE R17, 设计稿 §3.5 last row): what the user said they want from the next note ("下一篇只列我的承诺"). */
  noteGoal?: NoteGoal | null;
  /** AG21c (R47): the last list request answered in this session, so "再给我看一次" / "这次把…也加上" runs it again. */
  lastList?: LastListRequest;
}

/**
 * AG21c (R47): a list request as it was asked — the kind, the window, the count, the user's words of it and of its basis,
 * the deliverable. Re-run fresh (current records, current memory), never answered from the conversation text.
 */
export interface LastListRequest {
  domain: "event" | "contact" | "todo";
  at: string;
  from?: string;
  to?: string;
  count?: number;
  words: string;
  basis?: string;
  deliverable: string;
}

function lastListOf(raw: unknown): LastListRequest | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<LastListRequest>;
  if ((value.domain !== "event" && value.domain !== "contact" && value.domain !== "todo") || typeof value.words !== "string" || typeof value.at !== "string") return null;
  return {
    at: value.at,
    deliverable: typeof value.deliverable === "string" ? value.deliverable : "ranked_list",
    domain: value.domain,
    words: value.words,
    ...(typeof value.basis === "string" ? { basis: value.basis } : {}),
    ...(typeof value.count === "number" ? { count: value.count } : {}),
    ...(typeof value.from === "string" ? { from: value.from } : {}),
    ...(typeof value.to === "string" ? { to: value.to } : {}),
  };
}

export interface NoteGoal {
  followUps: boolean;
  interactions: boolean;
  setAt: string;
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
    ...(Array.isArray(raw.staleProfiles) ? { staleProfiles: raw.staleProfiles.filter((item) => item && typeof item.contactId === "string" && typeof item.value === "string" && typeof item.sourceId === "string" && (item.field === "organization" || item.field === "role")) } : {}),
    sessionId,
    shownList: raw.shownList && Array.isArray(raw.shownList.items) ? { items: raw.shownList.items, shownAt: String(raw.shownList.shownAt ?? "") } : null,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
    // AG14: references to saved entries (ids and revisions) and the last ranking's codes.
    ...(typeof raw.memoryVersion === "number" ? { memoryVersion: raw.memoryVersion } : {}),
    ...(Array.isArray(raw.memoryUses) ? { memoryUses: raw.memoryUses.filter((use) => use && typeof use.requestId === "string" && Array.isArray(use.memories)).map((use) => ({ memories: use.memories.filter((item) => item && typeof item.memoryId === "string" && typeof item.revision === "number").map((item) => ({ memoryId: item.memoryId, revision: item.revision })), requestId: use.requestId })) } : {}),
    ...(raw.lastRanking && typeof raw.lastRanking.requestId === "string" && Array.isArray(raw.lastRanking.listed) && Array.isArray(raw.lastRanking.memories) ? { lastRanking: { ...raw.lastRanking, listed: raw.lastRanking.listed.filter((ref) => typeof ref === "string"), memories: raw.lastRanking.memories.filter((item) => item && typeof item.memoryId === "string" && typeof item.revision === "number") } } : {}),
    ...(lastListOf(raw.lastList) ? { lastList: lastListOf(raw.lastList)! } : {}),
    ...(raw.noteGoal && typeof raw.noteGoal === "object" ? { noteGoal: { followUps: raw.noteGoal.followUps === true, interactions: raw.noteGoal.interactions === true, setAt: String(raw.noteGoal.setAt ?? "") } } : {}),
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
