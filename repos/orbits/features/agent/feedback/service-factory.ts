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
  AgentFeedbackRecordPayload,
  AgentFeedbackService,
} from "./contract";
import { createStorageAgentFeedbackService } from "./service";

const feedbackStore =
  createMemoryLiveRecordStore<AgentFeedbackRecordPayload>();
const cachedServices = new Map<string, AgentFeedbackService>();

export function createAgentFeedbackService(
  input: CreateConfiguredPostgresLiveRecordStoreOptions & {
    actorId: string;
    mode?: ModuleMode | string;
  },
): AgentFeedbackService {
  const mode = resolveModuleMode(input.mode);
  const actorId = input.actorId.trim();
  if (!actorId) {
    throw new Error("Authenticated actor is required for Agent feedback.");
  }
  const configured =
    mode === "live"
      ? createConfiguredPostgresLiveRecordStore<AgentFeedbackRecordPayload>(
          input,
        )
      : null;
  if (mode === "live" && !configured) {
    throw new Error(
      "Live Agent feedback requires a configured Orbit database.",
    );
  }
  const workspaceId = configured?.workspaceId ?? "mock-agent-feedback";
  const cacheKey = `${mode}\u0000${workspaceId}\u0000${actorId}`;
  const cached = cachedServices.get(cacheKey);
  if (cached) return cached;
  const service = createStorageAgentFeedbackService({
    actorId,
    store: configured?.store ?? feedbackStore,
    workspaceId,
  });
  cachedServices.set(cacheKey, service);
  return service;
}

export function resetAgentFeedbackServicesForTests(): void {
  cachedServices.clear();
}
