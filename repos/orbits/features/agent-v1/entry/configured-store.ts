/**
 * The entry store of this process (moved out of http.ts in AG04, so the graph executor can write back
 * an earlier request without importing the HTTP layer): in memory for mock and hybrid modes, else the
 * configured Postgres.
 */
import type { FeatureMode } from "../../../shared/config/feature-mode";
import { createConfiguredTransactionalPostgresRuntime } from "../../../shared/storage/transactional-postgres";
import { createMemoryAgentEntryStore, createPostgresAgentEntryStore, type AgentEntryStore } from "./store";

let memoryStore: AgentEntryStore | null = null;
let postgresStore: AgentEntryStore | null = null;

export function configuredAgentEntryStore(mode: FeatureMode): AgentEntryStore | null {
  if (mode === "mock" || mode === "hybrid") {
    memoryStore ??= createMemoryAgentEntryStore();
    return memoryStore;
  }
  if (postgresStore) return postgresStore;
  const runtime = createConfiguredTransactionalPostgresRuntime();
  if (!runtime) return null;
  postgresStore = createPostgresAgentEntryStore({ client: runtime.client, workspaceId: runtime.workspaceId });
  return postgresStore;
}
