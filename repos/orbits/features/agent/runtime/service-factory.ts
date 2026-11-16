import { enqueueAgentAction } from "./action-queue";
import { withAgentBackgroundDispatch } from "./background-dispatch";
import { createStorageContactArchiveActionWriter } from "../../contacts/action-writer";
import { createStorageEventActionWriter } from "../../events/action-writer";
import { createEventMatchmakingService } from "../../events/matchmaking/service";
import { createStorageFollowupActionWriter } from "../../followups/action-writer";
import { createStorageReminderActionWriter } from "../../notifications/action-writer";
import { createConfiguredOrbitIntegrationService } from "../../integrations/service-factory";
import { createAgentMemoryService } from "../memory/service-factory";
import {
  resolveModuleMode,
  type ModuleMode,
} from "../../../shared/services/module-mode";
import { createConfiguredPostgresLiveRecordStore } from "../../../shared/storage/configured-live-record-store";
import { createMemoryLiveRecordStore } from "../../../shared/storage/live-record-store";
import { createStorageAgentRuntimeRepository } from "../storage/agent-runtime-live-record-provider";
import { createAgentCalendarExecutorAdapter } from "./calendar-executor-adapter";
import { createAgentDomainExecutors } from "./domain-executors";
import { createAgentExecutorRegistry } from "./executor-registry";
import { createAgentRuntimeService, type AgentRuntimeService } from "./service";
import { createTodoReader } from "./todo-operations";
import { createConfiguredTaskService } from "../../tasks/service-factory";
import { createConfiguredNoteService } from "../../notes/service-factory";
import { cardWriteExecutors } from "../../agent-v1/domains/writes";
import { createConfiguredTransactionalPostgresRuntime } from "../../../shared/storage/transactional-postgres";

interface OrbitAgentRuntimeGlobal {
  __orbitAgentRuntimeServices?: Map<string, AgentRuntimeService>;
  __orbitAgentRuntimeServicesVersion?: number;
}

const runtimeGlobal = globalThis as typeof globalThis & OrbitAgentRuntimeGlobal;
const RUNTIME_SERVICE_CACHE_VERSION = 4;
if (
  runtimeGlobal.__orbitAgentRuntimeServicesVersion !==
  RUNTIME_SERVICE_CACHE_VERSION
) {
  runtimeGlobal.__orbitAgentRuntimeServices?.clear();
  runtimeGlobal.__orbitAgentRuntimeServicesVersion =
    RUNTIME_SERVICE_CACHE_VERSION;
}
const cachedServices =
  runtimeGlobal.__orbitAgentRuntimeServices ??
  (runtimeGlobal.__orbitAgentRuntimeServices = new Map<
    string,
    AgentRuntimeService
  >());

export interface OrbitAgentRuntimeActorContext {
  /**
   * The authenticated server-side actor. This value must never be copied from
   * an untrusted request body.
   */
  actorId: string;
}

function configuredTasksOrNull(): ReturnType<typeof createConfiguredTaskService> | null {
  try {
    return createConfiguredTaskService();
  } catch {
    // Without to-do storage the runtime still serves every other card; to-do cards cannot be made.
    return null;
  }
}

function configuredNotesOrNull(): ReturnType<typeof createConfiguredNoteService> | null {
  try {
    return createConfiguredNoteService();
  } catch {
    // Without note storage, memo items of a card cannot run (they fail and are reported); nothing else changes.
    return null;
  }
}

export function createOrbitAgentRuntimeService(
  requestedMode?: ModuleMode | string,
  actorContext?: OrbitAgentRuntimeActorContext,
): AgentRuntimeService {
  const mode = resolveModuleMode(requestedMode);
  const actorId = actorContext?.actorId.trim() ?? "";
  if (mode === "live" && !actorId) {
    throw new Error(
      "Live Orbit Agent runtime requires an authenticated actor context.",
    );
  }

  const configured =
    mode === "live" ? createConfiguredPostgresLiveRecordStore() : null;
  if (mode === "live" && !configured) {
    throw new Error(
      "Live Orbit Agent runtime requires ORBIT_EVENT_DATABASE_URL, ORBIT_LIVE_DATABASE_URL, or ORBIT_DATABASE_URL.",
    );
  }
  const store =
    configured?.store ?? createMemoryLiveRecordStore<Record<string, unknown>>();
  const workspaceId = configured?.workspaceId ?? "mock-agent-runtime";
  const agentWorkspaceId = actorId
    ? `${workspaceId}:agent-actor:${actorId}`
    : workspaceId;
  const cacheKey = `${mode}\u0000${agentWorkspaceId}`;
  const cached = cachedServices.get(cacheKey);
  if (cached) return cached;
  const repository = createStorageAgentRuntimeRepository({
    sqlClient: configured?.client,
    store: store as Parameters<
      typeof createStorageAgentRuntimeRepository
    >[0]["store"],
    // agent-design AG02: approvals, decisions and card revisions are one transaction each.
    transactionClient: mode === "live" ? createConfiguredTransactionalPostgresRuntime()?.client : undefined,
    workspaceId: agentWorkspaceId,
  });
  // agent-design AG02: the to-do create and update executors and the reader the card checks use.
  const tasks = mode === "live" && actorId ? configuredTasksOrNull() : null;
  const integrations =
    mode === "live"
      ? createConfiguredOrbitIntegrationService({ actorId })
      : null;
  // agent-design AG06: the conversation cards' executors (todo.create, todo.update, memo.create) come from the
  // agent-v1 domain write adapters; memos are written through the note service with extraction suppressed.
  const notes = mode === "live" && actorId ? configuredNotesOrNull() : null;
  const executors = createAgentExecutorRegistry([
    ...cardWriteExecutors({ actorId, notes, tasks }),
    ...createAgentDomainExecutors({
      contacts: createStorageContactArchiveActionWriter({
        store,
        workspaceId,
      }),
      events: createStorageEventActionWriter({
        store,
        userId: actorId || null,
        workspaceId,
      }),
      followups: createStorageFollowupActionWriter({
        store,
        userId: actorId || null,
        workspaceId,
      }),
      notifications: createStorageReminderActionWriter({
        store,
        userId: actorId || null,
        workspaceId,
      }),
      matchmaking: createEventMatchmakingService({ store, workspaceId }),
      memory: createAgentMemoryService({
        actorId: actorId || "mock-agent-runtime",
        mode,
      }),
      calendar: integrations
        ? createAgentCalendarExecutorAdapter(integrations)
        : undefined,
    }),
  ]);
  const base = createAgentRuntimeService({ cardReader: tasks ? createTodoReader(tasks, actorId) : null, executors, repository });
  const service = mode === "live" && process.env.VERCEL === "1"
    ? withAgentBackgroundDispatch(base, actorId, enqueueAgentAction)
    : base;
  cachedServices.set(cacheKey, service);
  return service;
}

export function resetOrbitAgentRuntimeServicesForTests(): void {
  cachedServices.clear();
}
