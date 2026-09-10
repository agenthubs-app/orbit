import { fromByteArray } from "base64-js";
import { filetypeinfo } from "magic-bytes.js";
import { MAX_ORBIT_BINARY_BYTES, type OrbitApiBytes, type OrbitApiClient } from "./client";
import type { ApiResult } from "./types";

export type BatchImageMimeType = "image/jpeg" | "image/png" | "image/webp" | "image/heic" | "image/heif";
export interface BatchImageInput {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
}
export interface PreparedBatchImage {
  uri: string;
  fileName: string;
  mimeType: BatchImageMimeType;
  rawSize: number;
  clientDigest: string;
}
export interface BatchImageNative {
  openFile(uri: string): Promise<{
    exists: boolean;
    size: number;
    bytes(): Promise<Uint8Array<ArrayBuffer>>;
  }>;
  sha256(bytes: Uint8Array<ArrayBuffer>): Promise<ArrayBuffer>;
}
export interface BatchImageOptions {
  native?: BatchImageNative;
  signal?: AbortSignal;
}
export interface SelectedBatchImage {
  uri: string;
  mimeType: BatchImageMimeType;
  rawSize: number;
}
export type BatchImageErrorCode =
  | "CANCELLED" | "INVALID_URI" | "FILE_UNREADABLE" | "EMPTY_FILE"
  | "FILE_TOO_LARGE" | "TOO_MANY_FILES" | "UNSUPPORTED_IMAGE"
  | "HASH_FAILED" | "FILE_CHANGED" | "API_ERROR";
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

const nativeBoundary: BatchImageNative = {
  async openFile(uri) {
    const { File } = await import("expo-file-system");
    return new File(uri);
  },
  async sha256(bytes) {
    const { digest, CryptoDigestAlgorithm } = await import("expo-crypto");
    return digest(CryptoDigestAlgorithm.SHA256, bytes);
  }
};

function checkCancellation(signal?: AbortSignal): void {
  if (signal?.aborted) throw new BatchImageError("CANCELLED", "图片处理已取消。");
}

function validateSize(size: number): void {
  if (!Number.isSafeInteger(size) || size < 0) {
    throw new BatchImageError("FILE_UNREADABLE", "无法读取图片，请重新选择。");
  }
  if (size === 0) throw new BatchImageError("EMPTY_FILE", "图片文件为空，请重新选择。");
  if (size > MAX_ORBIT_BINARY_BYTES) {
    throw new BatchImageError("FILE_TOO_LARGE", "图片不能超过 10 MiB，请更换文件。");
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

async function readOriginal(uri: string, options: BatchImageOptions): Promise<Uint8Array<ArrayBuffer>> {
  checkCancellation(options.signal);
  if (!uri.startsWith("file://") && !uri.startsWith("content://")) {
    throw new BatchImageError("INVALID_URI", "请选择本机图片文件。");
  }
  try {
    const file = await (options.native ?? nativeBoundary).openFile(uri);
    checkCancellation(options.signal);
    if (!file.exists) throw new BatchImageError("FILE_UNREADABLE", "无法读取图片，请重新选择。");
    const size = file.size;
    validateSize(size);
    const bytes = await file.bytes();
    checkCancellation(options.signal);
    validateSize(bytes.byteLength);
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
  const { uri, fileName } = input;
  const bytes = await readOriginal(uri, options);
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
  const bytes = await readOriginal(expected.uri, options);
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
