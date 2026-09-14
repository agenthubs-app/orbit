import type { FeatureMode } from "../../../shared/config/feature-mode";
import { createMemoryLiveRecordStore } from "../../../shared/storage/live-record-store";
import { createConfiguredTransactionalPostgresRuntime } from "../../../shared/storage/transactional-postgres";
import {
  createMemoryOrbitAgentChatOrganizationStore,
  createTransactionalOrbitAgentChatOrganizationStore,
  type OrbitAgentChatOrganizationStore,
} from "./orbit-agent-chat-session-transactions";

const memoryRecords = createMemoryLiveRecordStore<Record<string, unknown>>();
const memoryStores = new Map<string, OrbitAgentChatOrganizationStore>();
const liveStores = new Map<string, OrbitAgentChatOrganizationStore>();

export function createOrbitAgentChatOrganizationStore(
  mode: FeatureMode,
  actorId: string,
): OrbitAgentChatOrganizationStore | null {
  const normalizedActorId = actorId.trim();
  if (!normalizedActorId) {
    throw new Error("Orbit Agent organization requires an authenticated actor");
  }
  const key = `${mode}\u0000${normalizedActorId}`;
  if (mode === "mock" || mode === "hybrid") {
    const existing = memoryStores.get(key);
    if (existing) return existing;
    const created = createMemoryOrbitAgentChatOrganizationStore({
      actorId: normalizedActorId,
      store: memoryRecords,
      workspaceId: "workspace:mock",
    });
    memoryStores.set(key, created);
    return created;
  }

  const runtime = createConfiguredTransactionalPostgresRuntime();
  if (!runtime) return null;
  const existing = liveStores.get(key);
  if (existing) return existing;
  const created = createTransactionalOrbitAgentChatOrganizationStore({
    actorId: normalizedActorId,
    client: runtime.client,
    workspaceId: runtime.workspaceId,
  });
  liveStores.set(key, created);
  return created;
}
