import {
  ORBIT_API_ENDPOINTS,
  businessCardContactConfirmPath,
  contactDraftExternalImportPath,
  contactDraftMergeSuggestionApplyPath,
  contactDraftRecommendedConfirmPath,
  contactDraftPath,
  contactDraftReferralPath
} from "../api/endpoints";

export type ContactAcquisitionMode = "businessCard" | "manual" | "qr";
export type ContactDraftReviewFieldName =
  | "displayName"
  | "email"
  | "organization"
  | "phone"
  | "role";

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
  contactId?: string;
  contactWrite?: ContactBusinessCardWriteCandidate;
  contactWriteLabel?: string;
  confirmLabel: string;
  confirmationText: string;
  detail: string;
  draftId: string;
  evidenceExcerpts: string[];
  nextAction: string;
  reviewFields?: ContactDraftReviewFieldView[];
  reviewLabel?: string;
  sourceLabel: string;
  stateLabel: string;
  title: string;
  writeState: string;
}

export interface ContactBusinessCardWriteCandidate {
  displayName: string;
  draftId: string;
  email: string;
  evidenceIds: string[];
  imageDigest: string;
  organization: string;
  phone: string;
  relationshipContext: string;
  role: string;
}

export interface ContactBusinessCardWriteView {
  contactId: string | null;
  detail: string;
  nextAction: string;
  openContactLabel: string;
  statusLabel: string;
  title: string;
}

export interface ContactDraftReviewFieldView {
  confidenceLabel: string;
  field: ContactDraftReviewFieldName;
  label: string;
  stateLabel: string;
  value: string;
}

export type ContactDraftReviewFormState = Record<
  ContactDraftReviewFieldName,
  string
>;

export interface ContactDraftQueueView {
  drafts: ContactAcquisitionSummary[];
  emptyText: string;
  nextAction: string;
  summary: string;
  title: string;
}

export interface ContactMergeSuggestionView {
  confidenceLabel: string;
  decisionLabel: string;
  existingLabel: string;
  fieldDecisions: string[];
  guardrail: string;
  id: string;
  importedLabel: string;
  reviewQuestion: string;
  title: string;
}

export interface ContactMergeReviewView {
  emptyText: string;
  nextAction: string;
  suggestions: ContactMergeSuggestionView[];
  summary: string;
  title: string;
}

export interface ContactMergeApplyView {
  confirmedBy: string;
  detail: string;
  fieldDecisions: string[];
  nextAction: string;
  safetyText: string;
  summary: string;
  title: string;
}

export type ContactExternalSourceKind =
  | "csv"
  | "existing_customer_list"
  | "google_contacts"
  | "phone";
export type ContactReferralSourceKind =
  | "community_referral"
  | "founder_referral"
  | "investor_intro";

export interface ContactExternalSourceView {
  countLabel: string;
  id: string;
  label: string;
  stateLabel: string;
}

export interface ContactExternalCandidateView {
  confidenceLabel: string;
  detail: string;
  duplicateText: string;
  id: string;
  name: string;
  nextAction: string;
  sourceKind: string;
  sourceLabel: string;
}

export interface ContactExternalCandidatesView {
  candidates: ContactExternalCandidateView[];
  emptyText: string;
  nextAction: string;
  sources: ContactExternalSourceView[];
  summary: string;
  title: string;
}

export interface ContactExternalImportView {
  drafts: ContactAcquisitionSummary[];
  nextAction: string;
  safetyText: string;
  summary: string;
  title: string;
}

export interface ContactReferralSourceView {
  countLabel: string;
  id: ContactReferralSourceKind;
  label: string;
}

export interface ContactReferralRecommendationView {
  confidenceLabel: string;
  detail: string;
  id: string;
  introductionPath: string;
  name: string;
  nextAction: string;
  reason: string;
  recommenderLine: string;
  sourceKind: ContactReferralSourceKind;
  sourceLabel: string;
}

export interface ContactReferralRecommendationsView {
  drafts: ContactAcquisitionSummary[];
  emptyText: string;
  nextAction: string;
  recommendations: ContactReferralRecommendationView[];
  safetyText: string;
  sources: ContactReferralSourceView[];
  summary: string;
  title: string;
}

export interface ContactRecommendedConfirmView {
  confirmedBy: string;
  detail: string;
  evidenceExcerpts: string[];
  nextAction: string;
  safetyText: string;
  summary: string;
  title: string;
}

type ContactMergeApplyRequest =
  | {
      request: {
        body: {
          actorLabel: "Orbit iOS";
        };
        endpoint: string;
      };
      success: true;
    }
  | {
      error: string;
      success: false;
    };

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

type ExternalContactsImportRequest = {
  request: {
    body: Record<string, unknown>;
    endpoint: string;
  };
  success: true;
};

type ReferralRecommendationsRequest = {
  request: {
    body: Record<string, unknown>;
    endpoint: string;
  };
  success: true;
};

type RecommendedContactConfirmRequest =
  | {
      request: {
        body: {
          actorLabel: "Orbit iOS";
        };
        endpoint: string;
      };
      success: true;
    }
  | {
      error: string;
      success: false;
    };

type ContactDraftReviewRequest =
  | {
      request: {
        body: {
          reviewedFields: ContactDraftReviewFormState;
          reviewerLabel: string;
        };
        endpoint: string;
      };
      success: true;
    }
  | {
      error: string;
      success: false;
    };

type BusinessCardContactWriteRequest =
  | {
      request: {
        body: {
          actorLabel: "Orbit iOS";
          confirmed: true;
          displayName: string;
          draftId: string;
          email: string;
          evidenceIds: string[];
          imageDigest: string;
          organization: string;
          phone: string;
          relationshipContext: string;
          role: string;
        };
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

function stringListField(
  record: Record<string, unknown>,
  fieldName: string
): string[] {
  const value = record[fieldName];

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string" && item.trim() !== "")
    .map((item) => item.trim());
}

function booleanField(
  record: Record<string, unknown>,
  fieldName: string,
  fallback = false
): boolean {
  const value = record[fieldName];
  return typeof value === "boolean" ? value : fallback;
}

function numberField(
  record: Record<string, unknown>,
  fieldName: string,
  fallback = 0
): number {
  const value = record[fieldName];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
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
  const sourceType = stringField(source, "type");
  const externalKind =
    stringField(draft, "sourceKind") || stringField(source, "sourceKind");
  const labelsByType: Record<string, string> = {
    business_card_ocr: "名片识别",
    calendar_signal: "日历信号",
    email_signal: "邮件信号",
    event_import: "活动名单",
    external_contacts: "外部联系人",
    manual: "手动记录",
    qr_scan: "QR 扫码",
    referral: "朋友引荐"
  };

  if (sourceType === "external_contacts" && externalKind) {
    return externalSourceLabel(externalKind, stringField(source, "label"));
  }

  if (labelsByType[sourceType]) {
    return labelsByType[sourceType];
  }

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

function evidenceIdsFromDraft(draft: Record<string, unknown>): string[] {
  const evidence = Array.isArray(draft.evidence) ? draft.evidence : [];
  const evidenceIds = evidence
    .filter(isRecord)
    .map((item) => stringField(item, "evidenceId"))
    .filter(Boolean);
  const provenanceEvidenceIds = stringListField(
    nestedRecord(draft, "provenance"),
    "evidenceIds"
  );

  return [...new Set([...evidenceIds, ...provenanceEvidenceIds])];
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

function businessCardWriteCandidate(
  draft: Record<string, unknown>,
  capture: Record<string, unknown>
): ContactBusinessCardWriteCandidate | null {
  if (stringField(nestedRecord(draft, "source"), "type") !== "business_card_ocr") {
    return null;
  }

  const draftId = stringField(draft, "id");
  const imageDigest = stringField(capture, "imageDigest");
  const evidenceIds = evidenceIdsFromDraft(draft);

  if (!draftId || !imageDigest || evidenceIds.length === 0) {
    return null;
  }

  return {
    displayName: stringField(draft, "displayName"),
    draftId,
    email: stringField(draft, "email"),
    evidenceIds,
    imageDigest,
    organization: stringField(draft, "organization"),
    phone: stringField(draft, "phone"),
    relationshipContext: stringField(draft, "relationshipContext"),
    role: stringField(draft, "role")
  };
}

function confirmationText(
  confirmation: Record<string, unknown>,
  confirmed: boolean,
  contactWritten: boolean,
  contactWriteAvailable: boolean,
  writeTargets: readonly string[]
): string {
  if (confirmed) {
    if (contactWritten) {
      return "候选已确认，联系人已写入。";
    }

    return contactWriteAvailable
      ? "候选已确认；请再次明确确认后再写入联系人。"
      : "候选已确认；当前流程仍不会写入联系人。";
  }

  if (confirmation.required === false) {
    return "这条草稿无需确认。";
  }

  if (
    writeTargets.includes("contact") &&
    writeTargets.includes("connection")
  ) {
    return "确认后会写入联系人和关系记录，并保留来源证据。";
  }

  if (writeTargets.includes("contact")) {
    return "确认后会写入联系人，并保留来源证据。";
  }

  return "确认后会生成候选，不会直接写联系人。";
}

function fallbackNextAction(confirmed: boolean): string {
  return confirmed
    ? "先保留来源证据，再决定是否写入联系人。"
    : "先核对来源证据，再决定是否加入联系人。";
}

function summaryNextAction(
  value: string,
  confirmed: boolean,
  contactWritten: boolean
): string {
  if (contactWritten) {
    return "打开已保存的联系人，继续补充关系。";
  }

  const nextAction = preferredChineseSegment(value);

  if (
    !nextAction ||
    containsImplementationLabel(nextAction) ||
    !segmentLooksChinese(nextAction)
  ) {
    return fallbackNextAction(confirmed);
  }

  return nextAction;
}

function queueNextAction(payload: Record<string, unknown>, draftsCount: number): string {
  const nextAction = stringField(payload, "nextAction");

  if (draftsCount === 0) {
    return "先从名片、QR 或手动记录生成一个候选。";
  }

  if (!nextAction || !segmentLooksChinese(nextAction)) {
    return "先核对待确认候选，再决定是否确认。";
  }

  return preferredChineseSegment(nextAction);
}

function confidenceLabel(value: string): string {
  const labels: Record<string, string> = {
    high: "高可信",
    low: "低可信",
    medium: "中可信"
  };

  return labels[value.trim().toLowerCase()] ?? "待核对";
}

function externalSourceLabel(sourceKind: string, fallback = ""): string {
  const labels: Record<string, string> = {
    csv: "CSV 文件",
    existing_customer_list: "客户名单",
    google_contacts: "Google Contacts",
    phone: "手机通讯录"
  };
  const normalized = sourceKind.trim().toLowerCase();

  if (labels[normalized]) {
    return labels[normalized];
  }

  const preferredFallback = preferredChineseSegment(fallback);
  return preferredFallback && segmentLooksChinese(preferredFallback)
    ? preferredFallback
    : "外部来源";
}

function referralSourceLabel(sourceKind: string): string {
  const labels: Record<string, string> = {
    community_referral: "社区引荐",
    founder_referral: "创始人引荐",
    investor_intro: "投资人介绍"
  };

  return labels[sourceKind.trim().toLowerCase()] ?? "朋友引荐";
}

function isReferralSourceKind(value: string): value is ContactReferralSourceKind {
  return (
    value === "community_referral" ||
    value === "founder_referral" ||
    value === "investor_intro"
  );
}

function referralReasonLabel(sourceKind: string): string {
  const labels: Record<string, string> = {
    community_referral: "社区推荐，适合先确认共同场景和对方当前需求。",
    founder_referral: "创始人同行推荐，适合先确认引荐路径和合作价值。",
    investor_intro: "投资人介绍，适合先核对合作动机和介绍边界。"
  };

  return labels[sourceKind.trim().toLowerCase()] ?? "推荐人提供了关系线索，先核对来源再确认候选。";
}

function referralIntroductionPath(): string {
  return "先请推荐人确认可介绍，再准备一段很短的说明。";
}

function referralNextAction(): string {
  return "确认后仍只是候选，不会自动触达对方。";
}

function referralRecommendationsNextAction(
  payload: Record<string, unknown>,
  count: number
): string {
  if (count === 0) {
    return "先选择一种引荐来源，再生成待确认候选。";
  }

  const nextAction = preferredChineseSegment(stringField(payload, "nextAction"));
  return nextAction && segmentLooksChinese(nextAction)
    ? nextAction
    : "先核对推荐人、来源证据和引荐路径，再决定是否确认。";
}

function recommendedConfirmationNextAction(value: string): string {
  const nextAction = preferredChineseSegment(value);

  if (!nextAction || !segmentLooksChinese(nextAction)) {
    return "保留推荐人上下文，再决定是否加入联系人。";
  }

  return nextAction;
}

function recommendedConfirmationEvidence(
  payload: Record<string, unknown>
): string[] {
  const createdEvidence = nestedRecord(payload, "createdEvidence");
  const excerpt = preferredChineseSegment(stringField(createdEvidence, "excerpt"));

  return excerpt && segmentLooksChinese(excerpt) ? [excerpt] : [];
}

function externalSourceStateLabel(value: string): string {
  const labels: Record<string, string> = {
    "live-indexed": "已授权",
    "live-linked": "已连接",
    "live-not-connected": "未连接",
    "live-uploaded": "已上传",
    "mock-granted": "已授权",
    "mock-linked": "已连接",
    "mock-uploaded": "已上传"
  };

  return labels[value.trim().toLowerCase()] ?? "待核对";
}

function externalCandidateNextAction(value: string): string {
  const nextAction = preferredChineseSegment(value);
  return nextAction && segmentLooksChinese(nextAction)
    ? nextAction
    : "导入后仍需逐条确认，不会直接写联系人。";
}

function externalCandidatesNextAction(
  payload: Record<string, unknown>,
  count: number
): string {
  if (count === 0) {
    return "先选择一个来源，再导入为待确认候选。";
  }

  const nextAction = preferredChineseSegment(stringField(payload, "nextAction"));
  return nextAction && segmentLooksChinese(nextAction)
    ? nextAction
    : "先核对外部来源，再导入为待确认候选。";
}

function externalImportNextAction(
  payload: Record<string, unknown>,
  count: number
): string {
  if (count === 0) {
    return "先选择一个外部来源，再导入为待确认候选。";
  }

  const nextAction = preferredChineseSegment(stringField(payload, "nextAction"));
  return nextAction && segmentLooksChinese(nextAction)
    ? nextAction
    : "先核对导入候选，再决定是否确认。";
}

function mergeDecisionLabel(value: string): string {
  return value.trim().toLowerCase() === "keep_separate"
    ? "建议保留两条记录"
    : "建议合并到现有人脉";
}

function mergeReviewQuestion(value: string): string {
  const question = preferredChineseSegment(value);

  if (question && segmentLooksChinese(question)) {
    return question;
  }

  return "确认这两个记录是否是同一个人。";
}

function mergeNextAction(payload: Record<string, unknown>, count: number): string {
  const nextAction = stringField(payload, "nextAction");

  if (count === 0) {
    return "先生成或导入候选，再做重复检查。";
  }

  if (!nextAction || !segmentLooksChinese(nextAction)) {
    return "先核对可能重复的人，再决定是否合并。";
  }

  return preferredChineseSegment(nextAction);
}

function duplicateCandidateById(
  payload: Record<string, unknown>
): Record<string, Record<string, unknown>> {
  const candidates = Array.isArray(payload.duplicateCandidates)
    ? payload.duplicateCandidates
    : [];

  return Object.fromEntries(
    candidates
      .filter(isRecord)
      .map((candidate) => [stringField(candidate, "candidateId"), candidate])
      .filter(([candidateId]) => candidateId)
  );
}

function contactIdentityLine(
  prefix: string,
  name: string,
  organization: string,
  role: string
): string {
  const detail = [name, organization, role].filter(Boolean).join(" · ");
  return `${prefix}：${detail || "待核对联系人"}`;
}

function fieldLabel(value: string): string {
  const labels: Record<string, string> = {
    displayName: "姓名",
    email: "邮箱",
    organization: "公司",
    phone: "电话",
    relationshipContext: "关系背景",
    role: "职位"
  };

  return labels[value] ?? "字段";
}

function fieldDecisionLine(decision: Record<string, unknown>): string {
  const value = stringField(decision, "value");
  return `${fieldLabel(stringField(decision, "field"))}：${value || "待核对"}`;
}

function mergeApplyNextAction(payload: Record<string, unknown>): string {
  const nextAction = stringField(payload, "nextAction");

  if (!nextAction || !segmentLooksChinese(nextAction)) {
    return "先保留这次确认记录，等正式合并写入前再复核一次。";
  }

  return preferredChineseSegment(nextAction);
}

const reviewFieldOrder: ContactDraftReviewFieldName[] = [
  "displayName",
  "organization",
  "role",
  "email",
  "phone"
];

function reviewStateLabel(value: string): string {
  const labels: Record<string, string> = {
    accepted: "已确认",
    edited: "已编辑",
    needs_review: "待复核"
  };

  return labels[value.trim().toLowerCase()] ?? "待复核";
}

function isBusinessCardDraft(draft: Record<string, unknown>): boolean {
  return stringField(nestedRecord(draft, "source"), "type") === "business_card_ocr";
}

function reviewFieldsFromDraft(
  draft: Record<string, unknown>
): ContactDraftReviewFieldView[] {
  const extractedFields = nestedRecord(draft, "extractedFields");
  const hasExtractedFields = Object.keys(extractedFields).length > 0;

  if (!hasExtractedFields && !isBusinessCardDraft(draft)) {
    return [];
  }

  return reviewFieldOrder
    .map((fieldName) => {
      const field = nestedRecord(extractedFields, fieldName);
      const value =
        stringField(field, "reviewedValue") ||
        stringField(field, "value") ||
        stringField(draft, fieldName);

      return {
        confidenceLabel: confidenceLabel(stringField(field, "confidence")),
        field: fieldName,
        label: fieldLabel(fieldName),
        stateLabel: reviewStateLabel(stringField(field, "reviewState")),
        value
      };
    })
    .filter((field) => field.value);
}

export function contactDraftReviewFormFromSummary(
  summary: ContactAcquisitionSummary
): ContactDraftReviewFormState {
  const fields: ContactDraftReviewFormState = {
    displayName: "",
    email: "",
    organization: "",
    phone: "",
    role: ""
  };

  for (const field of summary.reviewFields ?? []) {
    fields[field.field] = field.value;
  }

  return fields;
}

export function buildContactDraftReviewRequest(
  draftId: string,
  fields: ContactDraftReviewFormState
): ContactDraftReviewRequest {
  const reviewedFields: ContactDraftReviewFormState = {
    displayName: clean(fields.displayName),
    email: clean(fields.email),
    organization: clean(fields.organization),
    phone: clean(fields.phone),
    role: clean(fields.role)
  };

  if (!Object.values(reviewedFields).some(Boolean)) {
    return { error: "先保留至少一个名片字段。", success: false };
  }

  const cleanedDraftId = clean(draftId);

  if (!cleanedDraftId) {
    return { error: "这条候选缺少草稿编号，暂时不能复核。", success: false };
  }

  return {
    request: {
      body: {
        reviewedFields,
        reviewerLabel: "iOS"
      },
      endpoint: contactDraftPath(cleanedDraftId)
    },
    success: true
  };
}

export function buildBusinessCardContactWriteRequest(
  summary: ContactAcquisitionSummary,
  fields?: ContactDraftReviewFormState | null
): BusinessCardContactWriteRequest {
  const candidate = summary.contactWrite;

  if (!candidate) {
    return { error: "这条名片候选缺少写入信息。", success: false };
  }

  const displayName = clean(fields?.displayName) || clean(candidate.displayName);

  if (!displayName) {
    return { error: "先确认名片上的姓名。", success: false };
  }

  return {
    request: {
      body: {
        actorLabel: "Orbit iOS",
        confirmed: true,
        displayName,
        draftId: candidate.draftId,
        email: clean(fields?.email) || clean(candidate.email),
        evidenceIds: candidate.evidenceIds,
        imageDigest: candidate.imageDigest,
        organization:
          clean(fields?.organization) || clean(candidate.organization),
        phone: clean(fields?.phone) || clean(candidate.phone),
        relationshipContext: clean(candidate.relationshipContext),
        role: clean(fields?.role) || clean(candidate.role)
      },
      endpoint: businessCardContactConfirmPath()
    },
    success: true
  };
}

export function businessCardContactWriteToView(
  payload: unknown
): ContactBusinessCardWriteView {
  const record = isRecord(payload) ? payload : {};
  const state = stringField(record, "state");
  const contactId = stringField(record, "contactId");

  if (state === "duplicate_review") {
    return {
      contactId: null,
      detail: stringField(record, "duplicateContactId", "可能重复的人脉"),
      nextAction: "发现可能重复的人脉，先处理重复项。",
      openContactLabel: "",
      statusLabel: "需要复核",
      title: "暂未写入"
    };
  }

  if (state === "already_confirmed") {
    return {
      contactId: contactId || null,
      detail: contactId || "这张名片已处理过",
      nextAction: "可以去人脉页继续补充关系。",
      openContactLabel: contactId ? "打开联系人" : "",
      statusLabel: "已处理",
      title: "名片已收录过"
    };
  }

  return {
    contactId: contactId || null,
    detail: contactId || "联系人记录",
    nextAction: "可以去人脉页继续补充关系。",
    openContactLabel: contactId ? "打开联系人" : "",
    statusLabel: "写入完成",
    title: "联系人已收录"
  };
}

export function acquisitionResultToSummary(
  data: unknown
): ContactAcquisitionSummary {
  const payload = isRecord(data) ? data : {};
  const confirmedDraft = nestedRecord(payload, "confirmedDraft");
  const reviewDraft = nestedRecord(payload, "reviewDraft");
  const draft =
    Object.keys(confirmedDraft).length > 0
      ? confirmedDraft
      : Object.keys(reviewDraft).length > 0
        ? reviewDraft
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
  const reviewFields = reviewFieldsFromDraft(draft);
  const contactWrite = businessCardWriteCandidate(
    draft,
    nestedRecord(payload, "capture")
  );
  const contactId =
    stringField(contactCandidate, "contactId") || stringField(draft, "contactId");
  const contactWritten =
    Boolean(contactId) &&
    (draft.contactWriteExecuted === true ||
      contactCandidate.contactWriteExecuted === true);
  const writeTargets = stringListField(confirmation, "writeTargets");

  return {
    canConfirm: Boolean(draftId) && !confirmed,
    ...(contactWritten ? { contactId } : {}),
    ...(contactWrite
      ? {
          contactWrite,
          contactWriteLabel: "写入联系人"
        }
      : {}),
    confirmLabel: confirmed ? "已确认候选" : "确认候选",
    confirmationText: confirmationText(
      confirmation,
      confirmed,
      contactWritten,
      Boolean(contactWrite),
      writeTargets
    ),
    detail,
    draftId,
    evidenceExcerpts: evidenceExcerpts(draft),
    nextAction: summaryNextAction(
      stringField(draft, "suggestedNextAction") ||
        stringField(payload, "nextAction"),
      confirmed,
      contactWritten
    ),
    ...(reviewFields.length > 0
      ? {
          reviewFields,
          reviewLabel: "保存复核字段"
        }
      : {}),
    sourceLabel: sourceLabel(draft),
    stateLabel: stateLabel(stringField(draft, "status", stringField(payload, "state"))),
    title: displayName,
    writeState: candidateWriteState(draft, contactCandidate, confirmed)
  };
}

export function contactDraftQueueToView(payload: unknown): ContactDraftQueueView {
  const record = isRecord(payload) ? payload : {};
  const drafts = (Array.isArray(record.drafts) ? record.drafts : [])
    .filter(isRecord)
    .map((draft) => acquisitionResultToSummary({ draft }));

  return {
    drafts,
    emptyText: drafts.length ? "" : "保存过的候选会出现在这里。",
    nextAction: queueNextAction(record, drafts.length),
    summary: drafts.length ? `${drafts.length} 条待确认候选` : "暂无待确认候选",
    title: "待确认候选"
  };
}

export function contactExternalCandidatesToView(
  payload: unknown
): ContactExternalCandidatesView {
  const record = isRecord(payload) ? payload : {};
  const sources = (Array.isArray(record.sources) ? record.sources : [])
    .filter(isRecord)
    .map((source) => {
      const sourceKind = stringField(source, "kind");
      const count = numberField(source, "candidateCount");

      return {
        countLabel: `${count} 个候选`,
        id: sourceKind,
        label: externalSourceLabel(sourceKind, stringField(source, "label")),
        stateLabel: externalSourceStateLabel(
          stringField(source, "permissionState")
        )
      };
    })
    .filter((source) => source.id);
  const candidates = (Array.isArray(record.candidates) ? record.candidates : [])
    .filter(isRecord)
    .map((candidate) => {
      const sourceKind = stringField(candidate, "sourceKind");

      return {
        confidenceLabel: confidenceLabel(stringField(candidate, "confidence")),
        detail: [
          stringField(candidate, "organization"),
          stringField(candidate, "role")
        ]
          .filter(Boolean)
          .join(" · "),
        duplicateText: stringField(candidate, "duplicateHint")
          ? "可能已存在"
          : "无明显重复",
        id: stringField(candidate, "candidateId"),
        name: stringField(candidate, "displayName", "待确认联系人"),
        nextAction: externalCandidateNextAction(
          stringField(candidate, "suggestedNextAction")
        ),
        sourceKind,
        sourceLabel: externalSourceLabel(
          sourceKind,
          stringField(nestedRecord(candidate, "source"), "label")
        )
      };
    })
    .filter((candidate) => candidate.id);

  return {
    candidates,
    emptyText: candidates.length
      ? ""
      : "连接或上传外部来源后，候选会出现在这里。",
    nextAction: externalCandidatesNextAction(record, candidates.length),
    sources,
    summary: candidates.length ? `${candidates.length} 个外部候选` : "暂无外部候选",
    title: "外部导入"
  };
}

export function buildExternalContactsImportRequest(
  sourceKind?: string | null
): ExternalContactsImportRequest {
  const cleanedSourceKind = clean(sourceKind);

  return {
    request: {
      body: cleanedSourceKind ? { sourceKind: cleanedSourceKind } : {},
      endpoint: contactDraftExternalImportPath({
        sourceKind: cleanedSourceKind || null
      })
    },
    success: true
  };
}

export function contactExternalImportToView(
  payload: unknown
): ContactExternalImportView {
  const record = isRecord(payload) ? payload : {};
  const drafts = (Array.isArray(record.contactDrafts)
    ? record.contactDrafts
    : []
  )
    .filter(isRecord)
    .map((draft) => {
      const summary = acquisitionResultToSummary({ draft });

      return {
        ...summary,
        evidenceExcerpts: summary.evidenceExcerpts.filter(segmentLooksChinese)
      };
    });

  return {
    drafts,
    nextAction: externalImportNextAction(record, drafts.length),
    safetyText:
      "只是生成待确认候选，没有读取真实通讯录，也没有写入联系人。",
    summary: drafts.length
      ? `${drafts.length} 条待确认外部候选`
      : "暂无待确认外部候选",
    title: "已生成外部候选"
  };
}

export function buildReferralRecommendationsRequest(
  sourceKind?: string | null
): ReferralRecommendationsRequest {
  const cleanedSourceKind = clean(sourceKind);

  return {
    request: {
      body: cleanedSourceKind ? { sourceKind: cleanedSourceKind } : {},
      endpoint: contactDraftReferralPath({
        sourceKind: cleanedSourceKind || null
      })
    },
    success: true
  };
}

export function buildRecommendedContactConfirmRequest(
  recommendationId: string
): RecommendedContactConfirmRequest {
  const cleanedRecommendationId = clean(recommendationId);

  if (!cleanedRecommendationId) {
    return { error: "这条引荐推荐缺少编号，暂时不能确认。", success: false };
  }

  return {
    request: {
      body: {
        actorLabel: "Orbit iOS"
      },
      endpoint: contactDraftRecommendedConfirmPath(cleanedRecommendationId)
    },
    success: true
  };
}

export function recommendedContactConfirmationToView(
  payload: unknown
): ContactRecommendedConfirmView {
  const record = isRecord(payload) ? payload : {};
  const confirmedContact = nestedRecord(record, "confirmedContact");
  const displayName = stringField(confirmedContact, "displayName", "待确认联系人");
  const detail = [
    stringField(confirmedContact, "organization"),
    stringField(confirmedContact, "role")
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    confirmedBy: stringField(record, "confirmedBy", "Orbit iOS"),
    detail,
    evidenceExcerpts: recommendedConfirmationEvidence(record),
    nextAction: recommendedConfirmationNextAction(stringField(record, "nextAction")),
    safetyText: "没有写入联系人，也没有发消息。",
    summary: `${displayName} 保持在候选复核中`,
    title: "引荐推荐已确认"
  };
}

export function contactReferralRecommendationsToView(
  payload: unknown
): ContactReferralRecommendationsView {
  const record = isRecord(payload) ? payload : {};
  const sources = (Array.isArray(record.referralSources)
    ? record.referralSources
    : []
  )
    .filter(isRecord)
    .map((source) => {
      const sourceKind = stringField(source, "kind");
      const recommenderCount = numberField(source, "recommenderCount");

      if (!isReferralSourceKind(sourceKind)) {
        return null;
      }

      return {
        countLabel: `${recommenderCount} 位推荐人`,
        id: sourceKind,
        label: referralSourceLabel(sourceKind)
      };
    })
    .filter((source): source is ContactReferralSourceView => Boolean(source));
  const recommendations = (Array.isArray(record.recommendations)
    ? record.recommendations
    : []
  )
    .filter(isRecord)
    .map((recommendation) => {
      const sourceKind = stringField(recommendation, "sourceKind");
      const recommender = nestedRecord(recommendation, "recommender");
      const recommenderDetail = [
        stringField(recommender, "displayName"),
        stringField(recommender, "organization"),
        stringField(recommender, "role")
      ]
        .filter(Boolean)
        .join(" · ");

      if (!isReferralSourceKind(sourceKind)) {
        return null;
      }

      return {
        confidenceLabel: confidenceLabel(stringField(recommendation, "confidence")),
        detail: [
          stringField(recommendation, "organization"),
          stringField(recommendation, "role")
        ]
          .filter(Boolean)
          .join(" · "),
        id: stringField(recommendation, "id"),
        introductionPath: referralIntroductionPath(),
        name: stringField(recommendation, "displayName", "待确认联系人"),
        nextAction: referralNextAction(),
        reason: referralReasonLabel(sourceKind),
        recommenderLine: `推荐人：${recommenderDetail || "待核对"}`,
        sourceKind,
        sourceLabel: referralSourceLabel(sourceKind)
      };
    })
    .filter(
      (recommendation): recommendation is ContactReferralRecommendationView =>
        Boolean(recommendation?.id)
    );
  const drafts = (Array.isArray(record.contactDrafts)
    ? record.contactDrafts
    : []
  )
    .filter(isRecord)
    .map((draft) => {
      const summary = acquisitionResultToSummary({ draft });

      return {
        ...summary,
        evidenceExcerpts: summary.evidenceExcerpts.filter(segmentLooksChinese)
      };
    });

  return {
    drafts,
    emptyText: recommendations.length ? "" : "有推荐人线索时，候选会出现在这里。",
    nextAction: referralRecommendationsNextAction(record, recommendations.length),
    recommendations,
    safetyText: "只生成待确认候选，不会发消息，也不会写入联系人。",
    sources,
    summary: recommendations.length
      ? `${recommendations.length} 条引荐推荐`
      : "暂无引荐推荐",
    title: "朋友引荐"
  };
}

export function contactMergeReviewToView(payload: unknown): ContactMergeReviewView {
  const record = isRecord(payload) ? payload : {};
  const candidatesById = duplicateCandidateById(record);
  const suggestions = (Array.isArray(record.mergeSuggestions)
    ? record.mergeSuggestions
    : []
  )
    .filter(isRecord)
    .map((suggestion) => {
      const candidate = candidatesById[stringField(suggestion, "candidateId")] ?? {};
      const importedName =
        stringField(candidate, "importedContactName") || "导入候选";
      const existingName =
        stringField(candidate, "existingContactName") || "现有人脉";
      const fieldDecisions = Array.isArray(suggestion.fieldDecisions)
        ? suggestion.fieldDecisions
        : [];

      return {
        confidenceLabel: confidenceLabel(stringField(suggestion, "confidence")),
        decisionLabel: mergeDecisionLabel(stringField(suggestion, "decision")),
        existingLabel: contactIdentityLine(
          "现有人脉",
          existingName,
          stringField(candidate, "existingOrganization"),
          stringField(candidate, "existingRole")
        ),
        fieldDecisions: fieldDecisions
          .filter(isRecord)
          .map(fieldDecisionLine)
          .filter(Boolean)
          .slice(0, 4),
        guardrail: "这里只做预览，不会直接合并或写入联系人。",
        id: stringField(suggestion, "id"),
        importedLabel: contactIdentityLine(
          "导入候选",
          importedName,
          stringField(candidate, "importedOrganization"),
          stringField(candidate, "importedRole")
        ),
        reviewQuestion: mergeReviewQuestion(
          stringField(suggestion, "reviewQuestion")
        ),
        title: `${importedName} 可能已在人脉里`
      };
    })
    .filter((suggestion) => suggestion.id);

  return {
    emptyText: suggestions.length ? "" : "有可能重复的导入候选会出现在这里。",
    nextAction: mergeNextAction(record, suggestions.length),
    suggestions,
    summary: suggestions.length ? `${suggestions.length} 条可能重复` : "暂无重复候选",
    title: "重复检查"
  };
}

export function buildContactMergeApplyRequest(
  suggestionId: string
): ContactMergeApplyRequest {
  const cleanedSuggestionId = clean(suggestionId);

  if (!cleanedSuggestionId) {
    return { error: "这条重复建议缺少编号，暂时不能确认。", success: false };
  }

  return {
    request: {
      body: {
        actorLabel: "Orbit iOS"
      },
      endpoint: contactDraftMergeSuggestionApplyPath(cleanedSuggestionId)
    },
    success: true
  };
}

export function contactMergeApplyToView(payload: unknown): ContactMergeApplyView {
  const record = isRecord(payload) ? payload : {};
  const preview = nestedRecord(record, "mergedContactPreview");
  const displayName = stringField(preview, "displayName", "待复核联系人");
  const detail = [
    stringField(preview, "organization"),
    stringField(preview, "role")
  ]
    .filter(Boolean)
    .join(" · ");
  const fieldDecisions = (Array.isArray(record.fieldDecisions)
    ? record.fieldDecisions
    : []
  )
    .filter(isRecord)
    .map(fieldDecisionLine)
    .filter(Boolean)
    .slice(0, 5);

  return {
    confirmedBy: stringField(record, "confirmedBy", "Orbit iOS"),
    detail,
    fieldDecisions,
    nextAction: mergeApplyNextAction(record),
    safetyText: "没有写入联系人，也没有执行破坏性合并。",
    summary: `${displayName} 保持在复核中`,
    title: "合并预览已确认"
  };
}
