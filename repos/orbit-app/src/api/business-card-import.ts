import { createOrbitApiClient, type OrbitApiClientOptions } from "./client";
import type { ApiResult } from "./types";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;
const states = ["pending", "processing", "ready", "completed", "failed", "cancelled"] as const;
const errorCodes = ["SOURCE_UNAVAILABLE", "PDF_INVALID", "IMAGE_INVALID", "BATCH_TOO_LARGE", "SOURCE_EXPIRED"] as const;
const importMessages: Readonly<Record<string, string>> = {
  UNAUTHORIZED: "登录状态已失效，请重新登录后再试。",
  IMPORT_NOT_FOUND: "没有找到这次导入，它可能已过期或不属于当前账号。",
  IMPORT_CONFLICT: "导入状态已经变化，请刷新后查看。",
  IMPORT_UNAVAILABLE: "暂时无法读取导入进度，请稍后重试。",
  IMPORT_ORIGIN_FORBIDDEN: "当前连接无法取消导入，请检查服务器设置。",
  INVALID_IMPORT_REQUEST: "导入地址无效，请返回导入中心重新选择。",
};

// This endpoint's public DTO is not in shared/contract yet. Keep a validated,
// consumer-only projection here; do not copy server feature/repository types.
export interface BusinessCardImportJob {
  id: string;
  state: typeof states[number];
  sourceCount: number;
  completedSources: number;
  preparedPages: number;
  currentSourcePage: number | null;
  currentSourcePageCount: number | null;
  errorCode: typeof errorCodes[number] | null;
  retryAt: string | null;
  batchId: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function count(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function timestamp(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

export function decodeBusinessCardImport(value: unknown, id: string): BusinessCardImportJob | null {
  const job = record(value) && record(value.job) ? value.job : null;
  if (!job || !UUID.test(id) || job.id !== id ||
      !states.includes(job.state as BusinessCardImportJob["state"]) ||
      !count(job.sourceCount) || job.sourceCount === 0 ||
      !count(job.completedSources) || job.completedSources > job.sourceCount ||
      !count(job.preparedPages) || job.preparedPages > 500 ||
      !(job.currentSourcePage === null || count(job.currentSourcePage)) ||
      !(job.currentSourcePageCount === null || count(job.currentSourcePageCount)) ||
      !(job.errorCode === null || errorCodes.includes(job.errorCode as typeof errorCodes[number])) ||
      !(job.retryAt === null || timestamp(job.retryAt)) ||
      !timestamp(job.createdAt) || !timestamp(job.updatedAt) || !timestamp(job.expiresAt) ||
      (job.state === "completed"
        ? typeof job.batchId !== "string" || !UUID.test(job.batchId)
        : job.batchId !== null)) return null;
  if (job.currentSourcePage === null) {
    if (job.currentSourcePageCount !== null || job.completedSources !== job.sourceCount) return null;
  } else {
    if (job.currentSourcePage < 1 || job.completedSources === job.sourceCount) return null;
    if (job.currentSourcePageCount === null ? job.currentSourcePage !== 1 :
        job.currentSourcePageCount < job.currentSourcePage || job.currentSourcePageCount > 500) return null;
  }
  if ((job.state === "ready" || job.state === "completed") &&
      (job.completedSources !== job.sourceCount || job.preparedPages < 1)) return null;
  if ((job.state === "completed" || job.state === "cancelled") &&
      (job.errorCode !== null || job.retryAt !== null)) return null;
  if (job.state === "failed" && (job.errorCode === null || job.retryAt !== null)) return null;
  return {
    id, state: job.state as BusinessCardImportJob["state"],
    sourceCount: job.sourceCount, completedSources: job.completedSources, preparedPages: job.preparedPages,
    currentSourcePage: job.currentSourcePage, currentSourcePageCount: job.currentSourcePageCount,
    errorCode: job.errorCode as BusinessCardImportJob["errorCode"], retryAt: job.retryAt,
    batchId: job.batchId as string | null, createdAt: job.createdAt, updatedAt: job.updatedAt, expiresAt: job.expiresAt,
  };
}

export function createBusinessCardImportClient(options: OrbitApiClientOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const client = createOrbitApiClient({
    ...options,
    // Adapt only this client's legacy endpoint; the common client's strict
    // envelope, cookie bridge, abort and session-expiry behavior remain intact.
    fetchImpl: async (url, init) => {
      const response = await fetchImpl(url, init);
      if (!response.headers.get("Content-Type")?.toLowerCase().includes("application/json")) return response;
      let payload: unknown;
      try { payload = await response.clone().json(); } catch { return response; }
      if (!record(payload)) return response;
      let envelope: unknown;
      if (response.ok && !("success" in payload) && "data" in payload) {
        envelope = { success: true, data: payload.data };
      } else if (!response.ok) {
        const code = record(payload.error) && typeof payload.error.code === "string" ? payload.error.code : "IMPORT_UNAVAILABLE";
        envelope = { success: false, error: { code, message: importMessages[code] ?? "这项导入操作暂时无法完成，请刷新后再试。" } };
      } else return response;
      const headers = new Headers(response.headers);
      headers.delete("Content-Length");
      return new Response(JSON.stringify(envelope), { status: response.status, headers });
    },
  });
  async function requestJob(id: string, cancel: boolean, signal?: AbortSignal): Promise<ApiResult<BusinessCardImportJob>> {
    if (!UUID.test(id)) return {
      success: false, status: 400, meta: { featureMode: null, privacy: null, runtimeBoundary: null },
      error: { code: "INVALID_IMPORT_REQUEST", message: importMessages.INVALID_IMPORT_REQUEST! },
    };
    const path = "/api/contact-drafts/business-card/imports/" + id;
    const requestOptions = signal ? { signal } : {};
    const result = cancel
      ? await client.post<unknown>(path + "/cancel", { ...requestOptions, body: {}, headers: { Origin: new URL(client.baseUrl).origin } })
      : await client.get<unknown>(path, requestOptions);
    if (!result.success) return result;
    const job = decodeBusinessCardImport(result.data, id);
    return job ? { ...result, data: job } : {
      success: false, status: result.status, meta: result.meta,
      error: { code: "IMPORT_INVALID_RESPONSE", message: "导入进度暂时无法确认，请刷新后再试。" },
    };
  }
  return {
    getJob: (id: string, signal?: AbortSignal) => requestJob(id, false, signal),
    cancelJob: (id: string, signal?: AbortSignal) => requestJob(id, true, signal),
  };
}
