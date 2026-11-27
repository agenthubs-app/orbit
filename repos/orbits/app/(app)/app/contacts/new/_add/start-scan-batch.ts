/**
 * R12 `/app/contacts/new/scan`：把暂存的照片建成名片 v2 批次——与旧上传区（card-batch-uploader）完全同一套做法：
 * 按内容去重、正反面按用户的配对写进 manifest、POST 建批次、照片放进内存与 IndexedDB 并登记为「进行中批次」，
 * 之后的上传 / 续传 / 识别轮询 / 自动进人脈由 `useCardBatch` 接手（批次页或全站 CardBatchHost）。
 */
import { cardScanPartialText, quotaNoticeText } from "../../../orbit-2026/copy/ai-monthly-limit";
import type { ScanStartResult } from "../../../orbit-2026/add/ScanUploadScreen";
import type { StagedCard } from "../../../orbit-2026/add/upload-model";
import { registerActiveBatch, savePendingFiles } from "../../card-batch-0918/card-batch-store";
import { INGEST_V2_API_BASE, resolveUploadMimeType, sha256OfFile, stashPendingFiles } from "../../ingest-v2/ingest-v2-client";
import { freezeManifestSubmission, type PairingCard, type PairingPhoto } from "../../ingest-v2/ingest-v2-route-view-model";

export async function startScanBatch(cards: readonly StagedCard[], idempotencyKey?: string, language: "zh" | "ja" | "en" = "ja"): Promise<ScanStartResult> {
  try {
    const byDigest = new Map<string, File>();
    const pairing: PairingCard[] = [];
    const photoOf = async (photo: StagedCard["front"]): Promise<PairingPhoto | null> => {
      const digest = await sha256OfFile(photo.file);
      // 同一张照片选了两次只算一张（按内容去重）。
      if (byDigest.has(digest)) return null;
      byDigest.set(digest, photo.file);
      return { clientDigest: digest, fileName: photo.file.name, id: photo.id, mimeType: resolveUploadMimeType(photo.file), rawSize: photo.file.size };
    };
    for (const card of cards) {
      const front = await photoOf(card.front);
      if (!front) continue;
      const back = card.back ? await photoOf(card.back) : null;
      pairing.push({ back, cardId: `card:${front.id}`, front });
    }
    if (!pairing.length) return { ok: false };
    const submission = freezeManifestSubmission(pairing, idempotencyKey ?? crypto.randomUUID());
    const response = await fetch(INGEST_V2_API_BASE, {
      body: JSON.stringify({ idempotencyKey: submission.idempotencyKey, manifest: submission.manifest }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const body = (await response.json().catch(() => null)) as { data?: { batch?: { id?: string }; quota?: { notAcceptedSeqs?: unknown[] } & Record<string, unknown> }; error?: { context?: unknown } } | null;
    const batchId = body?.data?.batch?.id;
    // 2026-11-27 分档：这个月的扫名片张数用完了——不建批次，写出张数、恢复日期与 Pro 的张数。
    if (response.status === 429) return { message: quotaNoticeText(language, body?.error?.context) ?? undefined, ok: false };
    if (!response.ok || !batchId) return { ok: false };
    // 只受理了一部分（超出本月剩余张数的名片没有受理）：批次照常开始，另给一句说明。
    const notAccepted = Array.isArray(body?.data?.quota?.notAcceptedSeqs) ? body.data.quota.notAcceptedSeqs.length : 0;
    const notice = notAccepted ? cardScanPartialText(language, notAccepted, body?.data?.quota) : undefined;
    stashPendingFiles(batchId, byDigest);
    await savePendingFiles(batchId, byDigest);
    registerActiveBatch(batchId);
    return { batchId, ok: true, ...(notice ? { notice } : {}) };
  } catch {
    return { ok: false };
  }
}
