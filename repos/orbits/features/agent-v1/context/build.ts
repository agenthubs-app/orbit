/**
 * The four things the first layer sees (设计稿 §3.10, agent-design AG03):
 *
 * 1. the latest 10 messages, text only; a long assistant answer is cut to its opening and keeps the
 *    ids of the records it referred to;
 * 2. the open items (an unanswered question, an alternative waiting for acceptance …);
 * 3. the list shown last (ids and names in display order);
 * 4. the record of each kind mentioned last (id and name).
 *
 * After more than 60 idle minutes 1, 3 and 4 are not given to the model; the record mentioned last
 * stays with code, as the first candidate if a question has to be asked. Open items are not affected.
 * Record bodies never enter the context. The model sees short handles (r1, r2 …, o1 …) instead of
 * product ids; code maps them back, so a model can only point at what the context offered.
 */
import type { AgentSessionState, NamedRecordRef, NoteGoal, SessionOpenItem, StaleProfile } from "./session-state";

export const CONTEXT_MESSAGE_WINDOW = 10;
export const IDLE_BREAK_MINUTES = 60;
export const ASSISTANT_TEXT_LIMIT = 160;
export const USER_TEXT_LIMIT = 400;
/** AG05: what the model sees of an earlier answer whose source record cannot be read now. */
export const STALE_ANSWER = "(an earlier answer based on a record that can no longer be read; its content is not available)";

export interface ContextMessage {
  role: "user" | "assistant";
  text: string;
  createdAt?: string;
  /** Product refs ("todo:task:…" or "task:…") the message pointed at. */
  recordRefs?: readonly string[];
  /** AG14: the session's own id of the message (an answer is `assistant:<requestId>[:…]`); never shown to a model. */
  id?: string;
}

export interface ContextHandle {
  handle: string;
  type: string;
  id: string;
  name: string | null;
  /** Where the model saw it: this turn's @ reference, the shown list, last mentioned, an old message. */
  source: "reference" | "shown_list" | "last_mentioned" | "message";
  /** AG05: false when the record cannot be read now (deleted, not the account's, withdrawn). */
  accessible?: boolean;
}

export interface FirstLayerContext {
  idle: boolean;
  idleMinutes: number | null;
  /** The messages given to the model (oldest first), already cut. */
  messages: { role: "user" | "assistant"; text: string; handles: string[] }[];
  shownList: ContextHandle[];
  lastMentioned: ContextHandle[];
  /** Kept for code even when the session was idle (the first candidate of a question). */
  lastMentionedForCode: NamedRecordRef[];
  openItems: (SessionOpenItem & { handle: string })[];
  references: ContextHandle[];
  handles: Map<string, ContextHandle>;
  openItemHandles: Map<string, SessionOpenItem>;
  /** The context block of the first layer's prompt. */
  promptText: string;
  /** AG20a (decision 2): for code only, never in the prompt — the profile fields the last answer found out of date. */
  staleProfiles: StaleProfile[];
  /** AG20b (R17): the goal the user stated for the next note (none when the session was idle). */
  noteGoal?: NoteGoal | null;
}

const ENTITY_TYPES = new Set(["contact", "event", "attendance", "todo", "memo", "schedule", "rule", "memory"]);

/** A message's record ref is "<type>:<product id>" ("todo:task:abc"); anything else is kept whole. */
function recordType(ref: string): { type: string; id: string } {
  const at = ref.indexOf(":");
  const head = at > 0 ? ref.slice(0, at) : "";
  return ENTITY_TYPES.has(head) && ref.length > at + 1 ? { id: ref.slice(at + 1), type: head } : { id: ref, type: "record" };
}

function cut(text: string, limit: number): string {
  const clean = text.replace(/\s+/gu, " ").trim();
  return clean.length > limit ? `${clean.slice(0, limit)}…` : clean;
}

/** Drops a user message with no reply after it (stopped or failed before anything was delivered). */
export function answeredMessages(messages: readonly ContextMessage[]): ContextMessage[] {
  return messages.filter((message, index) => message.role !== "user" || messages[index + 1]?.role === "assistant");
}

export function minutesBetween(fromIso: string | undefined, toIso: string): number | null {
  if (!fromIso) return null;
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  return Number.isFinite(from) && Number.isFinite(to) ? Math.max(0, (to - from) / 60_000) : null;
}

export function buildFirstLayerContext(input: {
  messages: readonly ContextMessage[];
  state: AgentSessionState | null;
  now: string;
  /** This turn's @ references, with names (AG05: `accessible: false` when one cannot be opened). */
  references: readonly (NamedRecordRef & { accessible?: boolean })[];
  /**
   * AG05 (设计稿 §3.6 恢复时按当前权限重读): ids of records of the conversation and the session state that
   * cannot be read now. Their handles say so, and an earlier answer that used one is not shown again.
   */
  inaccessible?: ReadonlySet<string>;
  window?: number;
  idleBreakMinutes?: number;
}): FirstLayerContext {
  const window = input.window ?? CONTEXT_MESSAGE_WINDOW;
  const idleBreak = input.idleBreakMinutes ?? IDLE_BREAK_MINUTES;
  const all = answeredMessages(input.messages);
  const lastAt = all.length ? all[all.length - 1].createdAt : input.state?.updatedAt;
  const idleMinutes = minutesBetween(lastAt, input.now);
  const idle = idleMinutes !== null && idleMinutes > idleBreak;

  const handles = new Map<string, ContextHandle>();
  const byId = new Map<string, ContextHandle>();
  const closed = input.inaccessible ?? new Set<string>();
  const handleFor = (ref: { type: string; id: string; name: string | null; accessible?: boolean }, source: ContextHandle["source"]): ContextHandle => {
    const known = byId.get(ref.id);
    if (known) {
      if (!known.name && ref.name && known.accessible !== false) known.name = ref.name;
      return known;
    }
    const accessible = ref.accessible === false || closed.has(ref.id) ? false : undefined;
    const made: ContextHandle = { handle: `r${handles.size + 1}`, id: ref.id, name: accessible === false ? null : ref.name, source, type: ref.type, ...(accessible === false ? { accessible } : {}) };
    handles.set(made.handle, made);
    byId.set(made.id, made);
    return made;
  };

  const references = input.references.map((ref) => handleFor({ accessible: ref.accessible, id: ref.id, name: ref.name || null, type: ref.type }, "reference"));
  const shownList = idle ? [] : (input.state?.shownList?.items ?? []).map((item) => handleFor({ id: item.id, name: item.name, type: item.type }, "shown_list"));
  const lastMentioned = idle ? [] : (input.state?.lastMentioned ?? []).map((item) => handleFor({ id: item.id, name: item.name, type: item.type }, "last_mentioned"));
  const messages = idle ? [] : all.slice(-window).map((message) => {
    const refs = (message.recordRefs ?? []).map((ref) => recordType(ref)).map((ref) => handleFor({ id: ref.id, name: null, type: ref.type }, "message"));
    // AG05: an earlier answer built on a record that cannot be read now is not shown again (its content would come back).
    const stale = message.role === "assistant" && refs.some((ref) => ref.accessible === false);
    return { handles: refs.map((ref) => ref.handle), role: message.role, text: stale ? STALE_ANSWER : cut(message.text, message.role === "assistant" ? ASSISTANT_TEXT_LIMIT : USER_TEXT_LIMIT) };
  });
  const openItemHandles = new Map<string, SessionOpenItem>();
  const openItems = (input.state?.openItems ?? []).map((item, index) => {
    const handle = `o${index + 1}`;
    openItemHandles.set(handle, item);
    return { ...item, handle };
  });

  const describe = (handle: ContextHandle) => `${handle.handle} ${handle.type}${handle.name ? ` ${handle.name}` : ""}${handle.accessible === false ? " (cannot be opened now)" : ""}`;
  const lines: string[] = [];
  lines.push(idle
    ? `The session was idle for ${Math.round(idleMinutes ?? 0)} minutes, so earlier messages, the last shown list and the last mentioned records are not available. Do not guess who or what a pronoun refers to.`
    : `Minutes since the last message: ${idleMinutes === null ? "none (new conversation)" : Math.round(idleMinutes)}.`);
  if (references.length) lines.push(`Records the user attached with @ to the current message: ${references.map(describe).join("; ")}.`);
  if (!idle) {
    lines.push(messages.length ? "Recent messages (oldest first, text only):" : "Recent messages: none.");
    for (const message of messages) lines.push(`- ${message.role}: ${message.text}${message.handles.length ? ` [records: ${message.handles.join(", ")}]` : ""}`);
    if (shownList.length) lines.push(`The list shown last, in display order: ${shownList.map((item, index) => `${index + 1}. ${describe(item)}`).join("; ")}.`);
    if (lastMentioned.length) lines.push(`The record of each kind mentioned last: ${lastMentioned.map(describe).join("; ")}.`);
  }
  lines.push(openItems.length ? `Open items of this session: ${openItems.map((item) => `${item.handle} (${item.kind}) ${item.summary}`).join("; ")}.` : "Open items of this session: none.");
  return {
    handles,
    idle,
    idleMinutes,
    lastMentioned,
    lastMentionedForCode: [...(input.state?.lastMentioned ?? [])],
    messages,
    noteGoal: idle ? null : input.state?.noteGoal ?? null,
    openItemHandles,
    openItems,
    promptText: lines.join("\n"),
    references,
    shownList,
    staleProfiles: idle ? [] : [...(input.state?.staleProfiles ?? [])],
  };
}
