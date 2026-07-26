import {
  createConfiguredPostgresLiveRecordStore,
  type CreateConfiguredPostgresLiveRecordStoreOptions,
} from "../../../shared/storage/configured-live-record-store";
import { createMemoryLiveRecordStore } from "../../../shared/storage/live-record-store";
import type {
  AgentOperationsRecordPayload,
  AgentOperationsService,
} from "./contract";
import { createStorageAgentOperationsService } from "./service";

const memoryStore =
  createMemoryLiveRecordStore<AgentOperationsRecordPayload>();
const cachedServices = new Map<string, AgentOperationsService>();

export function createAgentOperationsService(
  input: CreateConfiguredPostgresLiveRecordStoreOptions & {
    actorId: string;
  },
): AgentOperationsService {
  const actorId = input.actorId.trim();
  if (!actorId) {
    throw new Error(
      "Authenticated actor is required for Agent operations health.",
    );
  }
  const configured =
    createConfiguredPostgresLiveRecordStore<AgentOperationsRecordPayload>(
      input,
    );
  const workspaceId =
    configured?.workspaceId ?? "local-agent-operations";
  const cacheKey = `${workspaceId}\u0000${actorId}`;
  const cached = cachedServices.get(cacheKey);
  if (cached) return cached;
  const service = createStorageAgentOperationsService({
    actorId,
    store: configured?.store ?? memoryStore,
    workspaceId,
  });
  cachedServices.set(cacheKey, service);
  return service;
}

export function resetAgentOperationsServicesForTests(): void {
  cachedServices.clear();
}
