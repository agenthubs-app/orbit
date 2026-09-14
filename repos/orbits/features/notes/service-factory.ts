import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import { createNoteRepository } from "./repository";
import { createNoteService } from "./service";

export function createConfiguredNoteService() {
  const configured = createConfiguredPostgresLiveRecordStore();
  if (!configured) throw new Error("Note storage is not configured");
  return createNoteService({
    repository: createNoteRepository({ store: configured.store, workspaceId: configured.workspaceId }),
  });
}
