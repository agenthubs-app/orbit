/**
 * agent-design AG02 test kit (not a test file): a real ledger service over a live-record store —
 * memory by default, Postgres when a client is given — with the to-do service, the two to-do
 * executors and a fixed clock the test moves. Counts every executor call.
 */
import { createStorageAgentRuntimeRepository } from "../../features/agent/storage/agent-runtime-live-record-provider";
import { createAgentExecutorRegistry, type AgentActionExecutor } from "../../features/agent/runtime/executor-registry";
import { createAgentRuntimeService } from "../../features/agent/runtime/service";
import { createTodoExecutors, createTodoReader } from "../../features/agent/runtime/todo-operations";
import { cardWriteExecutors } from "../../features/agent-v1/domains/writes";
import { createNoteRepository } from "../../features/notes/repository";
import { createNoteService } from "../../features/notes/service";
import { createTaskRepository } from "../../features/tasks/repository";
import { createTaskService } from "../../features/tasks/service";
import { createMemoryLiveRecordStore, type LiveRecordStoreLike } from "../../shared/storage/live-record-store";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import type { TransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { createPrivateEventService } from "../../features/events/private-events/service";
import { createAttendanceService } from "../../features/events/attendance-notes/service";
import { createPersonalScheduleService } from "../../features/personal-schedule/service";

export const ACTOR = "user_agent_ledger_a";

export function createCardKit(options: { client?: TransactionalPostgresClient; workspaceId?: string; start?: string; wrapExecutor?: (executor: AgentActionExecutor) => AgentActionExecutor; legacyTodoExecutors?: boolean } = {}) {
  const workspaceId = options.workspaceId ?? "workspace:agent-ledger-test";
  const store = (options.client
    ? createPostgresLiveRecordStore({ client: options.client as never })
    : createMemoryLiveRecordStore<Record<string, unknown>>()) as LiveRecordStoreLike<Record<string, unknown>>;
  let clock = Date.parse(options.start ?? "2026-11-15T01:00:00.000Z");
  const now = () => {
    clock += 1;
    return new Date(clock).toISOString();
  };
  const tasks = createTaskService({ repository: createTaskRepository({ store, transactionClient: options.client, workspaceId }) });
  // AG06: the note service the memo executor writes through (no association reader: every id is accessible).
  const notes = createNoteService({ repository: createNoteRepository({ store, workspaceId }) });
  // AG13: private events, «我去过» and schedule items over the same store.
  const privateEvents = createPrivateEventService({ client: options.client ?? null, now, store, workspaceId });
  const attendance = createAttendanceService({ client: options.client ?? null, now, store, workspaceId });
  const schedule = createPersonalScheduleService({ ...(options.client ? { client: options.client } : {}), now, store, workspaceId });
  const executorCalls: { key: string; idempotencyKey: string }[] = [];
  // AG06: the product's card executors (features/agent-v1/domains/writes.ts); AG02's to-do executors are kept for the old kit option.
  const plainExecutors = options.legacyTodoExecutors ? createTodoExecutors({ actorId: ACTOR, tasks }) : cardWriteExecutors({ actorId: ACTOR, events: { attendance, privateEvents, schedule }, notes, tasks });
  const executors = plainExecutors.map((plain) => {
    const executor = options.wrapExecutor ? options.wrapExecutor(plain) : plain;
    const counted: AgentActionExecutor = {
      ...executor,
      execute: async (payload, context) => {
        executorCalls.push({ idempotencyKey: context.idempotencyKey, key: executor.key });
        return executor.execute(payload, context);
      },
    };
    return counted;
  });
  const repository = createStorageAgentRuntimeRepository({
    ...(options.client ? { sqlClient: options.client as never, transactionClient: options.client } : {}),
    store: store as never,
    workspaceId: `${workspaceId}:agent-actor:${ACTOR}`,
  });
  const runtime = createAgentRuntimeService({ cardReader: createTodoReader(tasks, ACTOR), executors: createAgentExecutorRegistry(executors), now, repository });
  return {
    advance(ms: number) {
      clock += ms;
    },
    attendance,
    executorCalls,
    notes,
    now,
    privateEvents,
    schedule,
    repository,
    runtime,
    store,
    tasks,
    async todo(title: string, plannedDate?: string) {
      const created = await tasks.create({ actorId: ACTOR, category: "work", idempotencyKey: `fixture:${title}`, now: now(), title, ...(plannedDate ? { plannedDate } : {}) });
      return created.task;
    },
    async listTasks() {
      return tasks.list({ actorId: ACTOR });
    },
    workspaceId,
  };
}

export type CardKit = ReturnType<typeof createCardKit>;

export async function freeze(kit: CardKit, intents: Parameters<NonNullable<CardKit["runtime"]["freezeCard"]>>[0]["intents"], actionId = `action:test:${Math.random().toString(36).slice(2)}`, locale = "zh") {
  const frozen = await kit.runtime.freezeCard!({ actionId, intents, locale, origin: { conversationId: "session:test", kind: "conversation", requestId: `request:${actionId}` } });
  if (!frozen.action) throw new Error("card was not frozen");
  return frozen.action;
}

export function decide(kit: CardKit, action: { actionId: string; revision?: number; payloadHash?: string }, decision: "confirm" | "reject" | "retry" | "mark_done" | "abandon", clientDecisionId: string, extra: { operationId?: string; revision?: number; payloadHash?: string } = {}) {
  return kit.runtime.decideAction!({
    actionId: action.actionId,
    clientDecisionId,
    decision,
    payloadHash: extra.payloadHash ?? action.payloadHash ?? "",
    revision: extra.revision ?? action.revision ?? 1,
    ...(extra.operationId ? { operationId: extra.operationId } : {}),
  });
}
