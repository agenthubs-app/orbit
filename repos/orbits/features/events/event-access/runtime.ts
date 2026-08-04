import { createConfiguredEventOperationsPostgresRuntime } from "../event-operations/storage/postgres-client";
import { createEventAccessService } from "./service";
import type { EventAccessService } from "./service";
import { createPostgresEventAccessRepository } from "./storage/postgres-repository";

export function createConfiguredEventAccessService(): EventAccessService | null {
  const runtime = createConfiguredEventOperationsPostgresRuntime();
  if (!runtime) return null;
  return createEventAccessService(createPostgresEventAccessRepository(runtime));
}
