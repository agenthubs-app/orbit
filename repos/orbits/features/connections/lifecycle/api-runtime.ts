import { createConfiguredTransactionalPostgresRuntime } from "../../../shared/storage/transactional-postgres";
import { createPostgresRelationshipLifecycleRepository } from "./postgres-repository";
import { createRelationshipLifecycleService } from "./service";

export function createConfiguredRelationshipLifecycleApiRuntime() {
  const runtime = createConfiguredTransactionalPostgresRuntime();
  if (!runtime) return null;
  const repository = createPostgresRelationshipLifecycleRepository(runtime);
  return { repository, service: createRelationshipLifecycleService(repository) };
}
