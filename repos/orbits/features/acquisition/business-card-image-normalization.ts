import convert from "heic-convert";

import {
  BUSINESS_CARD_IMAGE_MIME_TYPES,
  type BusinessCardImageMimeType,
} from "./business-card-cloud-ocr";

export const BUSINESS_CARD_HEIF_MIME_TYPES = ["image/heic", "image/heif"] as const;

export const BUSINESS_CARD_UPLOAD_MIME_TYPES = [
  ...BUSINESS_CARD_IMAGE_MIME_TYPES,
  ...BUSINESS_CARD_HEIF_MIME_TYPES,
] as const;

export type BusinessCardUploadMimeType =
  (typeof BUSINESS_CARD_UPLOAD_MIME_TYPES)[number];

export function isBusinessCardUploadMimeType(
  value: string | undefined,
): value is BusinessCardUploadMimeType {
  return BUSINESS_CARD_UPLOAD_MIME_TYPES.some((mimeType) => mimeType === value);
}

const UPLOAD_MIME_TYPE_BY_EXTENSION: Record<string, BusinessCardUploadMimeType> = {
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

/**
 * Browsers can hand over HEIC files with an empty `File.type`; the extension
 * fallback keeps iPhone uploads from being rejected at the boundary.
 */
export function resolveBusinessCardUploadMimeType(input: {
  declaredType?: string;
  fileName?: string;
}): string | undefined {
  const declared = input.declaredType?.trim();

  if (declared) {
    return declared;
  }

  const fileName = input.fileName?.trim().toLowerCase() ?? "";
  const extensionStart = fileName.lastIndexOf(".");

  if (extensionStart < 0) {
    return undefined;
  }

  return UPLOAD_MIME_TYPE_BY_EXTENSION[fileName.slice(extensionStart)];
}

export interface NormalizedBusinessCardUploadImage {
  imageBase64: string;
  mimeType: BusinessCardImageMimeType;
}

/**
 * The OCR provider contract only accepts JPEG/PNG/WebP; HEIF-family uploads
 * are transcoded here so providers never see formats they cannot parse.
 */
export async function normalizeBusinessCardUploadImage(input: {
  imageBase64: string;
  mimeType: BusinessCardUploadMimeType;
}): Promise<NormalizedBusinessCardUploadImage> {
  if (BUSINESS_CARD_IMAGE_MIME_TYPES.some((mimeType) => mimeType === input.mimeType)) {
    return {
      imageBase64: input.imageBase64,
      mimeType: input.mimeType as BusinessCardImageMimeType,
    };
  }

  const jpegBytes = await convert({
    buffer: Buffer.from(input.imageBase64, "base64"),
    format: "JPEG",
    quality: 0.9,
  });

  return {
    imageBase64: Buffer.from(jpegBytes).toString("base64"),
    mimeType: "image/jpeg",
  };
}
