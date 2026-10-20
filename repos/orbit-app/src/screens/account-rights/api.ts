import * as FileSystem from "expo-file-system/legacy";
import { Share } from "react-native";

import { createOrbitApiClient, type OrbitApiClient } from "../../api/client";
import type { AccountDeletionRequestContract, AccountExportContract } from "../../api/contract/account";

export class RightsApiError extends Error {
  constructor(readonly status: number, readonly reason: string) { super(reason); }
}

function unwrap<T>(result: Awaited<ReturnType<OrbitApiClient["get"]>>): T {
  if (result.success) return result.data as T;
  throw new RightsApiError(result.status, result.error.context?.reason ?? result.error.code);
}

function rawHeaders(cookieHeader: string): Record<string, string> {
  return cookieHeader.trim() ? { Cookie: cookieHeader, Accept: "application/json" } : { Accept: "application/json" };
}

export function createAccountRightsApi(input: { baseUrl: string; cookieHeader: string; fetchImpl?: typeof fetch }) {
  const client = createOrbitApiClient({ baseUrl: input.baseUrl, authCookieHeader: input.cookieHeader, ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}) });
  const fetcher = input.fetchImpl ?? fetch;
  const url = (path: string) => new URL(path, input.baseUrl).toString();
  return {
    async exports() { return unwrap<AccountExportContract[]>(await client.get("/api/account/exports")); },
    async createExport(body: { scope: string[]; mode: "selected" | "all-json"; contactsFormat: "csv" | "vcard"; idempotencyKey: string }) {
      return unwrap<AccountExportContract>(await client.post("/api/account/exports", { body }));
    },
    async deletion() { return unwrap<AccountDeletionRequestContract | null>(await client.get("/api/account/deletion-request")); },
    async method(): Promise<"credentials" | "google"> {
      const response = await fetcher(url("/api/account/deletion-request/method"), { headers: rawHeaders(input.cookieHeader), credentials: input.cookieHeader ? "omit" : "include" });
      const data = await response.json().catch(() => null) as { method?: string } | null;
      if (!response.ok || data?.method !== "credentials" && data?.method !== "google") throw new RightsApiError(response.status, "UNAVAILABLE");
      return data.method;
    },
    async reauthPassword(password: string): Promise<string> {
      const response = await fetcher(url("/api/account/deletion-request/reauth"), { method: "POST", credentials: input.cookieHeader ? "omit" : "include",
        headers: { ...rawHeaders(input.cookieHeader), "Content-Type": "application/json" }, body: JSON.stringify({ method: "password", password }) });
      const data = await response.json().catch(() => null) as { reauthReceipt?: string; error?: string } | null;
      if (!response.ok || !data?.reauthReceipt) throw new RightsApiError(response.status, data?.error ?? "UNAVAILABLE");
      return data.reauthReceipt;
    },
    async requestDeletion(receipt: string) { return unwrap<AccountDeletionRequestContract>(await client.post("/api/account/deletion-request", { body: { reauthReceipt: receipt, confirmed: true } })); },
    async cancelDeletion() { return unwrap<AccountDeletionRequestContract | null>(await client.delete("/api/account/deletion-request")); },
    async shareExport(item: AccountExportContract): Promise<void> {
      if (item.status !== "ready" || !item.downloadUrl || !FileSystem.cacheDirectory) throw new RightsApiError(404, "NOT_READY");
      const link = new URL(item.downloadUrl);
      if (!/^\/api\/account\/exports\/[^/]+\/download$/u.test(link.pathname) || decodeURIComponent(link.pathname.split("/")[4] ?? "") !== item.id) throw new RightsApiError(400, "INVALID_DOWNLOAD_URL");
      const source = url(`${link.pathname}${link.search}`);
      const destination = `${FileSystem.cacheDirectory}orbit-export-${Date.now()}.zip`;
      try {
        const downloaded = await FileSystem.downloadAsync(source, destination, { headers: rawHeaders(input.cookieHeader) });
        if (downloaded.status !== 200) throw new RightsApiError(downloaded.status, "DOWNLOAD_FAILED");
        await Share.share({ url: downloaded.uri, message: item.fileName ?? "Orbit export" });
      } finally { await FileSystem.deleteAsync(destination, { idempotent: true }).catch(() => undefined); }
    },
  };
}
