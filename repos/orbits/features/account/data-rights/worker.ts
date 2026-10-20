import { createHash } from "node:crypto";

import type { AccountExportScope } from "../../../shared/contract/account";
import { buildAccountExportArchive, type ExportImage } from "./archive";
import type { createAccountExportRecordStore } from "./records";

type Records = ReturnType<typeof createAccountExportRecordStore>;

export interface AccountExportFileStore {
  put(actorId: string, exportId: string, bytes: Buffer): Promise<string>;
  get(actorId: string, key: string): Promise<Buffer | null>;
  delete(actorId: string, key: string): Promise<void>;
}

class LostLease extends Error {}

export async function runAccountExportOnce(input: {
  records: Records;
  storage: AccountExportFileStore;
  read(actorId: string, scope: AccountExportScope): Promise<Record<string, unknown>[] | null>;
  readImages?(actorId: string): Promise<ExportImage[] | null>;
  now?: () => Date;
  maxBytes?: number;
}): Promise<{ kind: "idle" | "ready" | "failed" | "stale"; exportId?: string }> {
  const claim = await input.records.claimNext();
  if (!claim) return { kind: "idle" };
  const { record, leaseToken } = claim;
  const { actorId, id } = record;
  try {
    const archive = await buildAccountExportArchive({
      scope: record.scope, mode: record.mode, contactsFormat: record.contactsFormat,
      generatedAt: record.requestedAt, maxBytes: input.maxBytes,
      read: scope => input.read(actorId, scope),
      readImages: input.readImages ? () => input.readImages!(actorId) : undefined,
      onProgress: async completed => {
        if (!await input.records.markProgress(actorId, id, leaseToken, completed)) throw new LostLease();
      },
    });
    const key = await input.storage.put(actorId, id, archive);
    const stored = await input.storage.get(actorId, key);
    if (!stored) throw new Error("Export storage unavailable");
    const checksum = `sha256:${createHash("sha256").update(stored).digest("hex")}`;
    const ready = await input.records.markReady(actorId, id, leaseToken, {
      fileKey: key, checksum, fileName: `orbit-export-${id.split(":").at(-1)?.slice(0, 12) ?? "data"}.zip`, fileSizeBytes: stored.byteLength,
    });
    return { kind: ready ? "ready" : "stale", exportId: id };
  } catch (error) {
    if (error instanceof LostLease) return { kind: "stale", exportId: id };
    const kind = error instanceof Error && /^(Export exceeds|Invalid export image)/.test(error.message) ? "content" : "system";
    const changed = await input.records.markFailed(actorId, id, leaseToken, kind);
    return { kind: changed ? "failed" : "stale", exportId: id };
  }
}
