import { createConfiguredTransactionalPostgresRuntime } from "../../../shared/storage/transactional-postgres";
import type { LiveDatabaseEnv } from "../../../shared/storage/live-database-config";
import { createPostgresRelationshipLifecycleRepository } from "./postgres-repository";
import { createRelationshipLifecycleService, type RelationshipLifecycleService } from "./service";

export function createConfiguredRelationshipLifecycleService({ env, now }: { env?: LiveDatabaseEnv; now?: () => string } = {}): RelationshipLifecycleService | null {
  const runtime = createConfiguredTransactionalPostgresRuntime({ env });
  if (!runtime) return null;
  return createRelationshipLifecycleService(createPostgresRelationshipLifecycleRepository(runtime), now);
}
