/**
 * The write side of the domain registry (设计稿附录 B; agent-design AG06): the executors of the new entry's
 * conversation cards, one per key of AGENT_V1_CARD_EXECUTOR_KEYS. A domain whose service is not configured
 * contributes none (its cards then fail to execute rather than write elsewhere).
 */
import type { AgentActionExecutor } from "../../agent/runtime/executor-registry";
import type { NoteService } from "../../notes/service";
import type { TaskService } from "../../tasks/service";
import { memoWriteExecutors } from "./memo/write";
import { todoWriteExecutors } from "./todo/write";

export function cardWriteExecutors(input: { actorId: string; tasks?: Pick<TaskService, "create" | "update" | "get"> | null; notes?: Pick<NoteService, "create"> | null }): AgentActionExecutor[] {
  return [
    ...(input.tasks ? todoWriteExecutors({ actorId: input.actorId, tasks: input.tasks }) : []),
    ...(input.notes ? memoWriteExecutors({ actorId: input.actorId, notes: input.notes }) : []),
  ];
}
