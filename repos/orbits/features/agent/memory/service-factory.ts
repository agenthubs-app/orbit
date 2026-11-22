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
  /**
   * agent-design AG14 (设计稿 §6 账号一致性): the canonical account id — `resolveAuthenticatedApiActor().id`. The
   * settings page, the conversation, a resumed conversation and background runs all pass the same one.
   */
  actorId: string;
  mode?: ModuleMode | string;
  /**
   * The workspace of the resolved identity (`AuthenticatedApiActor.workspaceId`). Absent (background callers that hold
   * no request identity): the deployment's workspace, which is what the identity resolver returns today.
   */
  workspaceId?: string;
}

export function createAgentMemoryService({
  actorId,
  mode: requestedMode,
  workspaceId: identityWorkspaceId,
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
  // The scope is the account and the workspace of the resolved identity. In live mode that workspace is the one the
  // store is configured for (the identity resolver reads the same configuration); one cached service per scope, so
  // an account never gets the instance, or the entries, of another.
  const workspaceId = configured?.workspaceId ?? "mock-agent-memory";
  if (mode === "live" && identityWorkspaceId?.trim() && identityWorkspaceId.trim() !== workspaceId) {
    throw new Error("Agent memory was asked for a workspace this deployment does not serve.");
  }
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
