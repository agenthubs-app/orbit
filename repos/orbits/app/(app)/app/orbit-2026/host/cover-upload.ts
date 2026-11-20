"use client";

// 2026-11-20 主办方的活动图片（カバー画像）：选图 → 浏览器里先压缩 → POST /api/host/events/[id]/cover（multipart: file, focusY）。
// Vercel 函数请求体上限约 4.5MB：能解码的图（JPG / PNG / WebP）在 canvas 里缩到最长边 2400、JPEG 质量 0.85，
// 还 ≥ 4MB 就继续按 0.8 缩小（最多 6 次）；HEIC 浏览器解码不了，原样上传（服务端 heic-convert），> 4.5MB 直接报错。
import { hostEventCoverResultSchema } from "../../../../../shared/api-schema/host-events";
import type { HostEventCoverResult } from "../../../../../shared/contract/host-events";

export const COVER_SERVER_MAX = 8 * 1024 * 1024;
export const COVER_BODY_LIMIT = 4.5 * 1024 * 1024;
export const COVER_TARGET = 4 * 1024 * 1024;
export const COVER_MAX_EDGE = 2400;
const QUALITY = 0.85;

export type CoverKind = "image" | "heic" | "unsupported";

/** 文件属于哪类（MIME 或扩展名）。 */
export function coverKindOf(file: { type: string; name: string }): CoverKind {
  const type = (file.type || "").toLowerCase();
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (/^image\/(heic|heif)(-sequence)?$/.test(type) || ext === "heic" || ext === "heif") return "heic";
  if (["image/jpeg", "image/jpg", "image/pjpeg", "image/png", "image/webp"].includes(type) || ["jpg", "jpeg", "png", "webp"].includes(ext)) return "image";
  return "unsupported";
}

/** 能解码的图要不要重新编码（体积 ≥ 4MB 或最长边 > 2400）。 */
export function needsShrink(size: number, width: number, height: number): boolean {
  return size >= COVER_TARGET || Math.max(width, height) > COVER_MAX_EDGE;
}

/** 缩放后的尺寸（最长边 ≤ edge）。 */
export function fitEdge(width: number, height: number, edge: number): { width: number; height: number } {
  const scale = Math.min(1, edge / Math.max(width, height));
  return { height: Math.max(1, Math.round(height * scale)), width: Math.max(1, Math.round(width * scale)) };
}

export type PreparedCover = { ok: true; blob: Blob; name: string; url: string } | { ok: false; error: "type" | "tooLarge" | "unreadable" };

/** 选中的文件 → 可上传的 Blob（+ 本地预览 URL）。 */
export async function prepareCover(file: File): Promise<PreparedCover> {
  const kind = coverKindOf(file);
  if (kind === "unsupported") return { error: "type", ok: false };
  if (kind === "heic") {
    if (file.size > COVER_BODY_LIMIT) return { error: "tooLarge", ok: false };
    // 浏览器多半画不出 HEIC：预览用一张空白占位（img 加载失败也不报错），上传后以服务端裁好的图为准。
    return { blob: file, name: file.name, ok: true, url: URL.createObjectURL(file) };
  }
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); } catch { return { error: "unreadable", ok: false }; }
  if (!needsShrink(file.size, bitmap.width, bitmap.height)) {
    bitmap.close();
    return { blob: file, name: file.name, ok: true, url: URL.createObjectURL(file) };
  }
  let edge = Math.min(COVER_MAX_EDGE, Math.max(bitmap.width, bitmap.height));
  let blob: Blob | null = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const size = fitEdge(bitmap.width, bitmap.height, edge);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) break;
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
    if (blob && blob.size < COVER_TARGET) break;
    edge = Math.round(edge * 0.8);
  }
  bitmap.close();
  if (!blob) return { error: "unreadable", ok: false };
  if (blob.size >= COVER_BODY_LIMIT) return { error: "tooLarge", ok: false };
  const name = `${file.name.replace(/\.[^.]+$/, "") || "cover"}.jpg`;
  return { blob, name, ok: true, url: URL.createObjectURL(blob) };
}

export type CoverCallResult = { ok: true; data: HostEventCoverResult } | { ok: false; error: "tooLarge" | "type" | "sample" | "forbidden" | "failed" };

async function coverCall(url: string, init: RequestInit): Promise<CoverCallResult> {
  try {
    const response = await fetch(url, init);
    const body = (await response.json().catch(() => null)) as { data?: unknown; error?: { context?: { reason?: string } } } | null;
    if (!response.ok) {
      const reason = body?.error?.context?.reason ?? "";
      if (response.status === 413 || reason === "COVER_TOO_LARGE") return { error: "tooLarge", ok: false };
      if (reason === "COVER_TYPE_UNSUPPORTED" || reason === "COVER_IMAGE_UNREADABLE") return { error: "type", ok: false };
      if (reason === "SAMPLE_READ_ONLY") return { error: "sample", ok: false };
      if (response.status === 401 || response.status === 403) return { error: "forbidden", ok: false };
      return { error: "failed", ok: false };
    }
    const parsed = hostEventCoverResultSchema.safeParse(body?.data);
    return parsed.success ? { data: parsed.data, ok: true } : { error: "failed", ok: false };
  } catch {
    return { error: "failed", ok: false };
  }
}

export const coverApi = {
  upload: (eventId: string, blob: Blob, name: string, focusY: number) => {
    const form = new FormData();
    form.append("file", blob, name);
    form.append("focusY", String(Math.round(Math.max(0, Math.min(1, focusY)) * 1000) / 1000));
    return coverCall(`/api/host/events/${encodeURIComponent(eventId)}/cover`, { body: form, method: "POST" });
  },
  remove: (eventId: string) => coverCall(`/api/host/events/${encodeURIComponent(eventId)}/cover`, { method: "DELETE" }),
};

/** 失败原因（tsconfig 不开 strictNullChecks，判别联合不收窄，这里统一取）。 */
export const coverError = (result: PreparedCover | CoverCallResult): string => (result as { error?: string }).error ?? "failed";
