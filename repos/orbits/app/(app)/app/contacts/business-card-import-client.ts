"use client";

import { upload } from "@vercel/blob/client";

const UPLOADS = "/api/contact-drafts/business-card/uploads";
export const IMPORTS = "/api/contact-drafts/business-card/imports";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
interface Source { id: string; objectKey: string; uploadExpiresAt: string }
interface Attempt { requestKey: string; submitting: boolean; files: Array<{ requestKey: string; source?: Source }> }
export class CardImportClientError extends Error {
  constructor(readonly code: string) { super(code); }
}

export async function importJSON<T>(url: string, init?: RequestInit, request = fetch, timeoutMs = 30_000): Promise<T> {
  const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new CardImportClientError("IMPORT_UNAVAILABLE")); }, timeoutMs);
    }), (async () => {
      const response = await request(url, { ...init, cache: "no-store", signal: controller.signal });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new CardImportClientError(response.status === 401 ? "UNAUTHORIZED" : body?.error?.code ?? "IMPORT_UNAVAILABLE");
      if (!body?.data) throw new CardImportClientError("IMPORT_UNAVAILABLE");
      return body.data as T;
    })()]);
  } finally { clearTimeout(timer); controller.abort(); }
}

const storage = {
  getItem(key: string) { try { return sessionStorage.getItem(key); } catch { return null; } },
  setItem(key: string, value: string) { try { sessionStorage.setItem(key, value); } catch {} },
  removeItem(key: string) { try { sessionStorage.removeItem(key); } catch {} },
};
function mime(file: File): string {
  const extensions: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
    heic: "image/heic", heif: "image/heif", pdf: "application/pdf" };
  return file.type || extensions[file.name.split(".").at(-1)?.toLowerCase() ?? ""] || "";
}
async function hash(bytes: ArrayBuffer): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((v) => v.toString(16).padStart(2, "0")).join("");
}
function validSource(value: unknown): value is Source {
  const s = value as Source | undefined;
  return !!s && typeof s.id === "string" && UUID.test(s.id) && typeof s.objectKey === "string" &&
    /^orbit-card-sources\/[a-f0-9]{64}\/[a-f0-9]{64}\/[a-f0-9-]{36}$/.test(s.objectKey) && s.objectKey.endsWith(`/${s.id}`) &&
    typeof s.uploadExpiresAt === "string" && Number.isFinite(Date.parse(s.uploadExpiresAt));
}

export type CardImportUploadResult = { kind: "legacy" } | { kind: "created"; jobId: string } | { kind: "error"; code: string };
export function createV1CardUploader({ request = fetch, put = upload, cache = storage, timeoutMs = 120_000 }: {
  request?: typeof fetch; put?: typeof upload; cache?: Pick<Storage, "getItem" | "setItem" | "removeItem">; timeoutMs?: number;
} = {}) {
  const memory = new Map<string, Attempt>();
  const running = new Map<string, Promise<CardImportUploadResult>>();
  const post = <T>(url: string, body: unknown, wait = 30_000) => importJSON<T>(url, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }, request, Math.min(wait, timeoutMs));
  function save(key: string, attempt: Attempt) {
    memory.set(key, attempt); try { cache.setItem(key, JSON.stringify(attempt)); } catch {}
  }
  function load(key: string, count: number): Attempt {
    try {
      const value = memory.get(key) ?? JSON.parse(cache.getItem(key) ?? "null") as Attempt | null;
      if (value && UUID.test(value.requestKey) && typeof value.submitting === "boolean" && Array.isArray(value.files) &&
          value.files.length === count && value.files.every((file) => UUID.test(file.requestKey) && (!file.source || validSource(file.source)))) return value;
    } catch {}
    return { requestKey: crypto.randomUUID(), submitting: false, files: Array.from({ length: count }, () => ({ requestKey: crypto.randomUUID() })) };
  }
  const code = (error: unknown) => error instanceof CardImportClientError ? error.code : "IMPORT_UNAVAILABLE";
  return async function uploadFiles(files: readonly File[], progress: (done: number, total: number) => void = () => {}): Promise<CardImportUploadResult> {
    try {
      if (!files.length || files.length > 500 || files.some((file) => !["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"].includes(mime(file)) ||
          file.size < 1 || file.size > (mime(file) === "application/pdf" ? 50 : 10) * 1024 * 1024)) return { kind: "error", code: "INVALID_IMPORT_FILES" };
      const mode = await importJSON<{ directUpload: boolean }>(UPLOADS, undefined, request, Math.min(30_000, timeoutMs));
      if (mode.directUpload === false) return { kind: "legacy" };
      if (mode.directUpload !== true) return { kind: "error", code: "IMPORT_UNAVAILABLE" };
      const metadata = [];
      for (const file of files) metadata.push({ fileName: file.name, byteSize: file.size, mimeType: mime(file), digest: `sha256:${await hash(await file.arrayBuffer())}` });
      const key = `orbit-v1-card-import:${await hash(new TextEncoder().encode(JSON.stringify(metadata)).buffer as ArrayBuffer)}`;
      const existing = running.get(key); if (existing) return existing;
      const perform = async (): Promise<CardImportUploadResult> => {
        const attempt = load(key, files.length);
        const create = async (): Promise<CardImportUploadResult> => {
          attempt.submitting = true; save(key, attempt);
          const result = await post<{ job: { id: string } }>(IMPORTS, { requestKey: attempt.requestKey, sourceIds: attempt.files.map((file) => file.source!.id) }, 60_000);
          if (!UUID.test(result.job?.id ?? "")) throw new CardImportClientError("IMPORT_UNAVAILABLE");
          memory.delete(key); try { cache.removeItem(key); } catch {}
          return { kind: "created", jobId: result.job.id };
        };
        try {
          // An uncertain admission may already own every source. Recover it
          // before checking or replacing any of those references.
          if (attempt.submitting && attempt.files.every((file) => file.source)) {
            try { return await create(); }
            catch (error) { if (!["IMPORT_CONFLICT", "IMPORT_SOURCE_EXPIRED", "IMPORT_NOT_FOUND"].includes(code(error))) throw error; }
          }
          save(key, attempt);
          for (let i = 0; i < files.length; i++) {
            let accepted = false;
            for (let renewal = 0; renewal < 2 && !accepted; renewal++) {
              const entry = attempt.files[i];
              const renew = () => {
                attempt.files[i] = { requestKey: crypto.randomUUID() };
                attempt.requestKey = crypto.randomUUID(); attempt.submitting = false; save(key, attempt);
              };
              const verify = async () => {
                const result = await post<{ sourceId: string; verified: boolean }>(`${IMPORTS}/verify-source`, { sourceId: entry.source!.id }, 90_000);
                if (!result.verified || result.sourceId !== entry.source!.id) throw new CardImportClientError("IMPORT_UNAVAILABLE");
              };
              if (entry.source) {
                try { await verify(); accepted = true; break; }
                catch (error) {
                  const reason = code(error);
                  if (["UPLOAD_SOURCE_EXPIRED", "IMPORT_NOT_FOUND"].includes(reason) ||
                      (reason === "UPLOAD_SOURCE_NOT_UPLOADED" && Date.parse(entry.source.uploadExpiresAt) <= Date.now())) { renew(); continue; }
                  if (reason !== "UPLOAD_SOURCE_NOT_UPLOADED") throw error;
                }
              } else {
                let reservation: { source: Source & { digest: string; byteSize: number; mimeType: string } };
                try { reservation = await post(UPLOADS, { requestKey: entry.requestKey, pipeline: "v1", ...metadata[i] }); }
                catch (error) { if (code(error) === "UPLOAD_SOURCE_EXPIRED") { renew(); continue; } throw error; }
                const source = reservation.source;
                if (!validSource(source) || source.digest !== metadata[i].digest || source.byteSize !== files[i].size || source.mimeType !== metadata[i].mimeType) {
                  throw new CardImportClientError("IMPORT_UNAVAILABLE");
                }
                entry.source = { id: source.id, objectKey: source.objectKey, uploadExpiresAt: source.uploadExpiresAt }; save(key, attempt);
              }
              const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
              try {
                await Promise.race([put(entry.source.objectKey, files[i], { access: "private", handleUploadUrl: `${UPLOADS}/token`,
                  clientPayload: entry.source.id, contentType: metadata[i].mimeType, multipart: true, abortSignal: controller.signal }),
                new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("Upload timeout")); }, timeoutMs); })]);
                accepted = true;
              } catch {
                // A lost SDK response is not proof the upload failed.
                await verify(); accepted = true;
              } finally { clearTimeout(timer); controller.abort(); }
            }
            if (!accepted) throw new CardImportClientError("UPLOAD_SOURCE_EXPIRED");
            progress(i + 1, files.length);
          }
          return await create();
        } catch (error) { return { kind: "error", code: code(error) }; }
      };
      const task = perform().finally(() => running.delete(key)); running.set(key, task); return await task;
    } catch (error) { return { kind: "error", code: code(error) }; }
  };
}

export const uploadV1CardFiles = createV1CardUploader();
