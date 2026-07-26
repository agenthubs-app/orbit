import { createConfiguredStorageEventStoreProvider } from "../../events/event-crud-and-import/providers/storage-event-provider";
import { createConfiguredStorageFollowupTaskProvider } from "../../followups/storage/followup-live-record-provider";
import {
  createConfiguredPostgresLiveRecordStore,
  type CreateConfiguredPostgresLiveRecordStoreOptions,
} from "../../../shared/storage/configured-live-record-store";
import { resolveModuleMode, type ModuleMode } from "../../../shared/services/module-mode";
import { createMemoryLiveRecordStore } from "../../../shared/storage/live-record-store";
import type {
  AgentSignalRecordPayload,
  AgentSignalService,
} from "./contract";
import { createAgentSignalSourceCollector } from "./source-collector";
import { createStorageAgentSignalService } from "./service";

const memoryStore = createMemoryLiveRecordStore<AgentSignalRecordPayload>();
const cachedServices = new Map<string, AgentSignalService>();

export interface CreateAgentSignalServiceOptions
  extends CreateConfiguredPostgresLiveRecordStoreOptions {
  actorId: string;
  mode?: ModuleMode | string;
}

export function createAgentSignalService({
  actorId,
  mode: requestedMode,
  ...storeOptions
}: CreateAgentSignalServiceOptions): AgentSignalService {
  const mode = resolveModuleMode(requestedMode);
  const normalizedActorId = actorId.trim();
  if (!normalizedActorId) {
    throw new Error("Authenticated actor is required for Agent signals.");
  }
  const configured =
    mode === "live"
      ? createConfiguredPostgresLiveRecordStore<AgentSignalRecordPayload>(
          storeOptions,
        )
      : null;
  if (mode === "live" && !configured) {
    throw new Error(
      "Live Agent signals require ORBIT_EVENT_DATABASE_URL, ORBIT_LIVE_DATABASE_URL, or ORBIT_DATABASE_URL.",
    );
  }
  const workspaceId = configured?.workspaceId ?? "mock-agent-signals";
  const cacheKey = `${mode}\u0000${workspaceId}\u0000${normalizedActorId}`;
  const cached = cachedServices.get(cacheKey);
  if (cached) return cached;
  const collector = createAgentSignalSourceCollector({
    eventProvider:
      mode === "live" ? createConfiguredStorageEventStoreProvider() : null,
    followupProvider:
      mode === "live"
        ? createConfiguredStorageFollowupTaskProvider()
        : null,
  });
  const service = createStorageAgentSignalService({
    actorId: normalizedActorId,
    collect: () => collector.collect(),
    store: configured?.store ?? memoryStore,
    workspaceId,
  });
  cachedServices.set(cacheKey, service);
  return service;
}

export function resetAgentSignalServicesForTests(): void {
  cachedServices.clear();
}
