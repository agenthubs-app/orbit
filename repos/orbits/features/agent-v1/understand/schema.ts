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

export interface UnderstandPart {
  localId: string;
  sourceQuote: string;
  goal: string;
  clarity: Clarity;
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
}

export interface UnderstandOutput {
  plainChat: boolean;
  reply?: string;
  parts: UnderstandPart[];
}

export { CAPABILITIES };
export type { Capability };
