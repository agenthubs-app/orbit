import { createConfiguredTransactionalPostgresRuntime } from "../../shared/storage/transactional-postgres";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { createPersonalScheduleService } from "./service";

export function createConfiguredPersonalScheduleService() {
  const runtime = createConfiguredTransactionalPostgresRuntime();
  if (!runtime) throw new Error("Personal schedule storage is not configured");
  return createPersonalScheduleService({ client: runtime.client, workspaceId: runtime.workspaceId, store: createPostgresLiveRecordStore({ client: runtime.client }) });
}
