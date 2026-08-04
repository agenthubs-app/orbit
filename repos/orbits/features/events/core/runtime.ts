import type { LiveDatabaseEnv } from "../../../shared/storage/live-database-config";
import { createConfiguredEventOperationsPostgresRuntime } from "../event-operations/storage/postgres-client";
import { createEventCoreService, type EventCoreService } from "./service";
import { createPostgresEventCoreRepositoryFromRuntime } from "./storage/postgres-repository";

export function createConfiguredEventCoreService(input: {
  env?: LiveDatabaseEnv;
  max?: number;
} = {}): EventCoreService | null {
  const runtime = createConfiguredEventOperationsPostgresRuntime(input);
  if (!runtime) return null;
  return createEventCoreService(
    createPostgresEventCoreRepositoryFromRuntime(runtime),
  );
}
