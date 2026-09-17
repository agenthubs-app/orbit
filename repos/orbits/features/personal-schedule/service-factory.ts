import { createConfiguredTransactionalPostgresRuntime } from "../../shared/storage/transactional-postgres";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { createPersonalScheduleService } from "./service";
import { createPersonalScheduleAssociationReader } from "./association-reader";

export function createConfiguredPersonalScheduleService() {
  const runtime = createConfiguredTransactionalPostgresRuntime();
  if (!runtime) throw new Error("Personal schedule storage is not configured");
  const store = createPostgresLiveRecordStore({ client: runtime.client });
  return createPersonalScheduleService({ client: runtime.client, workspaceId: runtime.workspaceId, store, associationReaderForStore: transactionStore => createPersonalScheduleAssociationReader({ store: transactionStore, workspaceId: runtime.workspaceId }) });
}
