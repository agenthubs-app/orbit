import { createHash } from "node:crypto";

import type { AccountExportContract, AccountExportCreateInput } from "../../../shared/contract/account";
import { createAccountExportDownloadGrant, verifyAccountExportDownloadGrant } from "./download-grant";
import type { AccountExportRecord, createAccountExportRecordStore } from "./records";
import type { AccountExportFileStore } from "./worker";

const RECENT_LOGIN_MILLIS = 10 * 60_000;

type Records = ReturnType<typeof createAccountExportRecordStore>;
type DownloadResult = { kind: "ok"; bytes: Buffer; fileName: string } | { kind: "not-found" | "invalid-grant" | "expired" | "unavailable" };

export function createAccountExportService(input: {
  records: Records;
  storage: Pick<AccountExportFileStore, "get">;
  secret: string;
  now?: () => Date;
  publicBaseUrl?: string;
}) {
  const now = input.now ?? (() => new Date());
  function project(record: AccountExportRecord, actorId: string, request: Request): AccountExportContract {
    const expired = record.status === "ready" && !!record.expiresAt && now().toISOString() >= record.expiresAt;
    const output: AccountExportContract = {
      id: record.id, scope: record.scope, status: expired ? "expired" : record.status,
      requestedAt: record.requestedAt, mode: record.mode, contactsFormat: record.contactsFormat,
      completedItems: record.completedItems, totalItems: record.totalItems,
      readyAt: record.readyAt, expiresAt: record.expiresAt,
      fileName: record.fileName, fileSizeBytes: record.fileSizeBytes,
    };
    if (record.status === "ready" && !expired && record.fileKey) {
      output.downloadUrl = createAccountExportDownloadGrant({ actorId, exportId: record.id, secret: input.secret,
        now: now(), requestUrl: request.url, publicBaseUrl: input.publicBaseUrl }).toString();
    }
    return output;
  }
  return {
    async create(actorId: string, request: AccountExportCreateInput, authenticatedAt: number) {
      const age = now().getTime() - authenticatedAt;
      if (!Number.isSafeInteger(authenticatedAt) || age < -30_000 || age > RECENT_LOGIN_MILLIS) return { kind: "reauth" as const };
      return input.records.create(actorId, request);
    },
    async list(actorId: string, request: Request): Promise<AccountExportContract[]> {
      return (await input.records.list(actorId)).map(record => project(record, actorId, request));
    },
    async get(actorId: string, id: string, request: Request): Promise<{ kind: "found"; export: AccountExportContract } | { kind: "not-found" }> {
      const record = await input.records.get(actorId, id);
      return record ? { kind: "found", export: project(record, actorId, request) } : { kind: "not-found" };
    },
    async download(actorId: string, id: string, url: URL): Promise<DownloadResult> {
      const record = await input.records.get(actorId, id);
      if (!record) return { kind: "not-found" };
      if (record.status === "expired" || record.status === "ready" && !!record.expiresAt && now().toISOString() >= record.expiresAt) return { kind: "expired" };
      if (record.status !== "ready" || !record.fileKey || !record.fileName) return { kind: "not-found" };
      if (!verifyAccountExportDownloadGrant({ actorId, exportId: id, secret: input.secret, url, now: now() })) return { kind: "invalid-grant" };
      const bytes = await input.storage.get(actorId, record.fileKey);
      if (!bytes) return { kind: "unavailable" };
      if (record.fileSizeBytes !== bytes.byteLength || record.checksum !== `sha256:${createHash("sha256").update(bytes).digest("hex")}`) return { kind: "unavailable" };
      return { kind: "ok", bytes, fileName: record.fileName };
    },
  };
}
