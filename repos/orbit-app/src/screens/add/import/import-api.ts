// R16 取り込み (DESIGN §2.7): the App side of `/api/contacts/import/**` (same shapes as the Web,
// src/api/contract/contact-import.ts). Upload sends the file text itself as the body with the import
// headers: 連絡先 = the chosen people as vCard 3.0 (only they leave the phone), LinkedIn = the CSV.
import { useMemo } from "react";
import type { ZodType } from "zod";

import type { OrbitApiClient } from "../../../api/client";
import type { ContactImportBatchView, ContactImportMergeConfirmation, ContactImportRowView } from "../../../api/contract/contact-import";
import {
  CONTACT_IMPORT_UPLOAD_HEADERS,
  contactImportBatchResponseSchema,
  contactImportBatchResultSchema,
  contactImportDecisionsResultSchema,
  contactImportRowsPageSchema,
} from "../../../api/schema/contact-import";
import type { ApiResult } from "../../../api/types";
import { useOrbitApiClient } from "../../../hooks/useOrbitApiClient";
import { addFailureOf, type AddResult } from "../add-api";

const BASE = "/api/contacts/import";
const batchPath = (id: string, suffix = "") => `${BASE}/${encodeURIComponent(id)}${suffix}`;

export function newImportKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function utf8(text: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(text) as Uint8Array<ArrayBuffer>;
}

export interface ImportApi {
  upload: (body: Uint8Array<ArrayBuffer>, fileName: string, kind: "csv" | "vcard", key: string) => Promise<AddResult<ContactImportBatchView>>;
  get: (id: string) => Promise<AddResult<ContactImportBatchView>>;
  rows: (id: string) => Promise<AddResult<ContactImportRowView[]>>;
  commit: (id: string, intent: string, decisions: readonly { seq: number; decision: "create" | "merge" | "skip" }[], confirmations: readonly ContactImportMergeConfirmation[]) => Promise<AddResult<ContactImportBatchView>>;
}

export function createImportApi(client: OrbitApiClient): ImportApi {
  async function read<T>(promise: Promise<ApiResult<unknown>>, schema: ZodType<T>): Promise<AddResult<T>> {
    const result = await promise;
    if (!result.success) return { ok: false, failure: addFailureOf(result) };
    const parsed = schema.safeParse(result.data);
    return parsed.success ? { ok: true, data: parsed.data } : { ok: false, failure: { kind: "other", reason: "UNREADABLE", status: result.status } };
  }
  return {
    async upload(body, fileName, kind, key) {
      const result = await read(client.post<unknown>(BASE, {
        rawBody: body,
        headers: {
          "content-type": "application/octet-stream",
          [CONTACT_IMPORT_UPLOAD_HEADERS.idempotencyKey]: key,
          [CONTACT_IMPORT_UPLOAD_HEADERS.fileName]: encodeURIComponent(fileName),
          [CONTACT_IMPORT_UPLOAD_HEADERS.kind]: kind,
        },
      }), contactImportBatchResultSchema);
      return result.ok ? { ok: true, data: result.data.batch } : result;
    },
    async get(id) {
      const result = await read(client.get<unknown>(batchPath(id)), contactImportBatchResponseSchema);
      return result.ok ? { ok: true, data: result.data.batch } : result;
    },
    async rows(id) {
      const rows: ContactImportRowView[] = [];
      let cursor: number | null = 0;
      while (cursor !== null) {
        const page: AddResult<{ rows: readonly ContactImportRowView[]; nextCursor: number | null }> = await read(client.get<unknown>(batchPath(id, `/rows?cursor=${cursor}&filter=all`)), contactImportRowsPageSchema);
        if (!page.ok) return page;
        rows.push(...page.data.rows);
        cursor = page.data.nextCursor;
      }
      return { ok: true, data: rows };
    },
    async commit(id, intent, decisions, confirmations) {
      for (let start = 0; start < decisions.length; start += 200) {
        const decided = await read(client.patch<unknown>(batchPath(id, "/rows"), { body: { decisions: decisions.slice(start, start + 200) } }), contactImportDecisionsResultSchema);
        if (!decided.ok) return decided;
      }
      const result = await read(client.post<unknown>(batchPath(id, "/commit"), { body: { confirmationIntentId: intent, mergeConfirmations: confirmations } }), contactImportBatchResultSchema);
      return result.ok ? { ok: true, data: result.data.batch } : result;
    },
  };
}

export function useImportApi(): ImportApi {
  const client = useOrbitApiClient();
  return useMemo(() => createImportApi(client), [client]);
}

export { utf8 };
