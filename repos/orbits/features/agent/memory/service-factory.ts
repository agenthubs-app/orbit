import {
  createConfiguredPostgresLiveRecordStore,
  type CreateConfiguredPostgresLiveRecordStoreOptions,
} from "../../../shared/storage/configured-live-record-store";
import { createMemoryLiveRecordStore } from "../../../shared/storage/live-record-store";
import {
  resolveModuleMode,
  type ModuleMode,
} from "../../../shared/services/module-mode";
import type {
  AgentMemoryRecordPayload,
  AgentMemoryService,
} from "./contract";
import { createStorageAgentMemoryService } from "./service";

const memoryStore = createMemoryLiveRecordStore<AgentMemoryRecordPayload>();
const cachedServices = new Map<string, AgentMemoryService>();

export interface CreateAgentMemoryServiceOptions
  extends CreateConfiguredPostgresLiveRecordStoreOptions {
  actorId: string;
  mode?: ModuleMode | string;
}

export function createAgentMemoryService({
  actorId,
  mode: requestedMode,
  ...storeOptions
}: CreateAgentMemoryServiceOptions): AgentMemoryService {
  const mode = resolveModuleMode(requestedMode);
  const normalizedActorId = actorId.trim();
  if (!normalizedActorId) {
    throw new Error("Authenticated actor is required for Agent memory.");
  }
  const configured =
    mode === "live"
      ? createConfiguredPostgresLiveRecordStore<AgentMemoryRecordPayload>(
          storeOptions,
        )
      : null;
  if (mode === "live" && !configured) {
    throw new Error(
      "Live Agent memory requires ORBIT_EVENT_DATABASE_URL, ORBIT_LIVE_DATABASE_URL, or ORBIT_DATABASE_URL.",
    );
  }
  const workspaceId = configured?.workspaceId ?? "mock-agent-memory";
  const cacheKey = `${mode}\u0000${workspaceId}\u0000${normalizedActorId}`;
  const cached = cachedServices.get(cacheKey);
  if (cached) return cached;
  const service = createStorageAgentMemoryService({
    actorId: normalizedActorId,
    store: configured?.store ?? memoryStore,
    workspaceId,
  });
  cachedServices.set(cacheKey, service);
  return service;
}

export function resetAgentMemoryServicesForTests(): void {
  cachedServices.clear();
}
