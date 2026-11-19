/**
 * Where a scheduled rule gets the owner's saved memory from (agent-design AG15; 设计稿 §5.3 with §6: constraints apply
 * with nobody present too).
 *
 * AG14 delivers `recallFor()` (features/agent/memory/recall.ts), callable with an account and the workspace and no
 * session. AG15 was built in parallel with it, so the dispatcher talks to this one function; since the two were
 * merged, `configuredRuleRecall` returns AG14's recallFor() mapped to this shape: the standing rules in range (those
 * for every task and those for the kind of task the rule does), then the entries that apply to that kind of task.
 * Nothing is taken when 「回答时参考这些」 is off, and deleted or expired entries never are. The rule run (run-rule.ts)
 * applies what it returns: a constraint is a hard condition, a preference only ranks, and each entry it used is named
 * in the result and traced as `memory.recall` (the id only).
 */
import { emitTrace } from "../../agent-v1/observability/trace";
import type { AgentMemoryService } from "../memory/contract";
import { recallFor, type MemoryRecallTask } from "../memory/recall";

export interface RecalledRuleMemory {
  id: string;
  /** "constraint", "preference", … as the memory contract names them. */
  category: string;
  content: string;
}

export type RuleMemoryRecall = (input: {
  /** The rule owner's canonical account id. */
  actorId: string;
  workspaceId: string;
  /** What the rule ranks: memory that applies to recommending these. */
  domain: "event" | "contact" | "todo";
  now: string;
  /** The rule's own time zone (an entry's validity is counted in days there); absent: the deployment's default. */
  timeZone?: string;
}) => Promise<readonly RecalledRuleMemory[]>;

/** The kind of task (AG14's `appliesTo`) a rule over this domain does. */
const TASK_OF: Record<"event" | "contact" | "todo", MemoryRecallTask> = {
  contact: "contact.recommend",
  event: "event.recommend",
  todo: "todo.plan",
};

export interface RuleRecallOptions {
  /** The memory service of one account in one workspace (tests); default: the one of the configured database. */
  serviceFor?: (accountId: string, workspaceId: string) => Pick<AgentMemoryService, "snapshot">;
}

/**
 * The recall the dispatcher uses: AG14's recallFor() for the rule's owner — one read of that account's scope at the
 * moment of the run, no session. A read that fails is traced (`read.error`, where `rule.recall`) and the period is
 * computed without memory rather than not at all.
 */
export function configuredRuleRecall(options: RuleRecallOptions = {}): RuleMemoryRecall {
  return async ({ actorId, domain, now, timeZone, workspaceId }) => {
    try {
      const recall = await recallFor({
        accountId: actorId,
        mode: "live",
        now,
        task: TASK_OF[domain],
        ...(timeZone ? { timeZone } : {}),
        workspaceId,
        ...(options.serviceFor ? { service: options.serviceFor(actorId, workspaceId) } : {}),
      });
      return [...recall.rules, ...recall.relevant].map((item) => ({ category: item.category, content: item.content, id: item.memoryId }));
    } catch (error) {
      emitTrace({ domain, error: error instanceof Error ? error.message : String(error), ownerId: actorId, type: "read.error", where: "rule.recall" });
      return [];
    }
  };
}
