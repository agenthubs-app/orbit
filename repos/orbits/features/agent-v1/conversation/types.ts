// conversation/types.ts: the lab's types.ts (lab-conv repos/orbits/lab/conversation/types.ts, lab commit c8717763a); the only
// change is the World import, which points at the finder's copy of the record-finder lab types (identical file).
/**
 * Conversation lab (see SPEC.md): multi-turn understanding — what a reference points at, which open matter a message
 * continues, how a typed answer picks an option, how a follow-up relates to the request before, which conditions carry
 * over, and when to ask. Nothing here is imported by the agent; implementations live in adapters/.
 *
 * The record world is the record-finder lab's (../record-finder/fixtures/world.yaml), imported, never copied.
 * Cases test BEHAVIOUR, never memory structure: an implementation owns its memory (startSession → turn / reply).
 */
import type { Account, World } from "../finder/types";

export type { Account, World };

export type Gender = "female" | "male" | "unknown";
/** The record world plus the gender overlay (fixtures/contact-gender.yaml): contact id → gender, for pronouns only. */
export type LabWorld = World & { genders: Record<string, Gender> };

export type Lang = "zh" | "ja" | "en" | "mixed";
/** "event" covers platform events (E-) and private events (P-). */
export type RecordKind = "contact" | "todo" | "memo" | "schedule" | "event";
export type FollowUpClass = "follow_list" | "repeat" | "adjust" | "swap_period" | "ask_again_about" | "refine" | "correct" | "new";
/** How the scripted fake model answers at a checked turn (SPEC §4): the right hint, no hint, a wrong hint. */
export type HintMode = "correct" | "none" | "wrong";
export const HINT_MODES: HintMode[] = ["correct", "none", "wrong"];

// ---------- the request a turn is about (merged slots) ----------

export interface TimeWindow { from: string; to: string }   // local days YYYY-MM-DD, inclusive (Asia/Tokyo)

export interface Slots {
  kind?: RecordKind;
  verb?: "read" | "create" | "update" | "complete" | "delete" | "link";
  time?: TimeWindow;
  people?: string[];          // contact ids
  topic?: string[];           // content words of the request ("SaaS", "报价")
  place?: string;             // a place the request is limited to ("大阪", "東京")
  status?: "open" | "done";
}

// ---------- what the agent said (scripted; the lab never runs the agent) ----------

/** A question the agent asked and that waits for an answer (an open item). */
export interface Question {
  id: string;                                    // q1, q2 … unique inside a case
  about: "person" | "record" | "field" | "value" | "plan" | "reading" | "intent";
  /** What the question offered: record ids, or fixed choices (plannedDate / dueAt / keep / delete_attendance …). */
  options?: { id: string; label: string }[];
  /** The request it was asked for (what an answer goes on with). */
  for?: Slots;
  writes?: boolean;                              // the request would change a record
}

/** A change card shown and waiting for the click. */
/** target null = a create (the record does not exist yet). */
export interface Card { id: string; op: string; target: string | null; set?: Record<string, string> }
/** A write that was carried out in that turn (the user clicked the card). */
export interface Done { id: string; op: string; target: string | null; set?: Record<string, string> }

export interface AgentReply {
  text: string;
  at: string;
  mentions: string[];       // records the answer named or cited, in the order they appear
  listed: string[];         // the list the answer showed, in display order ([] = no list)
  asks?: Question;
  card?: Card;
  done: Done[];
  answered?: Slots;         // the request this answer served (what "再给我看一次" / "那下周呢" goes back to)
}

// ---------- the fake first-layer model's output (an INPUT hint; code decides) ----------

export type PickResult =
  | { kind: "option"; id: string }
  | { kind: "value"; field: string; value: string }
  | { kind: "unclear" };

export interface HintPart {
  quote: string;                                 // the part's words (a substring of the message)
  clarity?: "clear" | "missing_one" | "none" | "statement";
  continues?: string | null;                     // an open item id (q1 …) or null = new
  followUp?: FollowUpClass;
  refs?: { said: string; kind?: RecordKind; id?: string | null }[];
  slots?: Slots;                                 // the model's reading of the merged request
  pick?: PickResult;
}
export interface ModelHint { parts: HintPart[] }

// ---------- what an implementation returns ----------

export interface RefResult {
  said: string;                                  // the reference words ("她", "第二个", "那篇")
  outcome: "bound" | "ask" | "none";             // bound to one / ask with candidates / nothing to point at
  id?: string;                                   // bound
  candidates?: string[];                         // ask: at most 3
}

export interface PartResult {
  quote: string;
  continues: string | null;                      // the open item (q1 …) this part continues, or null = new
  pick?: PickResult;                             // when it continues a question
  followUp: FollowUpClass | null;                // null when it continues an open item
  refs: RefResult[];
  request: Slots | null;                         // the merged request; null for a bare answer
  next: "go" | "ask" | "deliver";                // go on / ask the user now / asked already: deliver as far as possible
  redo: string[];                                // earlier done writes (Done ids) this part would carry out again
}

export interface TurnResult {
  parts: PartResult[];                           // in message order
  shelved: string[];                             // open items (question ids) put aside this turn
}

export interface TurnInput {
  message: string;
  at: string;                                    // ISO with +09:00
  hint: ModelHint | null;
  gone: string[];                                // records no longer visible (deleted / unshared during the conversation)
}

export interface Session {
  turn(input: TurnInput): TurnResult;
  reply(answer: AgentReply): void;
}

/** One entry of the conversation so far, as the pure functions receive it (the transcript, not a memory). */
export type HistoryEntry =
  | { role: "user"; text: string; at: string; hint: ModelHint | null }
  | ({ role: "agent" } & AgentReply);

export interface FunctionInput {
  message: string;
  at: string;
  account: Account;
  history: HistoryEntry[];
  hint: ModelHint | null;
  gone: string[];
}

export interface BudgetInput {
  asked: number;                                 // questions already asked for this matter
  unrelatedMessages: number;                     // messages since the question that did not continue it (this one included)
  idleMinutes: number;                           // minutes since the previous message
  replyClear: boolean;                           // this message settles what was missing
}
export type Budget = "go" | "ask" | "deliver" | "shelve";

export interface Conversation {
  startSession(world: LabWorld, account: Account, startedAt: string): Session;
  resolveReference(input: FunctionInput & { said: string }, world: LabWorld): RefResult;
  attributeReply(input: FunctionInput & { parts: string[] }, world: LabWorld): (string | null)[];
  pickOptionFromReply(input: FunctionInput & { question: string }, world: LabWorld): PickResult;
  classifyFollowUp(input: FunctionInput, world: LabWorld): FollowUpClass;
  carryOverSlots(input: FunctionInput, world: LabWorld): Slots;
  clarificationBudget(input: BudgetInput): Budget;
}

// ---------- cases (cases/*.yaml) ----------

export interface RefExpect {
  said: string;
  bind?: string;                                 // exactly one of bind / ask / none
  ask?: string[];                                // the question's candidates must include these
  askOnly?: boolean;                             // … and be exactly these
  none?: true;
  never?: string[];                              // must never be bound or offered
}

/** value: field date (YYYY-MM-DD) or time (HH:MM, 24h). */
export interface PickExpect { option?: string; value?: { field: "date" | "time"; value: string }; unclear?: true }

export interface SlotExpect {
  kind?: RecordKind;
  verb?: Slots["verb"];
  time?: TimeWindow | null;                      // null = the request has no time window
  people?: string[] | null;                      // exactly these; null = the request names no person
  topicIncludes?: string[];
  place?: string | null;
  status?: Slots["status"] | null;
}

/** Old values that must NOT be in the merged request (the "误带条件" safety count). */
export interface MustNotCarry { time?: TimeWindow; people?: string[]; kind?: RecordKind; topic?: string[]; place?: string; status?: "open" | "done" }

export interface PartExpect {
  continues?: string | null;
  pick?: PickExpect;
  followUp?: FollowUpClass;
  refs?: RefExpect[];
  request?: SlotExpect;
  mustNotCarry?: MustNotCarry;
  next?: PartResult["next"];
  redo?: string[];                               // default [] (always checked)
}

export interface TurnExpect { parts: PartExpect[]; shelved?: string[] }

export interface UserStep { user: string; idle?: number; hint?: ModelHint; wrongHint?: ModelHint; expect?: TurnExpect; note?: string }
export interface AgentStep {
  agent: string;
  mentions?: string[];
  listed?: string[];
  asks?: Question;
  card?: Card;
  done?: Done[];
  answered?: Slots;
}
export interface GoneStep { gone: string[]; why: "deleted" | "unshared" }
export interface PadStep { pad: number }
export type Step = UserStep | AgentStep | GoneStep | PadStep;

export interface Variant {
  lang: Lang;
  user: string;                                  // replaces the final user message
  said?: string[];                               // replaces the reference words of the final turn's expectations, in order
  parts?: string[];                              // attributeReply: the part quotes of this phrasing
  hint?: ModelHint;
  wrongHint?: ModelHint;
  note?: string;
}

export interface CaseBase {
  id: string;
  example?: boolean;                             // an example from the skeleton (kept in dev)
  intent: string;                                // what the user means and why the expectation holds
  tags: string[];
  lang: Lang;                                    // language of the base phrasing
  account?: Account;                             // default A
  start?: string;                                // time of the first step (default 2026-11-21T14:00:00+09:00)
  turns: Step[];
  variants?: Variant[];                          // more phrasings of the final user message
  modes?: HintMode[];                            // default all three; narrowing needs a note in `intent`
}

export interface ReferenceCase extends CaseBase { fn: "resolveReference"; expect: RefExpect }
export interface AttributeCase extends CaseBase { fn: "attributeReply"; parts: string[]; expect: { continues: (string | null)[] } }
export interface PickCase extends CaseBase { fn: "pickOptionFromReply"; question: string; expect: PickExpect }
export interface FollowUpCase extends CaseBase { fn: "classifyFollowUp"; expect: { followUp: FollowUpClass } }
export interface CarryCase extends CaseBase { fn: "carryOverSlots"; expect: { request: SlotExpect; mustNotCarry?: MustNotCarry } }
export interface BudgetCase extends Omit<CaseBase, "turns"> { fn: "clarificationBudget"; turns?: never; input: BudgetInput; expect: { budget: Budget } }
/** A whole conversation fed turn by turn; expectations sit on user steps (the last user step must have one). */
export interface SessionCase extends CaseBase { fn: "session" }

export type Case = ReferenceCase | AttributeCase | PickCase | FollowUpCase | CarryCase | BudgetCase | SessionCase;
export type Fn = Case["fn"];
export const FNS: Fn[] = ["resolveReference", "attributeReply", "pickOptionFromReply", "classifyFollowUp", "carryOverSlots", "clarificationBudget", "session"];
