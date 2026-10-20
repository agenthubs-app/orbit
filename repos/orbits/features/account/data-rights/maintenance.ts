import { createConfiguredTransactionalPostgresRuntime } from "../../../shared/storage/transactional-postgres";
import { createConfiguredAccountRightsOutbox } from "./configured-outbox";
import { createAccountExportDomainReader } from "./domain-reader";
import { reapExpiredAccountExports } from "./expiry";
import { createAccountExportImageReader, createConfiguredAccountImageOpener } from "./images";
import { createAccountExportRecordStore } from "./records";
import { createConfiguredAccountExportFileStore } from "./storage/configured";
import { runAccountExportOnce } from "./worker";

/** One bounded pass. Production purge is deliberately absent from this entry. */
export async function runConfiguredAccountRightsMaintenancePass() {
  const runtime = createConfiguredTransactionalPostgresRuntime();
  if (!runtime) return null;
  const { client: db, workspaceId } = runtime;
  const records = createAccountExportRecordStore({ db, workspaceId });
  const storage = createConfiguredAccountExportFileStore(workspaceId);
  const open = createConfiguredAccountImageOpener(workspaceId);
  const exportResult = await runAccountExportOnce({ records, storage,
    read: (actorId, scope) => createAccountExportDomainReader({ db, workspaceId, actorId })(scope),
    readImages: actorId => createAccountExportImageReader({ db, workspaceId, actorId, open })(),
  });
  const expiry = await reapExpiredAccountExports({ records, storage });
  const outbox = createConfiguredAccountRightsOutbox();
  const delivery = { delivered: 0, retry: 0, unavailable: 0, uncertain: 0 };
  if (outbox) {
    for (let index = 0; index < 10; index++) {
      const result = await outbox.runOnce();
      if (result.kind === "idle") break;
      delivery[result.kind]++;
    }
  }
  return { export: exportResult.kind, expired: expiry.expired, expiryFailed: expiry.failed, delivery };
}
