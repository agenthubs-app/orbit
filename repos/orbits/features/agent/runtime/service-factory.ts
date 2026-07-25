import { createStorageContactArchiveActionWriter } from "../../contacts/action-writer";
import { createStorageEventActionWriter } from "../../events/action-writer";
import { createEventMatchmakingService } from "../../events/matchmaking/service";
import { createStorageFollowupActionWriter } from "../../followups/action-writer";
import { createStorageReminderActionWriter } from "../../notifications/action-writer";
import { createConfiguredOrbitIntegrationService } from "../../integrations/service-factory";
import { resolveModuleMode, type ModuleMode } from "../../../shared/services/module-mode";
import { createConfiguredPostgresLiveRecordStore } from "../../../shared/storage/configured-live-record-store";
import { createMemoryLiveRecordStore } from "../../../shared/storage/live-record-store";
import { createStorageAgentRuntimeRepository } from "../storage/agent-runtime-live-record-provider";
import { createAgentDomainExecutors } from "./domain-executors";
import { createAgentExecutorRegistry } from "./executor-registry";
import { createAgentRuntimeService, type AgentRuntimeService } from "./service";

interface OrbitAgentRuntimeGlobal {
  __orbitAgentRuntimeServices?: Map<ModuleMode, AgentRuntimeService>;
}

const runtimeGlobal = globalThis as typeof globalThis & OrbitAgentRuntimeGlobal;
const cachedServices =
  runtimeGlobal.__orbitAgentRuntimeServices ??
  (runtimeGlobal.__orbitAgentRuntimeServices = new Map<
    ModuleMode,
    AgentRuntimeService
  >());

export function createOrbitAgentRuntimeService(
  requestedMode?: ModuleMode | string,
): AgentRuntimeService {
  const mode = resolveModuleMode(requestedMode);
  const cached = cachedServices.get(mode);
  if (cached) return cached;

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
  const repository = createStorageAgentRuntimeRepository({
    sqlClient: configured?.client,
    store: store as Parameters<
      typeof createStorageAgentRuntimeRepository
    >[0]["store"],
    workspaceId,
  });
  const integrations =
    mode === "live" ? createConfiguredOrbitIntegrationService() : null;
  const executors = createAgentExecutorRegistry(
    createAgentDomainExecutors({
      contacts: createStorageContactArchiveActionWriter({
        store,
        workspaceId,
      }),
      events: createStorageEventActionWriter({ store, workspaceId }),
      followups: createStorageFollowupActionWriter({ store, workspaceId }),
      notifications: createStorageReminderActionWriter({
        store,
        workspaceId,
      }),
      matchmaking: createEventMatchmakingService({ store, workspaceId }),
      calendar: integrations
        ? {
            createEvent: async (payload, idempotencyKey) => {
              const provider =
                payload.provider === "microsoft_graph"
                  ? "microsoft_graph"
                  : "google_calendar";
              return integrations.createCalendarEvent({
                provider,
                payload,
                idempotencyKey,
              });
            },
          }
        : undefined,
    }),
  );
  const service = createAgentRuntimeService({ executors, repository });
  cachedServices.set(mode, service);
  return service;
}

export function resetOrbitAgentRuntimeServicesForTests(): void {
  cachedServices.clear();
}
