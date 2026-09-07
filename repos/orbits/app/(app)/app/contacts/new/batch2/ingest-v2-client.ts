"use client";

import type {
  IngestBatchDTO,
  IngestItemDTO,
} from "../../../../../../features/acquisition/business-card-ingest-v2/contract";

// V2 摄取的客户端工具：digest 计算、待上传文件暂存（内存，页面刷新即失效——
// 刷新后用户重新选择照片，按 digest 匹配回 manifest 续传）。

export const INGEST_V2_API_BASE = "/api/contact-drafts/business-card/batches/v2";

export interface IngestBatchDetail {
  batch: IngestBatchDTO;
  items: IngestItemDTO[];
}

export async function sha256OfFile(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  return `sha256:${hex}`;
}

export function resolveUploadMimeType(file: File): string {
  if (file.type?.trim()) {
    return file.type.trim();
  }
  const name = file.name.toLowerCase();
  if (name.endsWith(".heic")) return "image/heic";
  if (name.endsWith(".heif")) return "image/heif";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

const pendingFilesByBatch = new Map<string, Map<string, File>>();

export function stashPendingFiles(batchId: string, byDigest: Map<string, File>): void {
  pendingFilesByBatch.set(batchId, byDigest);
}

/**
 * 非破坏性读取：返回同一 Map 实例（没有则注册一个空的）。
 * React Strict Mode 在 dev 下双挂载组件，破坏性 take 会让第二次挂载拿到空表。
 */
export function getPendingFiles(batchId: string): Map<string, File> {
  const existing = pendingFilesByBatch.get(batchId);
  if (existing) {
    return existing;
  }
  const created = new Map<string, File>();
  pendingFilesByBatch.set(batchId, created);
  return created;
}

export async function fetchBatchDetail(batchId: string): Promise<IngestBatchDetail | null> {
  const response = await fetch(`${INGEST_V2_API_BASE}/${batchId}`);
  if (!response.ok) {
    return null;
  }
  const body = (await response.json()) as { data?: IngestBatchDetail };
  return body.data ?? null;
}

export async function uploadItemContent(input: {
  batchId: string;
  itemId: string;
  file: File;
}): Promise<{ ok: boolean; errorCode: string | null }> {
  const response = await fetch(
    `${INGEST_V2_API_BASE}/${input.batchId}/items/${input.itemId}/content`,
    {
      body: input.file,
      headers: { "Content-Type": resolveUploadMimeType(input.file) },
      method: "PUT",
    },
  );
  if (response.ok) {
    return { ok: true, errorCode: null };
  }
  const body = (await response.json().catch(() => null)) as {
    error?: { message?: string };
  } | null;
  const message = body?.error?.message ?? `HTTP_${response.status}`;
  return { ok: false, errorCode: message.split(":")[0] ?? "UPLOAD_FAILED" };
}

export async function postAction(path: string, body?: unknown): Promise<Response> {
  return fetch(`${INGEST_V2_API_BASE}${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    method: "POST",
  });
}
