import type { createAccountExportRecordStore } from "./records";
import type { AccountExportFileStore } from "./worker";

export async function reapExpiredAccountExports(input: {
  records: ReturnType<typeof createAccountExportRecordStore>;
  storage: Pick<AccountExportFileStore, "delete">;
}): Promise<{ expired: number; failed: number }> {
  const due = await input.records.listExpiredReady();
  let expired = 0;
  let failed = 0;
  for (const record of due) {
    try {
      if (!record.fileKey) throw new Error("Missing export file reference");
      await input.storage.delete(record.actorId, record.fileKey);
      if (await input.records.markExpired(record.actorId, record.id)) expired++;
    } catch {
      failed++;
    }
  }
  return { expired, failed };
}
