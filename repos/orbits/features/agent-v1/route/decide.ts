/**
 * Where each part goes, decided by code (设计稿 §3.1 承接判据 and "其余转换", 附录 A; agent-design AG03-2).
 *
 * The model only names capabilities, data sources, the deliverable, how clear the part is and its
 * constraints and dependencies. Whether a topic is commercial, or whether the web is involved, never
 * decides the route on its own. In order:
 *
 * 1. the data belongs to another user               → decline, explain_limit (permission_missing)
 * 2. a capability Orbit does not offer (external.*) → convert, suggest_external_agent
 * 3. it accepts an open alternative                 → accept, the alternative's next step
 * 4. "keep going until I'm satisfied"               → convert, offer_alternative (awaiting_acceptance)
 * 5–7 (AG04). the §3.11 next step (clarify/next-step.ts): a statement, or a write under a negation or a
 *    hypothesis → answer; nothing readable → clarify; a write missing one item or with readings that
 *    write → clarify (object_ambiguous); only-reading readings → read the most likely one; asked once
 *    and still unclear → clarify, left unfinished. Otherwise a clear write → propose_write.
 * 8. public web                                     → web_lookup
 * 9. Orbit records, views, functions                → read
 * 10. otherwise                                     → answer
 *
 * A part whose prerequisite part is not done this round waits (dependency_pending).
 */
import type { Reading, RecordKind } from "../clarify/default-readings";
import { decideNextStep, type NextStep } from "../clarify/next-step";
import type { UnderstandPart } from "../understand/schema";
import { capabilityKind, type Capability, type Route, type Verdict, type WaitReason } from "./capabilities";

export interface RouteDecision {
  verdict: Verdict;
  route: Route;
  waitReason: WaitReason | null;
  /** Why, in a few words (traced; not shown to the user). */
  reason: string;
  /** Write capabilities that were not taken up (a negation, a hypothesis, a statement). */
  blockedWrites: Capability[];
  /** AG04: the §3.11 next step of a part that is not plainly clear (absent: the ordinary routes). */
  step?: NextStep;
}

/** Negations and hypotheses that keep a part from becoming a write (zh, ja, en). */
const NEGATION = /(先别|别改|别动|不要改|不要加|不要建|不要删|不要动|不用改|不用加|不用建|不用删|不用动|先不|暂时不|还没想好|别加|别建|别删|不必改|do not|don'?t|not now|hold off|しないで|しなくて|ないで|やめて|待って)/iu;
const HYPOTHESIS = /(如果|要是|假如|假设|万一|もし|仮に|\bif\b|\bwhat if\b|\bsuppose\b|\bin case\b)/iu;
const HYPOTHESIS_OPENING = /^\s*(如果|要是|假如|假设|万一|もし|仮に|if\b|what if\b|suppose\b)/iu;

/**
 * AG04 run-02 (设计稿 §3.10 "隔了多久算断开", §3.11 row 4): pronouns and demonstratives, and the generic
 * words that may stand around them. A clue made of nothing else names no object by itself: only the
 * context can resolve it, and when the context had nothing to offer, code does not guess — it asks.
 * Longest first (Han and kana are matched as substrings; Latin words as whole words).
 */
const PRONOUN_WORDS_CJK = [
  "他们", "她们", "它们", "这些", "那些", "这个", "那个", "这条", "那条", "这篇", "那篇", "这件", "那件", "这位", "那位", "这场", "那场", "这次", "那次", "这份", "那份", "他", "她", "它", "这", "那", "该",
  "彼女ら", "彼女", "彼ら", "あの人", "この人", "その人", "あの方", "その方", "あいつ", "あれ", "それ", "これ", "あの", "その", "この", "例の", "彼",
];
// AG05 run-02 repair 2 (AE-AMB-012): the little words a clue may carry around the pronoun ("给他的", "彼に").
const GENERIC_WORDS_CJK = ["待办", "笔记", "活动", "日程", "联系人", "事情", "会议", "记录", "东西", "人", "事", "会", "的", "关于", "给", "跟", "和", "对", "向", "为", "与", "メモ", "ToDo", "イベント", "予定", "打ち合わせ", "について", "から", "やつ", "件", "人", "の", "に", "と", "へ"];
// AG10 stability run (AE-SCL-020): "when we last actually talked" — "we" (us, our) points at the person named nearby, never at a
// contact whose name starts with it ("Daniel Wee").
const PRONOUN_WORDS_LATIN = new Set(["he", "she", "him", "her", "his", "hers", "it", "its", "they", "them", "their", "that", "this", "those", "these", "one", "ones", "the", "s", "we", "us", "our"]);
const GENERIC_WORDS_LATIN = new Set(["note", "notes", "to-do", "todo", "task", "event", "meeting", "person", "thing", "item", "record", "contact"]);

export function isPronounClue(text: string): boolean {
  let rest = text.replace(/^@/u, "").trim();
  if (!rest) return false;
  const latin = rest.toLowerCase().split(/[\s'’]+/u).filter(Boolean);
  if (/^[\x20-\x7e’]+$/u.test(rest)) return latin.length > 0 && latin.every((word) => PRONOUN_WORDS_LATIN.has(word) || GENERIC_WORDS_LATIN.has(word)) && latin.some((word) => PRONOUN_WORDS_LATIN.has(word) && word !== "the" && word !== "s");
  let hadPronoun = false;
  for (const word of PRONOUN_WORDS_CJK) {
    if (rest.includes(word)) {
      hadPronoun = true;
      rest = rest.split(word).join("");
    }
  }
  if (!hadPronoun) return false;
  for (const word of GENERIC_WORDS_CJK) rest = rest.split(word).join("");
  return rest.replace(/[\s、，。・]/gu, "") === "";
}

export function isNegatedOrHypothetical(part: Pick<UnderstandPart, "constraints" | "sourceQuote">): boolean {
  return negationOf(part) || hypothesisOf(part);
}

/** "先别改", "don't add" … in the part's constraints (AG04 keeps the two signals apart). */
/** AG09 run-04 repair 2: the user's own words carry a negation (the same words as negationOf). */
export function negationIn(text: string): boolean {
  return NEGATION.test(text);
}

export function negationOf(part: Pick<UnderstandPart, "constraints">): boolean {
  return part.constraints.some((constraint) => NEGATION.test(constraint));
}

/** "如果", "もし", "if …" in the constraints, or the part opens with one. */
export function hypothesisOf(part: Pick<UnderstandPart, "constraints" | "sourceQuote">): boolean {
  return part.constraints.some((constraint) => HYPOTHESIS.test(constraint)) || HYPOTHESIS_OPENING.test(part.sourceQuote);
}

const kindsOf = (part: Pick<UnderstandPart, "requiredCapabilities">) => new Set(part.requiredCapabilities.map(capabilityKind));

/**
 * What decideRoute reads of a part: the first layer's part (AG03), or — after a pause — the part's
 * plan kept in the checkpoint (codes only, no words: negation and hypothesis already decided).
 */
export type RouteInput = Pick<UnderstandPart, "clarity" | "requiredCapabilities" | "dataSources" | "intentBasis" | "dataOwner" | "persistence" | "continues"> & {
  constraints?: string[];
  sourceQuote?: string;
  negation?: boolean;
  hypothesis?: boolean;
  readings?: readonly { capabilities: readonly Capability[]; deliverable: string }[];
  objectClues?: readonly { entity: string }[];
};

export interface RouteOptions {
  acceptedAlternative?: { leadsTo?: string } | null;
  /** AG04: questions already asked for this part (§3.11 只问一次). */
  asked?: number;
  objectKind?: RecordKind | null;
  pageKind?: RecordKind | null;
  topicKind?: RecordKind | null;
  /** run-02: the part points at its object only with a pronoun nothing could resolve (route node decides). */
  unboundPronoun?: boolean;
  /** AG07: the part names its object in its own words (not a pronoun) and says the new date (route node decides). */
  namedObjectWithDate?: boolean;
  /** AG07 run-03: a change verb with a new date and no bound object (route node decides from the words). */
  reschedule?: boolean;
}

export function decideRoute(part: RouteInput, options: RouteOptions = {}): RouteDecision {
  const kinds = kindsOf(part);
  const writes = part.requiredCapabilities.filter((capability) => capabilityKind(capability) === "write");
  const decision = (verdict: Verdict, route: Route, reason: string, waitReason: WaitReason | null = null, blockedWrites: Capability[] = [], step: NextStep | null = null): RouteDecision => ({ blockedWrites, reason, route, verdict, waitReason, ...(step ? { step } : {}) });

  if (part.dataOwner === "other_user") return decision("decline", "explain_limit", "data of another user; no permission from its owner", "permission_missing");
  if (kinds.has("external")) return decision("convert", "suggest_external_agent", "needs a capability Orbit does not offer (external.*)");
  // Accepting the alternative offered earlier comes before "open-ended": the accepted plan is the bounded one.
  if (part.continues?.kind === "alternative" && options.acceptedAlternative) {
    const leadsTo = options.acceptedAlternative.leadsTo;
    return leadsTo && capabilityKind(leadsTo as Capability) === "write"
      ? decision("accept", "propose_write", "accepts the alternative offered earlier; its next step is a write")
      : decision("accept", "answer", "accepts the alternative offered earlier");
  }
  if (part.persistence === "until_satisfied") return decision("convert", "offer_alternative", "an open-ended request; offer a bounded alternative first", "awaiting_acceptance");
  // AG12 run-02 stability (AE-SCL-016): a link the user hands over to read ("Here is their pricing page: https://…") is a
  // request to open it, whatever clarity the first layer gave the sentence; saying not to open it is a negation.
  if (part.requiredCapabilities.includes("web.fetch") && part.requiredCapabilities.every((capability) => capabilityKind(capability) === "web") && /https?:\/\/\S+/u.test(part.sourceQuote ?? "") && !part.negation && !part.hypothesis && writes.length === 0) return decision("accept", "web_lookup", "the user gave a link to read");
  // AG04: an unclear part's next step comes from the six rows of §3.11 (clarify/next-step.ts).
  const step = decideNextStep({
    capabilities: part.requiredCapabilities,
    clarity: part.clarity,
    hasContactClue: (part.objectClues ?? []).some((clue) => clue.entity === "contact"),
    hypothesis: part.hypothesis ?? (part.constraints && part.sourceQuote !== undefined ? hypothesisOf({ constraints: part.constraints, sourceQuote: part.sourceQuote }) : false),
    intentBasis: part.intentBasis,
    negation: part.negation ?? (part.constraints ? negationOf({ constraints: part.constraints }) : false),
    objectKind: options.objectKind ?? null,
    readings: (part.readings ?? []).map((reading) => ({ capabilities: [...reading.capabilities], deliverable: reading.deliverable as Reading["deliverable"] })),
    unboundPronoun: options.unboundPronoun ?? false,
    namedObjectWithDate: options.namedObjectWithDate ?? false,
    reschedule: options.reschedule ?? false,
  }, { asked: options.asked ?? 0, pageKind: options.pageKind ?? null, topicKind: options.topicKind ?? null });
  switch (step.kind) {
    case "respond":
      return decision("accept", "answer", step.conservative ? "a write tag on a statement, a hypothesis or a negation: answered as a statement until the judgment model checks it (AG08)" : "a statement, not a request", null, writes, step);
    case "not_understood":
      return decision("accept", "clarify", "nothing to act on can be read out of it", null, [], step);
    case "still_unclear":
      return decision("accept", "clarify", "asked once already and still unclear: delivered as far as it goes", null, [], step);
    case "ask_missing":
    case "ask_readings":
      return decision("accept", "clarify", "a write that misses its object or reads several ways", "object_ambiguous", [], step);
    case "most_likely":
      return decision("accept", "read", "only reading: the most likely reading is done and said first", null, [], step);
    default:
      break;
  }
  if (writes.length) return decision("accept", "propose_write", "an explicit request to change a record");
  if (kinds.has("web") || part.dataSources.includes("public_web")) return decision("accept", "web_lookup", "public sources");
  if (kinds.has("read") || kinds.has("function") || part.dataSources.includes("orbit_records")) return decision("accept", "read", "the user's Orbit records");
  return decision("accept", "answer", "discussion; no records or web needed");
}

export type PartStatus = "answered" | "awaiting_clarification" | "awaiting_confirmation" | "awaiting_acceptance" | "suggested_external" | "waiting_dependency" | "declined" | "unfinished" | "failed";

/**
 * Routes this version delivers no result for (probe as a route of its own): reported as not done. The web (web_lookup) works from AG09. Reads work from AG05; writes
 * are proposed on a card from AG06 (graph/nodes/propose.ts).
 */
export const NOT_YET_ROUTES: ReadonlySet<Route> = new Set(["probe"]);

/**
 * The status a route leaves a part in before dependencies are settled. An `answer` part is counted
 * as answered here (it will be answered unless it waits or the budget runs out); routes this sprint
 * cannot carry out are not done.
 */
export function statusForRoute(route: Route): PartStatus {
  switch (route) {
    case "suggest_external_agent":
      return "suggested_external";
    case "explain_limit":
      return "declined";
    case "offer_alternative":
      return "awaiting_acceptance";
    case "clarify":
      return "awaiting_clarification";
    case "answer":
      return "answered";
    case "read":
      // AG05: answered unless resolve finds it could not read (it sets the gap and the status).
      return "answered";
    case "web_lookup":
      // AG09: answered unless the web step (graph/nodes/probe.ts) could not look it up (it says why and sets the status).
      return "answered";
    default:
      return "unfinished";
  }
}

/**
 * A part whose prerequisite is not done this round waits for it. Done means answered; anything else
 * (suggested to an external agent, not available yet, declined …) leaves the dependent part waiting.
 */
/**
 * AG20b (TRIAGE R20, AE-REF-006; 设计稿 §3.2 "每项只等自己的前置条件"): a read whose record cannot be opened is finished — it
 * says so and asks to choose again — and holds nothing back: the part that went on from it is answered from its own records.
 */
function finishedWithoutResult(part: { status: PartStatus; route?: Route | null; reason?: string | null }): boolean {
  return part.status === "unfinished" && part.route === "read" && part.reason === "reference_not_accessible";
}

export function settleDependencies<T extends { localId: string; dependsOn: readonly string[]; status: PartStatus; waitReason: WaitReason | null; route?: Route | null; reason?: string | null }>(parts: T[]): T[] {
  const byId = new Map(parts.map((part) => [part.localId, part]));
  let changed = true;
  while (changed) {
    changed = false;
    for (const part of parts) {
      if (part.status === "waiting_dependency" || part.status === "declined") continue;
      // AG06: a write part's wait is decided by the propose step (a read it depends on is delivered first; an item
      // that waits for another item goes on the same card with dependsOn).
      if (part.route === "propose_write") continue;
      const blocked = part.dependsOn.some((id) => {
        const dependency = byId.get(id);
        return dependency?.status !== "answered" && !(dependency && finishedWithoutResult(dependency));
      });
      if (blocked) {
        part.status = "waiting_dependency";
        part.waitReason = "dependency_pending";
        changed = true;
      }
    }
  }
  return parts;
}
