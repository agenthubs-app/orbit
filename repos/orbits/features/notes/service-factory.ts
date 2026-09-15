import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import { createStorageContactGraphProvider } from "../contacts/storage/contact-live-record-provider";
import { createNoteAssociationReader } from "./association-reader";
import { createNoteRepository } from "./repository";
import { createNoteService } from "./service";

export function createConfiguredNoteService() {
  const configured = createConfiguredPostgresLiveRecordStore();
  if (!configured) throw new Error("Note storage is not configured");
  return createNoteService({
    repository: createNoteRepository({ store: configured.store, workspaceId: configured.workspaceId }),
    associationReader: createNoteAssociationReader({
      contactProvider: createStorageContactGraphProvider({ store: configured.store, workspaceId: configured.workspaceId }),
      store: configured.store,
      workspaceId: configured.workspaceId,
    }),
  });
}
