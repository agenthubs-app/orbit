/**
 * The graph's thread state (设计稿 §3.9 "状态里放什么", agent-design AG03).
 *
 * One request is one thread (thread id = requestId). The state holds references and progress only:
 * the request context, each part as offsets into this turn's message plus its route and status, the
 * records it was bound to by id, the budget and how many model calls were used. The message text,
 * the context given to the model, record bodies and the model's raw output are not in it; they live
 * in the run (AgentGraphRun) for the duration of the request and are never checkpointed.
 */
import { Annotation } from "@langchain/langgraph";

import type { AgentAnswerBasisContract, AgentAnswerBlockContract, AgentAnswerRecordContract, AgentClarificationContract, AgentPartResult } from "../../../shared/contract/agent-v1";
import type { ReadSource } from "../answer/basis";
import type { Material } from "../answer/schema";
import type { EventClaimFacts } from "../answer/event-claims";
import type { NextStep } from "../clarify/next-step";
import type { FirstLayerContext } from "../context/build";
import type { AgentSessionState, NamedRecordRef, StaleProfile } from "../context/session-state";
import type { TurnMemory } from "../domains/memory/turn";
import type { MemoryNote } from "../domains/memory/copy";
import type { AgentAnswerMemoryUseContract } from "../../../shared/contract/agent-v1";
import type { ReferenceHandle } from "./deps";
import type { Capability, Route, Verdict, WaitReason } from "../route/capabilities";
import type { PartStatus } from "../route/decide";
import type { PartWrite } from "../propose/resolve";
import type { CardOperationIntent } from "../../agent/runtime/card-operations";
import type { JudgmentBudget } from "../judgment/ask";
import type { RuleAskState } from "../rule/state";
import type { AgentActionPreviewContract, AgentWebResultContract } from "../../../shared/contract/agent-v1";
import type { Clarity, DataOwner, DataSource, Deliverable, IntentBasis, Persistence, RankField, ReadFilter, UnderstandOutput } from "../understand/schema";

export interface GraphPartRef {
  entity: string;
  /** The product id the clue was bound to (null: not bound). */
  recordId: string | null;
  /** AG04: the clue's words as [start, end) in this turn's message (the words themselves are not kept). */
  quote?: [number, number] | null;
}

/**
 * AG04: what code needs of a part to route it again after a pause — codes only, no words. Negation
 * and hypothesis are decided once from the first layer's constraints; readings keep capabilities and
 * the deliverable, never the model's label.
 */
export interface PartPlan {
  clarity: Clarity;
  dataSources: DataSource[];
  deliverable: Deliverable;
  intentBasis: IntentBasis;
  dataOwner: DataOwner;
  persistence: Persistence;
  negation: boolean;
  hypothesis: boolean;
  readings: { capabilities: Capability[]; deliverable: Deliverable }[];
  /** A click accepted the alternative offered for this part; it leads to this capability. */
  acceptedLeadsTo?: Capability | null;
  /** AG05: how the part's read is narrowed: the words as [start, end) in this turn's message (the words are not kept), order, status, dates. */
  readFilter?: Omit<ReadFilter, "text"> & { text?: [number, number] };
  /** AG08: picking or ordering records: the words as [start, end) in this turn's message, a count, a field. */
  rank?: { count?: number; basis?: [number, number]; within?: [number, number]; orderBy?: RankField; direction?: "asc" | "desc" };
  /** AG09: what a web.search part looks up: the name as [start, end) in this turn's message and qualifier codes. */
  webTarget?: { quote?: [number, number]; qualifiers: string[] };
  /** AG10: a ranking that asked "按什么来挑": its domain, dates and count (the reply goes on with them). */
  rankAsk?: { domain: "event" | "contact" | "todo"; count?: number; from?: string; to?: string };
  /** AG15: a scheduled task that asked "按什么来挑": what was read of it so far (the reply goes on to the card). */
  ruleAsk?: RuleAskState;
}

/** AG05: what a read part covered, per kind (codes and counts only). */
export interface PartCoverage {
  kind: string;
  pagesRead: number;
  seen: number;
  total: number | null;
  complete: boolean;
  /** AG07 run-02: the end of the records read, when only one was ("oldest" first meetings, "newest" otherwise). */
  direction?: "oldest" | "newest";
}

/** AG04: a set of clickable directions as the checkpoint keeps it (ids and codes; the labels are in the result document). */
export interface OptionSetState {
  clarificationId: string;
  partId: string;
  kind: "question" | "not_understood" | "entry";
  asks?: "object" | "reading";
  /** AG06: operation — a question before the card (which person, which to-do, which date field). */
  purpose: "directions" | "readings" | "object" | "other_readings" | "entry" | "alternative" | "operation" | "web_pick" | "web_send" | "ranking" | /** AG21b (R31): which occasion a note records. */ "interaction";
  state: "open" | "answered" | "shelved";
  selectedOptionId?: string | null;
  answeredBy?: string | null;
  /** The open item the question stands for (clarify_max_per_part counts per subgoal). */
  subgoal: string;
  options: { optionId: string; capability: Capability; capabilities: Capability[]; refType?: string; refId?: string }[];
}

/** AG04: what resumes a paused request (§3.9 暂停与恢复): a click, a later message that answered it, or shelving. */
export type GraphResolution =
  | { kind: "select"; clarificationId: string; optionId: string }
  | { kind: "continued"; clarificationId: string; requestId: string; status: PartStatus; reason?: string | null; route?: Route | null }
  | { kind: "shelve"; clarificationId: string };

export interface GraphPart {
  localId: string;
  /** sourceQuote as [start, end) in this turn's message (the message is read back by its request). */
  quote: [number, number];
  verdict: Verdict | null;
  route: Route | null;
  waitReason: WaitReason | null;
  status: PartStatus;
  /** A short code: why the part ended where it did (not_in_this_version, budget, model_error …). */
  reason: string | null;
  capabilities: Capability[];
  dependsOn: string[];
  refs: GraphPartRef[];
  /** The open item this part answers or accepts (its stored ref). */
  continues: { kind: string; ref: string } | null;
  /** AG04: the codes route needs again after a pause. */
  plan: PartPlan;
  /** AG04: questions asked for this part so far (a part answering a question inherits one). */
  asked: number;
  /** AG04: the §3.11 step code took (not_understood, ask_missing, most_likely …), null when plainly clear. */
  step: string | null;
  /** AG04: the reading done for a "most likely" part (its registered key, if any, and capabilities). */
  reading: { key?: string; capabilities: Capability[] } | null;
  /** AG04: a part made by a click on an entry: the part it was offered under. */
  origin: string | null;
  /** AG05: the records this part read in this request, by ref and version (never their content). */
  reads?: { ref: string; version: string }[];
  /** AG05: what the read did not give (附录 C gaps). */
  gaps?: string[];
  /** AG05: how much was read, per kind. */
  coverage?: PartCoverage[];
  /** AG05: the refs the delivered answer cites (verified). */
  cites?: string[];
  /** AG06: a write part's intents (codes and offsets), the user's picks and its operations on the card. */
  write?: PartWrite;
  /** AG09: the part's web step across a pause — the search it made (call key), the result picked, the query clicked. Ids and codes only. */
  web?: PartWeb;
}

export interface PartWeb {
  searchKey?: string;
  /** The search result (0-based, in the search's order) the user picked among same-named objects. */
  pick?: number;
  /** The user clicked send_query (rule 4) or skip_query. */
  confirmed?: boolean;
  skipped?: boolean;
}

const replace = <T>(fallback: () => T) => Annotation<T>({ default: fallback, reducer: (_previous, next) => next });

export const AgentGraphAnnotation = Annotation.Root({
  requestId: replace<string>(() => ""),
  sessionId: replace<string>(() => ""),
  /** Where the turn's words are kept: the request record of this requestId. */
  messageRef: replace<string>(() => ""),
  asOf: replace<string>(() => ""),
  timeZone: replace<string>(() => "Asia/Tokyo"),
  language: replace<"zh" | "ja" | "en">(() => "en"),
  /** Authorized @ references of this turn (product ids). */
  references: replace<string[]>(() => []),
  context: replace<{ idle: boolean; idleMinutes: number | null; messages: number; handles: number; openItems: number } | null>(() => null),
  budget: replace<{ limit: number; used: number }>(() => ({ limit: 4, used: 0 })),
  repairs: replace<number>(() => 0),
  understanding: replace<"pending" | "understood" | "invalid" | "model_error" | "budget">(() => "pending"),
  plainChat: replace<boolean>(() => false),
  parts: replace<GraphPart[]>(() => []),
  acceptedAlternativeRef: replace<string | null>(() => null),
  requestStatus: replace<"completed" | "waiting_user" | null>(() => null),
  delivered: replace<boolean>(() => false),
  /** AG04: the clickable directions of this request and their state. */
  optionSets: replace<OptionSetState[]>(() => []),
  /** AG04: deliver left open directions; clarify waits (interrupt) for a click or an answer. */
  pausing: replace<boolean>(() => false),
  /** AG04: after a resume, where clarify goes: route (a click to carry out) or deliver (closed from outside). */
  resumeNext: replace<"route" | "deliver" | null>(() => null),
  /** AG04: the parts a resume touched (null on the first pass: every part). */
  touched: replace<string[] | null>(() => null),
});

export type AgentGraphState = typeof AgentGraphAnnotation.State;
export type AgentGraphUpdate = typeof AgentGraphAnnotation.Update;

/** What one request needs while it runs and must never be checkpointed. */
export interface AgentGraphRun {
  message: string;
  locale: string;
  actorId: string;
  cardPrepared: boolean;
  context: FirstLayerContext | null;
  understood: UnderstandOutput | null;
  plainReply: string | null;
  answers: Map<string, string>;
  /** The delivered text and part results (filled by deliver). */
  text: string;
  partResults: AgentPartResult[];
  /** AG04: the §3.11 step of each part routed in this pass (its readings and options are built from it). */
  steps: Map<string, NextStep>;
  /** AG20b (R4): parts whose answer is code's line (a write tag the review did not confirm); the answer step skips them. */
  codeAnswers: Set<string>;
  /** AG04: route found parts that need directions built (clarify's prepare pass runs). */
  needsDirections: boolean;
  /** AG04: option labels written in this pass, by clarificationId → optionId. */
  optionLabels: Map<string, Map<string, { label: string; refName?: string }>>;
  /** AG04: on a resume, the labels the result document already shows. */
  previousClarifications: readonly AgentClarificationContract[] | null;
  /** AG04: names of records a click bound (from the result document, never from the checkpoint). */
  names: Map<string, string>;
  /** AG04: the delivered sets of directions (filled by deliver). */
  clarifications: AgentClarificationContract[];
  /** AG04: earlier requests this one answered or shelved; the executor resumes them after this run. */
  earlier: { requestId: string; resolution: GraphResolution }[];
  /** AG05: this turn's @ references as authorized now (`accessible: false` when one cannot be opened). */
  references: ReferenceHandle[];
  /** AG05: per part, the records given to the answer step (numbered sentences). */
  materials: Map<string, Material[]>;
  /** AG05: per part, code's notes to the answer step (who was found, coverage, what could not be read). */
  readNotes: Map<string, string[]>;
  /** AG11 (AE-SCL-021): per part, the previous question a 「那 @X 呢？」 asks again about the record picked now. */
  carriedQuestions: Map<string, string>;
  /** AG21c (R47): per part, the last list request it repeats or adjusts ("再给我看一次", "这次把周日的也加上"). */
  repeatedLists: Map<string, import("../context/session-state").LastListRequest>;
  /** AG21c (R47): the list request this turn answered (kept in the session for the next turn). */
  lastList: import("../context/session-state").LastListRequest | null;
  /** Hotfix 1c (AE-ANS-019): parts whose every record read is shown ("what to handle today"), whatever the answer cited. */
  showAllRead: Set<string>;
  /** AG05: per part, code's sentences after the answer (no record, partial, failed, choose again). */
  gapLines: Map<string, string[]>;
  /** AG20a (decision 2): the profile fields this turn's answer said are out of date, with the newer values it verified. */
  staleProfiles: StaleProfile[];
  /** AG05: names of records read in this request (id → name), for the answer and the session state. */
  readNames: Map<string, { type: string; name: string }>;
  /** AG05: per part, several people match its name: the candidates to ask about. */
  candidates: Map<string, NamedRecordRef[]>;
  /** AG05: the delivered answer's verified source refs (filled by verify). */
  sourceRefs: string[];
  /** AG07: what a link needs of each record read in this request (ref → kind, id, title, day), and the basis line verify writes. */
  readSources: Map<string, ReadSource>;
  basis: AgentAnswerBasisContract | null;
  /** AG06: code's sentences for write parts (not found, a question, cannot be done here). */
  writeLines: Map<string, string>;
  /** AG08: the round's judgment requests (at most 3, 设计稿 §3.3). */
  judgment: JudgmentBudget;
  /** AG06: the card of this request as frozen, and code's line for it. */
  actionPreview: AgentActionPreviewContract | null;
  cardLine: string | null;
  /** AG09: parts whose web step ran in this pass. */
  webDone: Set<string>;
  /** AG09: what this request sent and opened (the result document shows it next to the answer). */
  web: AgentWebResultContract;
  /** AG09: per part, code's question line before a web click (same-named results, a query to show). */
  webQuestions: Map<string, string>;
  /** AG09: URLs the answer may name (the user's, those searched and opened in this request). */
  webUrls: Set<string>;
  /** AG10 (AG08 交接 1): a ranking of this turn matched candidates to a topic (the judgment answered); only then may a model sentence say so. */
  topicMatched: boolean;
  /** AG10: parts a second-level function ran for in this pass. */
  functionsDone: Set<string>;
  /** AG10: per part, code's question line (the basis of a ranking). */
  questionLines: Map<string, string>;
  /** AG10: per part, code's lines before its answer or card (how "整理一下" was taken; what an extraction found). */
  leadLines: Map<string, string>;
  /** AG10: per part, the card operations an extraction made (propose freezes them; no second-layer model call). */
  presetIntents: Map<string, (CardOperationIntent & { localId: string })[]>;
  /** AG14: the turn's saved memory — the scope as read at intake, the rules in force, what was used (never checkpointed). */
  memory: TurnMemory;
  /** AG14: the session state as intake read it (the last ranking's codes, the memory uses of earlier answers). */
  sessionState: AgentSessionState | null;
  /** AG19: per part, its answer as blocks (the same words as `answers`, with the listed records as cards). */
  answerBlocks: Map<string, AgentAnswerBlockContract[]>;
  /** AG19: parts whose answer a model wrote (its first line is the conclusion when more follows). */
  modelAnswers: Set<string>;
  /** AG19: the card of each record read in this request (ref → the three lines, written by code). */
  recordCards: Map<string, AgentAnswerRecordContract>;
  /** AG19: the delivered answer as blocks (filled by deliver). */
  blocks: AgentAnswerBlockContract[];
  /** AG19 repair round 1: where each record read stands in a list code writes (ref → sort key, answer/blocks.ts listSortKey). */
  recordSort: Map<string, string>;
  /** AG19 repair round 1: the start, end and fee of each event read in this request (ref → facts), for answer/event-claims.ts. */
  eventFacts: Map<string, EventClaimFacts>;
  /** AG14 UI (D3): per part, the grey note with 「去设置 ›」 that stands for its memory line ("只用在这一次", "没有找到"). */
  memoryNotes: Map<string, MemoryNote>;
  /** AG14 UI (D4–D6): the memory chips at the start of the answer, in the order the parts used them. */
  memoryUse: AgentAnswerMemoryUseContract[];
  /** ORBIT_AGENT_CONVERSATION: the conversation engine on this turn (conversation/run.ts; null under legacy or before understand). */
  conversation: import("../conversation/run").ConversationRun | null;
}
