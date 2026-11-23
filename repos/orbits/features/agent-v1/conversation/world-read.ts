/**
 * The conversation engine's World from the store (ORBIT_AGENT_CONVERSATION_WORLD, conversation/mode.ts): per turn a small,
 * bounded read of the people this conversation is about — the contacts it named (name, company, title; the agent keeps
 * no aliases) and the newest to-dos / notes / schedule items linked to the first few of them. The records it named are
 * not read again (they stay names only: an answered record is not re-read for a later turn, eval AE-SCL-021). Never a whole collection: at most READ_CONTACTS contact rows and READ_RECORDS record rows per turn, read
 * through the record finder's loader (finder/world.ts: the same store, account + workspace scope, eval deny list, eval
 * read faults and field whitelist as every other read), memoised within the turn.
 *
 * The read is made after the first layer, and only when a part holds a person reference the agent left unbound
 * (needsWorldRead) or a write part needs records to confirm against (confirmNeedsOf, r10); the engine waits for it at
 * most READ_WAIT_MS and goes on without it.
 * Events are not read (the engine keeps their names from the conversation); a failure is traced and the World is the
 * names-only one.
 */
import type { FirstLayerContext } from "../context/build";
import type { NodeScope } from "../graph/deps";
import type { GraphPart } from "../graph/state";
import { emitTrace } from "../observability/trace";
import { createWorldLoader } from "../finder/world";
import type { World } from "../finder/types";
import type { ConversationLog } from "./bridge";
import type { LabWorld } from "./types";
import { labIdOf } from "./bridge";

export const READ_CONTACTS = 10;
export const READ_RECORDS = 30;
/** Contacts (the most recent ones) whose linked records are read. */
export const READ_LINKED_PEOPLE = 3;
export const READ_WAIT_MS = 250;

export interface WorldRead {
  status: "read" | "error" | "timeout" | "nothing";
  world: World | null;
  rows: number;
  contacts: number;
  records: number;
  ms: number;
  /** How long the turn waited for the read after the first layer's model call returned (the latency it added). */
  waitedMs?: number;
}

/** The lab ids this conversation is about, most recent first: contacts and records (T / M / S). */
export function conversationIdsOf(log: ConversationLog | null, context: FirstLayerContext | null): { contacts: string[]; records: string[] } {
  const ordered: string[] = [];
  for (const turn of [...(log?.turns ?? [])].reverse()) {
    for (const part of turn.user.hint?.parts ?? []) for (const ref of part.refs ?? []) if (ref.id) ordered.push(ref.id);
    for (const part of turn.user.hint?.parts ?? []) ordered.push(...(part.slots?.people ?? []));
    if (turn.agent?.card?.target) ordered.push(turn.agent.card.target);
    ordered.push(...(turn.agent?.mentions ?? []), ...(turn.agent?.listed ?? []), ...(turn.agent?.asks?.options ?? []).map((option) => option.id));
  }
  for (const item of context?.lastMentionedForCode ?? []) ordered.push(labIdOf(item.type, item.id) ?? "");
  for (const handle of context?.handles.values() ?? []) if (handle.accessible !== false) ordered.push(labIdOf(handle.type, handle.id) ?? "");
  for (const item of context?.openItems ?? []) for (const option of item.options ?? []) ordered.push(labIdOf(option.type, option.id) ?? "");
  ordered.push(...Object.keys(log?.names ?? {}));
  const gone = new Set([...(context?.handles.values() ?? [])].filter((handle) => handle.accessible === false).map((handle) => labIdOf(handle.type, handle.id)));
  const ids = [...new Set(ordered.filter((id) => id && !gone.has(id)))];
  return { contacts: ids.filter((id) => id.startsWith("C-")), records: ids.filter((id) => /^[TMS]-/u.test(id)) };
}

/**
 * Whether this turn reads at all: only when a part holds a person reference the agent left unbound (a name or a pronoun
 * its own code has not settled) — the one thing the read World can change under `on`. Stage A (eval run
 * 20261123-073911-0440974-CONV-data-A-shadow): reading on every turn read rows four cases forbid (AE-CTX-002, AE-CTX-004:
 * linked records of a person already bound; AE-SCL-001: a plain question; AE-SCL-003: a schedule clue), while it changed
 * no decision.
 */
export function needsWorldRead(parts: readonly Pick<GraphPart, "refs">[]): boolean {
  return parts.some((part) => part.refs.some((ref) => ref.entity === "contact" && !ref.recordId));
}

export interface ConfirmNeeds {
  creates: ("todo" | "memo" | "schedule")[];
  /** Lab ids of contacts a part deletes (their linked records). */
  linkedTo: string[];
  /** Lab ids of schedule items a part changes or deletes (a recurring series). */
  schedules: string[];
}

const CREATES: Record<string, ConfirmNeeds["creates"][number]> = { "memo.create": "memo", "schedule.create": "schedule", "todo.create": "todo" };

/**
 * r10's write confirmations need records the names-only World lacks (SPEC R34 duplicates, R35 deletes with links, R37
 * recurring items). Only a part that is plainly a write (clarity clear, an instruction or a selection, no negation, no
 * hypothesis, no other readings) and only the records its bound targets point at: a to-do / note / schedule item created
 * for a person the agent already bound (that person's linked records), a contact deleted (its linked records), a
 * schedule item changed or deleted (the item, for its recurrence). Null: nothing to confirm. A target named for the
 * first time is not bound yet at this point and is not read (the agent's own confirmations still apply).
 * R10-NEXT-shadow (2026-11-23): reading the newest open records of a kind for every create part, also on parts that only
 * might write, read records six cases forbid (AE-AMB-009/010/012, AE-CTX-005, AE-FN-010, AE-UND-010).
 */
export function confirmNeedsOf(parts: readonly Pick<GraphPart, "refs" | "capabilities" | "plan">[]): ConfirmNeeds | null {
  const needs: ConfirmNeeds = { creates: [], linkedTo: [], schedules: [] };
  for (const part of parts) {
    const plan = part.plan;
    if (!plan || plan.clarity !== "clear" || (plan.intentBasis !== "instruction" && plan.intentBasis !== "selection") || plan.negation || plan.hypothesis || plan.readings.length) continue;
    const people = part.refs.filter((ref) => ref.entity === "contact" && ref.recordId).map((ref) => labIdOf("contact", ref.recordId!)!);
    for (const capability of part.capabilities) {
      const kind = CREATES[capability];
      if (kind && people.length) {
        if (!needs.creates.includes(kind)) needs.creates.push(kind);
        needs.linkedTo.push(...people);
      }
      if (capability === "contact.delete") needs.linkedTo.push(...people);
      if (capability === "schedule.update" || capability === "schedule.delete") for (const ref of part.refs) if (ref.entity === "schedule" && ref.recordId) needs.schedules.push(labIdOf("schedule", ref.recordId)!);
    }
  }
  return needs.linkedTo.length || needs.schedules.length ? { creates: needs.creates, linkedTo: [...new Set(needs.linkedTo)], schedules: [...new Set(needs.schedules)] } : null;
}

/**
 * Starts the turn's read (null: nothing to read, or no record access). Never rejects. `people`: a part holds a person
 * reference the agent left unbound (needsWorldRead) — the contacts the conversation named and their linked records are
 * read; `confirm`: the write confirmations (confirmNeedsOf), read first, within the same caps.
 */
export function startWorldRead(scope: NodeScope, log: ConversationLog | null, now: string, timeZone: string, people = true, confirm: ConfirmNeeds | null = null): Promise<WorldRead> | null {
  const records = scope.deps.records;
  if (!records) return null;
  const ids = people ? conversationIdsOf(log, scope.run.context) : { contacts: [], records: [] };
  if (!ids.contacts.length && !confirm) return null;
  const started = Date.now();
  const loader = createWorldLoader({ now, records, scope: records.scope(scope.input.actorId), timeZone });
  return loader.conversationWorld({ contacts: ids.contacts, linkedPeople: people ? READ_LINKED_PEOPLE : 0, maxContacts: READ_CONTACTS, maxRecords: READ_RECORDS, ...(confirm ? { confirm } : {}) }).then(
    (world) => ({ contacts: world.contacts.length, ms: Date.now() - started, records: world.todos.length + world.memos.length + world.schedule.length, rows: loader.reads(), status: "read" as const, world }),
    (error: unknown) => {
      emitTrace({ error: error instanceof Error ? error.message : String(error), type: "conversation.world_error" });
      return { contacts: 0, ms: Date.now() - started, records: 0, rows: loader.reads(), status: "error" as const, world: null };
    },
  );
}

/** The read, waited for at most `waitMs` more (a read still running is "timeout"; its rows still count when it lands). */
export async function awaitWorldRead(pending: Promise<WorldRead> | null, waitMs = READ_WAIT_MS): Promise<WorldRead> {
  if (!pending) return { contacts: 0, ms: 0, records: 0, rows: 0, status: "nothing", world: null };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const waiting = Date.now();
  const timeout = new Promise<WorldRead>((resolve) => { timer = setTimeout(() => resolve({ contacts: 0, ms: waitMs, records: 0, rows: 0, status: "timeout", world: null }), waitMs); });
  try {
    return { ...(await Promise.race([pending, timeout])), waitedMs: Date.now() - waiting };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * The names-only World with the read records laid over it: a record read replaces its names-only entry (same lab id),
 * a record not named before is added. Genders stay empty (owner decision 2026-11-23: no gender, no inference).
 */
export function enrichWorld(base: LabWorld, read: World | null): LabWorld {
  if (!read) return base;
  const over = <R extends { id: string }>(mine: R[], theirs: R[]) => [...new Map([...mine, ...theirs].map((item) => [item.id, item])).values()];
  return { ...base, contacts: over(base.contacts, read.contacts), genders: {}, memos: over(base.memos, read.memos), schedule: over(base.schedule, read.schedule), todos: over(base.todos, read.todos) };
}
