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
import { createStoreContactAccess } from "../../agent-v1/domains/contact/access";
import type { ContactWriteDeps } from "../../agent-v1/domains/contact/apply";
import { boundContactReader } from "../../agent-v1/domains/contact/types";
import { createContactDeleteService } from "../../contacts/delete/service";
import { createConfiguredManualContactV2Service } from "../../contacts/manual-contact-v2/configured";
import { getConfiguredContactImportService } from "../../contacts/import/runtime";
import { createPrivateEventService } from "../../events/private-events/service";
import { createAttendanceService } from "../../events/attendance-notes/service";
import { createConfiguredPersonalScheduleService } from "../../personal-schedule/service-factory";
import { withCardExpiryTimers } from "../automations/card-expiry";
import { configuredAutomationStorage, createAgentAutomationService } from "../automations/service-factory";

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

function configuredOrNull<T>(make: () => T | null): T | null {
  try {
    return make();
  } catch {
    // Without that storage the runtime serves every other card; those contact items fail and are reported.
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
  // agent-design AG12: the contact items of a card — read for freezing and at the click, written by the contact services.
  const contactAccess = configured && actorId ? createStoreContactAccess({ store: configured.store, workspaceId: configured.workspaceId }) : null;
  const contacts: Omit<ContactWriteDeps, "actorId"> | null = configured && contactAccess && actorId
    ? {
      access: contactAccess,
      deletes: createContactDeleteService({ client: configured.client, workspaceId: configured.workspaceId }),
      imports: configuredOrNull(() => getConfiguredContactImportService({ schedule: (task) => { void task().catch(() => undefined); } })),
      manual: configuredOrNull(() => createConfiguredManualContactV2Service()),
      store: configured.store,
      workspaceId: configured.workspaceId,
    }
    : null;
  // agent-design AG13: private events, «我去过» and schedule items of a card (the same store; link writers lock together).
  const transactional = configured && actorId ? createConfiguredTransactionalPostgresRuntime()?.client ?? null : null;
  const events = configured && actorId
    ? {
      attendance: createAttendanceService({ client: transactional, store: configured.store, workspaceId: configured.workspaceId }),
      privateEvents: createPrivateEventService({ client: transactional, store: configured.store, workspaceId: configured.workspaceId }),
      schedule: configuredOrNull(() => createConfiguredPersonalScheduleService()),
    }
    : null;
  // agent-design AG15: scheduled rules are written by the automation service (the rule and its due-index row together);
  // a card frozen or regenerated here gets its one-off expiry timer in the same index.
  const rules = actorId ? configuredOrNull(() => ({ automations: createAgentAutomationService({ actorId, mode }) })) : null;
  const automationStorage = mode === "live" && actorId ? configuredOrNull(() => configuredAutomationStorage(mode)) : null;
  const executors = createAgentExecutorRegistry([
    // agent-design AG14: the memory items of a card write through the memory service of this account and workspace.
    ...cardWriteExecutors({ actorId, contacts, events, memory: actorId ? createAgentMemoryService({ actorId, mode }) : null, notes, rules, tasks }),
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
  const todoReader = tasks ? createTodoReader(tasks, actorId) : null;
  const contactReader = contactAccess ? boundContactReader(contactAccess, actorId) : null;
  const cardReader = todoReader || contactReader ? { ...(todoReader ?? { read: async () => null }), contacts: contactReader } : null;
  const base = createAgentRuntimeService({ cardReader, executors, repository });
  const timed = automationStorage ? withCardExpiryTimers(base, { ownerId: actorId, storage: automationStorage }) : base;
  const service = mode === "live" && process.env.VERCEL === "1"
    ? withAgentBackgroundDispatch(timed, actorId, enqueueAgentAction)
    : timed;
  cachedServices.set(cacheKey, service);
  return service;
}

export function resetOrbitAgentRuntimeServicesForTests(): void {
  cachedServices.clear();
}
