import { ORBIT_API_ENDPOINTS } from "../api/endpoints";

export type ContactAcquisitionMode = "businessCard" | "manual" | "qr";

export interface ContactAcquisitionFormState {
  displayName: string;
  followUpHint: string;
  imageBase64?: string;
  imageMimeType?: string;
  imageName: string;
  imageSizeBytes?: number | null;
  imageText: string;
  imageUri?: string;
  note: string;
  organization: string;
  qrText: string;
  role: string;
  scanLabel: string;
  tagsText: string;
}

export interface ContactAcquisitionSummary {
  canConfirm: boolean;
  confirmLabel: string;
  confirmationText: string;
  detail: string;
  draftId: string;
  evidenceExcerpts: string[];
  nextAction: string;
  sourceLabel: string;
  stateLabel: string;
  title: string;
  writeState: string;
}

type ContactAcquisitionRequest =
  | {
      request: {
        body: Record<string, unknown>;
        endpoint: string;
      };
      success: true;
    }
  | {
      error: string;
      success: false;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clean(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function optionalField(value: string | null | undefined): string | undefined {
  const cleaned = clean(value);
  return cleaned || undefined;
}

function tagsFromText(value: string): string[] | undefined {
  const tags = value
    .split(/[,，]/u)
    .map((tag) => tag.trim())
    .filter(Boolean);

  return tags.length > 0 ? tags : undefined;
}

function stripUndefined(
  value: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined)
  );
}

export function buildContactAcquisitionRequest(
  mode: ContactAcquisitionMode,
  form: ContactAcquisitionFormState
): ContactAcquisitionRequest {
  if (mode === "manual") {
    const displayName = optionalField(form.displayName);

    if (!displayName) {
      return { error: "先写联系人姓名。", success: false };
    }

    return {
      request: {
        body: stripUndefined({
          displayName,
          followUpHint: optionalField(form.followUpHint),
          note: optionalField(form.note),
          organization: optionalField(form.organization),
          role: optionalField(form.role),
          tags: tagsFromText(form.tagsText)
        }),
        endpoint: ORBIT_API_ENDPOINTS.contactDraftManual
      },
      success: true
    };
  }

  if (mode === "qr") {
    const qrText = optionalField(form.qrText);

    if (!qrText) {
      return { error: "先粘贴 QR 内容。", success: false };
    }

    return {
      request: {
        body: stripUndefined({
          qrText,
          scanLabel: optionalField(form.scanLabel)
        }),
        endpoint: ORBIT_API_ENDPOINTS.contactDraftQrScan
      },
      success: true
    };
  }

  const imageText = optionalField(form.imageText);
  const imageBase64 = optionalField(form.imageBase64);

  if (!imageText && !imageBase64) {
    return { error: "先选择名片图片或粘贴名片文字。", success: false };
  }

  return {
    request: {
      body: stripUndefined({
        imageBase64,
        imageName: optionalField(form.imageName),
        imageSizeBytes:
          typeof form.imageSizeBytes === "number" && form.imageSizeBytes > 0
            ? form.imageSizeBytes
            : undefined,
        imageText,
        mimeType: optionalField(form.imageMimeType)
      }),
      endpoint: ORBIT_API_ENDPOINTS.contactDraftBusinessCardScan
    },
    success: true
  };
}

function stringField(
  record: Record<string, unknown>,
  fieldName: string,
  fallback = ""
): string {
  const value = record[fieldName];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function nestedRecord(
  record: Record<string, unknown>,
  fieldName: string
): Record<string, unknown> {
  const value = record[fieldName];
  return isRecord(value) ? value : {};
}

function booleanField(
  record: Record<string, unknown>,
  fieldName: string,
  fallback = false
): boolean {
  const value = record[fieldName];
  return typeof value === "boolean" ? value : fallback;
}

function segmentLooksChinese(value: string): boolean {
  return /[\u4e00-\u9fff]/u.test(value) && !/[\u3040-\u30ff]/u.test(value);
}

function preferredChineseSegment(value: string): string {
  const withoutPrefix = value.replace(/^Manual note:\s*/iu, "").trim();
  const markerMatch = /ZH:\s*([^/]+?)(?:\s+EN:|\s+JA:|$)/u.exec(withoutPrefix);

  if (markerMatch?.[1]?.trim()) {
    return markerMatch[1].trim();
  }

  const segments = withoutPrefix
    .split(/\s*\/\s*/u)
    .map((segment) => segment.trim())
    .filter(Boolean);

  return segments.find(segmentLooksChinese) ?? withoutPrefix;
}

function containsImplementationLabel(value: string): boolean {
  return /\b(live|mock|provider|postgres|source-backed|manual note evidence|manual source evidence|shared contact draft queue|without creating a contact|camera|upload|ocr provider|ai provider)\b/i.test(
    value
  );
}

function sourceLabel(draft: Record<string, unknown>): string {
  const source = nestedRecord(draft, "source");
  const label = stringField(source, "label");
  const qrMatch = /(?:Direct )?QR scan for (.+)$/iu.exec(label);
  const cardMatch = /^Business card exchange for (.+)$/iu.exec(label);

  if (/manual contact note/iu.test(label)) {
    return "手动记录";
  }

  if (qrMatch?.[1]?.trim()) {
    return `QR 扫码：${qrMatch[1].trim()}`;
  }

  if (cardMatch?.[1]?.trim()) {
    return `名片交换：${cardMatch[1].trim()}`;
  }

  return preferredChineseSegment(label);
}

function stateLabel(value: string): string {
  const labels: Record<string, string> = {
    confirmed: "已确认",
    pending: "待确认",
    pending_confirmation: "待确认",
    success: "已生成草稿"
  };

  return labels[value.trim().toLowerCase()] ?? "待确认";
}

function evidenceExcerpts(draft: Record<string, unknown>): string[] {
  const evidence = Array.isArray(draft.evidence) ? draft.evidence : [];

  return [
    ...new Set(
      evidence
        .filter(isRecord)
        .map((item) => preferredChineseSegment(stringField(item, "excerpt")))
        .filter((excerpt) => excerpt && !containsImplementationLabel(excerpt))
    )
  ].slice(0, 3);
}

function candidateWriteState(
  draft: Record<string, unknown>,
  candidate: Record<string, unknown>,
  confirmed: boolean
): string {
  if (
    draft.contactWriteExecuted === true ||
    candidate.contactWriteExecuted === true
  ) {
    return "联系人已写入";
  }

  return confirmed ? "候选已确认" : "还没有创建联系人";
}

function confirmationText(
  confirmation: Record<string, unknown>,
  confirmed: boolean
): string {
  if (confirmed) {
    return "已确认，下一步再写入联系人。";
  }

  return confirmation.required === false
    ? "这条草稿无需确认。"
    : "确认后会生成候选，不会直接写联系人。";
}

function fallbackNextAction(confirmed: boolean): string {
  return confirmed
    ? "先保留来源证据，再决定是否写入联系人。"
    : "先核对来源证据，再决定是否加入联系人。";
}

function summaryNextAction(value: string, confirmed: boolean): string {
  if (!value || containsImplementationLabel(value)) {
    return fallbackNextAction(confirmed);
  }

  return preferredChineseSegment(value);
}

export function acquisitionResultToSummary(
  data: unknown
): ContactAcquisitionSummary {
  const payload = isRecord(data) ? data : {};
  const confirmedDraft = nestedRecord(payload, "confirmedDraft");
  const draft =
    Object.keys(confirmedDraft).length > 0
      ? confirmedDraft
      : nestedRecord(payload, "draft");
  const contactCandidate = nestedRecord(payload, "contactCandidate");
  const confirmation = nestedRecord(draft, "confirmation");
  const displayName = stringField(draft, "displayName", "待确认联系人");
  const detail = [stringField(draft, "organization"), stringField(draft, "role")]
    .filter(Boolean)
    .join(" · ");
  const confirmed =
    stringField(payload, "state").toLowerCase() === "confirmed" ||
    stringField(draft, "status").toLowerCase() === "confirmed" ||
    booleanField(contactCandidate, "readyForContactWrite");
  const draftId = stringField(draft, "id");

  return {
    canConfirm: Boolean(draftId) && !confirmed,
    confirmLabel: confirmed ? "已确认候选" : "确认候选",
    confirmationText: confirmationText(confirmation, confirmed),
    detail,
    draftId,
    evidenceExcerpts: evidenceExcerpts(draft),
    nextAction: summaryNextAction(
      stringField(draft, "suggestedNextAction") ||
        stringField(payload, "nextAction"),
      confirmed
    ),
    sourceLabel: sourceLabel(draft),
    stateLabel: stateLabel(stringField(draft, "status", stringField(payload, "state"))),
    title: displayName,
    writeState: candidateWriteState(draft, contactCandidate, confirmed)
  };
}
