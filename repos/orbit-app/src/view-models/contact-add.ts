import { fromByteArray } from "base64-js";
import type { BatchImageErrorCode, PreparedBatchImage } from "../api/batch-images";
import type { MessageKey } from "../i18n/messages";
import {
  buildContactAcquisitionRequest,
  type ContactAcquisitionFormState,
  type ContactAcquisitionRequest,
  type ContactAcquisitionSummary
} from "./contact-acquisition";

// Sprint 0140: the scan and manual-add pages opened separately from the
// contacts page. Both reuse the existing draft endpoints; nothing here writes a
// contact — only the explicit 「保存到人脉」 action on each page does.

/**
 * The direct scan posts the image as base64 JSON. Measured on the local stack
 * (2026-10-04): bodies above 10,485,760 bytes are truncated by the API proxy,
 * which is a raw image of about 7.49 MiB. 7 MiB (body 9,786,805 bytes) is the
 * client target, so larger photos are compressed before they are sent.
 */
export const DIRECT_SCAN_MAX_IMAGE_BYTES = 7 * 1024 * 1024;

export function buildDirectScanRequest(
  prepared: Pick<PreparedBatchImage, "fileName" | "mimeType">,
  bytes: Uint8Array
): ContactAcquisitionRequest {
  return buildContactAcquisitionRequest("businessCard", {
    ...emptyManualForm,
    imageBase64: fromByteArray(bytes),
    imageMimeType: prepared.mimeType,
    imageName: prepared.fileName,
    imageSizeBytes: bytes.byteLength
  });
}

export type ScanImageFailure =
  | "cameraDenied"
  | "imageTooLarge"
  | "compressionFailed"
  | "imageUnreadable"
  | "cancelled";

export function scanImageFailure(error: unknown): ScanImageFailure {
  const code = (error as { code?: BatchImageErrorCode } | null)?.code;
  if (code === "CANCELLED") return "cancelled";
  if (code === "FILE_TOO_LARGE") return "imageTooLarge";
  if (code === "COMPRESSION_FAILED") return "compressionFailed";
  return "imageUnreadable";
}

export const scanFailureMessageKey: Record<Exclude<ScanImageFailure, "cancelled">, MessageKey> = {
  cameraDenied: "contactAdd.cameraDenied",
  compressionFailed: "contactAdd.compressionFailed",
  imageTooLarge: "contactAdd.imageTooLarge",
  imageUnreadable: "contactAdd.imageUnreadable"
};

const knownIssueKeys: Record<string, MessageKey> = {
  IDENTITY_MISSING: "contactAdd.issueIdentityMissing",
  INVALID_EMAIL: "contactAdd.issueInvalidEmail",
  INVALID_PHONE: "contactAdd.issueInvalidPhone",
  MULTIPLE_OFFICES: "contactAdd.issueMultipleOffices",
  NATIVE_ROMANIZED_NAME_CONFLICT: "contactAdd.issueNameConflict",
  SHARED_CONTACT_VALUE: "contactAdd.issueSharedValue"
};

export function scanIssueMessageKey(code: string): MessageKey {
  return Object.hasOwn(knownIssueKeys, code) ? knownIssueKeys[code]! : "contactAdd.issueOther";
}

/** A scan result can be reviewed and saved only when the server returned a write candidate. */
export function scanResultReviewable(summary: ContactAcquisitionSummary): boolean {
  return Boolean(summary.draftId && summary.contactWrite && summary.reviewFields?.length);
}

export const emptyManualForm: ContactAcquisitionFormState = {
  displayName: "",
  followUpHint: "",
  imageName: "",
  imageText: "",
  note: "",
  organization: "",
  qrText: "",
  role: "",
  scanLabel: "",
  tagsText: ""
};

export type ManualField = "displayName" | "organization" | "role" | "note" | "followUpHint" | "tagsText";

export interface ManualReviewRow {
  field: ManualField;
  labelKey: MessageKey;
  value: string;
}

const manualRowLabels: Array<[ManualField, MessageKey]> = [
  ["displayName", "contactAdd.name"],
  ["organization", "contactAdd.company"],
  ["role", "contactAdd.role"],
  ["note", "contactAdd.note"],
  ["followUpHint", "contactAdd.nextStep"],
  ["tagsText", "contactAdd.tags"]
];

/** Every field is listed so the review shows exactly what will be saved, including blanks. */
export function manualReviewRows(form: ContactAcquisitionFormState): ManualReviewRow[] {
  return manualRowLabels.map(([field, labelKey]) => ({ field, labelKey, value: form[field].trim() }));
}

export function manualRelationshipFilled(form: ContactAcquisitionFormState): number {
  return [form.note, form.followUpHint, form.tagsText].filter(value => value.trim()).length;
}

export function canReviewManual(form: ContactAcquisitionFormState): boolean {
  return form.displayName.trim().length > 0;
}

export function buildManualAddRequest(form: ContactAcquisitionFormState): ContactAcquisitionRequest {
  return buildContactAcquisitionRequest("manual", form);
}
