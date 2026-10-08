import type { LiveDatabaseEnv } from "../../../shared/storage/live-database-config";
import { createConfiguredEventOperationsPostgresRuntime } from "../event-operations/storage/postgres-client";
import { createEventCoreService, type EventCoreService } from "./service";
import { createPostgresEventStartWindowReader, type EventStartWindowReader } from "./start-window";
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

/** W0021：活动归属用的开始时间窗口读取（只取三列）；数据库未配置时为 null。 */
export function createConfiguredEventStartWindowReader(input: {
  env?: LiveDatabaseEnv;
  max?: number;
} = {}): EventStartWindowReader | null {
  const runtime = createConfiguredEventOperationsPostgresRuntime(input);
  if (!runtime) return null;
  return createPostgresEventStartWindowReader({
    client: runtime.client,
    workspaceId: runtime.workspaceId,
  });
}
