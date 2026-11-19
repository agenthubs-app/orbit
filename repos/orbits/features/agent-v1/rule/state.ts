/**
 * agent-design AG15: what a scheduled-task request that asked "按什么来挑" keeps until the reply (设计稿 §3.5: a rule
 * runs unattended, so its ranking basis must be on the card; with none said, one question first). Codes, ids and names
 * only — the checkpoint and the session state hold no record text. The scope words are kept as offsets into the part's
 * own words (the open item already keeps those words as its quote).
 */
import type { AgentRuleReference, AgentRuleScope } from "../../agent/automations/contract";
import type { RuleSchedule } from "../domains/rule/ops";

export interface RuleAskState {
  schedule: RuleSchedule;
  scope: AgentRuleScope;
  /** The scope words as [start, end) in the part's own words; null: code words the scope. */
  scopeSpan: [number, number] | null;
  maxItems: number;
  validUntil: string | null;
  push: boolean;
  references: AgentRuleReference[];
}
