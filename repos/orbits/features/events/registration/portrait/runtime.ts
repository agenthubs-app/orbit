import { createConfiguredTransactionalPostgresRuntime } from "../../../../shared/storage/transactional-postgres";
import { createTransactionalPortraitRepository } from "./repository";
import { createEventRegistrationPortraitService } from "./service";
import { readPortraitSnapshot } from "./source-reader";

export function createEventRegistrationPortraitRuntime() {
  const runtime = createConfiguredTransactionalPostgresRuntime();
  if (!runtime) return null;
  const repository = createTransactionalPortraitRepository({ ...runtime, readSnapshot: readPortraitSnapshot });
  return { ...runtime, repository, service: createEventRegistrationPortraitService({ repository, workspaceId: runtime.workspaceId }) };
}
