"use client";

import { upload } from "@vercel/blob/client";

const BASE = "/api/contact-drafts/business-card/uploads";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
interface Source { id: string; objectKey: string; uploadExpiresAt: string }
interface Attempt { requestKey: string; source?: Source }
export interface ContentUploadResult { ok: boolean; errorCode: string | null }
interface Input { batchId: string; itemId: string; operation: "upload" | "replace"; expectedVersion?: number;
  file: File; digest: string; mimeType: string }

const browserCache = {
  getItem(key: string) { try { return sessionStorage.getItem(key); } catch { return null; } },
  setItem(key: string, value: string) { try { sessionStorage.setItem(key, value); } catch {} },
};

export function createIngestContentUploader({ request = fetch, put = upload, cache = browserCache, timeoutMs = 120_000 }: {
  request?: typeof fetch; put?: typeof upload;
  cache?: Pick<Storage, "getItem" | "setItem">; timeoutMs?: number;
} = {}) {
  const memory = new Map<string, Attempt>();
  const running = new Map<string, Promise<ContentUploadResult>>();
  async function bounded<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([operation(controller.signal), new Promise<never>((_, reject) => {
        timer = setTimeout(() => { reject(new Error("Upload timed out.")); controller.abort(); }, timeoutMs);
      })]);
    } finally { clearTimeout(timer); controller.abort(); }
  }
  async function json(url: string, init?: RequestInit) {
    return bounded(async (signal) => {
      const response = await request(url, { ...init, signal });
      const body = await response.json().catch(() => null) as {
        data?: { directUpload?: boolean; item?: { id?: string }; source?: Source & { digest?: string; byteSize?: number; mimeType?: string } };
        error?: { code?: string; message?: string };
      } | null;
      return { ok: response.ok && body !== null, body,
        errorCode: response.ok ? null : (body?.error?.code ?? body?.error?.message?.split(":")[0] ?? `HTTP_${response.status}`) };
    });
  }
  const post = (url: string, body: unknown) => json(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  function validSource(source: Source | undefined): source is Source {
    return !!source && UUID.test(source.id) &&
      /^orbit-card-sources\/[a-f0-9]{64}\/[a-f0-9]{64}\/[a-f0-9-]{36}$/.test(source.objectKey) &&
      source.objectKey.endsWith(`/${source.id}`) && Number.isFinite(Date.parse(source.uploadExpiresAt));
  }
  function load(key: string): Attempt {
    if (memory.has(key)) return memory.get(key)!;
    try {
      const stored = JSON.parse(cache.getItem(key) ?? "null") as Attempt | null;
      if (stored && UUID.test(stored.requestKey) && (!stored.source || validSource(stored.source))) return stored;
    } catch {}
    return { requestKey: crypto.randomUUID() };
  }
  function save(key: string, attempt: Attempt) {
    memory.set(key, attempt);
    try { cache.setItem(key, JSON.stringify(attempt)); } catch {}
  }
  async function perform(input: Input, key: string): Promise<ContentUploadResult> {
    try {
      const mode = await json(BASE);
      if (!mode.ok || typeof mode.body?.data?.directUpload !== "boolean") return { ok: false, errorCode: mode.errorCode ?? "UPLOAD_UNAVAILABLE" };
      if (!mode.body.data.directUpload) {
        const url = `/api/contact-drafts/business-card/batches/v2/${input.batchId}/items/${input.itemId}/${input.operation === "replace" ? "replace" : "content"}`;
        const result = await json(url, { method: input.operation === "replace" ? "POST" : "PUT", body: input.file,
          headers: { "Content-Type": input.mimeType, ...(input.operation === "replace" ? { "If-Match": String(input.expectedVersion) } : {}) } });
        return { ok: result.ok, errorCode: result.errorCode };
      }
      let attempt = load(key);
      const consume = async (sourceId: string) => {
        const result = await post(`${BASE}/consume-v2`, {
          sourceId, batchId: input.batchId, itemId: input.itemId, operation: input.operation,
          ...(input.operation === "replace" ? { expectedVersion: input.expectedVersion } : {}),
        });
        if (result.ok && result.body?.data?.item?.id !== input.itemId) return { ...result, ok: false, errorCode: "INVALID_UPLOAD_RECEIPT" };
        return result;
      };
      // Renew only on an explicit expired/missing-source verdict. A timeout or
      // provider error preserves the receipt so uncertain success stays replayable.
      for (let renewal = 0; renewal < 2; renewal++) {
        save(key, attempt);
        if (!attempt.source) {
          const reserved = await post(BASE, { requestKey: attempt.requestKey, pipeline: "v2", fileName: input.file.name,
            mimeType: input.mimeType, byteSize: input.file.size, digest: input.digest });
          if (reserved.errorCode === "UPLOAD_SOURCE_EXPIRED") { attempt = { requestKey: crypto.randomUUID() }; continue; }
          const source = reserved.body?.data?.source;
          if (!reserved.ok || !validSource(source) || source.digest !== input.digest || source.byteSize !== input.file.size || source.mimeType !== input.mimeType) {
            return { ok: false, errorCode: reserved.errorCode ?? "INVALID_UPLOAD_RESERVATION" };
          }
          attempt.source = { id: source.id, objectKey: source.objectKey, uploadExpiresAt: source.uploadExpiresAt };
          save(key, attempt);
        }
        const source = attempt.source;
        const previous = await consume(source.id);
        if (previous.ok) return { ok: true, errorCode: null };
        if (previous.errorCode === "UPLOAD_SOURCE_EXPIRED" ||
            (previous.errorCode === "UPLOAD_SOURCE_NOT_UPLOADED" && Date.parse(source.uploadExpiresAt) <= Date.now())) {
          attempt = { requestKey: crypto.randomUUID() }; continue;
        }
        if (previous.errorCode !== "UPLOAD_SOURCE_NOT_UPLOADED") return { ok: false, errorCode: previous.errorCode };
        try {
          await bounded((signal) => put(source.objectKey, input.file, { access: "private", handleUploadUrl: `${BASE}/token`,
            clientPayload: source.id, contentType: input.mimeType, multipart: true, abortSignal: signal }));
        } catch {
          // The object may have arrived despite a lost SDK response, or an
          // earlier attempt may already own the non-overwritable pathname.
        }
        const result = await consume(source.id);
        return { ok: result.ok, errorCode: result.errorCode };
      }
      save(key, attempt);
      return { ok: false, errorCode: "UPLOAD_SOURCE_EXPIRED" };
    } catch { return { ok: false, errorCode: "UPLOAD_UNAVAILABLE" }; }
  }
  return function uploadContent(input: Input): Promise<ContentUploadResult> {
    const key = `orbit-card-upload-v1:${JSON.stringify([input.batchId, input.itemId, input.operation, input.expectedVersion ?? null, input.digest, input.mimeType, input.file.name])}`;
    const existing = running.get(key); if (existing) return existing;
    const task = perform(input, key).finally(() => running.delete(key));
    running.set(key, task); return task;
  };
}

export const uploadIngestContent = createIngestContentUploader();
