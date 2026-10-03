import { fromByteArray } from "base64-js";
import { filetypeinfo } from "magic-bytes.js";
import { MAX_ORBIT_BINARY_BYTES, type OrbitApiBytes, type OrbitApiClient } from "./client";
import type { ApiResult } from "./types";
import {
  isSupportedBatchImageSource,
  openBatchImageSource,
  type BrowserBatchImageFile
} from "./batch-image-source";
import { openBatchImageCompressor } from "./batch-image-compressor";

export type BatchImageMimeType = "image/jpeg" | "image/png" | "image/webp" | "image/heic" | "image/heif";
export interface BatchImageInput {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  file?: BrowserBatchImageFile | null;
}
export interface PreparedBatchImage {
  uri: string;
  fileName: string;
  mimeType: BatchImageMimeType;
  rawSize: number;
  clientDigest: string;
}
export interface BatchImageNative {
  openFile(uri: string, input?: BatchImageInput): Promise<{
    exists: boolean;
    size: number;
    bytes(): Promise<Uint8Array<ArrayBuffer>>;
  }>;
  sha256(bytes: Uint8Array<ArrayBuffer>): Promise<ArrayBuffer>;
}
// Sprint 0140: an image over the upload limit is re-encoded on the device
// before it is digested or uploaded. The ladder is fixed so the same photo
// always yields the same attempt sequence; 2048 px on the long edge is the
// floor, which keeps a hand-held business card legible for review and OCR.
export interface BatchImageCompressionStep {
  maxLongEdge: number;
  quality: number;
}
export const BATCH_IMAGE_COMPRESSION_STEPS: readonly BatchImageCompressionStep[] = Object.freeze([
  { maxLongEdge: 4096, quality: 0.85 },
  { maxLongEdge: 3200, quality: 0.8 },
  { maxLongEdge: 2560, quality: 0.75 },
  { maxLongEdge: 2048, quality: 0.7 }
]);
export interface CompressedBatchImageCopy {
  uri: string;
  size: number;
  file?: BrowserBatchImageFile | null;
}
export interface OpenedBatchImageForCompression {
  width: number;
  height: number;
  /** Encodes a JPEG copy at exactly the given pixel size. */
  encode(size: { width: number; height: number }, quality: number): Promise<CompressedBatchImageCopy>;
  discard(copy: CompressedBatchImageCopy): Promise<void> | void;
  close(): void;
}
export interface BatchImageCompressor {
  open(input: BatchImageInput): Promise<OpenedBatchImageForCompression>;
}
export interface BatchImageOptions {
  native?: BatchImageNative;
  signal?: AbortSignal;
  compressor?: BatchImageCompressor;
  /** Upload limit for this transport; defaults to the 10 MiB binary limit. */
  maxBytes?: number;
}
export interface SelectedBatchImage {
  uri: string;
  mimeType: BatchImageMimeType;
  rawSize: number;
}
export type BatchImageErrorCode =
  | "CANCELLED" | "INVALID_URI" | "FILE_UNREADABLE" | "EMPTY_FILE"
  | "FILE_TOO_LARGE" | "TOO_MANY_FILES" | "UNSUPPORTED_IMAGE"
  | "HASH_FAILED" | "FILE_CHANGED" | "API_ERROR" | "COMPRESSION_FAILED";
export class BatchImageError extends Error {
  constructor(
    readonly code: BatchImageErrorCode,
    message: string,
    readonly apiFailure?: Extract<ApiResult<never>, { success: false }>
  ) {
    super(message);
    this.name = code === "CANCELLED" ? "AbortError" : "BatchImageError";
  }
}

const defaultCompressor: BatchImageCompressor = { open: openBatchImageCompressor };

const nativeBoundary: BatchImageNative = {
  async openFile(_uri, input) {
    return openBatchImageSource(input ?? { uri: _uri });
  },
  async sha256(bytes) {
    const { digest, CryptoDigestAlgorithm } = await import("expo-crypto");
    return digest(CryptoDigestAlgorithm.SHA256, bytes);
  }
};

function checkCancellation(signal?: AbortSignal): void {
  if (signal?.aborted) throw new BatchImageError("CANCELLED", "图片处理已取消。");
}

function uploadLimit(options: BatchImageOptions): number {
  const limit = options.maxBytes;
  return limit !== undefined && Number.isSafeInteger(limit) && limit > 0 && limit < MAX_ORBIT_BINARY_BYTES
    ? limit : MAX_ORBIT_BINARY_BYTES;
}

function validateSize(size: number, limit = MAX_ORBIT_BINARY_BYTES): void {
  if (!Number.isSafeInteger(size) || size < 0) {
    throw new BatchImageError("FILE_UNREADABLE", "无法读取图片，请重新选择。");
  }
  if (size === 0) throw new BatchImageError("EMPTY_FILE", "图片文件为空，请重新选择。");
  if (size > limit) {
    throw new BatchImageError("FILE_TOO_LARGE", "图片不能超过 10 MiB，请更换文件。");
  }
}

function compressedSize(width: number, height: number, maxLongEdge: number): { width: number; height: number } {
  const longEdge = Math.max(width, height);
  if (longEdge <= maxLongEdge) return { width, height };
  const scale = maxLongEdge / longEdge;
  return {
    width: Math.max(1, width >= height ? maxLongEdge : Math.round(width * scale)),
    height: Math.max(1, height > width ? maxLongEdge : Math.round(height * scale))
  };
}

function compressedFileName(fileName: string | null | undefined, uri: string): string {
  const base = fileName?.trim() || uri.split("/").pop() || "image";
  return `${base.replace(/\.[^./]*$/u, "") || "image"}.jpg`;
}

const OVERSIZED = Symbol("oversized");

async function compressOversized(input: BatchImageInput, options: BatchImageOptions): Promise<BatchImageInput> {
  const limit = uploadLimit(options);
  let opened: OpenedBatchImageForCompression;
  try {
    opened = await (options.compressor ?? defaultCompressor).open({ ...input });
  } catch {
    checkCancellation(options.signal);
    throw new BatchImageError("COMPRESSION_FAILED", "这张图片太大，且无法在本机压缩，请重拍或换一张。");
  }
  try {
    for (const step of BATCH_IMAGE_COMPRESSION_STEPS) {
      checkCancellation(options.signal);
      let copy: CompressedBatchImageCopy;
      try {
        copy = await opened.encode(compressedSize(opened.width, opened.height, step.maxLongEdge), step.quality);
      } catch {
        checkCancellation(options.signal);
        throw new BatchImageError("COMPRESSION_FAILED", "这张图片太大，且无法在本机压缩，请重拍或换一张。");
      }
      if (options.signal?.aborted || !(copy.size > 0 && copy.size <= limit)) {
        await opened.discard(copy);
        checkCancellation(options.signal);
        continue;
      }
      return {
        uri: copy.uri,
        fileName: compressedFileName(input.fileName, input.uri),
        mimeType: "image/jpeg",
        fileSize: copy.size,
        file: copy.file ?? null
      };
    }
    throw new BatchImageError("FILE_TOO_LARGE", "图片压缩后仍然太大，请重拍或换一张。");
  } finally {
    opened.close();
  }
}

function imageMime(bytes: Uint8Array): BatchImageMimeType {
  const matches = new Set<BatchImageMimeType>();
  for (const match of filetypeinfo(bytes)) {
    const mime = match.mime === "image/heif" && match.extension === "heic"
      ? "image/heic" : match.mime;
    if (mime === "image/jpeg" || mime === "image/png" || mime === "image/webp" ||
        mime === "image/heic" || mime === "image/heif") matches.add(mime);
  }
  const [mime] = matches;
  if (matches.size !== 1 || !mime) {
    throw new BatchImageError("UNSUPPORTED_IMAGE", "无法识别图片格式，请更换文件。");
  }
  return mime;
}

async function readOriginal(input: BatchImageInput, options: BatchImageOptions): Promise<Uint8Array<ArrayBuffer>>;
async function readOriginal(input: BatchImageInput, options: BatchImageOptions, allowOversized: true): Promise<Uint8Array<ArrayBuffer> | typeof OVERSIZED>;
async function readOriginal(input: BatchImageInput, options: BatchImageOptions, allowOversized = false): Promise<Uint8Array<ArrayBuffer> | typeof OVERSIZED> {
  checkCancellation(options.signal);
  if (!isSupportedBatchImageSource(input.uri)) {
    throw new BatchImageError("INVALID_URI", "请选择本机图片文件。");
  }
  const limit = uploadLimit(options);
  if (input.fileSize !== undefined && input.fileSize !== null) {
    if (allowOversized && Number.isSafeInteger(input.fileSize) && input.fileSize > limit) return OVERSIZED;
    validateSize(input.fileSize, limit);
  }
  try {
    const file = await (options.native ?? nativeBoundary).openFile(input.uri, input);
    checkCancellation(options.signal);
    if (!file.exists) throw new BatchImageError("FILE_UNREADABLE", "无法读取图片，请重新选择。");
    const size = file.size;
    if (allowOversized && Number.isSafeInteger(size) && size > limit) return OVERSIZED;
    validateSize(size, limit);
    const bytes = await file.bytes();
    checkCancellation(options.signal);
    validateSize(bytes.byteLength, limit);
    if (size !== bytes.byteLength) throw new BatchImageError("FILE_CHANGED", "图片已变化，请重新选择。");
    return bytes;
  } catch (error) {
    checkCancellation(options.signal);
    if (error instanceof BatchImageError) throw error;
    throw new BatchImageError("FILE_UNREADABLE", "无法读取图片，请重新选择。");
  }
}

async function clientDigest(bytes: Uint8Array<ArrayBuffer>, options: BatchImageOptions): Promise<string> {
  checkCancellation(options.signal);
  try {
    const digest = new Uint8Array(await (options.native ?? nativeBoundary).sha256(bytes));
    checkCancellation(options.signal);
    if (digest.length !== 32) throw new Error("Invalid SHA-256 output");
    return `sha256:${Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  } catch (error) {
    checkCancellation(options.signal);
    if (error instanceof BatchImageError) throw error;
    throw new BatchImageError("HASH_FAILED", "无法校验图片，请重新选择。");
  }
}

export async function prepareBatchImage(input: BatchImageInput, options: BatchImageOptions = {}): Promise<PreparedBatchImage> {
  const selection = { ...input };
  const original = await readOriginal(selection, options, true);
  const source = original === OVERSIZED ? await compressOversized(selection, options) : selection;
  const { uri, fileName } = source;
  const bytes = original === OVERSIZED ? await readOriginal(source, options) : original;
  const mimeType = imageMime(bytes);
  const digest = await clientDigest(bytes, options);
  return {
    uri,
    fileName: fileName?.trim() || uri.split("/").pop() || "image",
    mimeType,
    rawSize: bytes.byteLength,
    clientDigest: digest
  };
}
export async function prepareBatchImages(inputs: readonly BatchImageInput[], options: BatchImageOptions = {}): Promise<PreparedBatchImage[]> {
  checkCancellation(options.signal);
  if (inputs.length > 100) throw new BatchImageError("TOO_MANY_FILES", "每批最多选择 100 张图片。");
  const selection = inputs.map((input) => ({ ...input }));
  const prepared: PreparedBatchImage[] = [];
  for (const input of selection) prepared.push(await prepareBatchImage(input, options));
  return prepared;
}
export async function readPreparedBatchImage(prepared: PreparedBatchImage, options: BatchImageOptions = {}): Promise<Uint8Array<ArrayBuffer>> {
  const expected = { ...prepared };
  const bytes = await readOriginal(expected, options);
  const mimeType = imageMime(bytes);
  const digest = await clientDigest(bytes, options);
  if (bytes.byteLength !== expected.rawSize || mimeType !== expected.mimeType || digest !== expected.clientDigest) {
    throw new BatchImageError("FILE_CHANGED", "图片已变化，请重新选择并匹配原图片。");
  }
  return bytes;
}
export async function loadSelectedBatchImage(client: OrbitApiClient, protectedImagePath: string, options: Pick<BatchImageOptions, "signal"> = {}): Promise<SelectedBatchImage> {
  checkCancellation(options.signal);
  const result = await client.get<OrbitApiBytes>(protectedImagePath, { responseType: "bytes", ...options });
  checkCancellation(options.signal);
  if (!result.success) throw new BatchImageError("API_ERROR", result.error.message, result);
  const { bytes, contentType } = result.data;
  validateSize(bytes.byteLength);
  const mimeType = imageMime(bytes);
  const declaredMime = contentType.split(";", 1)[0]?.trim().toLowerCase();
  if (declaredMime !== mimeType && !(declaredMime === "image/heif" && mimeType === "image/heic")) {
    throw new BatchImageError("UNSUPPORTED_IMAGE", "图片格式不匹配，请更换文件。");
  }
  const encoded = fromByteArray(bytes);
  checkCancellation(options.signal);
  return { uri: `data:${mimeType};base64,${encoded}`, mimeType, rawSize: bytes.byteLength };
}
