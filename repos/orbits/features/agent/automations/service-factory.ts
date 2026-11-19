import {
  createConfiguredPostgresLiveRecordStore,
  type CreateConfiguredPostgresLiveRecordStoreOptions,
} from "../../../shared/storage/configured-live-record-store";
import {
  createMemoryLiveRecordStore,
} from "../../../shared/storage/live-record-store";
import { createConfiguredTransactionalPostgresRuntime } from "../../../shared/storage/transactional-postgres";
import {
  resolveModuleMode,
  type ModuleMode,
} from "../../../shared/services/module-mode";
import type {
  AgentAutomationRecordPayload,
  AgentAutomationService,
} from "./contract";
import { createMemoryAutomationStorage, createPostgresAutomationStorage, type AutomationStorage } from "./due-index";
import { createStorageAgentAutomationService } from "./service";

const memoryStore =
  createMemoryLiveRecordStore<AgentAutomationRecordPayload>();
const memoryStorage = createMemoryAutomationStorage("mock-agent-automations", { store: memoryStore as never });
const cachedServices = new Map<string, AgentAutomationService>();
const cachedStorages = new Map<string, AutomationStorage>();

export interface CreateAgentAutomationServiceOptions
  extends CreateConfiguredPostgresLiveRecordStoreOptions {
  actorId: string;
  mode?: ModuleMode | string;
}

/**
 * agent-design AG15: rules, their run history and the due index as one store (one transaction). Live mode needs the
 * transactional database client; null when no database is configured.
 */
export function configuredAutomationStorage(requestedMode?: ModuleMode | string): AutomationStorage | null {
  const mode = resolveModuleMode(requestedMode);
  if (mode !== "live") return memoryStorage;
  const runtime = createConfiguredTransactionalPostgresRuntime();
  if (!runtime) return null;
  const cached = cachedStorages.get(runtime.workspaceId);
  if (cached) return cached;
  const storage = createPostgresAutomationStorage(runtime);
  cachedStorages.set(runtime.workspaceId, storage);
  return storage;
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
  const storage = configuredAutomationStorage(mode);
  const service = createStorageAgentAutomationService({
    actorId: normalizedActorId,
    store: configured?.store ?? memoryStore,
    // AG15: a rule and its row of the due index are one transaction; the dispatcher claims across accounts from it.
    ...(storage && storage.workspaceId === workspaceId ? { storage } : {}),
    workspaceId,
  });
  cachedServices.set(cacheKey, service);
  return service;
}

export function resetAgentAutomationServicesForTests(): void {
  cachedServices.clear();
  cachedStorages.clear();
}
