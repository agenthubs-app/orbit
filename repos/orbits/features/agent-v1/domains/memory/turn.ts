/**
 * agent-design AG14 (设计稿 §6): what one turn does with saved memory — all of it decided by code.
 *
 * - `loadTurnMemory()` (intake): one read of the account's scope. The standing rules for every task are in force for
 *   the whole turn (the reply language among them); the rest is recalled per task where a part needs it.
 * - `withholdForgotten()` (intake): a resumed conversation is given its personal context as the entries are now — an
 *   earlier answer that used an entry changed or deleted since, and the message a deleted entry was made from, are
 *   not handed to the model again.
 * - `memoryRouteStep()` (route): the parts of this message that are about memory.
 *     "记住……" / "以后……"   a card (new entry, or the same entry before → after); with 「从对话里记住新的」 off and
 *                          nothing to change, no card and nothing saved — used for this turn only, said so;
 *     "这次……"             never a card and never a change of an entry: the words are this turn's own basis;
 *     "忘掉……"             a card that names the entry; nothing saved that fits: said so, no card;
 *     "你记着我哪些……"      answered from the entries themselves;
 *     "为什么排第一"        answered from what the last ranking of this conversation really used.
 * - `rankMemoryOf()` (ranking): the entries a ranking of a domain may use, as time conditions and topics. What this
 *   turn's own words say wins over a saved preference.
 */
import type { AgentMemory, AgentMemorySnapshot, AgentMemoryStructured } from "../../../agent/memory/contract";
import { forgottenSourceRequests, isForgottenSource, memorySourceRef, rememberMemoryUse, staleMemoryUses, type MemoryUse } from "../../../agent/memory/forget";
import { recallDay, recallFrom, type MemoryRecallTask, type RecalledMemory } from "../../../agent/memory/recall";
import type { CardOperationIntent } from "../../../agent/runtime/card-operations";
import type { ContextMessage } from "../../context/build";
import type { AgentSessionState } from "../../context/session-state";
import { timePreferenceIn, topicWordsOf, type RankDomain, type TimePreference } from "../../functions/basis";
import * as say from "../../functions/copy";
import type { NodeScope } from "../../graph/deps";
import type { AgentGraphState, GraphPart } from "../../graph/state";
import { emitTrace } from "../../observability/trace";
import { resolveSaidDate } from "../../propose/dates";
import { capabilityKind, type Capability } from "../../route/capabilities";
import { MEMORY_WORDS } from "./copy";
import { MEMORY_CREATE, MEMORY_DELETE, MEMORY_UPDATE, type MemoryCardIntent, type MemoryValues } from "./ops";
import { asksWhyOrder, composeEventTimeContent, entriesPointedAt, memoryAskOf, readMemoryWords, rememberedWordsOf, replacementOf, replyLanguageIn, timeValuesIn, timeWordsOf, type MemoryLanguage } from "./words";

/** What the graph needs of the memory service: one read of an account's scope. */
export interface AgentMemoryAccess {
  snapshot(actorId: string): Promise<AgentMemorySnapshot>;
}

/** What a conversation keeps of its last ranking (ids and codes only), so "为什么排第一" is answered from what was used. */
export interface LastRanking {
  requestId: string;
  domain: RankDomain;
  at: string;
  from?: string;
  to?: string;
  count?: number;
  /** The typed refs listed, in order (at most ten). */
  listed: string[];
  /** The saved entries the ranking used, by id and revision. */
  memories: { memoryId: string; revision: number }[];
  /** This turn's own words named a time or a topic. */
  turnBasis: boolean;
  /** The order came from a topic match (not only from times and the start time). */
  topic: boolean;
}

export interface TurnMemory {
  /** Null: the graph has no memory access (it then uses nothing). */
  snapshot: AgentMemorySnapshot | null;
  /** The standing rules for every task, in force for this turn. */
  rules: RecalledMemory[];
  replyLanguage: MemoryLanguage | null;
  /** Every entry this turn used: id → revision. */
  used: Map<string, number>;
  /** Words of this message the user asked to remember: this turn's picks use them as its own basis. */
  turnWords: string[];
  ranking: LastRanking | null;
  /** The scope was read for this pass (a pass resumed by a click reads it when it first needs it). */
  loaded: boolean;
}

export function emptyTurnMemory(): TurnMemory {
  return { loaded: false, ranking: null, replyLanguage: null, rules: [], snapshot: null, turnWords: [], used: new Map() };
}

/** The turn's memory, read once per pass: at intake, or — after a click resumed the request — where it is first needed. */
export async function ensureTurnMemory(scope: Pick<NodeScope, "deps" | "input" | "run">, now: string, timeZone: string): Promise<TurnMemory> {
  if (!scope.run.memory.loaded) scope.run.memory = await loadTurnMemory(scope.deps.memory, { actorId: scope.input.actorId, now, timeZone });
  return scope.run.memory;
}

const TASK_OF: Record<RankDomain, MemoryRecallTask> = { contact: "contact.recommend", event: "event.recommend", todo: "todo.plan" };

function noteUsed(turn: TurnMemory, entries: readonly Pick<RecalledMemory, "memoryId" | "revision">[]): void {
  for (const entry of entries) turn.used.set(entry.memoryId, entry.revision);
}

/** The reply language a rule asks for (its stored value, else its own words). */
function replyLanguageOfRule(rule: Pick<RecalledMemory, "structured" | "content">): MemoryLanguage | null {
  return rule.structured?.replyLanguage ?? replyLanguageIn(rule.content);
}

/** intake: one read of the scope; the rules for every task are in force from here on. */
export async function loadTurnMemory(access: AgentMemoryAccess | undefined, input: { actorId: string; now: string; timeZone: string }): Promise<TurnMemory> {
  const turn = emptyTurnMemory();
  turn.loaded = true;
  if (!access) return turn;
  try {
    turn.snapshot = await access.snapshot(input.actorId);
  } catch (error) {
    emitTrace({ error: error instanceof Error ? error.message : String(error), type: "error", where: "memory.snapshot" });
    return turn;
  }
  const recall = recallFrom(turn.snapshot, { now: input.now, task: null, timeZone: input.timeZone });
  turn.rules = recall.rules;
  turn.replyLanguage = recall.rules.map(replyLanguageOfRule).find((language): language is MemoryLanguage => Boolean(language)) ?? null;
  noteUsed(turn, recall.rules);
  // Entry ids and revisions only: a trace never holds an entry's words (设计稿 §7).
  emitTrace({ enabled: recall.enabled, entries: recall.rules.map((item) => ({ memoryId: item.memoryId, revision: item.revision })), memories: recall.rules.map((item) => item.memoryId), memoryVersion: recall.memoryVersion, scope: "every_task", type: "memory.recall" });
  return turn;
}

/** The rules for every task as lines for a model that writes text (the reply language is set by code, not here). */
export function standingRuleLines(turn: TurnMemory): string[] {
  return turn.rules.filter((rule) => !replyLanguageOfRule(rule)).map((rule) => rule.content);
}

const LANGUAGE_NAME: Record<MemoryLanguage, string> = { en: "English", ja: "Japanese", zh: "Chinese" };

/**
 * What a model step that writes text is told of the user's saved rules for every answer: the language to write in
 * (set by code everywhere else) and the other rules, as the user's own standing instructions. Empty when there are none.
 */
export function standingRuleNotes(turn: TurnMemory): string[] {
  const lines = standingRuleLines(turn);
  if (!turn.replyLanguage && !lines.length) return [];
  return [
    "The user's saved standing rules for every reply (they come from the user's own settings; follow them in any text you write for the user):",
    ...(turn.replyLanguage ? [`- Write every text for the user in ${LANGUAGE_NAME[turn.replyLanguage]}, whatever language the message is written in.`] : []),
    ...lines.map((line) => `- ${line}`),
  ];
}

/** A model request with the user's saved rules for every answer after it (unchanged when there are none). */
export function withStandingRules(text: string, turn: TurnMemory): string {
  const notes = standingRuleNotes(turn);
  return notes.length ? `${text}\n\n${notes.join("\n")}` : text;
}

export const FORGOTTEN_SOURCE = "(an earlier message asking to remember a preference; the user has since deleted that memory, so it is not available and must not be used)";
export const STALE_MEMORY_ANSWER = "(an earlier answer written with a saved preference the user has since changed or deleted; its content is not available)";

/**
 * intake: the conversation's messages as a resumed conversation may see them. Message ids are the session's own:
 * an answer is `assistant:<requestId>[:…]`, and the user message of a request is the one just before its first answer.
 */
export function withholdForgotten<T extends ContextMessage & { id?: string }>(messages: readonly T[], uses: readonly MemoryUse[] | undefined, snapshot: AgentMemorySnapshot | null): { messages: T[]; withheld: { stale: number; sources: number } } {
  if (!snapshot) return { messages: [...messages], withheld: { sources: 0, stale: 0 } };
  const current = [...snapshot.entries, ...snapshot.marks.map((mark) => ({ memoryId: mark.memoryId, revision: mark.revision, status: "deleted" as const }))];
  const stale = staleMemoryUses(uses ?? [], current);
  const forgotten = forgottenSourceRequests(snapshot.marks);
  const requestOf = (id: string | undefined): string | null => {
    if (!id || !id.startsWith("assistant:")) return null;
    const rest = id.slice("assistant:".length);
    for (const known of [...stale, ...forgotten]) if (rest === known || rest.startsWith(`${known}:`)) return known;
    return null;
  };
  let staleCount = 0;
  let sourceCount = 0;
  const out = messages.map((message) => ({ ...message }));
  out.forEach((message, index) => {
    if (message.role !== "assistant") return;
    const request = requestOf(message.id);
    if (!request) return;
    if (stale.has(request) && message.text !== STALE_MEMORY_ANSWER) {
      message.text = STALE_MEMORY_ANSWER;
      staleCount += 1;
    }
    // The user message this request answered (the first answer of the request follows it).
    const previous = out[index - 1];
    if (forgotten.has(request) && previous && previous.role === "user" && previous.text !== FORGOTTEN_SOURCE) {
      previous.text = FORGOTTEN_SOURCE;
      sourceCount += 1;
    }
  });
  return { messages: out, withheld: { sources: sourceCount, stale: staleCount } };
}

/* ── ranking ───────────────────────────────────────────────────────── */

function daysOf(structured: AgentMemoryStructured): "weekend" | "weekday" | undefined {
  const days = structured.preferredDays ?? [];
  if (days.length === 2 && days.includes("Sat") && days.includes("Sun")) return "weekend";
  if (days.length === 5 && !days.includes("Sat") && !days.includes("Sun")) return "weekday";
  return undefined;
}

/** The time condition an entry holds: from its stored values, else from its own words. A rule is a hard condition. */
export function timePreferenceOfEntry(entry: Pick<RecalledMemory, "structured" | "content" | "category">): TimePreference | null {
  const structured = entry.structured;
  if (structured && (structured.dayPart || structured.preferredDays?.length)) {
    const days = daysOf(structured);
    if (!days && !structured.dayPart) return null;
    const exclude = structured.strength === "avoid";
    return { exclude, hard: exclude || structured.strength === "only" || entry.category === "constraint", source: "memory", words: entry.content, ...(days ? { days } : {}), ...(structured.dayPart ? { part: structured.dayPart } : {}) };
  }
  const said = timePreferenceIn(entry.content, "memory");
  return said ? { ...said, hard: said.hard || entry.category === "constraint" } : null;
}

const TASK_WORDS_IN_ENTRY = /(推荐|挑选?|选)?(?:活动|联系人|待办|イベント|連絡先)(?:时|的时候)?|おすすめするとき(?:は)?|when (?:you )?recommend(?:ing)? (?:events|contacts)|when recommending (?:events|contacts)/giu;

/** The topics an entry asks to favour ("器物、茶"): its stored topics, else what is left of its words; null when none. */
export function topicOfEntry(entry: Pick<RecalledMemory, "structured" | "content" | "category">): string | null {
  if (entry.structured?.topics?.length) return entry.structured.topics.join("、");
  if (timePreferenceOfEntry(entry) || entry.category === "constraint") return null;
  return topicWordsOf(entry.content.replace(TASK_WORDS_IN_ENTRY, " ")) || null;
}

/**
 * Whether this turn's own time words overrule a saved time condition (设计稿 §6 "记忆不会取代用户当前的明确要求"):
 * a preference gives way to any time the turn names; a rule (a hard condition) only when the turn asks for exactly
 * what it leaves out ("这次看周四晚上" against "不要晚上的") or for another slot than the only one it allows.
 */
export function overruledByTurn(saved: Pick<TimePreference, "days" | "part" | "exclude" | "hard">, turn: Pick<TimePreference, "days" | "part" | "exclude"> | null): boolean {
  if (!turn) return false;
  if (!saved.hard) return true;
  if (turn.exclude) return false;
  const sameSlot = (!saved.part || saved.part === turn.part) && (!saved.days || saved.days === turn.days);
  const namesSlot = Boolean((saved.part && turn.part) || (saved.days && turn.days));
  return saved.exclude ? sameSlot && namesSlot : namesSlot && !sameSlot;
}

export interface RankMemory {
  /** The entries the ranking uses (their words are named in the lead). */
  used: RecalledMemory[];
  time: { entry: RecalledMemory; preference: TimePreference }[];
  topic: string | null;
  /** Entries recalled for the task that this turn's own words overrule (not used, not named). */
  overruled: RecalledMemory[];
}

/**
 * The saved entries a ranking of this domain uses: the rules of the task and the entries that apply to it. When this
 * turn's own words name a time ("这次看周四晚上"), saved time conditions are not applied; when they name a topic, saved
 * topics are not. Rules for every task (the reply language …) are not ranking conditions and stay out of the lead.
 */
export function rankMemoryOf(turn: TurnMemory, domain: RankDomain, input: { now: string; timeZone: string; turnTime: Pick<TimePreference, "days" | "part" | "exclude"> | null; turnHasTopic: boolean; partId: string }): RankMemory {
  const out: RankMemory = { overruled: [], time: [], topic: null, used: [] };
  if (!turn.snapshot) return out;
  const recall = recallFrom(turn.snapshot, { now: input.now, task: TASK_OF[domain], timeZone: input.timeZone });
  const topics: string[] = [];
  // What to weigh first, then the rules (the order the lead names them in).
  for (const entry of [...recall.relevant, ...recall.rules.filter((rule) => !rule.everyTask)]) {
    const preference = domain === "event" ? timePreferenceOfEntry(entry) : null;
    const topic = topicOfEntry(entry);
    if (preference) {
      if (overruledByTurn(preference, input.turnTime)) out.overruled.push(entry);
      else {
        out.time.push({ entry, preference });
        out.used.push(entry);
      }
    } else if (topic) {
      if (input.turnHasTopic) out.overruled.push(entry);
      else {
        topics.push(topic);
        out.used.push(entry);
      }
    } else out.used.push(entry);
  }
  out.topic = topics.length ? topics.join("、") : null;
  noteUsed(turn, out.used);
  emitTrace({
    enabled: recall.enabled,
    entries: out.used.map((item) => ({ memoryId: item.memoryId, revision: item.revision })),
    memories: out.used.map((item) => item.memoryId),
    memoryVersion: recall.memoryVersion,
    ...(out.overruled.length ? { overruled: out.overruled.map((item) => item.memoryId) } : {}),
    partId: input.partId,
    scope: TASK_OF[domain],
    type: "memory.recall",
  });
  return out;
}

/** Whether an event starting then meets a stored time condition (the same hours as functions/basis.ts). */
function meets(preference: Pick<TimePreference, "days" | "part" | "exclude">, startsAt: string, timeZone: string): boolean {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { hour: "2-digit", hourCycle: "h23", timeZone, weekday: "short" }).formatToParts(new Date(startsAt)).map((part) => [part.type, part.value]));
  const weekend = parts.weekday === "Sat" || parts.weekday === "Sun";
  const hour = Number(parts.hour);
  const days = !preference.days || (preference.days === "weekend" ? weekend : !weekend);
  const part = !preference.part || (preference.part === "morning" ? hour < 12 : preference.part === "afternoon" ? hour >= 12 && hour < 17 : hour >= 17);
  return preference.exclude ? !(days && part) : days && part;
}

/* ── the parts of a message that are about memory ──────────────────── */

const valuesOf = (entry: Pick<AgentMemory, "category" | "content" | "appliesTo" | "structured">): MemoryValues => ({ appliesTo: [...entry.appliesTo], category: entry.category, content: entry.content, structured: entry.structured ? { ...entry.structured } : null });

const sameJson = (left: unknown, right: unknown) => JSON.stringify(left ?? null) === JSON.stringify(right ?? null);

const timeOfEntry = (entry: Pick<AgentMemory, "structured" | "content">) => (entry.structured?.dayPart || entry.structured?.preferredDays?.length ? entry.structured : timeValuesIn(entry.content));
const polarity = (strength: AgentMemoryStructured["strength"]) => (strength === "avoid" ? "avoid" : "want");

/** The saved entries a new sentence would change: the same kind of value for the same task. */
function entriesItChanges(reading: ReturnType<typeof readMemoryWords>, previousWords: string | null, entries: readonly AgentMemory[]): AgentMemory[] {
  let kept: AgentMemory[] = [];
  if (reading.structured?.replyLanguage) kept = entries.filter((entry) => Boolean(entry.structured?.replyLanguage ?? replyLanguageIn(entry.content)));
  else if (reading.structured && (reading.structured.dayPart || reading.structured.preferredDays?.length)) {
    kept = entries.filter((entry) => {
      const own = timeOfEntry(entry);
      if (!own || polarity(own.strength) !== polarity(reading.structured!.strength)) return false;
      return !entry.appliesTo.length || entry.appliesTo.includes("all") || entry.appliesTo.some((task) => reading.appliesTo.includes(task));
    });
  }
  if (previousWords) {
    const pointed = entriesPointedAt(previousWords, kept.length ? kept : entries);
    if (pointed.length) kept = pointed;
  }
  return kept;
}

type Settled = { kind: "card"; intent: MemoryCardIntent } | { kind: "line"; reason: string; line: string; usedThisTurn?: string };

/** What a sentence to remember becomes: a card item, or code's sentence (already saved, learning off, nothing to keep). */
export function settleRemember(input: { words: string; language: MemoryLanguage; snapshot: AgentMemorySnapshot; requestId: string; today: string }): Settled {
  const { language, snapshot } = input;
  const kept = rememberedWordsOf(input.words);
  const { next, previous } = replacementOf(kept);
  const words = rememberedWordsOf(next).replace(/^(?:改成|改为|换成|变成|switch to|change (?:it |that )?to)\s*/iu, "").trim();
  if (!words) return { kind: "line", line: MEMORY_WORDS.nothingToRemember(language, input.words.replace(/[。.!！]+$/u, "")), reason: "memory_nothing_to_keep" };
  const reading = readMemoryWords(words);
  const existing = entriesItChanges(reading, previous, snapshot.entries);
  if (existing.length > 1) return { kind: "line", line: MEMORY_WORDS.whichOne(language, "change", existing), reason: "memory_several_match" };
  if (existing.length === 1) {
    const entry = existing[0];
    // The same entry after the change: its task stays unless the words name another; pure time words are written from the values.
    const structured = reading.structured ? { ...reading.structured } : entry.structured;
    const onlyTime = Boolean(reading.structured && (reading.structured.dayPart || reading.structured.preferredDays?.length)) && (reading.composable || !topicWordsOf(words));
    const content = onlyTime && entry.appliesTo.includes("event.recommend") && structured ? composeEventTimeContent(structured, language) : reading.composable && structured ? composeEventTimeContent(structured, language) : words;
    const same = sameJson(structured, entry.structured ?? timeOfEntry(entry)) && (sameJson(reading.structured, null) ? content === entry.content : true);
    if (same) return { kind: "line", line: MEMORY_WORDS.alreadySaved(language, entry), reason: "memory_already_saved" };
    return { intent: { capability: MEMORY_UPDATE, expectedRevision: entry.revision, set: { content, structured }, shown: valuesOf(entry), targetId: entry.memoryId }, kind: "card" };
  }
  const content = reading.composable && reading.structured ? composeEventTimeContent(reading.structured, language) : words;
  const twin = snapshot.entries.find((entry) => entry.content === content || (reading.structured && sameJson(entry.structured, reading.structured) && sameJson(entry.appliesTo, reading.appliesTo)));
  if (twin) return { kind: "line", line: MEMORY_WORDS.alreadySaved(language, twin), reason: "memory_already_saved" };
  // A new entry is kept only with 「从对话里记住新的」 on; off: this turn only, and how to keep it (设计稿 §6).
  if (!snapshot.settings.allowConversationLearning) return { kind: "line", line: MEMORY_WORDS.learningOff(language, content), reason: "memory_learning_off", usedThisTurn: words };
  // The message a deleted entry was made from never proposes it again (the same request handled once more).
  if (isForgottenSource(snapshot.marks, memorySourceRef(input.requestId))) return { kind: "line", line: MEMORY_WORDS.nothingToForget(language, snapshot.entries.length > 0), reason: "memory_source_forgotten" };
  return { intent: { capability: MEMORY_CREATE, set: { appliesTo: reading.appliesTo, category: reading.category, content, structured: reading.structured }, sourceMessageRef: memorySourceRef(input.requestId) }, kind: "card" };
}

/** What an ask to forget becomes: a card that names the entry, or code's sentence. */
export function settleForget(input: { words: string; language: MemoryLanguage; snapshot: AgentMemorySnapshot }): Settled {
  const { language, snapshot } = input;
  const pointed = entriesPointedAt(input.words, snapshot.entries);
  if (!pointed.length) return { kind: "line", line: MEMORY_WORDS.nothingToForget(language, snapshot.entries.length > 0), reason: "memory_not_found" };
  if (pointed.length > 1) return { kind: "line", line: MEMORY_WORDS.whichOne(language, "forget", pointed), reason: "memory_several_match" };
  const entry = pointed[0];
  return { intent: { capability: MEMORY_DELETE, expectedRevision: entry.revision, shown: valuesOf(entry), targetId: entry.memoryId }, kind: "card" };
}

const writesOf = (part: Pick<GraphPart, "capabilities">) => part.capabilities.filter((capability) => capabilityKind(capability) === "write");
const isMemoryWrite = (capability: Capability) => capability.startsWith("memory.");

/** The words are an ask about saved memory that code settles (no other change is asked for in the same part). */
export function isMemoryAsk(words: string, capabilities: readonly Capability[]): boolean {
  const otherWrites = capabilities.some((capability) => capabilityKind(capability) === "write" && !isMemoryWrite(capability));
  return !otherWrites && memoryAskOf(words, capabilities.some(isMemoryWrite)) !== null;
}

function answerByCode(scope: NodeScope, part: GraphPart, text: string, cites: string[] = []): void {
  scope.run.answers.set(part.localId, text);
  scope.run.steps.delete(part.localId);
  part.route = "read";
  part.verdict = "accept";
  part.status = "answered";
  part.reason = null;
  part.waitReason = null;
  part.step = null;
  part.reading = null;
  // A matter of its own: it does not answer a question left open earlier in the conversation.
  part.continues = null;
  part.reads = cites.map((ref) => ({ ref, version: "" }));
  part.cites = cites;
  part.gaps = [];
}

function settleWrite(scope: NodeScope, part: GraphPart, settled: Settled, capability: Capability): void {
  const { run } = scope;
  run.steps.delete(part.localId);
  part.route = "propose_write";
  part.verdict = "accept";
  part.waitReason = null;
  part.step = null;
  part.reading = null;
  part.continues = null;
  part.capabilities = [capability];
  if (settled.kind === "line") {
    part.status = "unfinished";
    part.reason = settled.reason;
    run.writeLines.set(part.localId, settled.line);
    return;
  }
  part.capabilities = [settled.intent.capability as Capability];
  // A card of this request exists already (the request is handled again): it is shown as it is.
  if (run.cardPrepared) {
    part.status = "awaiting_confirmation";
    part.reason = null;
    return;
  }
  run.presetIntents.set(part.localId, [{ ...(settled.intent as unknown as CardOperationIntent), localId: `m-${part.localId}`, partId: part.localId }]);
  part.write = { intents: [], picks: {} };
  part.status = "unfinished";
  part.reason = "proposing";
}

/** The answer to "为什么把第一场排在最前面": what the conversation's last ranking really used, read again now. */
async function explainOrder(scope: NodeScope, state: AgentGraphState, part: GraphPart, ranking: LastRanking): Promise<boolean> {
  const { deps, input, run } = scope;
  const language = state.language as MemoryLanguage;
  const timeZone = state.timeZone || "Asia/Tokyo";
  const first = ranking.listed[0];
  if (!first || !deps.records) return false;
  const at = first.indexOf(":");
  const kind = first.slice(0, at);
  if (kind !== "event") return false;
  const view = (await deps.records.reader.read("event", deps.records.scope(input.actorId), { id: first.slice(at + 1) })).items[0];
  if (!view) return false;
  const title = String(view.fields.title ?? "");
  const startsAt = typeof view.fields.startsAt === "string" ? view.fields.startsAt : null;
  const entries = new Map((run.memory.snapshot?.entries ?? []).map((entry) => [entry.memoryId, entry]));
  const used: { content: string; meets: string | null }[] = [];
  let changedSince = false;
  for (const ref of ranking.memories) {
    const entry = entries.get(ref.memoryId);
    // Only an entry that is still what it was then is quoted.
    if (!entry || entry.revision !== ref.revision) {
      changedSince = true;
      continue;
    }
    const preference = timePreferenceOfEntry(entry);
    const fits = preference && startsAt && !preference.exclude && meets(preference, startsAt, timeZone) && entry.structured ? timeWordsOf(entry.structured, language) : preference && startsAt && !preference.exclude && meets(preference, startsAt, timeZone) ? say.timeWords(preference, language) : null;
    used.push({ content: entry.content, meets: fits });
    run.memory.used.set(entry.memoryId, entry.revision);
  }
  const quoted = ranking.memories.filter((ref) => entries.get(ref.memoryId)?.revision === ref.revision);
  emitTrace({ entries: quoted, memories: quoted.map((ref) => ref.memoryId), partId: part.localId, scope: "explain_order", type: "memory.recall" });
  const text = MEMORY_WORDS.whyFirst(language, { changedSince, tieBreak: !ranking.topic && ranking.listed.length > 1, title, turnBasis: ranking.turnBasis, used, when: startsAt ? say.whenWordsOf(startsAt, timeZone, language) : null });
  answerByCode(scope, part, text, [view.ref]);
  run.readNames.set(view.id, { name: title, type: "event" });
  run.sourceRefs = [...new Set([...run.sourceRefs, view.ref])];
  emitTrace({ first: view.ref, partId: part.localId, type: "memory.order_explained" });
  return true;
}

/**
 * route (first pass): the parts of this message that are about memory, settled by code. Returns nothing; the parts
 * are changed in place (their route, status and capabilities), the run gets code's sentences and the card items.
 */
export async function memoryRouteStep(scope: NodeScope, state: AgentGraphState, parts: GraphPart[]): Promise<void> {
  const { input, run } = scope;
  const turn = run.memory;
  const snapshot = turn.snapshot;
  if (!snapshot) return;
  const language = state.language as MemoryLanguage;
  const now = state.asOf || scope.deps.now();
  const timeZone = state.timeZone || "Asia/Tokyo";
  const session = run.sessionState;
  const settledIds = new Set<string>();
  for (const part of parts) {
    const quote = input.message.slice(part.quote[0], part.quote[1]);
    const tagged = part.capabilities.some(isMemoryWrite);
    const otherWrites = writesOf(part).some((capability) => !isMemoryWrite(capability));
    const ask = memoryAskOf(quote, tagged);
    // A statement, a negation or a hypothesis is not an ask to change memory (route already answers it as such).
    const refused = part.plan.negation || part.plan.hypothesis;
    if (!ask && asksWhyOrder(quote) && session?.lastRanking && !writesOf(part).length) {
      try {
        if (await explainOrder(scope, state, part, session.lastRanking)) settledIds.add(part.localId);
      } catch (error) {
        emitTrace({ error: error instanceof Error ? error.message : String(error), partId: part.localId, type: "read.error", where: "memory.explain_order" });
      }
      continue;
    }
    if (ask === "list" && !otherWrites) {
      const today = recallDay(now, timeZone);
      const entries = snapshot.entries.map((entry) => ({ ...entry, expired: Boolean((entry.validUntil && today > entry.validUntil) || (entry.validFrom && today < entry.validFrom)) }));
      answerByCode(scope, part, MEMORY_WORDS.list(language, entries, snapshot.settings));
      part.capabilities = part.capabilities.filter((capability) => !isMemoryWrite(capability));
      settledIds.add(part.localId);
      emitTrace({ count: entries.length, partId: part.localId, type: "memory.listed" });
      continue;
    }
    if (ask === "this_time") {
      // "这次……" never changes an entry: the memory tags go, the words are this turn's own basis.
      if (tagged) part.capabilities = part.capabilities.filter((capability) => !isMemoryWrite(capability));
      const last = session?.lastRanking;
      const namesRecord = part.refs.some((ref) => ref.recordId);
      if (last && last.domain === "event" && timePreferenceIn(quote, "turn") && !otherWrites && !namesRecord) {
        const day = resolveSaidDate(quote, now, timeZone)?.day;
        part.capabilities = ["event.read", "fn.rank"];
        part.plan = { ...part.plan, clarity: "clear", dataSources: ["orbit_records"], deliverable: "ranked_list", rank: { ...(last.count ? { count: last.count } : {}) }, readFilter: day ? { from: day, to: day } : { ...(last.from ? { from: last.from } : {}), ...(last.to ? { to: last.to } : {}) }, readings: [] };
        run.steps.delete(part.localId);
        part.route = "read";
        part.verdict = "accept";
        part.status = "answered";
        part.reason = null;
        part.waitReason = null;
        part.step = null;
        part.reading = null;
        part.continues = null;
        settledIds.add(part.localId);
      } else if (tagged && !part.capabilities.length) {
        part.route = "answer";
        part.status = "answered";
        part.reason = null;
        part.waitReason = null;
      }
      emitTrace({ partId: part.localId, reranks: settledIds.has(part.localId), type: "memory.this_time" });
      continue;
    }
    if (refused || otherWrites) continue;
    if (ask === "forget") {
      const settled = settleForget({ language, snapshot, words: quote });
      settleWrite(scope, part, settled, "memory.delete");
      settledIds.add(part.localId);
      emitTrace({ kind: settled.kind, partId: part.localId, ...(settled.kind === "line" ? { reason: settled.reason } : { target: settled.intent.capability === MEMORY_DELETE ? settled.intent.targetId : null }), type: "memory.forget" });
      continue;
    }
    if (ask === "remember") {
      const settled = settleRemember({ language, requestId: input.requestId, snapshot, today: recallDay(now, timeZone), words: quote });
      settleWrite(scope, part, settled, "memory.create");
      settledIds.add(part.localId);
      // The words count for this turn's own picks, saved or not.
      const words = rememberedWordsOf(replacementOf(rememberedWordsOf(quote)).next);
      if (words) turn.turnWords.push(words);
      emitTrace({ kind: settled.kind, learning: snapshot.settings.allowConversationLearning, partId: part.localId, ...(settled.kind === "line" ? { reason: settled.reason } : { capability: settled.intent.capability }), type: "memory.remember" });
      continue;
    }
    if (tagged) {
      // Tagged as a memory change with no words that ask for one: not a change (answered as what else it is).
      part.capabilities = part.capabilities.filter((capability) => !isMemoryWrite(capability));
      if (!writesOf(part).length && part.route === "propose_write") {
        const reads = part.capabilities.length > 0;
        part.route = reads ? "read" : "answer";
        part.status = "answered";
        part.reason = null;
      }
      emitTrace({ partId: part.localId, type: "memory.tag_dropped" });
    }
  }
  if (!settledIds.size) return;
  // A part settled here is no prerequisite to wait for: its words are used in this very turn.
  for (const part of parts) {
    if (!part.dependsOn.some((id) => settledIds.has(id))) continue;
    part.dependsOn = part.dependsOn.filter((id) => !settledIds.has(id));
  }
}

/** deliver: what the session keeps of this turn's use of memory (ids and revisions only). */
export function memoryOfSession(previous: Pick<AgentSessionState, "memoryUses" | "lastRanking"> | null, turn: TurnMemory, requestId: string): Pick<AgentSessionState, "memoryUses" | "lastRanking" | "memoryVersion"> {
  const all = [...turn.used.entries()].map(([memoryId, revision]) => ({ memoryId, revision }));
  // An answer shaped by an entry — a ranking's, or a rule every answer follows — is stale once that entry changes.
  const uses = rememberMemoryUse(previous?.memoryUses, { memories: all, requestId });
  return { lastRanking: turn.ranking ?? previous?.lastRanking ?? undefined, memoryUses: uses.length ? uses : undefined, memoryVersion: turn.snapshot?.version };
}
