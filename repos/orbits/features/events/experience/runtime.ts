import { createConfiguredEventOperationsPostgresRuntime } from "../event-operations/storage/postgres-client";
import type { EventExperienceService } from "./contract";
import { createEventExperienceService } from "./service";
import { createPostgresEventExperienceRepository } from "./storage/postgres-repository";

/**
 * Experience uses the existing event-operations database runtime but owns its
 * tables and migration module. A missing live database is explicit to callers;
 * it is never silently replaced with an in-memory store in production.
 */
export function createConfiguredEventExperienceService(): EventExperienceService | null {
  const runtime = createConfiguredEventOperationsPostgresRuntime();
  if (!runtime) return null;
  return createEventExperienceService({
    repository: createPostgresEventExperienceRepository({ runtime }),
  });
}
