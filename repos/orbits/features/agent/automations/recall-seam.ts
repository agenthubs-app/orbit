/**
 * Where a scheduled rule gets the owner's saved memory from (agent-design AG15; 设计稿 §5.3 with §6: constraints apply
 * with nobody present too).
 *
 * AG14 delivers `recallFor()` (features/agent/memory/recall.ts), callable with an account and the workspace and no
 * session. AG15 was built in parallel with it, so the dispatcher talks to this one function. Until the two are merged
 * nothing is recalled here; at the merge, `configuredRuleRecall` returns AG14's recallFor() mapped to this shape
 * (constraints always, preferences by domain). The rule run (run-rule.ts) already applies what it returns: a constraint
 * is a hard condition, a preference only ranks, and each recalled entry is named in the result and traced as
 * `memory.recall`.
 */
export interface RecalledRuleMemory {
  id: string;
  /** "constraint", "preference", … as the memory contract names them. */
  category: string;
  content: string;
}

export type RuleMemoryRecall = (input: {
  actorId: string;
  workspaceId: string;
  /** What the rule ranks: memory that applies to recommending these. */
  domain: "event" | "contact" | "todo";
  now: string;
}) => Promise<readonly RecalledRuleMemory[]>;

/** The recall the dispatcher uses. Returns nothing until AG14's recallFor() is connected here. */
export function configuredRuleRecall(): RuleMemoryRecall {
  return async () => [];
}
