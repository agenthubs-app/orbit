/**
 * 引导内名片导入的纯模型（无 React / fetch）：把名片 V2 批次（features/acquisition/business-card-ingest-v2）
 * 映射成设计稿「10 名片确认」需要的东西——哪些卡可自动导入、哪些要人工核对、每个字段的核对状态。
 *
 * 设计稿按「置信度 %」着色，但识别管线不产出逐字段置信度；这里只用管线真实给出的依据：
 * reviewIssues（worker 的规则校验 + 二次逐字符核验）、正反面冲突、字段是否为空、用户是否改过。
 */
import type { IngestItemDTO } from "../../../../../features/acquisition/business-card-ingest-v2/contract";
import {
  INGEST_V2_FIELDS,
  type IngestV2CardDraft,
  type IngestV2CardViewModel,
  type IngestV2Field,
} from "../../contacts/ingest-v2/ingest-v2-route-view-model";
import type { Copy } from "./onboarding-model";

export type ParseStage = "upload" | "recognize" | "review";

// reviewIssue.field（识别层的字段名）→ 确认表单字段。地址等不在表单里的问题不标到字段上。
const ISSUE_FIELD_MAP: Record<string, IngestV2Field> = {
  fullName: "displayName",
  romanizedFullName: "displayName",
  nativeFullName: "displayName",
  organization: "organization",
  title: "role",
  role: "role",
  emails: "email",
  email: "email",
  contactPoints: "phone",
  phones: "phone",
};

export function cardIssues(card: IngestV2CardViewModel): IngestItemDTO["reviewIssues"][number][] {
  return card.items.flatMap(item => [...item.reviewIssues]);
}

export function flaggedFields(card: IngestV2CardViewModel, draft: IngestV2CardDraft): Set<IngestV2Field> {
  const flagged = new Set<IngestV2Field>();
  for (const issue of cardIssues(card)) {
    const field = ISSUE_FIELD_MAP[issue.field];
    if (field) flagged.add(field);
  }
  for (const field of draft.conflictedFields) flagged.add(field);
  if (!draft.fields.displayName.trim()) flagged.add("displayName");
  return flagged;
}

const REASON_COPY: Record<string, Copy> = {
  IDENTITY_MISSING: { zh: "未识别到姓名", en: "No name found" },
  INVALID_EMAIL: { zh: "邮箱可疑", en: "Email looks off" },
  INVALID_PHONE: { zh: "电话可疑", en: "Phone looks off" },
  MULTIPLE_OFFICES: { zh: "多个办公地点", en: "Several offices" },
  SHARED_CONTACT_VALUE: { zh: "号码归属不清", en: "Shared number" },
  NATIVE_ROMANIZED_NAME_CONFLICT: { zh: "姓名写法不一", en: "Name spellings differ" },
  ORG_SUFFIX_MISSING: { zh: "公司后缀可能缺失", en: "Company suffix missing?" },
  VERIFICATION_MISMATCH: { zh: "二次识别不一致", en: "Second read disagrees" },
};

/** 左侧照片面板上的「⚠ 原因」徽标：取最需要人看的那一条。 */
export function cardReason(card: IngestV2CardViewModel, draft: IngestV2CardDraft, duplicate: boolean): Copy {
  if (duplicate) return { zh: "可能重复", en: "Possible duplicate" };
  if (card.hasTerminalFailure) return { zh: "识别失败", en: "Recognition failed" };
  if (draft.conflictedFields.length) return { zh: "正反面不一致", en: "Sides disagree" };
  const issue = cardIssues(card)[0];
  if (issue) return REASON_COPY[issue.code] ?? { zh: "需要核对", en: "Needs a check" };
  if (!draft.fields.displayName.trim()) return REASON_COPY.IDENTITY_MISSING!;
  return { zh: "需要核对", en: "Needs a check" };
}

/**
 * 设计稿「识别可靠，已自动导入」的判定：卡已全部识别、没有任何 reviewIssue、
 * 没有正反面冲突/过期来源、有姓名。只要有一条疑点就交给用户确认。
 */
export function isAutoImportEligible(card: IngestV2CardViewModel, draft: IngestV2CardDraft): boolean {
  return card.reviewable
    && card.allExtracted
    && !card.allConfirmed
    && !card.invalidStructure
    && !card.hasMissingImageDigest
    && !card.hasTerminalFailure
    && cardIssues(card).length === 0
    && draft.conflictedFields.length === 0
    && draft.staleFields.length === 0
    && Boolean(draft.fields.displayName.trim());
}

export function isCardSkipped(card: IngestV2CardViewModel): boolean {
  return card.items.length > 0 && card.items.every(item => item.status === "skipped" || item.status === "excluded");
}

/** 需要人看的卡：可复核（含识别失败可手填的）、未确认、未跳过、不是这次自动导入成功的。 */
export function needsReview(card: IngestV2CardViewModel, autoImported: ReadonlySet<string>): boolean {
  if (autoImported.has(card.cardId)) return false;
  if (card.allConfirmed || isCardSkipped(card)) return false;
  return card.reviewable || card.invalidStructure || card.hasTerminalFailure;
}

export interface FieldTag {
  kind: "edited" | "check" | "empty" | "ok";
  label: Copy;
}

export function fieldTag(input: { edited: boolean; flagged: boolean; value: string }): FieldTag {
  if (input.edited) return { kind: "edited", label: { zh: "✓ 已修改", en: "✓ Edited" } };
  if (input.flagged) return { kind: "check", label: { zh: "请核对", en: "Please check" } };
  if (!input.value.trim()) return { kind: "empty", label: { zh: "未识别到", en: "Not found" } };
  return { kind: "ok", label: { zh: "已识别", en: "Recognized" } };
}

export function parseStage(status: string | undefined): ParseStage {
  // 批次详情还没拉到（刚创建/刚切换）时按「上传」处理——否则会被误判为已进入核对，提前把提醒标成已读。
  if (!status || status === "collecting") return "upload";
  if (status === "processing") return "recognize";
  return "review";
}

export { INGEST_V2_FIELDS };
