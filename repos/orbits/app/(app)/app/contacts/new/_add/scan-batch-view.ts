/**
 * R12：把共用名片状态机（`useCardBatch`）的状态映射成新「名刺の読み取り / まとめて確認 / 完成」画面要的视图
 * （`orbit-2026/add/scan-types.ts`）。纯函数，不碰 IO；判定口径全部沿用 card-batch-model（自动导入、复核原因、跳过）。
 * 放在路由目录里而不是 orbit-2026：新画面不能引用旧目录（orbit-2026-scope 门禁），映射由这里做。
 */
import type {
  ScanBatchView,
  ScanCardKind,
  ScanCardView,
  ScanFailure,
  ScanIssueGroup,
  ScanPhase,
  ScanSection,
} from "../../../orbit-2026/add/scan-types";
import {
  cardIssues,
  enrichmentNeedsReview,
  flaggedFields,
  isAutoImportEligible,
  isCardSkipped,
} from "../../card-batch-0918/card-batch-model";
import type { CardBatch } from "../../card-batch-0918/use-card-batch";
import { initialCardDraft, type IngestV2CardViewModel } from "../../ingest-v2/ingest-v2-route-view-model";

type BatchState = Pick<CardBatch,
  "attributed" | "attribution" | "attributionDecisions" | "autoCount" | "autoPending" | "autoRunning" | "batchId" | "cards" | "detail" | "drafts" | "duplicates"
  | "finished" | "loadFailed" | "matches" | "mergedCount" | "missing" | "pending" | "queue" | "reviewing" | "settledCount" | "stage" | "status"
  | "uploadFailed" | "userCount">;

const MISREAD = new Set(["VERIFICATION_MISMATCH"]);
const FORMAT = new Set(["INVALID_EMAIL", "INVALID_PHONE", "SHARED_CONTACT_VALUE", "MULTIPLE_OFFICES"]);

/** 要確認的分组：按现有 issue 码（缺姓名、公司后缀、定向复读不一致、正反面冲突、行业 / 职级 / 地区待选、格式）。 */
export function issueGroupFor(card: IngestV2CardViewModel, batch: Pick<BatchState, "drafts">): ScanIssueGroup {
  const draft = batch.drafts[card.cardId] ?? initialCardDraft(card);
  if (!draft.fields.displayName.trim()) return "name";
  if (draft.conflictedFields.length) return "sides";
  if (enrichmentNeedsReview(draft)) return "enrichment";
  const issue = cardIssues(card)[0];
  if (!issue) return "other";
  if (issue.code === "IDENTITY_MISSING" || issue.code === "NATIVE_ROMANIZED_NAME_CONFLICT") return "name";
  if (issue.code === "ORG_SUFFIX_MISSING") return "orgSuffix";
  if (MISREAD.has(issue.code)) return "misread";
  if (FORMAT.has(issue.code)) return "format";
  return "other";
}

/** 读不出的原因：现有错误码只分得出「画像を読み取れません」和「混み合っていて失敗」（DESIGN §2.2 第 8 步）。 */
export function failureFor(card: IngestV2CardViewModel): ScanFailure | null {
  const failed = card.items.find((item) => item.status === "terminal_failed");
  if (!failed) return null;
  return failed.errorCode === "IMAGE_INVALID" || failed.errorCode === "OCR_INVALID_OUTPUT" ? "image" : "busy";
}

function kindFor(card: IngestV2CardViewModel, batch: BatchState, needsLook: boolean): ScanCardKind {
  const statuses = card.items.map((item) => item.status);
  if (card.allConfirmed) return "added";
  if (isCardSkipped(card)) return "skipped";
  if (statuses.some((status) => status === "awaiting_upload" || status === "uploaded")) return "uploading";
  if (statuses.some((status) => status === "processing")) return "reading";
  if (statuses.some((status) => status === "queued")) return "queued";
  if (card.hasTerminalFailure) return "failed";
  if (batch.matches[card.cardId]) return "duplicate";
  return needsLook ? "guess" : "ready";
}

function phaseFor(batch: BatchState): ScanPhase {
  if (!batch.detail) return batch.loadFailed ? "missing" : "loading";
  if (batch.status === "expired") return "expired";
  if (batch.status === "cancelled") return "cancelled";
  if (batch.stage === "upload") return "uploading";
  if (batch.stage === "recognize") return "reading";
  if (batch.autoRunning || batch.autoPending || !batch.reviewing) return "importing";
  return batch.finished ? "done" : "review";
}

export function buildScanBatchView(batch: BatchState): ScanBatchView {
  const pendingIds = new Set(batch.pending.map((card) => card.cardId));
  const queueIds = new Set(batch.queue.map((card) => card.cardId));
  const cards: ScanCardView[] = batch.cards.map((card) => {
    const draft = batch.drafts[card.cardId] ?? null;
    const flagged = draft ? [...flaggedFields(card, draft)] : [];
    const needsLook = Boolean(draft) && !isAutoImportEligible(card, draft!);
    let section: ScanSection | null = null;
    if (pendingIds.has(card.cardId)) {
      section = card.hasTerminalFailure ? "failed" : batch.duplicates.has(card.cardId) ? "duplicate" : needsLook ? "review" : "ready";
    }
    return {
      cardId: card.cardId,
      kind: kindFor(card, batch, needsLook),
      name: draft?.fields.displayName.trim() ?? "",
      organization: draft?.fields.organization.trim() ?? "",
      role: draft?.fields.role.trim() ?? "",
      twoSided: card.isTwoSided,
      fileName: card.items[0]?.sourceFileName ?? "",
      section,
      issueGroup: section === "review" ? issueGroupFor(card, batch) : null,
      failure: failureFor(card),
      candidate: batch.matches[card.cardId] ?? null,
      card,
      draft,
      flagged,
    };
  });
  const items = batch.cards.flatMap((card) => card.items);
  const count = (section: ScanSection) => cards.filter((card) => card.section === section).length;
  // 自动进人脈的卡不在复核队列里（cardReviewQueue 口径）：已确认且不在队列 = 自动导入 / 自动统合。
  const autoAdded = batch.cards.filter((card) => card.allConfirmed && !queueIds.has(card.cardId)).length;
  const held = count("ready");
  const events = batch.attribution.events;
  const candidateEvents = new Set(Object.values(batch.attribution.cards).filter((value): value is string => Boolean(value)));
  // 整批选择：有候选的卡都勾选同一场活动时就是它；全部取消 = つけない。
  const chosen = [...candidateEvents].find((eventId) => Object.entries(batch.attribution.cards).some(([cardId, candidate]) => candidate === eventId && batch.attributionDecisions[cardId] !== false)) ?? null;
  return {
    batchId: batch.batchId ?? "",
    phase: phaseFor(batch),
    createdAt: batch.detail?.batch.createdAt ?? null,
    completed: batch.status === "completed",
    photos: items.length,
    uploaded: items.filter((item) => item.status !== "awaiting_upload").length,
    settled: batch.settledCount,
    cards,
    counts: {
      duplicate: count("duplicate"),
      review: count("review"),
      asIs: autoAdded + held,
      autoAdded,
      held,
      failed: count("failed"),
      created: batch.autoCount + batch.userCount,
      merged: batch.mergedCount,
      // 读不出的不计入「追加」：没有被手入力补成联系人的读不出卡（跳过后条目仍保留 errorCode）。
      unreadable: batch.cards.filter((card) => !card.allConfirmed && card.items.some((item) => item.errorCode !== null && (item.status === "terminal_failed" || item.status === "skipped"))).length,
    },
    events: events.filter((event) => candidateEvents.has(event.eventId)),
    selectedEventId: chosen,
    writtenEventIds: [...new Set(Object.values(batch.attributed))],
    uploadFailed: batch.uploadFailed,
    missingFiles: batch.missing,
  };
}
