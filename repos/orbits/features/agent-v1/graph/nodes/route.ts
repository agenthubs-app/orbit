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
import { needsIntentReview, reviewWriteIntent } from "../../judgment/intent-review";
import { organizeMeansSummary } from "./functions";
import { contactKindOf } from "../../propose/resolve";
import { capabilityKind, type Capability } from "../../route/capabilities";
import type { NextStep } from "../../clarify/next-step";

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

/** AG09 run-02: words that ask to look on the web (zh, ja, en). */
const EXPLICIT_WEB = /(上网|联网|网上|网络上|搜一下|搜搜|搜索|官网|公开资料|公开职务|公开信息|ネット|ウェブ|検索|公式サイト|公開情報|online|on the web|the internet|web search|search the web|google|look (?:it |them |him |her )?up)/iu;

export function routeInputOf(part: GraphPart): RouteInput {
  return {
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
    const unboundPronoun = (part: GraphPart) => nothingToResolveFrom && !namedInMessage && !part.refs.some((ref) => ref.recordId) && part.refs.some((ref) => isPronounClue(clueText(ref)));
    // AG07 gate (AE-XL-005): the first layer called "把报价待办改到周五" missing one item although the to-do is named in
    // its own words and the new day is said; code then looks it up instead of asking without candidates.
    const namedObjectWithDate = (part: GraphPart) => {
      const named = part.refs.some((ref) => ref.entity !== "contact" && !ref.recordId && Boolean(clueSearchWords(clueText(ref))) && !isPronounClue(clueText(ref)));
      return named && resolveSaidDate(input.message.slice(part.quote[0], part.quote[1]), state.asOf || deps.now(), state.timeZone || "Asia/Tokyo") !== null;
    };
    // AG08 (§3.11, §3.8): a write tag on words that read like a statement, a question or a hypothesis, or with no
    // registered write verb, is checked once by the judgment model. Anything but a sure "yes" makes it a statement.
    const reviewed = new Set<string>();
    if (!resume) {
      for (const original of state.parts) {
        const found = attribution?.get(original.localId);
        const quote = input.message.slice(original.quote[0], original.quote[1]);
        const followsWrite = original.dependsOn.some((id) => state.parts.find((other) => other.localId === id)?.capabilities.some((capability) => capabilityKind(capability) === "write"));
        const review = { capabilities: original.capabilities, clarity: original.plan.clarity, continues: Boolean(found && found.kind !== "new"), followsWrite, hypothesis: original.plan.hypothesis, intentBasis: original.plan.intentBasis, negation: original.plan.negation, quote };
        if (!needsIntentReview(review)) continue;
        const result = await reviewWriteIntent(deps.judgment, run.judgment, { language: state.language, message: input.message, quote, requestId: input.requestId });
        emitTrace({ explicit: result.explicit, partId: original.localId, type: "route.intent_review", verdict: result.verdict ? { answer: result.verdict.answer, confidence: result.verdict.confidence, fallback: result.verdict.fallback, reason: result.verdict.reason } : null });
        if (!result.explicit) reviewed.add(original.localId);
      }
    }
    const parts: GraphPart[] = state.parts.map((original) => {
      if (resume && !state.touched!.includes(original.localId)) return original;
      const part: GraphPart = { ...original };
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
      if (!resume && organizeMeansSummary(part, input.message, new Set(run.references.map((reference) => reference.id))) && (part.plan.clarity !== "clear" || part.capabilities.some((capability) => capabilityKind(capability) === "write"))) {
        part.capabilities = ["memo.read", "fn.summarize"];
        part.plan = { ...part.plan, clarity: "clear", dataSources: ["orbit_records"], deliverable: "summary", readings: [] };
        emitTrace({ partId: part.localId, type: "route.organize_is_summary" });
      }
      const routeOptions = { acceptedAlternative: accepted, asked: part.asked, objectKind: objectOf(scope, part).kind, pageKind: pageKindOf(scope), topicKind, namedObjectWithDate: namedObjectWithDate(part), reschedule, unboundPronoun: unboundPronoun(part) };
      let decision = decideRoute(routeInputOf(part), routeOptions);
      // AG09 run-02 (AE-CTX-006): a question about one of the user's own contacts (an @ record) is answered from the records;
      // the web is looked up about a contact only when the user asks for it ("上网查", "ネットで", "online").
      const partWords = input.message.slice(part.quote[0], part.quote[1]);
      if (!resume && decision.route === "web_lookup" && part.refs.some((ref) => ref.entity === "contact" && ref.recordId) && !EXPLICIT_WEB.test(partWords)) {
        part.capabilities = [...new Set([...part.capabilities.filter((capability) => capabilityKind(capability) !== "web"), "contact.read" as Capability])];
        part.plan = { ...part.plan, dataSources: ["orbit_records"] };
        decision = decideRoute(routeInputOf(part), routeOptions);
        emitTrace({ partId: part.localId, reason: "a question about the user's own contact, not asked to look online: read from the records", route: decision.route, type: "route.contact_not_looked_up_online" });
      }
      if (reviewed.has(part.localId) && decision.step?.kind === "respond" && decision.step.entry) {
        const entry = reviewedEntry(part, input.message.slice(part.quote[0], part.quote[1]), clueText, state.asOf || deps.now(), state.timeZone || "Asia/Tokyo");
        if (entry) decision.step = { ...decision.step, entry: entry.entry, reviewed: entry.reviewed };
      }
      if (unboundPronoun(part)) emitTrace({ partId: part.localId, reason: "a pronoun with nothing to resolve it from (§3.10): the object is missing", type: "route.unbound_reference" });
      // AG09 (PLANNER 排除范围; AE-UND-010 in one part): a change that saves what a web page says is not offered yet — the part
      // reads the page (web_lookup) and code says the save is not available (graph/nodes/probe.ts); no card.
      if (decision.route === "propose_write" && part.capabilities.some((capability) => capabilityKind(capability) === "web")) {
        emitTrace({ partId: part.localId, reason: "a change built on a web page: the page is read, the save is not offered yet", type: "route.web_save_not_offered" });
        decision.route = "web_lookup";
        decision.reason = "public sources (saving them is not offered yet)";
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
