import { requireEventCapability } from "../event-access/guard";
import { createConfiguredEventAccessService } from "../event-access/runtime";
import { createConfiguredEventOperationsPostgresRuntime } from "../event-operations/storage/postgres-client";
import { createEventAdmissionService, type EventAdmissionService } from "./service";
import { createPostgresEventAdmissionRepository } from "./storage/postgres-repository";

export function createConfiguredEventAdmissionService(): EventAdmissionService | null {
  const runtime = createConfiguredEventOperationsPostgresRuntime();
  const accessService = createConfiguredEventAccessService();
  if (!runtime || !accessService) return null;

  return createEventAdmissionService({
    repository: createPostgresEventAdmissionRepository(runtime),
    requireCapability: (actorId, eventId, capability) =>
      requireEventCapability({
        actorId,
        capability,
        eventId,
        service: accessService,
      }),
  });
}
