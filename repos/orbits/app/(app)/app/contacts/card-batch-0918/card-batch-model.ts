/**
 * 名片批量导入（新用户引导 / 人脉导入 / 全站提醒共用）的纯模型（无 React / fetch）：把名片 V2 批次（features/acquisition/business-card-ingest-v2）
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
} from "../ingest-v2/ingest-v2-route-view-model";
export type Copy = { zh: string; en: string };

export type ParseStage = "upload" | "recognize" | "review";

// reviewIssue.field（识别层的字段名）→ 确认表单字段。不在表单里的问题不标到字段上。
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
  addresses: "address",
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

// 徽标文案说人话：直接说哪个字段可能不对，不暴露「二次识别」这类管线术语。
const REASON_COPY: Record<string, Copy> = {
  IDENTITY_MISSING: { zh: "未识别到姓名", en: "No name found" },
  INVALID_EMAIL: { zh: "邮箱格式不对", en: "Email looks off" },
  INVALID_PHONE: { zh: "电话格式不对", en: "Phone looks off" },
  MULTIPLE_OFFICES: { zh: "有多个办公地点", en: "Several offices" },
  SHARED_CONTACT_VALUE: { zh: "号码归属不清", en: "Shared number" },
  NATIVE_ROMANIZED_NAME_CONFLICT: { zh: "姓名写法不一", en: "Name spellings differ" },
  ORG_SUFFIX_MISSING: { zh: "公司名可能少了后缀", en: "Company suffix missing?" },
};

// 同一张名片读了两遍，某个字段两次读出来不一样 → 这个字段可能有字读错了。
const MISREAD_COPY: Record<string, Copy> = {
  contactPoints: { zh: "电话可能有字读错", en: "Phone may be misread" },
  emails: { zh: "邮箱可能有字读错", en: "Email may be misread" },
  organization: { zh: "公司名可能有字读错", en: "Company may be misread" },
};

/** 左侧照片面板上的「⚠ 原因」徽标：取最需要人看的那一条。 */
export function cardReason(card: IngestV2CardViewModel, draft: IngestV2CardDraft, duplicate: boolean): Copy {
  if (duplicate) return { zh: "可能重复", en: "Possible duplicate" };
  if (card.hasTerminalFailure) return { zh: "识别失败", en: "Recognition failed" };
  if (draft.conflictedFields.length) return { zh: "正反面不一致", en: "Sides disagree" };
  if (industryNeedsReview(draft)) return { zh: "正反面行业不一致", en: "Sides disagree on industry" };
  const issue = cardIssues(card)[0];
  if (issue?.code === "VERIFICATION_MISMATCH") return MISREAD_COPY[issue.field] ?? { zh: "可能有字读错", en: "May be misread" };
  if (issue) return REASON_COPY[issue.code] ?? { zh: "需要核对", en: "Needs a check" };
  if (!draft.fields.displayName.trim()) return REASON_COPY.IDENTITY_MISSING!;
  return { zh: "需要核对", en: "Needs a check" };
}

/** 正反面行业冲突且用户还没选定或清空：这张卡必须人工确认。 */
export function industryNeedsReview(draft: IngestV2CardDraft): boolean {
  return draft.industry?.conflicted === true;
}

/**
 * 设计稿「识别可靠，已自动导入」的判定：卡已全部识别、没有任何 reviewIssue、
 * 没有正反面冲突（含行业）/过期来源、有姓名。只要有一条疑点就交给用户确认。
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
    && !industryNeedsReview(draft)
    && Boolean(draft.fields.displayName.trim());
}

/**
 * 与已有联系人完全一致的卡直接并入（哪怕识别有疑点）的前提：识别完成、没有失败面、没有正反面冲突。
 * 行业两面不一致时也不自动并入——联系人字段对得上，不代表该补哪个行业。
 */
export function isAutoMergeEligible(card: IngestV2CardViewModel, draft: IngestV2CardDraft): boolean {
  return card.allExtracted
    && !card.hasTerminalFailure
    && draft.conflictedFields.length === 0
    && !industryNeedsReview(draft);
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

// ── 本机账本（纯解析）：哪些卡是自动导入的、哪些经用户确认、哪些并入了已有联系人、哪些「稍后处理」。
// 状态机（use-card-batch）读写它；今日要事（W0011 use-pending-cards）只读，用同一套口径算待确认数。
export interface CardBatchLedger { auto: string[]; user: string[]; merged: string[]; later: string[]; notified: boolean }
export const EMPTY_CARD_BATCH_LEDGER: CardBatchLedger = { auto: [], later: [], merged: [], notified: false, user: [] };
export const CARD_BATCH_LEDGER_PREFIX = "orbit.cardBatch.ledger.v1:";

/** 解析 localStorage 里的账本原文；缺失或损坏时退回空账本（只影响计数口径）。 */
export function parseCardBatchLedger(raw: string | null): CardBatchLedger {
  try {
    const parsed = JSON.parse(raw ?? "null") as Partial<CardBatchLedger> | null;
    const list = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
    return { auto: list(parsed?.auto), later: list(parsed?.later), merged: list(parsed?.merged), notified: parsed?.notified === true, user: list(parsed?.user) };
  } catch {
    return EMPTY_CARD_BATCH_LEDGER;
  }
}

/**
 * 复核队列与其中仍待确认的卡（全站胶囊「N 张名片待你确认」的 N）：
 * 队列 = 需要人看的卡 + 用户确认过的卡 + 用户跳过的卡，但不含这次自动导入的；
 * 待确认 = 队列里未确认、未跳过、也没被「稍后处理」的卡。
 */
export function cardReviewQueue(cards: readonly IngestV2CardViewModel[], ledger: CardBatchLedger) {
  const autoSet = new Set(ledger.auto);
  const laterSet = new Set(ledger.later);
  const queue = cards.filter(card => !autoSet.has(card.cardId) && (needsReview(card, autoSet) || ledger.user.includes(card.cardId) || (isCardSkipped(card) && card.items.some(item => item.status === "skipped"))));
  const isHandled = (card: IngestV2CardViewModel) => card.allConfirmed || isCardSkipped(card) || laterSet.has(card.cardId);
  return { isHandled, laterSet, pending: queue.filter(card => !isHandled(card)), queue };
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
