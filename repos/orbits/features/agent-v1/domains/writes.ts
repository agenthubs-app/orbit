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
import { contactWriteExecutors, type ContactWriteDeps } from "./contact/apply";
import { eventWriteExecutors, type EventWriteDeps } from "./private-event/apply";
import { memoryWriteExecutors, type MemoryWriteDeps } from "./memory/apply";
import { ruleWriteExecutors, type RuleWriteDeps } from "./rule/apply";

export function cardWriteExecutors(input: { actorId: string; tasks?: (Pick<TaskService, "create" | "update" | "get"> & Partial<Pick<TaskService, "complete" | "reopen" | "delete">>) | null; notes?: Pick<NoteService, "create" | "update"> | null; contacts?: Omit<ContactWriteDeps, "actorId"> | null; events?: Omit<EventWriteDeps, "actorId" | "tasks"> | null; memory?: MemoryWriteDeps["memory"] | null; rules?: RuleWriteDeps | null }): AgentActionExecutor[] {
  return [
    // AG14: memory.create, update, delete (domains/memory/apply.ts).
    ...(input.memory ? memoryWriteExecutors({ memory: input.memory }) : []),
    ...(input.tasks ? todoWriteExecutors({ actorId: input.actorId, tasks: input.tasks }) : []),
    ...(input.notes ? memoWriteExecutors({ actorId: input.actorId, notes: input.notes }) : []),
    // AG12: contact.create, update, delete, restore, import (domains/contact/apply.ts).
    ...(input.contacts ? contactWriteExecutors({ ...input.contacts, actorId: input.actorId }) : []),
    // AG13: private events, «我去过», schedule items, and to-do complete / reopen / delete (domains/private-event/apply.ts).
    ...eventWriteExecutors({ ...(input.events ?? {}), actorId: input.actorId, tasks: input.tasks?.complete && input.tasks.reopen && input.tasks.delete ? (input.tasks as Pick<TaskService, "get" | "complete" | "reopen" | "delete">) : null }),
    // AG15: scheduled rules — create, change, pause, resume, remove (domains/rule/apply.ts).
    ...(input.rules ? ruleWriteExecutors(input.rules) : []),
  ];
}
