import type { AccountDeletionRequestContract, AccountExportContract } from "../../../../../shared/contract/account";

export class AccountRightsApiError extends Error {
  constructor(readonly status: number, readonly reason: string) { super(reason); }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...init }); }
  catch { throw new AccountRightsApiError(0, "NETWORK"); }
  const body = await response.json().catch(() => null) as { success?: boolean; data?: T; context?: { reason?: string }; error?: { code?: string; context?: { reason?: string } } } | null;
  if (!response.ok || !body || body.success !== true) throw new AccountRightsApiError(response.status, body?.error?.context?.reason ?? body?.context?.reason ?? body?.error?.code ?? "UNAVAILABLE");
  return body.data as T;
}

const json = (value: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value) });

export const accountRightsApi = {
  listExports: () => request<AccountExportContract[]>("/api/account/exports"),
  createExport: (input: { scope: string[]; mode: "selected" | "all-json"; contactsFormat?: "csv" | "vcard"; idempotencyKey: string }) =>
    request<AccountExportContract>("/api/account/exports", json(input)),
  getDeletion: () => request<AccountDeletionRequestContract | null>("/api/account/deletion-request"),
  method: async (): Promise<"credentials" | "google"> => {
    const response = await fetch("/api/account/deletion-request/method", { cache: "no-store" });
    if (!response.ok) throw new AccountRightsApiError(response.status, "UNAVAILABLE");
    const data = await response.json() as { method: "credentials" | "google" };
    return data.method;
  },
  reauthPassword: async (password: string): Promise<string> => {
    const response = await fetch("/api/account/deletion-request/reauth", json({ method: "password", password }));
    const data = await response.json().catch(() => null) as { reauthReceipt?: string; error?: string } | null;
    if (!response.ok || !data?.reauthReceipt) throw new AccountRightsApiError(response.status, data?.error ?? "UNAVAILABLE");
    return data.reauthReceipt;
  },
  reauthGoogleStart: async (): Promise<void> => {
    const response = await fetch("/api/account/deletion-request/reauth/google/start", json({ channel: "web" }));
    const data = await response.json().catch(() => null) as { started?: boolean; error?: string } | null;
    if (!response.ok || !data?.started) throw new AccountRightsApiError(response.status, data?.error ?? "UNAVAILABLE");
  },
  reauthGoogle: async (): Promise<string> => {
    const response = await fetch("/api/account/deletion-request/reauth", json({ method: "google" }));
    const data = await response.json().catch(() => null) as { reauthReceipt?: string; error?: string } | null;
    if (!response.ok || !data?.reauthReceipt) throw new AccountRightsApiError(response.status, data?.error ?? "UNAVAILABLE");
    return data.reauthReceipt;
  },
  requestDeletion: (reauthReceipt: string) => request<AccountDeletionRequestContract>("/api/account/deletion-request", json({ reauthReceipt, confirmed: true })),
  cancelDeletion: () => request<AccountDeletionRequestContract | null>("/api/account/deletion-request", { method: "DELETE" }),
};
