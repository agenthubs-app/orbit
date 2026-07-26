import {
  createConfiguredPostgresLiveRecordStore,
  type CreateConfiguredPostgresLiveRecordStoreOptions,
} from "../../../shared/storage/configured-live-record-store";
import {
  createMemoryLiveRecordStore,
} from "../../../shared/storage/live-record-store";
import {
  resolveModuleMode,
  type ModuleMode,
} from "../../../shared/services/module-mode";
import type {
  AgentAutomationRecordPayload,
  AgentAutomationService,
} from "./contract";
import { createStorageAgentAutomationService } from "./service";

const memoryStore =
  createMemoryLiveRecordStore<AgentAutomationRecordPayload>();
const cachedServices = new Map<string, AgentAutomationService>();

export interface CreateAgentAutomationServiceOptions
  extends CreateConfiguredPostgresLiveRecordStoreOptions {
  actorId: string;
  mode?: ModuleMode | string;
}

export function createAgentAutomationService({
  actorId,
  mode: requestedMode,
  ...storeOptions
}: CreateAgentAutomationServiceOptions): AgentAutomationService {
  const mode = resolveModuleMode(requestedMode);
  const normalizedActorId = actorId.trim();
  if (!normalizedActorId) {
    throw new Error("Authenticated actor is required for Agent automations.");
  }
  const configured =
    mode === "live"
      ? createConfiguredPostgresLiveRecordStore<AgentAutomationRecordPayload>(
          storeOptions,
        )
      : null;
  if (mode === "live" && !configured) {
    throw new Error(
      "Live Agent automations require ORBIT_EVENT_DATABASE_URL, ORBIT_LIVE_DATABASE_URL, or ORBIT_DATABASE_URL.",
    );
  }
  const workspaceId = configured?.workspaceId ?? "mock-agent-automations";
  const cacheKey = `${mode}\u0000${workspaceId}\u0000${normalizedActorId}`;
  const cached = cachedServices.get(cacheKey);
  if (cached) return cached;
  const service = createStorageAgentAutomationService({
    actorId: normalizedActorId,
    store: configured?.store ?? memoryStore,
    workspaceId,
  });
  cachedServices.set(cacheKey, service);
  return service;
}

export function resetAgentAutomationServicesForTests(): void {
  cachedServices.clear();
}
