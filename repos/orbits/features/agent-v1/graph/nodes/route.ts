/**
 * route (code): verdict, route and wait reason per part (route/decide.ts), the statuses this sprint
 * can reach, and dependencies settled. The first layer's handoff is traced here.
 *
 * AG04: on the first pass each part is first attributed to an open item it continues (§3.7,
 * clarify/attribution.ts) — a part answering a question inherits that question, so it is not asked
 * again — and an unclear part's next step comes from §3.11 (clarify/next-step.ts). After a pause only
 * the parts the resume touched are routed again, from the plan kept in the checkpoint; nothing else
 * changes and no model is called.
 */
import { CHECKIN as CHECKIN_WORDS, UNSUPPORTED_REPEAT } from "../../propose/events-resolve";
import { importTableOf } from "../../domains/contact/import-preview";
import { attributeMessage } from "../../clarify/attribution";
import { recordKindOf } from "../../clarify/default-readings";
import { resolveSaidDate } from "../../propose/dates";
import { emitTrace } from "../../observability/trace";
import { decideRoute, isPronounClue, NOT_YET_ROUTES, settleDependencies, statusForRoute, type RouteInput } from "../../route/decide";
import type { ContinueKind } from "../../understand/schema";
import type { GraphNode, NodeScope } from "../deps";
import type { AgentGraphState, GraphPart } from "../state";
import { clueWords, needsDirections, objectOf, pageKindOf } from "./clarify";
import { clueSearchWords } from "./resolve";
import { needsIntentReview, readsAsQuestion, readsAsWriteRequest, reviewWriteIntent } from "../../judgment/intent-review";
import { CLARIFY_WORDS } from "../../clarify/copy";
import { nextNoteGoalIn, organizeMeansSummary, updatesInteractionsFromMemo } from "./functions";
import { keepsLookingIn, pushSaidIn, RECURRING_ASK, recurrenceSaidIn, RULE_NOUN, RULE_QUALIFIER, stateVerbSaidIn } from "../../rule/parse";
import { reminderSaidIn } from "../../rule/reminder";
import { contactKindOf } from "../../propose/resolve";
import { optionPickedIn } from "../../propose/asked";
import { capabilityKind, type Capability } from "../../route/capabilities";
import type { NextStep } from "../../clarify/next-step";
import { isMemoryAsk, memoryRouteStep } from "../../domains/memory/turn";
import { nothingToRepeatLine, repeatedWords, repeatOrAdjust } from "../../understand/repeat-list";

/** The words of a day said in the message ("周五", "金曜日", "Friday", "11月20日"), for an entry's label. */
const DAY_WORDS = /(下(?:个)?(?:周|星期|礼拜)[一二三四五六日天]|(?:周|星期|礼拜)[一二三四五六日天]|明天|后天|\d{1,2}\s*月\s*\d{1,2}\s*日|来週の?[月火水木金土日]曜日?|[月火水木金土日]曜日|明日|明後日|(?:next\s+)?(?:mon|tues|wednes|thurs|fri|satur|sun)day|tomorrow)/iu;

/**
 * AG08 (§3.11 "可以附一个入口"): the entry offered after the write-intent review turned a write tag into a statement,
 * chosen by code from the words — moving the named record to the day it names, or logging the contact it reports.
 */
function reviewedEntry(part: GraphPart, quote: string, clue: (ref: GraphPart["refs"][number]) => string, asOf: string, timeZone: string): { entry: Capability; reviewed: NonNullable<Extract<NextStep, { kind: "respond" }>["reviewed"]> } | null {
  const record = part.refs.find((ref) => ref.entity === "todo" || ref.entity === "schedule");
  const day = quote.match(DAY_WORDS)?.[1];
  if (record && day && reschedulesTo(quote, asOf, timeZone)) {
    const words = clueSearchWords(clue(record));
    return { entry: record.entity === "schedule" ? "schedule.update" : "todo.update", reviewed: { date: day.replace(/\s+/gu, ""), kind: "reschedule", ...(words ? { object: words } : {}) } };
  }
  if (part.refs.some((ref) => ref.entity === "contact") && contactKindOf(quote).channel) return { entry: "memo.create", reviewed: { kind: "interaction" } };
  return null;
}

/** AG10 run-02: words naming a to-do, and words naming a note (a statement about either gets the matching entry). */
const TODO_WORD = /(待办|代办|(?:设|加|建)个?提醒|ToDo|TODO|タスク|リマインダー|\bto-?dos?\b|\btasks?\b|\ba reminder\b)/iu;
const RECORD_NOTE_WORD = /(笔记|メモ|\bnotes?\b|往来|来电|电话|電話|\bcall(?:ed)?\b)/iu;

/** AG09 run-02: words that ask to look on the web (zh, ja, en). */
const EXPLICIT_WEB = /(上网|联网|网上|网络上|搜一下|搜搜|搜索|官网|公开资料|公开职务|公开信息|ネット|ウェブ|検索|公式サイト|公開情報|online|on the web|the internet|web search|search the web|google|look (?:it |them |him |her )?up)/iu;

export function routeInputOf(part: GraphPart, message?: string): RouteInput {
  return {
    // AG13 repair round 8 (AE-SCL-016 run-08): the part's own words, so AG12's rule "a link handed over is read" sees the
    // link in the graph too (it only did in unit tests).
    ...(message !== undefined ? { sourceQuote: message.slice(part.quote[0], part.quote[1]) } : {}),
    clarity: part.plan.clarity,
    ...(part.continues ? { continues: { kind: part.continues.kind as ContinueKind, ref: part.continues.ref } } : {}),
    dataOwner: part.plan.dataOwner,
    dataSources: part.plan.dataSources,
    hypothesis: part.plan.hypothesis,
    intentBasis: part.plan.intentBasis,
    negation: part.plan.negation,
    objectClues: part.refs.map((ref) => ({ entity: ref.entity })),
    persistence: part.plan.persistence,
    readings: part.plan.readings,
    requiredCapabilities: part.capabilities,
  };
}

/** A verb that moves something to another day (zh, ja, en). */
const CHANGE_TO = /(改到|改成|挪到|推到|延到|移到|调到|提前到|往后推|改期|に変更|へ変更|変更して|にずらし|ずらして|に移して|に延期|move(?:d)?\b[^.!?]{0,20}\bto\b|reschedule|push(?:ed)?\b[^.!?]{0,20}\bto\b|change\b[^.!?]{0,20}\bto\b)/iu;

/** AG07 run-03: the words move something to a new day they name ("改到周五", "金曜に変更", "move it to Friday"). */
export function reschedulesTo(words: string, asOf: string, timeZone: string): boolean {
  return CHANGE_TO.test(words) && resolveSaidDate(words, asOf, timeZone) !== null;
}

/**
 * AG15: whether a part asks for a scheduled task, by code's reading of its words (never the model's say-so alone):
 * - it continues an open question about a task ("按什么来挑");
 * - the first layer named a rule capability and the words hold a recurrence, or name a task with pause / resume / delete;
 * - the words hold a recurrence and ask Orbit to pick, tell or check something each time — and are not a calendar entry
 *   ("每周一十点的周会加进日程" is a schedule item, AG13).
 */
export function isRuleRequest(part: Pick<GraphPart, "capabilities" | "continues">, quote: string, openItems: readonly { ref: string; rule?: unknown }[]): boolean {
  if (part.continues && openItems.some((item) => item.ref === part.continues!.ref && item.rule)) return true;
  const tagged = part.capabilities.some((capability) => capability.startsWith("rule."));
  const recurring = recurrenceSaidIn(quote) !== null;
  // A repeating calendar entry ("毎週月曜の定例を11時に変更して", AG13) is a schedule item even when the first layer also
  // named a rule capability: it stays with the schedule writes.
  const calendar = part.capabilities.some((capability) => capability.startsWith("schedule.")) || CALENDAR_WORDS.test(quote);
  if (tagged && !calendar && (recurring || (RULE_NOUN.test(quote) && stateVerbSaidIn(quote) !== null))) return true;
  // AG21a (decision 2): "…再一直帮我留意新的" tagged as a task — keeping looking is a scheduled task (AG15's card, or its
  // question for when to run); keeping looking only on finding nothing is not (AG03's bounded alternative).
  if (tagged && !calendar && keepsLookingIn(quote)) return true;
  if (tagged && RULE_NOUN.test(quote) && stateVerbSaidIn(quote) !== null) return true;
  // AG16: turning a task's reminder on or off ("这个定时任务以后在手机上提醒我", "turn off notifications for that task") is a
  // change of the task — it gets a card like any other change. Read by code: the words ask for or call off a reminder,
  // and speak of a task — a scheduled task named as such, or (when the first layer named a rule capability) "任务 / task".
  // A sentence that only says how a task made in the same message should tell the user ("不用推送，先跑到 11 月底") names
  // no task: it stays that task's qualifier (qualifiesRuleOf).
  if (!calendar && (pushSaidIn(quote) ?? reminderSaidIn(quote)) !== null && (RULE_NOUN.test(quote) || (tagged && /(任务|タスク|\btasks?\b)/iu.test(quote)))) return true;
  if (!recurring || calendar) return false;
  return RECURRING_ASK.test(quote) && part.capabilities.some((capability) => capability === "event.read" || capability === "contact.read" || capability === "todo.read" || capability === "fn.rank" || capability.startsWith("rule."));
}

const CALENDAR_WORDS = /(日程|日历|行程|カレンダー|スケジュールに|\bschedule\b|\bcalendar\b)/iu;

/**
 * AG15: a sentence that only qualifies the scheduled task another part of the same message asks for — how to be told,
 * until when ("结果放站内收件箱就行，不用推送，先跑到 11 月底。"). It is not a request of its own: the task's card takes its
 * words (graph/nodes/rule.ts reads them from the whole message), so it is neither proposed nor answered separately.
 */
export function qualifiesRuleOf(part: Pick<GraphPart, "capabilities" | "continues" | "localId" | "refs">, quote: string, others: readonly { part: Pick<GraphPart, "capabilities" | "continues" | "localId">; quote: string }[], openItems: readonly { ref: string; rule?: unknown }[]): boolean {
  if (isRuleRequest(part, quote, openItems) || !RULE_QUALIFIER.test(quote) || part.refs.some((ref) => ref.recordId)) return false;
  if (part.capabilities.some((capability) => capabilityKind(capability) === "write" && !capability.startsWith("rule."))) return false;
  return others.some((other) => other.part.localId !== part.localId && isRuleRequest(other.part, other.quote, openItems));
}

type LookupKind = "todo" | "schedule" | "memo" | "privateEvent";

/**
 * AG21b (R42): the readings of a write that differ only by the kind of record they change (the same verbs on a to-do, a
 * schedule item, a private event or a note), one kind each; null when they differ otherwise.
 */
export function readingKindsOf(readings: readonly { capabilities: readonly Capability[] }[]): { kind: LookupKind; capabilities: Capability[] }[] | null {
  if (readings.length < 2) return null;
  const out: { kind: LookupKind; capabilities: Capability[]; verbs: string }[] = [];
  for (const reading of readings) {
    const writes = reading.capabilities.filter((capability) => capabilityKind(capability) === "write");
    const heads = new Set(writes.map((capability) => capability.slice(0, capability.indexOf("."))));
    if (!writes.length || heads.size !== 1) return null;
    const head = [...heads][0];
    if (head !== "todo" && head !== "schedule" && head !== "memo" && head !== "privateEvent") return null;
    out.push({ capabilities: [...reading.capabilities], kind: head, verbs: writes.map((capability) => capability.slice(capability.indexOf(".") + 1)).sort().join(",") });
  }
  if (new Set(out.map((item) => item.kind)).size !== out.length || new Set(out.map((item) => item.verbs)).size !== 1) return null;
  return out.map(({ capabilities, kind }) => ({ capabilities, kind }));
}

/** AG21b (R42): whether the account holds a record of this kind with these words. A read that fails counts as holding one. */
async function kindHolds(records: NonNullable<NodeScope["deps"]["records"]>, actorId: string, kind: LookupKind, words: readonly string[]): Promise<boolean> {
  const scope = records.scope(actorId);
  try {
    if (kind === "privateEvent") {
      if (!records.privateEvents) return true;
      const squash = (text: string) => text.toLowerCase().replace(/[\s「」"“”]/gu, "");
      const events = await records.privateEvents.list(scope.accountId);
      return events.some((event) => words.some((word) => squash(event.title).includes(squash(word)) || squash(word).includes(squash(event.title))));
    }
    for (const text of words) if ((await records.reader.read(kind, scope, { limit: 3, text })).items.length) return true;
    return false;
  } catch {
    return true;
  }
}

export function routeNode(scope: NodeScope): GraphNode {
  const { deps, input, run } = scope;
  return async (state: AgentGraphState) => {
    const resume = state.touched !== null;
    const understood = run.understood;
    if (!resume && !understood) return {};
    const context = run.context;
    run.steps = new Map();
    const attribution = !resume && context
      ? attributeMessage(state.parts.map((part) => ({ capabilities: part.capabilities, clarity: part.plan.clarity, continues: part.continues, localId: part.localId })), context.openItems)
      : null;
    let acceptedAlternativeRef: string | null = state.acceptedAlternativeRef;
    const topicKind = context?.shownList.length ? recordKindOf(context.shownList[0].type) : null;
    // run-02 (§3.10): a pronoun is resolved from the conversation within the 60-minute window. With nothing
    // to resolve it from — idle, or no conversation and no state — and nothing else named in this message,
    // code does not guess. A resumed part was answered by a click, so its object is no longer missing.
    // Open items are context too: a part answering one points at that matter's object.
    const nothingToResolveFrom = !resume && Boolean(context) && context!.openItems.length === 0 && (context!.idle || (context!.messages.length === 0 && context!.shownList.length === 0 && context!.lastMentioned.length === 0));
    const clueText = (ref: GraphPart["refs"][number]) => clueWords(input.message, ref) ?? "";
    // AG09 stability run (AE-SCL-016): a public name to look up or a web page the user gave names something too — "the
    // latest quote they gave me" after "Here is Lumen ATS's pricing page: …" has its "they" in the same message.
    const namesPublicObject = state.parts.some((part) => Boolean(part.plan.webTarget?.quote) || /https?:\/\//u.test(input.message.slice(part.quote[0], part.quote[1])));
    const namedInMessage = namesPublicObject || (context?.references.length ?? 0) > 0 || state.parts.some((part) => part.refs.some((ref) => ref.recordId || (clueText(ref) && !isPronounClue(clueText(ref)))));
    // AG12 stability run (AE-CON-010): "import these" with a table pasted in the same message — the pronoun is the table.
    const pastedTable = importTableOf(input.message) !== null;
    const unboundPronoun = (part: GraphPart) => nothingToResolveFrom && !namedInMessage && !(pastedTable && part.capabilities.includes("contact.import")) && !part.refs.some((ref) => ref.recordId) && part.refs.some((ref) => isPronounClue(clueText(ref)));
    // AG07 gate (AE-XL-005): the first layer called "把报价待办改到周五" missing one item although the to-do is named in
    // its own words and the new day is said; code then looks it up instead of asking without candidates.
    const namedObjectWithDate = (part: GraphPart) => {
      const named = part.refs.some((ref) => ref.entity !== "contact" && !ref.recordId && Boolean(clueSearchWords(clueText(ref))) && !isPronounClue(clueText(ref)));
      return named && resolveSaidDate(input.message.slice(part.quote[0], part.quote[1]), state.asOf || deps.now(), state.timeZone || "Asia/Tokyo") !== null;
    };
    // AG08 (§3.11, §3.8): a write tag on words that read like a statement, a question or a hypothesis, or with no
    // registered write verb, is checked once by the judgment model. Anything but a sure "yes" makes it a statement.
    const reviewed = new Set<string>();
    const ruleQuotes = state.parts.map((part) => ({ part, quote: input.message.slice(part.quote[0], part.quote[1]) }));
    // AG21b (R29): the turn continues a write in progress — an open question of a write, or the last request asked for one.
    const lastUserText = context && !context.idle ? [...context.messages].reverse().find((message) => message.role === "user")?.text ?? "" : "";
    const writeInProgress = Boolean(context && !context.idle && (context.openItems.some((item) => item.writes) || (lastUserText && readsAsWriteRequest(lastUserText))));
    if (!resume) {
      for (const original of state.parts) {
        const found = attribution?.get(original.localId);
        const quote = input.message.slice(original.quote[0], original.quote[1]);
        const followsWrite = original.dependsOn.some((id) => state.parts.find((other) => other.localId === id)?.capabilities.some((capability) => capabilityKind(capability) === "write"));
        const withWrite = writeInProgress || state.parts.some((other) => other.localId !== original.localId && other.capabilities.some((capability) => capabilityKind(capability) === "write"));
        const review = { capabilities: original.capabilities, clarity: original.plan.clarity, continues: Boolean(found && found.kind !== "new"), followsWrite, hypothesis: original.plan.hypothesis, intentBasis: original.plan.intentBasis, negation: original.plan.negation, quote, withWrite };
        // AG14: an ask about saved memory is read from the words by code (memoryRouteStep); it needs no review.
        if (isMemoryAsk(quote, original.capabilities)) continue;
        // AG15: a recurrence with a pick or tell verb, or a named task with pause / resume / delete, is an explicit
        // request by code's own reading (isRuleRequest); the judgment is not asked whether it is one.
        if (isRuleRequest(original, quote, context?.openItems ?? []) || qualifiesRuleOf(original, quote, ruleQuotes, context?.openItems ?? [])) continue;
        if (!needsIntentReview(review)) continue;
        const result = await reviewWriteIntent(deps.judgment, run.judgment, { language: state.language, message: input.message, quote, requestId: input.requestId });
        emitTrace({ explicit: result.explicit, partId: original.localId, type: "route.intent_review", verdict: result.verdict ? { answer: result.verdict.answer, confidence: result.verdict.confidence, fallback: result.verdict.fallback, reason: result.verdict.reason } : null });
        if (!result.explicit) reviewed.add(original.localId);
      }
    }
    // AG21b (R42): a write read several ways that differ only by the kind of record ("把样书那条改到周四": a to-do or a
    // schedule item) is looked up in each kind first: exactly one kind holding a record of those words decides (still a
    // card); two or more, or none, are asked as before.
    const narrowed = new Map<string, Capability[]>();
    if (!resume && deps.records) {
      for (const original of state.parts) {
        if (original.plan.clarity !== "multiple_readings" || reviewed.has(original.localId)) continue;
        const words = original.refs.filter((ref) => ref.entity !== "contact" && !ref.recordId).map((ref) => clueSearchWords(clueText(ref))).filter((text): text is string => Boolean(text));
        const kinds = readingKindsOf(original.plan.readings ?? []);
        if (!words.length || !kinds) continue;
        const holding = [];
        for (const item of kinds) if (await kindHolds(deps.records, input.actorId, item.kind, words)) holding.push(item);
        emitTrace({ holding: holding.map((item) => item.kind), kinds: kinds.map((item) => item.kind), partId: original.localId, type: "route.reading_kinds_looked_up" });
        if (holding.length === 1) narrowed.set(original.localId, holding[0].capabilities);
      }
    }
    let parts: GraphPart[] = state.parts.map((original) => {
      if (resume && !state.touched!.includes(original.localId)) return original;
      const part: GraphPart = { ...original };
      if (narrowed.has(part.localId)) {
        part.capabilities = [...narrowed.get(part.localId)!];
        part.plan = { ...part.plan, clarity: "clear", readings: [] };
      }
      // AG09 stability run (AE-SCL-016): with a public object named in this message (a name to look up, a web page), a
      // contact clue that is only a pronoun ("they") stands for that company or person, not for one of the user's contacts.
      if (!resume && namesPublicObject) {
        const kept = part.refs.filter((ref) => !(ref.entity === "contact" && !ref.recordId && isPronounClue(clueText(ref))));
        if (kept.length !== part.refs.length) {
          emitTrace({ dropped: part.refs.length - kept.length, partId: part.localId, reason: "a pronoun for the public object this message names", type: "route.pronoun_for_public_object" });
          part.refs = kept;
        }
      }
      if (attribution) {
        const found = attribution.get(part.localId);
        if (found && found.kind !== "new") {
          part.continues = { kind: found.kind, ref: found.item.ref };
          if (found.kind === "clarification") part.asked = Math.max(part.asked, 1);
          emitTrace({ fallback: found.fallback, item: { kind: found.item.kind, ref: found.item.ref, requestId: found.item.requestId }, partId: part.localId, type: "attribution.continues" });
        } else {
          if (part.continues) emitTrace({ claimed: part.continues, partId: part.localId, reason: "not an open item of that kind (or already taken)", type: "attribution.rejected" });
          part.continues = null;
        }
      }
      const openItem = part.continues ? context?.openItems.find((item) => item.ref === part.continues!.ref) ?? null : null;
      const accepted = part.continues?.kind === "alternative"
        ? (part.plan.acceptedLeadsTo ? { leadsTo: part.plan.acceptedLeadsTo } : openItem?.kind === "alternative" ? openItem : null)
        : null;
      // AG07 run-03 (AE-AMB-007): "把那个改到周五" — a change verb with a new date and no named object is a reschedule
      // of an unknown item (also when a later message only answers the question about it).
      const namesNothing = !part.refs.some((ref) => ref.recordId || (clueText(ref) && !isPronounClue(clueText(ref))));
      const reschedule = namesNothing && reschedulesTo(openItem?.quote ?? input.message.slice(part.quote[0], part.quote[1]), state.asOf || deps.now(), state.timeZone || "Asia/Tokyo");
      // AG08: the review found no explicit request: the part is a statement (no card, one entry).
      if (reviewed.has(part.localId)) part.plan = { ...part.plan, clarity: "statement" };
      // AG10 (AE-FN-008): "@笔记 帮我整理一下" with no product named is a summary of that memo, not readings to choose from.
      // AG13 repair round 8 (AE-FN-008, run-08): also when the first layer added an extraction the words do not ask for
      // ("帮我整理一下" tagged fn.extractFollowUps); organizeMeansSummary already refuses words that ask for one.
      // AG20b (TRIAGE R17, §3.5): "用这篇笔记更新我和小林的往来" on a picked note is the extraction of its interactions, prepared
      // as a change (the card still needs the click) — not three readings to choose from.
      const attachedIds = new Set(run.references.filter((reference) => reference.accessible !== false).map((reference) => reference.id));
      if (!resume && updatesInteractionsFromMemo(part, input.message, attachedIds) && (part.plan.clarity !== "clear" || !part.capabilities.includes("fn.extractInteractions"))) {
        part.capabilities = ["memo.read", "fn.extractInteractions"];
        part.plan = { ...part.plan, clarity: "clear", dataSources: ["orbit_records"], deliverable: "change", readings: [] };
        emitTrace({ partId: part.localId, type: "route.memo_updates_interactions" });
      }
      // AG20b (TRIAGE R17, §3.5 last row): a goal stated for the next note ("下一篇笔记我只要我答应的事") is kept for the next
      // "整理一下" (deliver keeps it in the session) and acknowledged in code's words — not a standing rule, nothing written.
      const noteGoal = !resume ? nextNoteGoalIn(input.message.slice(part.quote[0], part.quote[1])) : null;
      if (noteGoal && !part.refs.some((ref) => ref.recordId)) {
        part.capabilities = [];
        part.plan = { ...part.plan, clarity: "clear", dataSources: [], deliverable: "answer", persistence: "this_turn", readings: [] };
        run.answers.set(part.localId, CLARIFY_WORDS.noteGoalKept(state.language, noteGoal));
        run.codeAnswers.add(part.localId);
        emitTrace({ goal: noteGoal, partId: part.localId, type: "route.note_goal" });
      }
      if (!resume && organizeMeansSummary(part, input.message, new Set(run.references.map((reference) => reference.id))) && (part.plan.clarity !== "clear" || part.capabilities.some((capability) => capabilityKind(capability) === "write" || capability.startsWith("fn.extract")))) {
        part.capabilities = ["memo.read", "fn.summarize"];
        part.plan = { ...part.plan, clarity: "clear", dataSources: ["orbit_records"], deliverable: "summary", readings: [] };
        emitTrace({ partId: part.localId, type: "route.organize_is_summary" });
      }
      // AG21c (R47): "再给我看一次" / "这回把周日的也加上" right after a list re-runs that list request (kind, window, count, its
      // words), read fresh, with the adjustment; with no list request stored it says so and asks what to list.
      const repeat = !resume && !part.continues && !part.refs.some((ref) => ref.recordId || (clueText(ref) && !isPronounClue(clueText(ref)) && !/^(?:那个|这个|它|それ|あれ|it|that|them)$/iu.test(clueText(ref)))) && !part.capabilities.some((capability) => capabilityKind(capability) === "write") ? repeatOrAdjust(input.message.slice(part.quote[0], part.quote[1])) : null;
      if (repeat) {
        const last = context && !context.idle ? run.sessionState?.lastList ?? null : null;
        if (last) {
          part.capabilities = [`${last.domain}.read`, "fn.rank"] as GraphPart["capabilities"];
          part.refs = [];
          part.plan = { ...part.plan, clarity: "clear", dataSources: ["orbit_records"], deliverable: last.deliverable as GraphPart["plan"]["deliverable"], rank: { ...(last.count ? { count: last.count } : {}) }, readFilter: { ...(last.from ? { from: last.from } : {}), ...(last.to ? { to: last.to } : {}) }, readings: [] };
          run.repeatedLists.set(part.localId, { ...last, words: repeatedWords(last, input.message.slice(part.quote[0], part.quote[1]), repeat) });
        } else {
          part.capabilities = [];
          part.plan = { ...part.plan, clarity: "clear", dataSources: [], deliverable: "answer", readings: [] };
          run.answers.set(part.localId, nothingToRepeatLine(state.language));
          run.codeAnswers.add(part.localId);
        }
        emitTrace({ kind: repeat, partId: part.localId, stored: Boolean(last), type: "route.repeats_last_list" });
      }
      const routeOptions = { acceptedAlternative: accepted, asked: part.asked, objectKind: objectOf(scope, part).kind, pageKind: pageKindOf(scope), topicKind, namedObjectWithDate: namedObjectWithDate(part), reschedule, unboundPronoun: unboundPronoun(part) };
      let decision = decideRoute(routeInputOf(part, input.message), routeOptions);
      // AG09 run-02 (AE-CTX-006): a question about one of the user's own contacts (an @ record) is answered from the records;
      // the web is looked up about a contact only when the user asks for it ("上网查", "ネットで", "online").
      const partWords = input.message.slice(part.quote[0], part.quote[1]);
      if (!resume && decision.route === "web_lookup" && part.refs.some((ref) => ref.entity === "contact" && ref.recordId) && !EXPLICIT_WEB.test(partWords)) {
        part.capabilities = [...new Set([...part.capabilities.filter((capability) => capabilityKind(capability) !== "web"), "contact.read" as Capability])];
        part.plan = { ...part.plan, dataSources: ["orbit_records"] };
        decision = decideRoute(routeInputOf(part, input.message), routeOptions);
        emitTrace({ partId: part.localId, reason: "a question about the user's own contact, not asked to look online: read from the records", route: decision.route, type: "route.contact_not_looked_up_online" });
      }
      if (reviewed.has(part.localId) && decision.step?.kind === "respond" && decision.step.entry) {
        const entry = reviewedEntry(part, input.message.slice(part.quote[0], part.quote[1]), clueText, state.asOf || deps.now(), state.timeZone || "Asia/Tokyo");
        if (entry) decision.step = { ...decision.step, entry: entry.entry, reviewed: entry.reviewed };
      }
      // AG10 run-02 (AE-AMB-004): a statement about a to-do ("I should probably add a to-do to chase her") is offered a
      // to-do, not a note about the person.
      if (decision.step?.kind === "respond" && decision.step.entry === "memo.create" && !decision.step.reviewed && TODO_WORD.test(partWords) && !RECORD_NOTE_WORD.test(partWords)) {
        decision.step = { ...decision.step, entry: "todo.create" };
        emitTrace({ partId: part.localId, type: "route.todo_entry" });
      }
      if (unboundPronoun(part)) emitTrace({ partId: part.localId, reason: "a pronoun with nothing to resolve it from (§3.10): the object is missing", type: "route.unbound_reference" });
      // AG09 (PLANNER 排除范围; AE-UND-010 in one part): a change that saves what a web page says is not offered yet — the part
      // reads the page (web_lookup) and code says the save is not available (graph/nodes/probe.ts); no card.
      if (decision.route === "propose_write" && part.capabilities.some((capability) => capabilityKind(capability) === "web")) {
        emitTrace({ partId: part.localId, reason: "a change built on a web page: the page is read, the save is not offered yet", type: "route.web_save_not_offered" });
        decision.route = "web_lookup";
        decision.reason = "public sources (saving them is not offered yet)";
      }
      // AG13 (AE-EVT-001): "建成私人活动，并记上我参加了" — the second sentence's object is what the first creates in this very
      // message; it is not missing. The two go to the second layer together (one card; «我去过» waits for the event).
      const createsFirst = (other: GraphPart | undefined) => Boolean(other && other.capabilities.some((capability) => capabilityKind(capability) === "write" && capability.endsWith(".create")));
      if (!resume && decision.route === "clarify" && decision.waitReason === "object_ambiguous" && part.capabilities.some((capability) => capabilityKind(capability) === "write") && part.dependsOn.some((id) => createsFirst(state.parts.find((other) => other.localId === id)))) {
        emitTrace({ partId: part.localId, reason: "its object is created by the part it depends on, in this message", type: "route.object_created_before" });
        decision = { ...decision, reason: "an explicit request to change a record (its object is created first, in this message)", route: "propose_write", step: undefined, waitReason: null };
      }
      // AG13 (AE-EVT-004): "帮我把签到补上" — the organizer's check-in is never written; code says so, whatever route the words
      // got (the second step's code line, no card).
      if (!resume && CHECKIN_WORDS.test(input.message.slice(part.quote[0], part.quote[1])) && part.capabilities.some((capability) => capability.startsWith("attendance.")) && decision.route !== "propose_write") {
        emitTrace({ partId: part.localId, reason: "a check-in is the organizer's record", type: "route.organizer_record" });
        decision = { ...decision, reason: "a check-in is the organizer's record (code says so)", route: "propose_write", step: undefined, waitReason: null };
      }
      // AG13 gate run-03 (AE-EVT-007): "那改成每月第二个周二…呢？" about a schedule item names a repetition the schedule cannot
      // store; code says so and offers one-off dates (propose), never an answer that tells the user to set that rule.
      if (!resume && UNSUPPORTED_REPEAT.test(input.message.slice(part.quote[0], part.quote[1])) && part.capabilities.some((capability) => /^(?:schedule|rule)\./u.test(capability) && capabilityKind(capability) === "write") && decision.route !== "propose_write") {
        emitTrace({ partId: part.localId, reason: "a repetition the schedule cannot store", type: "route.repeat_unsupported" });
        decision = { ...decision, reason: "a repetition the schedule cannot store (code says so)", route: "propose_write", step: undefined, waitReason: null };
      }
      // AG15 (设计稿 §5.3, §3.5): a scheduled task — said with a recurrence, or the reply to its "按什么来挑", or a named task
      // to pause / resume / remove — goes to the second step, where code reads it and asks its one question itself (the
      // ranking basis). A negation or a hypothesis stays conservative.
      if (!part.plan.negation && !part.plan.hypothesis && (part.plan.ruleAsk || isRuleRequest(part, input.message.slice(part.quote[0], part.quote[1]), context?.openItems ?? []))) {
        if (!part.capabilities.some((capability) => capability.startsWith("rule."))) part.capabilities = [...part.capabilities, "rule.create"];
        if (decision.route !== "propose_write") {
          emitTrace({ from: decision.route, partId: part.localId, reason: "a scheduled task, read by code", type: "route.rule_request" });
          decision = { ...decision, reason: "a scheduled task to set up or change (code reads it; the card needs a click)", route: "propose_write", step: undefined, verdict: "accept", waitReason: null };
        }
      }
      // AG21a (R26): a typed answer that names an option of a write question ("计划日", "柏舟那个") goes on with the asked part
      // (propose resumes it with the pick), whatever the first layer made of the few words.
      if (!resume && part.continues?.kind === "clarification" && openItem?.resume && optionPickedIn(openItem, partWords)) {
        part.capabilities = [...new Set(openItem.resume.intents.map((intent) => intent.capability))] as Capability[];
        part.plan = { ...part.plan, clarity: "clear", readings: [] };
        if (decision.route !== "propose_write") emitTrace({ from: decision.route, partId: part.localId, type: "route.answer_picks_option" });
        decision = { ...decision, reason: "answers a write question by naming one of its options (the asked part goes on)", route: "propose_write", step: undefined, verdict: "accept", waitReason: null };
      }
      // AG15: a sentence that only qualifies the task (inbox only, until when) belongs to the task's card.
      if (!resume && qualifiesRuleOf(part, input.message.slice(part.quote[0], part.quote[1]), ruleQuotes, context?.openItems ?? [])) {
        emitTrace({ from: decision.route, partId: part.localId, reason: "it only qualifies the scheduled task asked for in the same message", type: "route.rule_qualifier" });
        part.capabilities = part.capabilities.filter((capability) => capabilityKind(capability) !== "write");
        part.plan = { ...part.plan, clarity: "statement", readings: [] };
        decision = { blockedWrites: [], reason: "part of the scheduled task asked for in the same message", route: "answer", verdict: "accept", waitReason: null };
      }
      if (accepted && part.continues) acceptedAlternativeRef = part.continues.ref;
      let status = statusForRoute(decision.route);
      let reason: string | null = NOT_YET_ROUTES.has(decision.route) ? "not_in_this_version" : null;
      if (decision.step?.kind === "still_unclear") {
        status = "unfinished";
        reason = "still_unclear";
      }
      if (decision.route === "propose_write") {
        // AG06: the propose step finds the records and makes the card; a card prepared before the turn is shown as it is.
        status = run.cardPrepared ? "awaiting_confirmation" : "unfinished";
        reason = run.cardPrepared ? null : "proposing";
      }
      if (decision.step) run.steps.set(part.localId, decision.step);
      // AG20b (TRIAGE R4): a write tag the review did not confirm, on words that ask and suppose nothing, is answered by
      // code — what was done (nothing changed) and the entry, never a limit Orbit does not have. A question is still answered.
      if (!resume && reviewed.has(part.localId) && decision.route === "answer" && decision.step?.kind === "respond" && !part.plan.hypothesis && !readsAsQuestion(partWords)) {
        run.answers.set(part.localId, CLARIFY_WORDS.statementNoChange(state.language, partWords.trim().replace(/[。.!！]+$/u, ""), Boolean(decision.step.entry)));
        run.codeAnswers.add(part.localId);
        emitTrace({ entry: decision.step.entry ?? null, partId: part.localId, type: "route.statement_by_code" });
      }
      return {
        ...part,
        // AG05: a part routed again reads again (under the permissions of now).
        cites: undefined,
        coverage: undefined,
        gaps: undefined,
        reads: undefined,
        reading: decision.step?.kind === "most_likely" ? { capabilities: [...decision.step.reading.capabilities], ...(decision.step.reading.key ? { key: decision.step.reading.key } : {}) } : null,
        reason,
        route: decision.route,
        status,
        step: decision.step?.kind ?? null,
        verdict: decision.verdict,
        waitReason: decision.waitReason,
      };
    });
    if (!resume) {
      // AG15: a qualifying sentence right next to the scheduled task it belongs to ("…挑三场周末活动。结果放收件箱就行，不用推送，
      // 先跑到 11 月底。") becomes part of that task: one part, one question at most, one card. Code reads the whole of it.
      const absorbed = new Set<string>();
      for (const part of parts) {
        const quote = input.message.slice(part.quote[0], part.quote[1]);
        if (!qualifiesRuleOf(part, quote, ruleQuotes, context?.openItems ?? [])) continue;
        const host = parts.find((other) => other.localId !== part.localId && !absorbed.has(other.localId) && other.route === "propose_write" && isRuleRequest(other, input.message.slice(other.quote[0], other.quote[1]), context?.openItems ?? []));
        if (!host) continue;
        const [from, to] = host.quote[1] <= part.quote[0] ? [host.quote[1], part.quote[0]] : [part.quote[1], host.quote[0]];
        // Only words of no other part may lie between the two (punctuation, spaces).
        const between = from <= to ? input.message.slice(from, to) : "";
        if (from > to || /[^\s，。、,.!！;；:：]/u.test(between)) continue;
        host.quote = [Math.min(host.quote[0], part.quote[0]), Math.max(host.quote[1], part.quote[1])];
        absorbed.add(part.localId);
        emitTrace({ into: host.localId, partId: part.localId, type: "route.rule_qualifier_absorbed" });
      }
      if (absorbed.size) parts = parts.filter((part) => !absorbed.has(part.localId)).map((part) => (part.dependsOn.some((id) => absorbed.has(id)) ? { ...part, dependsOn: part.dependsOn.filter((id) => !absorbed.has(id)) } : part));
      // AG14: the parts about saved memory ("记住……", "这次……", "忘掉……", what is saved, why the list was ordered so) are
      // settled by code before dependencies are (domains/memory/turn.ts).
      await memoryRouteStep(scope, state, parts);
      settleDependencies(parts);
      for (const part of parts) if (part.status === "waiting_dependency") part.reason = "dependency_pending";
    }
    emitTrace({
      acceptedAlternativeRef,
      parts: parts.map((part) => {
        const source = understood?.parts.find((item) => item.localId === part.localId);
        return {
          capabilities: part.capabilities,
          clarity: part.plan.clarity,
          ...(source ? { constraints: source.constraints, goal: source.goal } : {}),
          dataOwner: part.plan.dataOwner,
          dataSources: part.plan.dataSources,
          deliverable: part.plan.deliverable,
          dependsOn: part.dependsOn,
          intentBasis: part.plan.intentBasis,
          objectClues: part.refs.map((ref, index) => ({ entity: ref.entity, recordId: ref.recordId, text: clueWords(input.message, ref) ?? source?.objectClues[index]?.text ?? "", ...(source?.objectClues[index]?.referenceId ? { referenceId: source.objectClues[index].referenceId } : {}) })),
          partId: part.localId,
          persistence: part.plan.persistence,
          ...(part.plan.readings.length ? { readings: part.plan.readings } : {}),
          route: part.route,
          sourceQuote: input.message.slice(part.quote[0], part.quote[1]),
          status: part.status,
          step: part.step,
          verdict: part.verdict,
          waitReason: part.waitReason,
          ...(part.continues ? { continues: part.continues } : {}),
          ...(part.origin ? { origin: part.origin } : {}),
        };
      }),
      plainChat: state.plainChat,
      requestId: input.requestId,
      ...(resume ? { resumed: true } : {}),
      type: "first_layer.handoff",
    });
    run.needsDirections = parts.some((part) => (!resume || state.touched!.includes(part.localId)) && needsDirections(part, run.steps.get(part.localId), state.optionSets));
    return { acceptedAlternativeRef, parts, resumeNext: null };
  };
}
