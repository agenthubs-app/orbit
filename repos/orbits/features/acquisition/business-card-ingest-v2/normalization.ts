import convert from "heic-convert";
import sharp from "sharp";

import {
  INGEST_V2_DERIVATIVE_HARD_MAX_BYTES,
  INGEST_V2_DERIVATIVE_TARGET_EDGE_PX,
  INGEST_V2_MAX_RAW_BYTES,
} from "./contract";

// 标准化（方案 §二）：校验 → EXIF 旋转 → 缩放 → 自适应压缩 → 去元数据。不裁切。
// 失败即 IMAGE_INVALID，当场返回给上传请求，不产生僵尸任务。

export type IngestImageInvalidReason =
  | "UNSUPPORTED_MIME"
  | "MAGIC_MISMATCH"
  | "RAW_TOO_LARGE"
  | "TOO_MANY_PIXELS"
  | "DECODE_FAILED"
  | "DERIVATIVE_TOO_LARGE";

export class IngestImageInvalidError extends Error {
  constructor(
    public readonly reason: IngestImageInvalidReason,
    message: string,
  ) {
    super(message);
    this.name = "IngestImageInvalidError";
  }
}

const MAX_PIXELS = 60_000_000;
const JPEG_QUALITY_LADDER = [82, 70, 60, 52] as const;
const TARGET_MAX_BYTES = 1_200_000;

export const INGEST_V2_UPLOAD_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export type IngestUploadMimeType = (typeof INGEST_V2_UPLOAD_MIME_TYPES)[number];

export function isIngestUploadMimeType(value: string): value is IngestUploadMimeType {
  return INGEST_V2_UPLOAD_MIME_TYPES.some((mime) => mime === value);
}

type SniffedKind = "jpeg" | "png" | "webp" | "heif";

function sniffKind(bytes: Buffer): SniffedKind | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "png";
  }
  if (
    bytes.length >= 12 &&
    bytes.toString("latin1", 0, 4) === "RIFF" &&
    bytes.toString("latin1", 8, 12) === "WEBP"
  ) {
    return "webp";
  }
  if (bytes.length >= 12 && bytes.toString("latin1", 4, 8) === "ftyp") {
    return "heif";
  }
  return null;
}

const KIND_BY_MIME: Record<IngestUploadMimeType, SniffedKind> = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heif",
  "image/heif": "heif",
};

/**
 * 在完整解码前从 HEIC 容器的 ispe 盒读出像素尺寸（解码器级像素上限——
 * heic-convert 自身没有限额，方案 §二 要求不允许"解码后再查像素"）。
 * 盒结构简单线性扫描即可；多图容器取最大值。
 */
export function scanHeifDeclaredPixels(bytes: Buffer): number | null {
  let maxPixels: number | null = null;
  const marker = Buffer.from("ispe", "latin1");
  let offset = 0;
  while (offset < bytes.length) {
    const index = bytes.indexOf(marker, offset);
    if (index < 0 || index + 16 > bytes.length) {
      break;
    }
    // ispe: [size(4)] 'ispe' [version/flags(4)] [width(4)] [height(4)]
    const width = bytes.readUInt32BE(index + 8);
    const height = bytes.readUInt32BE(index + 12);
    if (width > 0 && height > 0 && width < 100_000 && height < 100_000) {
      const pixels = width * height;
      maxPixels = maxPixels === null ? pixels : Math.max(maxPixels, pixels);
    }
    offset = index + 4;
  }
  return maxPixels;
}

export interface NormalizedIngestImage {
  jpegBytes: Buffer;
  width: number;
  height: number;
}

export async function normalizeIngestImage(input: {
  bytes: Buffer;
  declaredMimeType: string;
}): Promise<NormalizedIngestImage> {
  const { bytes } = input;
  if (bytes.length === 0 || bytes.length > INGEST_V2_MAX_RAW_BYTES) {
    throw new IngestImageInvalidError(
      "RAW_TOO_LARGE",
      `raw upload must be 1..${INGEST_V2_MAX_RAW_BYTES} bytes`,
    );
  }
  if (!isIngestUploadMimeType(input.declaredMimeType)) {
    throw new IngestImageInvalidError(
      "UNSUPPORTED_MIME",
      `unsupported mime type: ${input.declaredMimeType}`,
    );
  }
  const sniffed = sniffKind(bytes);
  if (!sniffed) {
    throw new IngestImageInvalidError("MAGIC_MISMATCH", "unrecognized image container");
  }
  if (sniffed !== KIND_BY_MIME[input.declaredMimeType]) {
    throw new IngestImageInvalidError(
      "MAGIC_MISMATCH",
      `declared ${input.declaredMimeType} but content is ${sniffed}`,
    );
  }

  let decodable: Buffer = bytes;
  if (sniffed === "heif") {
    const declaredPixels = scanHeifDeclaredPixels(bytes);
    if (declaredPixels !== null && declaredPixels > MAX_PIXELS) {
      throw new IngestImageInvalidError(
        "TOO_MANY_PIXELS",
        `heif declares ${declaredPixels} pixels (limit ${MAX_PIXELS})`,
      );
    }
    try {
      const converted = await convert({
        buffer: bytes,
        format: "JPEG",
        quality: 0.92,
      });
      decodable = Buffer.from(converted);
    } catch (error) {
      throw new IngestImageInvalidError(
        "DECODE_FAILED",
        `heif decode failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // sharp 的 limitInputPixels 是解码器级限额（方案 §二）。
  const pipelineFor = (quality: number) =>
    sharp(decodable, { limitInputPixels: MAX_PIXELS })
      .rotate()
      .resize(INGEST_V2_DERIVATIVE_TARGET_EDGE_PX, INGEST_V2_DERIVATIVE_TARGET_EDGE_PX, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality, mozjpeg: true });

  let lastError: unknown = null;
  for (const quality of JPEG_QUALITY_LADDER) {
    try {
      const { data, info } = await pipelineFor(quality).toBuffer({
        resolveWithObject: true,
      });
      if (data.length <= TARGET_MAX_BYTES) {
        return { jpegBytes: data, width: info.width, height: info.height };
      }
      if (
        quality === JPEG_QUALITY_LADDER[JPEG_QUALITY_LADDER.length - 1] &&
        data.length <= INGEST_V2_DERIVATIVE_HARD_MAX_BYTES
      ) {
        return { jpegBytes: data, width: info.width, height: info.height };
      }
      lastError = null;
    } catch (error) {
      lastError = error;
      break;
    }
  }
  if (lastError) {
    const message = lastError instanceof Error ? lastError.message : String(lastError);
    if (/pixel limit/i.test(message)) {
      throw new IngestImageInvalidError("TOO_MANY_PIXELS", message);
    }
    throw new IngestImageInvalidError("DECODE_FAILED", `decode failed: ${message}`);
  }
  throw new IngestImageInvalidError(
    "DERIVATIVE_TOO_LARGE",
    `derivative exceeds ${INGEST_V2_DERIVATIVE_HARD_MAX_BYTES} bytes even at minimum quality`,
  );
}

/**
 * 标准化并发准入（方案 §二）：per-actor 1 + 全局上限，防多用户同时解码
 * HEIC 耗尽内存。进程内信号量对单实例部署（P4 门槛）正确。
 */
export function createNormalizationGate(options?: { globalLimit?: number }) {
  const globalLimit = options?.globalLimit ?? 3;
  let globalActive = 0;
  const globalWaiters: Array<() => void> = [];
  const actorActive = new Set<string>();
  const actorWaiters = new Map<string, Array<() => void>>();

  async function acquireGlobal(): Promise<void> {
    if (globalActive < globalLimit) {
      globalActive += 1;
      return;
    }
    await new Promise<void>((resolve) => globalWaiters.push(resolve));
    globalActive += 1;
  }

  function releaseGlobal(): void {
    globalActive -= 1;
    globalWaiters.shift()?.();
  }

  async function acquireActor(actorId: string): Promise<void> {
    if (!actorActive.has(actorId)) {
      actorActive.add(actorId);
      return;
    }
    await new Promise<void>((resolve) => {
      const queue = actorWaiters.get(actorId) ?? [];
      queue.push(resolve);
      actorWaiters.set(actorId, queue);
    });
    actorActive.add(actorId);
  }

  function releaseActor(actorId: string): void {
    actorActive.delete(actorId);
    const queue = actorWaiters.get(actorId);
    const next = queue?.shift();
    if (queue && queue.length === 0) {
      actorWaiters.delete(actorId);
    }
    next?.();
  }

  return {
    async run<T>(actorId: string, fn: () => Promise<T>): Promise<T> {
      await acquireActor(actorId);
      try {
        await acquireGlobal();
        try {
          return await fn();
        } finally {
          releaseGlobal();
        }
      } finally {
        releaseActor(actorId);
      }
    },
  };
}
