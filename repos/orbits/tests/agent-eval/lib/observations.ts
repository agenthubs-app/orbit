/**
 * What a case run shows, derived from the merged trace, the db-diff and the fixture id map.
 * Hard checks read only this; adding evidence for a new check word starts here.
 */
import type { AgentResultDocument } from "../../../shared/contract/agent-v1";
import type { ClientViewRecord } from "./client-views";
import type { DatabaseDiff, RecordChange } from "./snapshot";
import type { TraceEvent } from "./trace-log";

/** Collections that hold the user's own data. Writes anywhere else (chat, ledger, receipts, caches) are not business writes. */
export const BUSINESS_COLLECTIONS = new Set([
  "contacts",
  "connections",
  "contact_detail_states",
  "contact_facts",
  "contact_introductions",
  "notes",
  "tasks",
  "personal_schedule_items",
  "personal_schedule_occurrence_exceptions",
  "orbitScheduleItems",
  "event_registrations",
  "agentMemories",
  "agentAutomations",
  // AG13: private events and «我去过» (the user's own notes).
  "private_events",
  "event_attendance_notes",
]);
export const BUSINESS_TABLES = new Set(["event_ops_membership_heads", "event_ops_admission_application_heads", "event_ops_checkins", "event_ops_events"]);
/** Read collections that count as reading a business record (no_private_reads, private_reads_within). */
export const PRIVATE_READ_COLLECTIONS = new Set(["contacts", "connections", "contact_detail_states", "contact_facts", "notes", "tasks", "personal_schedule_items", "orbitScheduleItems", "event_registrations", "agentMemories", "agentAutomations", "private_events", "event_attendance_notes"]);

export interface NormalizedOp {
  op: string;
  target: string | null;
  set: Record<string, unknown>;
  raw: unknown;
}

export interface CardObservation {
  cardId: string;
  kind: "ledger_action" | "entity_draft" | "fake";
  frozenSeq: number | null;
  ops: NormalizedOp[];
  state: string | null;
  revisions: number;
  observedBy: string[];
}

export interface DecisionObservation {
  cardId: string;
  decision: string;
  accepted: boolean;
  seq: number;
  status: number;
  reason: string | null;
  via: "click" | "text";
  /** A resent decision the server answered with the first one's result (accepted, but not a new decision). */
  replayed?: boolean;
}

export interface ReadObservation {
  seq: number;
  collection: string | null;
  productId: string;
  fixtureId: string | null;
  owner: string | null;
  account: string | null;
}

/** AG01: the protocol-3 entry as the runner saw it (requests stored by the server, acks, client views). */
export interface EntryObservation {
  requests: {
    requestId: string;
    sessionId: string;
    message: string;
    status: string;
    receivedSeq: number;
    receivedAt: string;
    startedAt: string | null;
    endedAt: string | null;
    attempts: number;
    arrivedWhileRunning: boolean;
    queueAheadAtArrival: number;
    document: AgentResultDocument;
    /** Trace seq of the server's entry.started / last entry.finished or entry.cancelled. */
    startSeq: number | null;
    endSeq: number | null;
  }[];
  acks: { client: string; step: number; resend: boolean; message: string; httpStatus: number; requestId: string | null; status: string | null; replayed: boolean | null; error: string | null; seq: number }[];
  clients: Record<string, { docs: Record<string, AgentResultDocument>; duplicates: number[]; onlineAtEnd: boolean; received: number }>;
}

/** AG03: one part of the first layer's handoff (the product's `first_layer.handoff` event). */
export interface HandoffPart {
  partId: string;
  sourceQuote: string;
  verdict: string | null;
  route: string | null;
  status: string | null;
  waitReason: string | null;
  dependsOn: string[];
  objectClues: { entity: string; text: string; recordId: string | null }[];
}

/** AG03: what the first layer got and gave for one request (in the order the server received them). */
export interface FirstLayerObservation {
  requestId: string;
  message: string;
  receivedSeq: number;
  handoff: { seq: number; parts: HandoffPart[] } | null;
  /** Messages of earlier conversation given to the first layer (context.built). */
  contextMessages: number | null;
  contextSeq: number | null;
  /** Everything sent to the main model by the understand node for this request. */
  understandPrompts: { seq: number; text: string }[];
  /** The result document's part results. */
  partResults: AgentResultDocument["partResults"];
}

export interface Observation {
  caseId: string;
  account: string;
  accounts: Record<string, string>;
  idMap: Record<string, string>;
  fixtureIdOf: (productId: string | null | undefined) => string | null;
  events: TraceEvent[];
  diff: DatabaseDiff;
  businessChanges: (RecordChange & { fixtureId: string | null; external: boolean })[];
  cards: CardObservation[];
  decisions: DecisionObservation[];
  requests: { requestId: string; seq: number; status: number; state: string | null }[];
  answers: { seq: number; text: string; citations: string[] }[];
  reads: ReadObservation[];
  clicks: TraceEvent[];
  clarifications: number;
  unsupported: { step: number; word: string; reason: string }[];
  fake: boolean;
  entry?: EntryObservation;
  /** AG03: the first layer per request (protocol-3 entry with the graph). */
  firstLayer?: FirstLayerObservation[];
  /** Run-level facts filled in at the end of the run (costs, summary, voiding). */
  run?: Record<string, unknown>;
  /** AG05: the "recent interaction" view per contact fixture, read by the runner before and after the steps. */
  recentInteractions?: Record<string, { before: RecentInteractionObservation | null; after: RecentInteractionObservation | null }>;
  /** AG07: what each client showed of the last card after each step (client_view, same_card_on). */
  clientViews?: ClientViewRecord[];
  /** AG11: the account's memory entries (not settings, not deleted) when the case ended, read by the runner. */
  memoryAfter?: { id: string }[];
  /** AG14: every memory entry at the end (any account, deleted ones with their mark), as stored. */
  memoryEntries?: MemoryEntryObservation[];
  /** AG14: the entries the last turn used (the product's memory.recall events after the last user message). */
  memoryRecalled?: { id: string; fixtureId: string | null }[];
  /** AG14: per account label, the entries the settings API listed for that account's own sign-in at the end. */
  settingsMemory?: Record<string, { status: number; ids: string[] }>;
  /** AG15: every scheduled rule of the world's accounts when the case ended (state as its owner's list shows it). */
  rulesAfter?: { id: string; fixtureId: string | null; account: string | null; state: string; version: number }[];
  /** AG15: the run history written during the case, in the order the periods were planned (from the database difference). */
  ruleRuns?: {
    rule: string; fixtureRule: string | null; account: string | null; scheduledAt: string; outcome: string; skipped: number; listed: string[]; cardId: string | null; delivery: string;
    /** AG16: the run's id, when its result was worked out, and its reminder — each as the database holds it at the end. */
    runId?: string;
    computedAt?: string;
    computeAttempts?: number;
    push?: { state: string; attempts: number; deliveredAt: string | null; reason: string | null; deliveryId: string | null; targets: { platform: string; state: string; attempts: number }[] };
  }[];
  /**
   * AG18 (switch_account): which account was signed in from which trace seq on (the first entry is seq 0). A read
   * belongs to the account signed in when it was made; `account` above is the last one only.
   */
  accountTimeline?: { fromSeq: number; account: string }[];
  /** AG18 (shadow_report): every shadow comparison record at the end, with its stored owner (account label) and payload. */
  shadowRecords?: { ownerAccount: string | null; recordAccount: string | null; requestId: string; divergences: { field: string; old: unknown; new: unknown }[]; newError: string | null; oldText: string; newText: string }[];
}

export interface MemoryEntryObservation {
  id: string;
  fixtureId: string | null;
  /** The account label of the owner (null: not one of the case's accounts). */
  account: string | null;
  status: "active" | "deleted";
  revision: number;
  category: string;
  appliesTo: string[];
}

export interface RecentInteractionObservation {
  occurredOn: string;
  productId: string;
  /** The fixture id of the source record (null: a record created in this run). */
  source: string | null;
}

const OP_NAMES: Record<string, string> = {
  add_to_orbit_schedule: "schedule.create",
  create_followup_task: "todo.create",
  create_preparation_task: "todo.create",
  save_meeting_note: "memo.create",
  save_memory: "memory.save",
};
const DRAFT_OPS: Record<string, string> = { event: "event.create", note: "memo.create", schedule: "schedule.create", task: "todo.create" };

export function normalizeLedgerOps(card: Record<string, any>, fixtureIdOf: Observation["fixtureIdOf"]): NormalizedOp[] {
  return ((card.operations ?? []) as Record<string, any>[]).map((operation) => {
    const payload = (operation.payload ?? {}) as Record<string, unknown>;
    // AG02 cards name their capability, target and the values they set (after) explicitly.
    const targetProduct = (operation.targetRef?.id ?? payload.taskId ?? payload.noteId ?? payload.contactId ?? payload.recordId ?? null) as string | null;
    const op = operation.capability ?? OP_NAMES[operation.operationType] ?? String(operation.operationType ?? operation.op);
    return { op: String(op), raw: operation, set: (operation.after ?? payload) as Record<string, unknown>, target: fixtureIdOf(targetProduct) ?? targetProduct };
  });
}

export function normalizeDraftOps(draft: Record<string, any>): NormalizedOp[] {
  return [{ op: DRAFT_OPS[draft.kind] ?? `${draft.kind}.create`, raw: draft, set: (draft.fields ?? {}) as Record<string, unknown>, target: null }];
}

/** Record ids (product) found anywhere in a value. */
export function productIdsIn(value: unknown, known: ReadonlySet<string>): string[] {
  const out = new Set<string>();
  const visit = (item: unknown, depth: number) => {
    if (depth > 12 || item === null || item === undefined) return;
    if (typeof item === "string") {
      if (known.has(item)) out.add(item);
      return;
    }
    if (Array.isArray(item)) item.forEach((entry) => visit(entry, depth + 1));
    else if (typeof item === "object") Object.values(item as Record<string, unknown>).forEach((entry) => visit(entry, depth + 1));
  };
  visit(value, 0);
  return [...out];
}

export function isBusinessChange(change: RecordChange): boolean {
  return BUSINESS_COLLECTIONS.has(change.collection);
}

/** db.write events that touched this record (by id in params/returned rows or an explicit records list). */
export function writesFor(events: readonly TraceEvent[], change: Pick<RecordChange, "id" | "collection">): TraceEvent[] {
  return events.filter((event) => {
    if (event.type !== "db.write") return false;
    if (Array.isArray(event.records) && (event.records as { id: string; collection: string }[]).some((record) => record.id === change.id && record.collection === change.collection)) return true;
    // AG06: a write of another record of orbit_records ([workspace, collection, record id, …]) is not this
    // record's write, even when its payload names the record (a card that targets a to-do mentions its id).
    const params = Array.isArray(event.params) ? event.params : null;
    if (params && (event.tables as string[] | undefined)?.includes("orbit_records") && typeof params[1] === "string" && typeof params[2] === "string" && /^[A-Za-z][A-Za-z0-9_]*$/u.test(params[1]) && (params[1] !== change.collection || params[2] !== change.id)) return false;
    const haystack = JSON.stringify([event.params ?? null, event.returned ?? null]);
    return haystack.includes(JSON.stringify(change.id)) && (haystack.includes(JSON.stringify(change.collection)) || String(event.sql ?? "").includes(change.collection) || (event.tables as string[] | undefined)?.includes("orbit_records") === true);
  });
}
