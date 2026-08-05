import { createConfiguredEventOperationsPostgresRuntime } from "../event-operations/storage/postgres-client";
import { createEventAccessDirectoryService } from "./directory-service";
import type { EventAccessDirectoryService } from "./directory-service";
import { createPostgresEventAccessDirectoryRepository } from "./storage/postgres-directory-repository";

export function createConfiguredEventAccessDirectoryService(): EventAccessDirectoryService | null {
  const runtime = createConfiguredEventOperationsPostgresRuntime();
  if (!runtime) return null;
  return createEventAccessDirectoryService(
    createPostgresEventAccessDirectoryRepository(runtime),
  );
}
