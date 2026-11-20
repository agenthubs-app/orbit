/**
 * 2026-11-20 主办方上传的活动图片（`POST /api/host/events/[id]/cover`）：校验 → 转 webp、按 focusY 裁成 2:1、最长边 1600 →
 * 存 Vercel Blob（private，经 `/api/event-covers/…` 公开读取，见 blobStore）。HEIC 先用 heic-convert 转 JPEG（同名片识别的做法）。
 * - 类型按文件头判断（声明的 MIME 只作参考，不信任）；≤ 8MB。
 * - 存储：有 `BLOB_READ_WRITE_TOKEN`（或在 Vercel 上）→ Blob；本机开发没有令牌 → 写 `public/orbit-covers/uploads/`（gitignore），
 *   返回站内路径；生产环境没有令牌 → 明确报错（不静默退回本地盘）。
 */
import { createHash } from "node:crypto";

export const EVENT_COVER_MAX_BYTES = 8 * 1024 * 1024;
export const EVENT_COVER_MAX_EDGE = 1600;
const WEBP_QUALITY = 82;

export type EventCoverErrorCode = "COVER_FILE_MISSING" | "COVER_TYPE_UNSUPPORTED" | "COVER_TOO_LARGE" | "COVER_FOCUS_INVALID" | "COVER_IMAGE_UNREADABLE" | "COVER_STORAGE_UNCONFIGURED" | "COVER_STORAGE_FAILED";

export class EventCoverError extends Error {
  constructor(readonly code: EventCoverErrorCode, message: string = code) {
    super(message);
    this.name = "EventCoverError";
  }
}

export type EventCoverSourceType = "image/jpeg" | "image/png" | "image/webp" | "image/heic";
const DECLARED_OK = new Set(["", "application/octet-stream", "image/jpeg", "image/jpg", "image/pjpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"]);

/** 文件头 → 类型（jpg / png / webp / heic-heif）；其他一律 null。 */
export function sniffEventCoverType(bytes: Uint8Array): EventCoverSourceType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png";
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (bytes.length >= 12 && ascii(4, 8) === "ftyp" && ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1", "heif"].includes(ascii(8, 12))) return "image/heic";
  return null;
}

/** focusY：缺省 0.5（居中）；给了就必须是 0–1 的数。 */
export function parseEventCoverFocus(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0.5;
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : Number.NaN;
  if (!Number.isFinite(number) || number < 0 || number > 1) throw new EventCoverError("COVER_FOCUS_INVALID", "focusY must be a number between 0 and 1.");
  return number;
}

/** 上传前的校验（类型 / 大小）；返回按文件头判断的类型。 */
export function validateEventCoverUpload(input: { bytes: Uint8Array; declaredType?: string | null }): EventCoverSourceType {
  if (!input.bytes.length) throw new EventCoverError("COVER_FILE_MISSING", "Attach an image file.");
  if (input.bytes.length > EVENT_COVER_MAX_BYTES) throw new EventCoverError("COVER_TOO_LARGE", "The image must be 8MB or smaller.");
  const declared = (input.declaredType ?? "").trim().toLowerCase();
  const sniffed = sniffEventCoverType(input.bytes);
  if (!DECLARED_OK.has(declared) || !sniffed) throw new EventCoverError("COVER_TYPE_UNSUPPORTED", "Use a JPG, PNG, WebP or HEIC image.");
  return sniffed;
}

/** 2:1 裁剪框：比 2:1 宽 → 左右居中裁；比 2:1 高 → 按 focusY 上下取。 */
export function eventCoverCrop(width: number, height: number, focusY: number): { left: number; top: number; width: number; height: number } {
  if (width / height >= 2) {
    const cropWidth = Math.max(1, Math.min(width, Math.round(height * 2)));
    return { height, left: Math.floor((width - cropWidth) / 2), top: 0, width: cropWidth };
  }
  const cropHeight = Math.max(1, Math.min(height, Math.round(width / 2)));
  return { height: cropHeight, left: 0, top: Math.round((height - cropHeight) * Math.min(1, Math.max(0, focusY))), width };
}

/** 转码：HEIC → JPEG（heic-convert）→ sharp：按 EXIF 摆正、2:1 裁剪、最长边 ≤ 1600、webp。 */
export async function renderEventCover(bytes: Uint8Array, type: EventCoverSourceType, focusY: number): Promise<Buffer> {
  try {
    const { default: sharp } = await import("sharp");
    let source = Buffer.from(bytes);
    if (type === "image/heic") {
      const { default: convert } = await import("heic-convert");
      source = Buffer.from(await convert({ buffer: source, format: "JPEG", quality: 0.92 }));
    }
    const upright = await sharp(source, { limitInputPixels: 80_000_000 }).rotate().toBuffer({ resolveWithObject: true });
    const crop = eventCoverCrop(upright.info.width, upright.info.height, focusY);
    return await sharp(upright.data)
      .extract(crop)
      .resize({ fit: "inside", height: EVENT_COVER_MAX_EDGE / 2, width: EVENT_COVER_MAX_EDGE, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
  } catch {
    throw new EventCoverError("COVER_IMAGE_UNREADABLE", "The image could not be read.");
  }
}

export interface EventCoverStore {
  /** 存一张已处理的 webp，返回可直接显示的 coverUrl（https:// 或站内 `/`）。 */
  put(input: { workspaceId: string; eventId: string; webp: Buffer }): Promise<string>;
}

/** 内容寻址的对象名：`orbit-event-covers/<活动摘要>/<内容摘要>.webp`（不暴露活动 id）。 */
export function eventCoverObjectName(workspaceId: string, eventId: string, webp: Buffer): string {
  const scope = createHash("sha256").update(`${workspaceId}\u0000${eventId}`).digest("hex").slice(0, 20);
  const content = createHash("sha256").update(webp).digest("hex").slice(0, 24);
  return `orbit-event-covers/${scope}/${content}.webp`;
}

/** 站内读取地址：`/api/event-covers/<活动摘要>/<内容摘要>.webp`（对象名去掉前缀；内容寻址 → 可长缓存）。 */
export const EVENT_COVER_ROUTE_PREFIX = "/api/event-covers/";
const OBJECT_PATTERN = /^orbit-event-covers\/([0-9a-f]{20})\/([0-9a-f]{24})\.webp$/u;

export function eventCoverRoutePath(objectName: string): string {
  const match = OBJECT_PATTERN.exec(objectName);
  if (!match) throw new EventCoverError("COVER_STORAGE_FAILED", "Unexpected cover object name.");
  return `${EVENT_COVER_ROUTE_PREFIX}${match[1]}/${match[2]}.webp`;
}

/** 读取路由的参数 → 对象名；格式不对返回 null（路由回 404）。 */
export function eventCoverObjectFromRoute(scope: string, file: string): string | null {
  const name = `orbit-event-covers/${scope}/${file}`;
  return OBJECT_PATTERN.test(name) ? name : null;
}

// 生产 Blob store 是 private（名片同库），封面也存 private，经 `/api/event-covers/…` 公开读出并让 CDN 长缓存。
const blobStore: EventCoverStore = {
  async put({ eventId, webp, workspaceId }) {
    const { put } = await import("@vercel/blob");
    const name = eventCoverObjectName(workspaceId, eventId, webp);
    await put(name, webp, { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "image/webp" });
    return eventCoverRoutePath(name);
  },
};

function localStore(rootDir: string): EventCoverStore {
  return {
    async put({ eventId, webp, workspaceId }) {
      const { mkdir, writeFile } = await import("node:fs/promises");
      const path = await import("node:path");
      const file = eventCoverObjectName(workspaceId, eventId, webp).replace(/^orbit-event-covers\//u, "").replace("/", "-");
      await mkdir(rootDir, { recursive: true });
      await writeFile(path.join(rootDir, file), webp);
      return `/orbit-covers/uploads/${file}`;
    },
  };
}

/** 按环境选存储：Blob 令牌 / Vercel → Blob；本机非生产 → public/orbit-covers/uploads；否则 null（路由报 COVER_STORAGE_UNCONFIGURED）。 */
export function configuredEventCoverStore(env: Record<string, string | undefined> = process.env): EventCoverStore | null {
  if (env.BLOB_READ_WRITE_TOKEN?.trim() || env.VERCEL === "1") return blobStore;
  if (env.NODE_ENV === "production") return null;
  return localStore(env.ORBIT_EVENT_COVER_DIR ?? "public/orbit-covers/uploads");
}
