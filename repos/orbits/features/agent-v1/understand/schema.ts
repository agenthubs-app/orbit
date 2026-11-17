/**
 * The first layer's output (设计稿附录 C `UnderstandOutput`, agent-design AG03).
 *
 * The model proposes parts with their capabilities, data sources and deliverable; it never decides
 * where a part goes. `verdict`, `route` and `waitReason` are computed by code (route/decide.ts),
 * and fields of that kind in the model's output are dropped by the validator.
 */
import { CAPABILITIES, type Capability } from "../route/capabilities";

export const CLARITIES = ["clear", "missing_one", "multiple_readings", "statement", "none"] as const;
export type Clarity = (typeof CLARITIES)[number];

export const DATA_SOURCES = ["turn_material", "orbit_records", "public_web"] as const;
export type DataSource = (typeof DATA_SOURCES)[number];

export const DELIVERABLES = ["answer", "list", "ranked_list", "comparison", "summary", "change", "rule", "memory_change"] as const;
export type Deliverable = (typeof DELIVERABLES)[number];

export const ENTITIES = ["contact", "event", "attendance", "todo", "memo", "schedule", "rule", "memory"] as const;
export type Entity = (typeof ENTITIES)[number];

export const INTENT_BASES = ["instruction", "selection", "accepted_context"] as const;
export type IntentBasis = (typeof INTENT_BASES)[number];

export const CONTINUE_KINDS = ["clarification", "card", "pending_external", "alternative"] as const;
export type ContinueKind = (typeof CONTINUE_KINDS)[number];

/**
 * Two signals 附录 C does not name but §3.1 needs to decide by code (登记 in the AG03 REPORT):
 * - `dataOwner: "other_user"` — the part asks for data that belongs to another Orbit user
 *   (decline, `explain_limit`; never a detour).
 * - `persistence: "until_satisfied"` — the user asks Orbit to keep going without an end
 *   ("一直找下去"); Orbit offers a bounded alternative and waits for acceptance.
 */
export const DATA_OWNERS = ["self", "other_user"] as const;
export type DataOwner = (typeof DATA_OWNERS)[number];
export const PERSISTENCES = ["this_turn", "until_satisfied"] as const;
export type Persistence = (typeof PERSISTENCES)[number];

export interface ObjectClue {
  entity: Entity;
  /** The words of this turn that point at the object ("他", "第二个", "那篇笔记", "@田中浩"). */
  text: string;
  /** A handle the context gave (r1, r2 …), resolved by code to a record ref. */
  referenceId?: string;
}

/**
 * AG04 (附录 C `readings`, at most 3): what an unclear part could mean. Code uses the capabilities and
 * the deliverable only to pick a reading or build a clickable direction; the model's `label` is never
 * shown (clarify/options.ts writes the words). A reading with a capability outside 附录 A is dropped.
 */
export interface UnderstandReading {
  label: string;
  deliverable: Deliverable;
  capabilities: Capability[];
}

export const MAX_READINGS = 3;

/**
 * AG05: how a part that reads records narrows its read (附录 C has no field for it; 登记 in the AG05
 * REPORT). Code compiles the read request from it; anything invalid is dropped, never a reason to
 * reject the output.
 * - `text`: words to look for in titles and bodies, copied from the CURRENT message (a topic, a title).
 * - `order`: newest (default), oldest ("the first time"), both (then and now).
 * - `status`: open / completed (to-dos).
 * - `from`/`to`: a date range, YYYY-MM-DD, both inclusive, resolved from the message and today's date.
 */
export const READ_ORDERS = ["newest", "oldest", "both"] as const;
export type ReadOrder = (typeof READ_ORDERS)[number];
export const READ_STATUSES = ["open", "completed"] as const;

export interface ReadFilter {
  text?: string;
  order?: ReadOrder;
  status?: (typeof READ_STATUSES)[number];
  from?: string;
  to?: string;
  /** AG05 run-03: the part asks how the person stands now (where, what they do, how they are lately). */
  current?: true;
}

/**
 * AG08 (附录 C `rankingBasis`, with what code needs to rank by itself; 登记 in the AG08 REPORT): a part that picks
 * or orders records. Words are copied from the CURRENT message; code checks them and decides from them whether
 * the order needs the judgment model (a basis to understand) or only a field (no judgment, AG08-2).
 * - `count`: how many the user wants (absent: all, up to code's list limit).
 * - `basis`: what makes one fit (a topic, a purpose) — 附录 C rankingBasis with source "turn".
 * - `within`: words that limit which records count (a place, an industry); dates stay in readFilter.
 * - `orderBy` / `direction`: a record field the user orders by.
 */
export const RANK_FIELDS = ["startsAt", "lastInteraction", "dueAt", "plannedDate"] as const;
export type RankField = (typeof RANK_FIELDS)[number];
export interface RankSpec {
  count?: number;
  basis?: string;
  within?: string;
  orderBy?: RankField;
  direction?: "asc" | "desc";
}

/**
 * AG09 (附录 C `webTarget`; 设计稿 §3.4 rule 1): what a web.search part looks up — the words of the CURRENT message that
 * name the public object (`quote`, checked to be a substring) and qualifier codes of the fixed vocabulary
 * (web/vocabulary.ts). Code builds the query from these two (web/query.ts); the model never writes a query.
 */
export interface WebTargetSpec {
  quote?: string;
  qualifiers: string[];
}

export interface UnderstandPart {
  localId: string;
  sourceQuote: string;
  goal: string;
  clarity: Clarity;
  readings?: UnderstandReading[];
  continues?: { kind: ContinueKind; ref: string };
  objectClues: ObjectClue[];
  constraints: string[];
  dependsOn: string[];
  requiredCapabilities: Capability[];
  dataSources: DataSource[];
  deliverable: Deliverable;
  intentBasis: IntentBasis;
  dataOwner: DataOwner;
  persistence: Persistence;
  /** AG05: the read's narrowing (see ReadFilter). */
  readFilter?: ReadFilter;
  /** AG08: picking or ordering records (see RankSpec). */
  rank?: RankSpec;
  /** AG09: what to look up on the public web (see WebTargetSpec). */
  webTarget?: WebTargetSpec;
}

export interface UnderstandOutput {
  /**
   * AG06 (附录 C has no field for it; 登记 in the AG06 REPORT): the language the CURRENT message is written in
   * (its grammar, not the names or loanwords in it). Code checks it against the text (replyLanguageOf).
   */
  language?: "zh" | "ja" | "en";
  plainChat: boolean;
  reply?: string;
  parts: UnderstandPart[];
}

export { CAPABILITIES };
export type { Capability };
