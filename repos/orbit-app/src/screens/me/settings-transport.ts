import type { FetchLike } from "../../api/client";

// These older APIs use {data} (and memory DELETE 204), not the App envelope.
// This adapter only normalizes the wire; settings-api.ts owns and audits every endpoint call.
export function settingsFetch(fetcher: FetchLike): FetchLike {
  return async (input, init) => {
    const response = await fetcher(input, init);
    if (init?.signal?.aborted) throw new Error("Inactive settings request");
    const path = new URL(String(input)).pathname;
    if (!path.startsWith("/api/integrations") && !path.startsWith("/api/agent/memory")) return response;
    if (response.status === 204) return Response.json({ success: true, data: null });
    const value: unknown = await response.clone().json().catch(() => null);
    if (!value || typeof value !== "object" || "success" in value) return response;
    const headers = new Headers(response.headers); headers.delete("content-length");
    if (response.ok && "data" in value) return Response.json({ success: true, data: value.data }, { status: response.status, headers });
    if (!response.ok && "error" in value) return Response.json({ success: false, error: value.error }, { status: response.status, headers });
    return response;
  };
}
