/**
 * Where the agent meets the conversation engine (ORBIT_AGENT_CONVERSATION, conversation/mode.ts):
 *
 * 1. understand (after the first layer's parts are made): `conversationTurn` runs the engine on the logged turns plus
 *    this message, compares it with the agent's parts and, when the switch is `on`, applies its decisions
 *    (conversation/apply.ts). The engine never blocks or breaks a turn: an error, or a run over the budget, is traced
 *    and the turn goes on as legacy.
 * 2. deliver (the session state of a new turn): `conversationAfterTurn` adds ask / go and shelving to the comparison,
 *    emits `conversation.shadow`, schedules the shadow record, and returns the log with this turn appended (the user's
 *    words, the hint, the agent's reply as the lab sees it).
 * legacy: neither runs, and the session state gets no log.
 */
import type { AgentSessionState, NamedRecordRef } from "../context/session-state";
import type { AgentGraphState, GraphPart } from "../graph/state";
import type { NodeScope } from "../graph/deps";
import type { UnderstandOutput } from "../understand/schema";
import { swapsPeriod } from "../understand/read-window";
import { emitTrace } from "../observability/trace";
import { scheduleConversationShadow } from "../rollout/conversation-shadow";
import { applyCarry, applyTurn, carryChangesOf, compareTurn, enginePartOf, resultDiffs, withPronounsBound, type Applied, type ConversationDiff } from "./apply";
import { appendTurn, formsOf, hintOf, labIdOf, namesOf, normalizeLog, runAskGo, runEngine, TYPE_OF_COLLECTION, worldOf, type ConversationLog, type EngineTurn } from "./bridge";
import { conversationBudgetMs, conversationMode, openedMode, type ConversationMode } from "./mode";
import { awaitWorldRead, confirmNeedsOf, enrichWorld, READ_RECORDS, startWorldRead, type WorldRead } from "./world-read";
import type { World } from "../finder/types";
import type { AgentReply, FollowUpClass, ModelHint, Question, Slots, TurnResult } from "./types";

export interface ConversationRun {
  mode: Exclude<ConversationMode, "legacy">;
  hint: ModelHint | null;
  result: TurnResult | null;
  status: "compared" | "error" | "over_budget";
  error: string | null;
  ms: number;
  diffs: ConversationDiff[];
  applied: Applied[];
  /** The engine's input of this turn and the names its World had (the ask / go run at deliver starts from them). */
  turn?: EngineTurn;
  names?: Record<string, { type: string; name: string }>;
  plainChat?: boolean;
  /** The store read for the engine's World (ORBIT_AGENT_CONVERSATION_WORLD; null: off / nothing to read). */
  world?: { status: WorldRead["status"]; rows: number; contacts: number; records: number; readMs: number; waitedMs: number; engineMs: number; used: boolean } | null;
  /** The records that read gave (kept for the ask / go run at deliver: r10's write confirmations need them). Not logged. */
  readWorld?: World | null;
}

/** More than this many minutes since the conversation's last message is an idle break (R2: a bare pronoun is asked). */
const IDLE_MINUTES = 60;

function idleSince(log: ConversationLog | null, now: string): boolean {
  const last = log?.turns.at(-1);
  const at = Date.parse(last?.agent?.at ?? last?.user.at ?? "");
  return Number.isFinite(at) && Date.parse(now) - at > IDLE_MINUTES * 60_000;
}

/** Names of the records the store read gave (to check a bound record against the reference's words). */
function namesOfWorld(world: World): Record<string, { type: string; name: string }> {
  const out: Record<string, { type: string; name: string }> = {};
  for (const item of world.contacts) out[item.id] = { name: item.name, type: "contact" };
  for (const item of world.todos) out[item.id] = { name: item.title, type: "todo" };
  for (const item of world.memos) out[item.id] = { name: item.title, type: "memo" };
  for (const item of world.schedule) out[item.id] = { name: item.title, type: "schedule" };
  return out;
}

const appliedKey = (item: Applied) => JSON.stringify([item.part, item.what, item.detail]);
/** What `on` would change with `other` that it does not change with `base` (and the reverse). */
function appliedDelta(base: readonly Applied[], other: readonly Applied[]): { added: Applied[]; removed: Applied[] } | null {
  const left = new Set(base.map(appliedKey));
  const right = new Set(other.map(appliedKey));
  const added = other.filter((item) => !left.has(appliedKey(item)));
  const removed = base.filter((item) => !right.has(appliedKey(item)));
  return added.length || removed.length ? { added, removed } : null;
}

/** The log as the session state holds it (null: none yet). */
export function logOf(state: AgentSessionState | null | undefined): ConversationLog | null {
  return normalizeLog((state as { conversation?: unknown } | null | undefined)?.conversation);
}

/** A card or a write question waits from the turn before (what a cancel can call off). */
function changeWaits(log: ConversationLog | null): boolean {
  const last = log?.turns.at(-1)?.agent;
  return Boolean(last && (last.card || last.asks?.writes));
}

/**
 * understand: the engine on this turn. Returns the parts the graph goes on with — the same parts unless the switch is
 * `on` and the engine changed something. Never throws.
 */
export function conversationTurn(scope: NodeScope, state: AgentGraphState, output: UnderstandOutput | null, parts: GraphPart[], flags: { followedList: boolean } = { followedList: false }, read: WorldRead | null = null): GraphPart[] {
  const mode = conversationMode();
  if (mode === "legacy") return parts;
  const { input, run } = scope;
  const now = state.asOf || scope.deps.now();
  const zone = state.timeZone || "Asia/Tokyo";
  const started = Date.now();
  const hint = hintOf(output, run.context);
  const record: ConversationRun = { applied: [], diffs: [], error: null, hint, mode, ms: 0, result: null, status: "compared", world: null };
  run.conversation = record;
  try {
    const log = logOf(run.sessionState);
    const gone = [...(run.context?.handles.values() ?? [])].filter((handle) => handle.accessible === false).map((handle) => labIdOf(handle.type, handle.id)).filter((id): id is string => Boolean(id));
    const names = namesOf(log, run.context);
    const world = worldOf(names, now, zone);
    const turn = { at: now, gone, hint, message: input.message };
    record.turn = turn;
    record.names = names;
    record.plainChat = Boolean(output?.plainChat);
    const result = runEngine(log, world, turn);
    record.ms = Date.now() - started;
    if (record.ms > conversationBudgetMs()) {
      record.status = "over_budget";
      emitTrace({ budgetMs: conversationBudgetMs(), ms: record.ms, type: "conversation.over_budget" });
      return parts;
    }
    // the World read from the store (ORBIT_AGENT_CONVERSATION_WORLD): a second run; over the budget it is dropped
    const worldMode = openedMode("world");
    let enriched: TurnResult | null = null;
    let enrichedNames = names;
    if (worldMode !== "off" && read && read.status !== "nothing") {
      const engineStarted = Date.now();
      if (read.world) {
        record.readWorld = read.world;
        try {
          enriched = runEngine(log, enrichWorld(world, read.world), turn);
          enrichedNames = { ...names, ...namesOfWorld(read.world) };
        } catch (error) {
          emitTrace({ error: error instanceof Error ? error.message : String(error), type: "conversation.error", where: "world" });
        }
      }
      const engineMs = Date.now() - engineStarted;
      if (engineMs > conversationBudgetMs()) enriched = null;
      record.world = { contacts: read.contacts, engineMs, readMs: read.ms, records: read.records, waitedMs: read.waitedMs ?? 0, rows: read.rows, status: read.status, used: worldMode === "on" && Boolean(enriched) };
      emitTrace({ ...record.world, mode: worldMode, type: "conversation.world" });
    }
    const driving = worldMode === "on" && enriched ? enriched : result;
    const drivingNames = driving === enriched ? enrichedNames : names;
    record.result = driving;
    const previousAsk = [...(run.context?.messages ?? [])].reverse().find((item) => item.role === "user")?.text;
    const agentFollowUps = new Map<string, FollowUpClass>();
    for (const part of parts) {
      if (flags.followedList) agentFollowUps.set(part.localId, "follow_list");
      else if (run.carriedQuestions.has(part.localId)) agentFollowUps.set(part.localId, "ask_again_about");
      else if (previousAsk && swapsPeriod(input.message)) agentFollowUps.set(part.localId, "swap_period");
    }
    const compareInput = { agentFollowUps, message: input.message, parts, result: driving, waitingChange: changeWaits(log) };
    record.diffs = compareTurn(compareInput);
    const applyWith = (engineResult: TurnResult, withNames: Record<string, { type: string; name: string }>) => applyTurn({ ...compareInput, context: run.context, gone: new Set(gone), names: withNames, result: engineResult, timeZone: zone });
    const idle = idleSince(log, now);
    const pronounMode = openedMode("pronoun");
    const carryMode = openedMode("carry");
    // what `on` decides today (the World as the switch says), then each opened decision on top of it
    const current = applyWith(driving, drivingNames);
    // the World: the engine's reading and what `on` would change with it (logged under shadow and on)
    if (enriched) {
      record.diffs.push(...resultDiffs(input.message, parts, result, enriched));
      const delta = appliedDelta(applyWith(result, names).applied, applyWith(enriched, enrichedNames).applied);
      if (delta) record.diffs.push({ agent: delta.removed, engine: delta.added, field: "world", part: "applied" });
    }
    // pronouns (R27) over the World that drives (shadow: over the read World too, when there is one)
    const probe = pronounMode === "on" || !enriched ? driving : enriched;
    const probeNames = probe === enriched ? enrichedNames : drivingNames;
    const pronouns = pronounMode === "off" ? null : withPronounsBound(probe, idle);
    let final = current;
    let finalResult = driving;
    if (pronouns?.bound.length) {
      const before = probe === driving ? current : applyWith(probe, probeNames);
      const after = applyWith(pronouns.result, probeNames);
      const delta = appliedDelta(before.applied, after.applied);
      record.diffs.push({ agent: delta?.removed ?? [], engine: { applied: delta?.added ?? [], bound: pronouns.bound }, field: "pronoun", part: null });
      if (pronounMode === "on" && mode === "on") {
        final = after;
        finalResult = pronouns.result;
        const saids = new Set(pronouns.bound.map((item) => item.said));
        final.applied = final.applied.map((item) => (delta?.added.some((other) => appliedKey(other) === appliedKey(item)) && saids.has(String((item.detail as { said?: string }).said ?? "")) ? { ...item, what: "pronoun" as const } : item));
      }
    }
    // the merged request's people, over the parts as they are after the decisions above
    const carry = carryMode === "off" ? [] : carryChangesOf({ message: input.message, parts: final.parts, result: carryMode === "on" ? finalResult : (enriched ?? finalResult) });
    for (const change of carry) record.diffs.push({ agent: final.parts.find((part) => part.localId === change.part)?.refs.filter((ref) => ref.entity === "contact").map((ref) => ref.recordId) ?? [], engine: change, field: "carry", part: change.part });
    if (mode !== "on") return parts;
    let out = final.parts;
    const applied = [...final.applied];
    if (carryMode === "on" && carry.length) {
      out = applyCarry(out, carry);
      for (const change of carry) applied.push({ detail: { followUp: change.followUp, ids: change.ids }, part: change.part, what: change.what });
    }
    record.applied = applied;
    for (const item of applied) emitTrace({ ...item, type: item.what === "ref_refused" ? "conversation.refused" : "conversation.applied" });
    return out;
  } catch (error) {
    record.status = "error";
    record.error = error instanceof Error ? error.message : String(error);
    record.ms = Date.now() - started;
    emitTrace({ error: record.error, type: "conversation.error" });
    return parts;
  }
}

const ABOUT: Record<string, Question["about"]> = { intent: "intent", object: "record", person: "person", reading: "reading" };

/** Lab ids (and names) of the records a card's operations change or link. */
function cardMentions(preview: NodeScope["run"]["actionPreview"]): { ids: string[]; names: Record<string, { type: string; name: string }>; target: string | null; op: string | null; set: Record<string, string> } {
  const ids: string[] = [];
  const names: Record<string, { type: string; name: string }> = {};
  let target: string | null = null;
  let op: string | null = null;
  const set: Record<string, string> = {};
  for (const operation of preview?.operations ?? []) {
    op ??= operation.capability;
    const type = operation.target ? TYPE_OF_COLLECTION[operation.target.collection] : undefined;
    const lab = type && operation.target ? labIdOf(type, operation.target.id) : null;
    if (lab) {
      target ??= lab;
      ids.push(lab);
      const name = /[「『“"]([^」』”"]+)[」』”"]/u.exec(operation.display?.record ?? "")?.[1]?.trim();
      if (name) names[lab] = { name, type: type! };
    }
    const shown = (operation.shown as { names?: Record<string, unknown> } | undefined)?.names ?? {};
    const visit = (value: unknown, key: string) => {
      if (typeof value === "string" && value.startsWith("contact:")) {
        const id = labIdOf("contact", value)!;
        ids.push(id);
        if (typeof shown[value] === "string") names[id] = { name: shown[value] as string, type: "contact" };
      } else if (Array.isArray(value)) value.forEach((item) => visit(item, key));
      else if (value && typeof value === "object") for (const [inner, item] of Object.entries(value)) visit(item, inner);
      else if (typeof value === "string" && /date|due|day|on$/iu.test(key) && /^\d{4}-\d{2}-\d{2}/u.test(value)) set[key] = value;
    };
    visit(operation.after, "");
  }
  return { ids: [...new Set(ids)], names, op, set, target };
}

/**
 * deliver, before the session state: a plain write part whose person the agent bound only after understand (a name said
 * for the first time, bound by the reads or the card — AE-XL-015 / 016 / 017) gets that person's linked records for r10's
 * duplicate check, through the same bounded read (confirmNeedsOf's rules), within the records the turn's first read left.
 * People the first layer's hint already bound were read (or not needed) at understand; read-only parts are never read.
 * The records only feed the ask / go run (askGoRun). Never throws.
 */
export async function conversationLateRead(scope: NodeScope, state: AgentGraphState): Promise<void> {
  const record = scope.run.conversation;
  if (!record?.turn || conversationMode() === "legacy" || openedMode("world") === "off") return;
  try {
    const needs = confirmNeedsOf(state.parts);
    if (!needs) return;
    const early = new Set((record.hint?.parts ?? []).flatMap((part) => (part.refs ?? []).map((ref) => ref.id)).filter(Boolean));
    const linkedTo = needs.linkedTo.filter((id) => !early.has(id));
    const left = READ_RECORDS - (record.world?.records ?? 0);
    if (!linkedTo.length || left <= 0) return;
    const read = await awaitWorldRead(startWorldRead(scope, null, state.asOf || scope.deps.now(), state.timeZone || "Asia/Tokyo", false, { creates: needs.creates, linkedTo, schedules: [] }, left));
    emitTrace({ contacts: linkedTo.length, ms: read.ms, records: read.records, rows: read.rows, status: read.status, type: "conversation.world_late", waitedMs: read.waitedMs ?? 0 });
    if (!read.world) return;
    const earlier = record.readWorld;
    const over = <R extends { id: string }>(mine: R[], theirs: R[]) => [...new Map([...mine, ...theirs].map((item) => [item.id, item])).values()];
    record.readWorld = earlier ? { ...earlier, contacts: over(earlier.contacts, read.world.contacts), memos: over(earlier.memos, read.world.memos), schedule: over(earlier.schedule, read.world.schedule), todos: over(earlier.todos, read.world.todos) } : read.world;
  } catch (error) {
    emitTrace({ error: error instanceof Error ? error.message : String(error), type: "conversation.error", where: "world_late" });
  }
}

/**
 * The engine's ask / go at deliver: its World has the records the conversation named plus what the store gave this turn
 * (the records read, bound, shown, offered), each bound record known also by the words that named it. Under the lab's
 * World (the whole account) a name binds when one record has it and asks when several do; this is the nearest the agent
 * has to that without another read. Throws what the engine throws (the caller catches).
 */
function askGoRun(scope: NodeScope, state: AgentGraphState, next: AgentSessionState, log: ConversationLog | null, record: ConversationRun): TurnResult {
  const { input, run } = scope;
  const now = state.asOf || scope.deps.now();
  const names: Record<string, { type: string; name: string }> = { ...(record.names ?? {}) };
  const add = (type: string, id: string, name: string | null | undefined) => {
    const lab = labIdOf(type === "attendance" ? "event" : type, id);
    if (lab && !names[lab]) names[lab] = { name: name || "", type };
  };
  for (const [id, item] of run.readNames) add(item.type, id, item.name);
  for (const item of next.lastMentioned.filter((entry) => entry.at === now)) add(item.type, item.id, item.name);
  for (const item of next.shownList?.shownAt === now ? next.shownList.items : []) add(item.type, item.id, item.name);
  for (const item of next.openItems.filter((entry) => entry.requestId === input.requestId)) for (const option of item.options ?? []) add(option.type, option.id, option.label.replace(/[（(].*$/u, "").trim());
  // the card's records (a to-do it changes, the people it links: 「给李薇建一个待办」 binds 李薇 only on the card)
  const card = cardMentions(run.actionPreview);
  for (const id of card.ids) if (card.names[id] && !names[id]) names[id] = card.names[id];
  const bound: { labId: string; words: string }[] = [];
  for (const part of state.parts) for (const ref of part.refs) {
    if (!ref.recordId) continue;
    const type = ref.entity === "attendance" ? "event" : ref.entity;
    add(type, ref.recordId, run.names.get(ref.recordId) ?? [...(run.context?.handles.values() ?? [])].find((handle) => handle.id === ref.recordId)?.name);
    const lab = labIdOf(type, ref.recordId);
    if (lab && ref.quote) bound.push({ labId: lab, words: input.message.slice(ref.quote[0], ref.quote[1]) });
  }
  const forms = formsOf(bound);
  for (const id of Object.keys(names)) if (!names[id].name) {
    if (forms[id]?.length) names[id] = { ...names[id], name: forms[id][0] };
    else delete names[id];
  }
  // R27 counts for ask / go when it is on (ORBIT_AGENT_CONVERSATION_PRONOUN), as it does for the parts
  const bind = openedMode("pronoun") === "on" ? (result: TurnResult) => withPronounsBound(result, idleSince(log, now)).result : undefined;
  // r10: the records the turn's store read gave (open records of a kind created, a deleted contact's linked records, a
  // changed schedule item) — what the engine's write confirmations are checked against
  const read = record.readWorld ?? null;
  return runAskGo(log, names, record.turn!, Boolean(record.plainChat), forms, state.timeZone || "Asia/Tokyo", bind, read ? (world) => enrichWorld(world, read) : undefined);
}

/**
 * deliver (a new turn's session state): the rest of the comparison, the trace and the shadow record, and the log with
 * this turn. Returns undefined when the switch is legacy (the state keeps no log). Never throws.
 */
export function conversationAfterTurn(scope: NodeScope, state: AgentGraphState, previous: AgentSessionState | null, next: AgentSessionState): ConversationLog | undefined {
  const mode = conversationMode();
  if (mode === "legacy") return undefined;
  const { input, run } = scope;
  const now = state.asOf || scope.deps.now();
  const log = logOf(previous);
  const record = run.conversation ?? null;
  try {
    const result = record?.result ?? null;
    // ask / go (the engine as the lab runs it: a World with what the store gave this turn, see bridge.ts runAskGo),
    // and the questions shelved this turn
    if (record && result) {
      const askGo = record.turn ? askGoRun(scope, state, next, log, record) : result;
      for (const part of state.parts) {
        const item = enginePartOf(askGo, input.message, part);
        if (!item) continue;
        const agentNext = part.status === "awaiting_clarification" ? "ask" : "go";
        const engineNext = item.next === "ask" ? "ask" : "go";
        const why = item.refs.filter((ref) => ref.outcome !== "bound").map((ref) => ({ outcome: ref.outcome, said: ref.said, ...(ref.candidates ? { candidates: ref.candidates.length } : {}) }));
        if (agentNext !== engineNext) record.diffs.push({ agent: agentNext, engine: item.next, field: "next", part: part.localId, ...(why.length ? { why } : {}) });
      }
      const kept = new Set(next.openItems.map((item) => item.ref));
      const continued = new Set(state.parts.map((part) => part.continues?.ref).filter(Boolean) as string[]);
      const agentShelved = (previous?.openItems ?? []).filter((item) => item.kind === "clarification" && !kept.has(item.ref) && !continued.has(item.ref)).map((item) => item.ref).sort();
      const engineShelved = [...result.shelved].sort();
      if (JSON.stringify(agentShelved) !== JSON.stringify(engineShelved)) record.diffs.push({ agent: agentShelved, engine: engineShelved, field: "shelved", part: null });
    }
    if (record) {
      emitTrace({ applied: record.applied.length, diffs: record.diffs, error: record.error, mode: record.mode, ms: record.ms, status: record.status, type: "conversation.shadow" });
      scheduleConversationShadow({ actorId: input.actorId, applied: record.applied, comparedAt: now, diffs: record.diffs, error: record.error, message: input.message, mode: record.mode, ms: record.ms, requestId: input.requestId, schemaVersion: 1, sessionId: input.sessionId, status: record.status });
    }
    // the agent's reply as the lab sees it
    const names: Record<string, { type: string; name: string }> = {};
    const mentions: string[] = [];
    const mention = (item: Pick<NamedRecordRef, "type" | "id" | "name">) => {
      const lab = labIdOf(item.type, item.id);
      if (!lab) return;
      mentions.push(lab);
      if (item.name) names[lab] = { name: item.name, type: item.type };
    };
    for (const item of next.lastMentioned.filter((entry) => entry.at === now)) mention(item);
    for (const part of state.parts) for (const ref of part.refs) {
      const known = ref.recordId ? run.readNames.get(ref.recordId)?.name ?? run.names.get(ref.recordId) ?? [...(run.context?.handles.values() ?? [])].find((handle) => handle.id === ref.recordId)?.name ?? null : null;
      if (ref.recordId) mention({ id: ref.recordId, name: known ?? "", type: ref.entity === "attendance" ? "event" : ref.entity });
    }
    const card = cardMentions(run.actionPreview);
    mentions.push(...card.ids);
    Object.assign(names, card.names);
    const listed = next.shownList && next.shownList.shownAt === now ? next.shownList.items.map((item) => labIdOf(item.type, item.id)).filter((id): id is string => Boolean(id)) : [];
    for (const item of next.shownList?.shownAt === now ? next.shownList.items : []) if (item.name) names[labIdOf(item.type, item.id) ?? ""] = { name: item.name, type: item.type };
    delete names[""];
    const asked = next.openItems.find((item) => item.kind === "clarification" && item.requestId === input.requestId);
    const askedPart = asked ? state.parts.find((part) => part.localId === asked.partId) : undefined;
    const askedFor = askedPart && result ? enginePartOf(result, input.message, askedPart)?.request ?? undefined : undefined;
    const asks: Question | undefined = asked ? {
      about: ABOUT[asked.asks ?? "object"] ?? "record",
      id: asked.ref,
      options: (asked.options ?? []).map((option) => ({ id: labIdOf(option.type, option.id) ?? option.id, label: option.label })),
      ...(askedFor && Object.keys(askedFor).length ? { for: askedFor } : {}),
      ...(asked.writes ? { writes: true } : {}),
    } : undefined;
    for (const option of asked?.options ?? []) {
      const lab = labIdOf(option.type, option.id);
      if (lab) names[lab] ??= { name: option.label.replace(/[（(].*$/u, "").trim(), type: option.type };
    }
    const firstNew = result?.parts.find((part) => !part.continues);
    const answered: Slots | undefined = !asked && firstNew?.request && Object.keys(firstNew.request).length && firstNew.request.verb !== "create" ? firstNew.request : undefined;
    const agent: AgentReply = {
      at: now,
      done: [],
      listed,
      mentions: [...new Set([...listed, ...mentions])],
      text: run.text.replace(/\s+/gu, " ").slice(0, 300),
      ...(asks ? { asks } : {}),
      ...(card.op && run.actionPreview ? { card: { id: run.actionPreview.actionId, op: card.op, target: card.target, ...(Object.keys(card.set).length ? { set: card.set } : {}) } } : {}),
      ...(answered ? { answered } : {}),
    };
    return appendTurn(log, { agent, requestId: input.requestId, user: { at: now, hint: record?.hint ?? null, text: input.message } }, names);
  } catch (error) {
    emitTrace({ error: error instanceof Error ? error.message : String(error), type: "conversation.error", where: "log" });
    return log ?? undefined;
  }
}

