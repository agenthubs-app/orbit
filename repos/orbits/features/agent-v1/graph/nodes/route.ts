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
      ? attributeMessage(state.parts.map((part) => ({ clarity: part.plan.clarity, continues: part.continues, localId: part.localId })), context.openItems)
      : null;
    let acceptedAlternativeRef: string | null = state.acceptedAlternativeRef;
    const topicKind = context?.shownList.length ? recordKindOf(context.shownList[0].type) : null;
    // run-02 (§3.10): a pronoun is resolved from the conversation within the 60-minute window. With nothing
    // to resolve it from — idle, or no conversation and no state — and nothing else named in this message,
    // code does not guess. A resumed part was answered by a click, so its object is no longer missing.
    // Open items are context too: a part answering one points at that matter's object.
    const nothingToResolveFrom = !resume && Boolean(context) && context!.openItems.length === 0 && (context!.idle || (context!.messages.length === 0 && context!.shownList.length === 0 && context!.lastMentioned.length === 0));
    const clueText = (ref: GraphPart["refs"][number]) => clueWords(input.message, ref) ?? "";
    const namedInMessage = (context?.references.length ?? 0) > 0 || state.parts.some((part) => part.refs.some((ref) => ref.recordId || (clueText(ref) && !isPronounClue(clueText(ref)))));
    const unboundPronoun = (part: GraphPart) => nothingToResolveFrom && !namedInMessage && !part.refs.some((ref) => ref.recordId) && part.refs.some((ref) => isPronounClue(clueText(ref)));
    // AG07 gate (AE-XL-005): the first layer called "把报价待办改到周五" missing one item although the to-do is named in
    // its own words and the new day is said; code then looks it up instead of asking without candidates.
    const namedObjectWithDate = (part: GraphPart) => {
      const named = part.refs.some((ref) => ref.entity !== "contact" && !ref.recordId && Boolean(clueSearchWords(clueText(ref))) && !isPronounClue(clueText(ref)));
      return named && resolveSaidDate(input.message.slice(part.quote[0], part.quote[1]), state.asOf || deps.now(), state.timeZone || "Asia/Tokyo") !== null;
    };
    const parts: GraphPart[] = state.parts.map((original) => {
      if (resume && !state.touched!.includes(original.localId)) return original;
      const part: GraphPart = { ...original };
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
      const decision = decideRoute(routeInputOf(part), { acceptedAlternative: accepted, asked: part.asked, objectKind: objectOf(scope, part).kind, pageKind: pageKindOf(scope), topicKind, namedObjectWithDate: namedObjectWithDate(part), reschedule, unboundPronoun: unboundPronoun(part) });
      if (unboundPronoun(part)) emitTrace({ partId: part.localId, reason: "a pronoun with nothing to resolve it from (§3.10): the object is missing", type: "route.unbound_reference" });
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
