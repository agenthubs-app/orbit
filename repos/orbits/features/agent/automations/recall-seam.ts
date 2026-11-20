/**
 * Where a scheduled rule gets the owner's saved memory from (agent-design AG15; 设计稿 §5.3 with §6: constraints apply
 * with nobody present too).
 *
 * AG14 delivers `recallFor()` (features/agent/memory/recall.ts), callable with an account and the workspace and no
 * session. AG15 was built in parallel with it, so the dispatcher talks to this one function; since the two were
 * merged, `configuredRuleRecall` returns AG14's recall as it is: the standing rules in range (those for every task and
 * those for the kind of task the rule does) and the entries that apply to that kind of task. Nothing is taken when
 * 「回答时参考这些」 is off, and deleted or expired entries never are.
 *
 * The rule run (run-rule.ts) applies it with the same classification a conversation turn uses
 * (domains/memory/turn.ts `rankMemoryFrom`) — it does not filter the entries a second time by their words.
 */
import { emitTrace } from "../../agent-v1/observability/trace";
import type { AgentMemoryService } from "../memory/contract";
import { recallFor, type MemoryRecall, type MemoryRecallTask } from "../memory/recall";

export type RuleMemoryRecall = (input: {
  /** The rule owner's canonical account id. */
  actorId: string;
  workspaceId: string;
  /** What the rule ranks: memory that applies to recommending these. */
  domain: "event" | "contact" | "todo";
  now: string;
  /** The rule's own time zone (an entry's validity is counted in days there); absent: the deployment's default. */
  timeZone?: string;
}) => Promise<MemoryRecall>;

/** The kind of task (AG14's `appliesTo`) a rule over this domain does. */
export const RULE_RECALL_TASK: Record<"event" | "contact" | "todo", MemoryRecallTask> = {
  contact: "contact.recommend",
  event: "event.recommend",
  todo: "todo.plan",
};

/** Nothing recalled (no memory access, or the read failed). */
export const NO_RULE_MEMORY: MemoryRecall = { enabled: false, memoryVersion: 0, relevant: [], rules: [] };

export interface RuleRecallOptions {
  /** The memory service of one account in one workspace (tests); default: the one of the configured database. */
  serviceFor?: (accountId: string, workspaceId: string) => Pick<AgentMemoryService, "snapshot">;
}

/**
 * The recall the dispatcher uses: AG14's recallFor() for the rule's owner — one read of that account's scope at the
 * moment of the run, no session, never a write. A read that fails is traced (`read.error`, where `rule.recall`) and
 * the period is computed without memory rather than not at all.
 */
export function configuredRuleRecall(options: RuleRecallOptions = {}): RuleMemoryRecall {
  return async ({ actorId, domain, now, timeZone, workspaceId }) => {
    try {
      return await recallFor({
        accountId: actorId,
        mode: "live",
        now,
        task: RULE_RECALL_TASK[domain],
        ...(timeZone ? { timeZone } : {}),
        workspaceId,
        ...(options.serviceFor ? { service: options.serviceFor(actorId, workspaceId) } : {}),
      });
    } catch (error) {
      emitTrace({ domain, error: error instanceof Error ? error.message : String(error), ownerId: actorId, type: "read.error", where: "rule.recall" });
      return NO_RULE_MEMORY;
    }
  };
}
