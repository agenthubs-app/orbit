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
import { applyTurn, compareTurn, enginePartOf, type Applied, type ConversationDiff } from "./apply";
import { appendTurn, hintOf, labIdOf, namesOf, normalizeLog, runEngine, TYPE_OF_COLLECTION, worldOf, type ConversationLog } from "./bridge";
import { conversationBudgetMs, conversationMode, type ConversationMode } from "./mode";
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
export function conversationTurn(scope: NodeScope, state: AgentGraphState, output: UnderstandOutput | null, parts: GraphPart[], flags: { followedList: boolean } = { followedList: false }): GraphPart[] {
  const mode = conversationMode();
  if (mode === "legacy") return parts;
  const { input, run } = scope;
  const now = state.asOf || scope.deps.now();
  const started = Date.now();
  const hint = hintOf(output, run.context);
  const record: ConversationRun = { applied: [], diffs: [], error: null, hint, mode, ms: 0, result: null, status: "compared" };
  run.conversation = record;
  try {
    const log = logOf(run.sessionState);
    const gone = [...(run.context?.handles.values() ?? [])].filter((handle) => handle.accessible === false).map((handle) => labIdOf(handle.type, handle.id)).filter((id): id is string => Boolean(id));
    const world = worldOf(namesOf(log, run.context), now, state.timeZone || "Asia/Tokyo");
    const result = runEngine(log, world, { at: now, gone, hint, message: input.message });
    record.ms = Date.now() - started;
    if (record.ms > conversationBudgetMs()) {
      record.status = "over_budget";
      emitTrace({ budgetMs: conversationBudgetMs(), ms: record.ms, type: "conversation.over_budget" });
      return parts;
    }
    record.result = result;
    const previousAsk = [...(run.context?.messages ?? [])].reverse().find((item) => item.role === "user")?.text;
    const agentFollowUps = new Map<string, FollowUpClass>();
    for (const part of parts) {
      if (flags.followedList) agentFollowUps.set(part.localId, "follow_list");
      else if (run.carriedQuestions.has(part.localId)) agentFollowUps.set(part.localId, "ask_again_about");
      else if (previousAsk && swapsPeriod(input.message)) agentFollowUps.set(part.localId, "swap_period");
    }
    const compareInput = { agentFollowUps, message: input.message, parts, result, waitingChange: changeWaits(log) };
    record.diffs = compareTurn(compareInput);
    if (mode !== "on") return parts;
    const gonePieces = new Set(gone);
    const applied = applyTurn({ ...compareInput, context: run.context, gone: gonePieces, timeZone: state.timeZone || "Asia/Tokyo" });
    record.applied = applied.applied;
    for (const item of applied.applied) emitTrace({ ...item, type: "conversation.applied" });
    return applied.parts;
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
    // ask / go, and the questions shelved this turn
    if (record && result) {
      for (const part of state.parts) {
        const item = enginePartOf(result, input.message, part);
        if (!item) continue;
        const agentNext = part.status === "awaiting_clarification" ? "ask" : "go";
        const engineNext = item.next === "ask" ? "ask" : "go";
        if (agentNext !== engineNext) record.diffs.push({ agent: agentNext, engine: item.next, field: "next", part: part.localId });
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

