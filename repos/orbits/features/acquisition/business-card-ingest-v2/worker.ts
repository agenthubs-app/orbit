import sharp from "sharp";

import {
  normalizeBusinessCardExtraction,
  reviewIssuesForBusinessCard,
  type BusinessCardCloudOcrProvider,
  type BusinessCardCloudOcrResult,
  type BusinessCardStructuredExtraction,
} from "../business-card-cloud-ocr";
import { BusinessCardCloudOcrProviderError } from "../business-card-ocr-validation";
import {
  INGEST_V2_OCR_DEADLINE_MS,
  type IngestItemErrorCode,
} from "./contract";
import type { IngestDerivativeStore } from "./derivative-store";
import type { BusinessCardIngestRepository } from "./repository";

// V2 worker（方案 §六）：领取（不持 batch 锁）→ 端到端 deadline 内执行两阶段 OCR
// → CAS 提交（0 行=已被接管/取消，静默）。通知与清理走 outbox，reaper/sweep 每轮前置。

export interface IngestV2WorkerRunResult {
  claimed: number;
  extracted: number;
  failed: number;
  sweptBatches: number;
  reapedItems: number;
  notificationsSent: number;
  notificationsSuperseded: number;
  notificationFailures: number;
  cleanupDeleted: number;
  cleanupRetried: number;
}

function errorCodeFor(error: unknown): IngestItemErrorCode {
  if (error instanceof BusinessCardCloudOcrProviderError) {
    if (error.code === "PROVIDER_TIMEOUT") {
      return "OCR_PROVIDER_TIMEOUT";
    }
    if (error.code === "INVALID_STRUCTURED_OUTPUT") {
      return "OCR_INVALID_OUTPUT";
    }
  }
  return "OCR_PROVIDER_FAILED";
}

/** 指数退避 + 抖动（方案 §六）。attempt 为已授予的 lease 次数（≥1）。 */
export function retryDelayMsForAttempt(attempt: number): number {
  const base = 5_000 * 3 ** Math.max(0, attempt - 1);
  const jitter = base * 0.25 * (Math.random() * 2 - 1);
  return Math.round(base + jitter);
}

// 方向回退：仅当姓名+公司全部识别为空时才尝试旋转重试（180° 覆盖最常见的
// 倒置，其次 90°），按字段覆盖度择优；绝不对每张照片固定识别四遍。
function identityAndOrgMissing(extraction: BusinessCardStructuredExtraction): boolean {
  return !extraction.fullName && !extraction.nativeFullName && !extraction.organization;
}

function coverageScore(extraction: BusinessCardStructuredExtraction): number {
  return (
    (extraction.fullName || extraction.nativeFullName ? 2 : 0) +
    (extraction.organization ? 1 : 0) +
    extraction.emails.length +
    extraction.contactPoints.length
  );
}

const ROTATION_FALLBACK_ANGLES = [180, 90] as const;

export async function extractWithOrientationFallback(
  provider: BusinessCardCloudOcrProvider,
  bytes: Buffer,
): Promise<{ base64: string; extraction: BusinessCardStructuredExtraction; ocr: BusinessCardCloudOcrResult }> {
  const base64 = bytes.toString("base64");
  const first = await provider.extract({ imageBase64: base64, mimeType: "image/jpeg" });
  let best = {
    base64,
    extraction: normalizeBusinessCardExtraction(first.extraction),
    ocr: first,
  };

  if (!identityAndOrgMissing(best.extraction)) {
    return best;
  }

  for (const angle of ROTATION_FALLBACK_ANGLES) {
    let rotatedBase64: string;
    try {
      rotatedBase64 = (await sharp(bytes).rotate(angle).jpeg().toBuffer()).toString("base64");
    } catch {
      continue;
    }
    try {
      const attempt = await provider.extract({ imageBase64: rotatedBase64, mimeType: "image/jpeg" });
      const extraction = normalizeBusinessCardExtraction(attempt.extraction);
      if (coverageScore(extraction) > coverageScore(best.extraction)) {
        best = { base64: rotatedBase64, extraction, ocr: attempt };
      }
      if (!identityAndOrgMissing(extraction)) {
        break;
      }
    } catch {
      // 单个方向失败不影响其余尝试；最差保留第一次结果。
    }
  }

  return best;
}

async function withDeadline<T>(promise: Promise<T>, deadlineMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(
            new BusinessCardCloudOcrProviderError(
              "PROVIDER_TIMEOUT",
              `worker deadline of ${deadlineMs}ms elapsed`,
            ),
          );
        }, deadlineMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function createIngestV2Worker({
  repository,
  store,
  provider,
  notify,
  concurrency = 3,
  ocrDeadlineMs = INGEST_V2_OCR_DEADLINE_MS,
}: {
  repository: BusinessCardIngestRepository;
  store: IngestDerivativeStore;
  provider: BusinessCardCloudOcrProvider;
  notify: (input: {
    actorId: string;
    batchId: string;
    reviewGeneration: number;
  }) => Promise<void>;
  concurrency?: number;
  ocrDeadlineMs?: number;
}) {
  return {
    async runOnce(): Promise<IngestV2WorkerRunResult> {
      const result: IngestV2WorkerRunResult = {
        claimed: 0,
        extracted: 0,
        failed: 0,
        sweptBatches: 0,
        reapedItems: 0,
        notificationsSent: 0,
        notificationsSuperseded: 0,
        notificationFailures: 0,
        cleanupDeleted: 0,
        cleanupRetried: 0,
      };

      const swept = await repository.sweepDueBatches();
      result.sweptBatches = swept.expiredBatchIds.length;
      const reaped = await repository.reapExhaustedLeases();
      result.reapedItems = reaped.reapedItemIds.length;

      const claimed = await repository.claimItems({ limit: concurrency });
      result.claimed = claimed.length;

      await Promise.all(
        claimed.map(async (item) => {
          try {
            if (!item.derivativeObjectKey) {
              throw new BusinessCardCloudOcrProviderError(
                "PROVIDER_REQUEST_FAILED",
                "derivative object key is missing",
              );
            }
            const bytes = await store.get(item.derivativeObjectKey);
            if (!bytes) {
              // 衍生图丢失不会自愈：直接终态，复核时可换图/手工录入。
              await repository.submitFailure({
                itemId: item.id,
                leaseToken: item.leaseToken,
                expectedVersion: item.version,
                errorStage: "normalize",
                errorCode: "IMAGE_INVALID",
                retryDelayMs: 0,
              });
              result.failed += 1;
              return;
            }
            const best = await withDeadline(
              (async () => {
                const chosen = await extractWithOrientationFallback(provider, bytes);
                // 第三遍定向复核只对最终采用的方向跑一次；失败返回 null，
                // 相关 mismatch issue 直接不产生，绝不阻塞主链路。
                const verification =
                  (await provider
                    .verifyHighRiskFields?.({
                      imageBase64: chosen.base64,
                      mimeType: "image/jpeg",
                    })
                    .catch(() => null)) ?? null;
                return { ...chosen, verification };
              })(),
              ocrDeadlineMs,
            );
            const extraction = best.extraction;
            const submitted = await repository.submitExtraction({
              itemId: item.id,
              leaseToken: item.leaseToken,
              expectedVersion: item.version,
              extraction,
              reviewIssues: reviewIssuesForBusinessCard(extraction, {
                transcript: best.ocr.transcript ?? null,
                verification: best.verification,
              }),
              usage: best.ocr.usage,
            });
            if (submitted.accepted) {
              result.extracted += 1;
            }
          } catch (error) {
            await repository.submitFailure({
              itemId: item.id,
              leaseToken: item.leaseToken,
              expectedVersion: item.version,
              errorStage: "ocr",
              errorCode: errorCodeFor(error),
              retryDelayMs: retryDelayMsForAttempt(item.attemptCount),
            });
            result.failed += 1;
          }
        }),
      );

      // 通知投递（方案 §六）：发送前重读 batch 做 best-effort supersede。
      const notifications = await repository.listPendingNotifications({ limit: 10 });
      for (const notification of notifications) {
        const detail = await repository.getBatch({
          actorId: notification.actorId,
          batchId: notification.batchId,
        });
        const current =
          detail &&
          detail.batch.status === "ready_for_review" &&
          detail.batch.reviewGeneration === notification.reviewGeneration;
        if (!current) {
          await repository.resolveNotification({
            batchId: notification.batchId,
            eventType: notification.eventType,
            reviewGeneration: notification.reviewGeneration,
            outcome: "superseded",
          });
          result.notificationsSuperseded += 1;
          continue;
        }
        try {
          await notify({
            actorId: notification.actorId,
            batchId: notification.batchId,
            reviewGeneration: notification.reviewGeneration,
          });
          await repository.resolveNotification({
            batchId: notification.batchId,
            eventType: notification.eventType,
            reviewGeneration: notification.reviewGeneration,
            outcome: "sent",
          });
          result.notificationsSent += 1;
        } catch {
          // 投递失败保持 pending，下一轮重试；不能击穿批处理本身。
          result.notificationFailures += 1;
        }
      }

      // cleanup outbox：删除失败自动重试（方案 §七）。
      const cleanupTasks = await repository.listPendingCleanupTasks({ limit: 20 });
      for (const task of cleanupTasks) {
        try {
          await store.delete(task.objectKey);
          await repository.resolveCleanupTask({ id: task.id, outcome: "done" });
          result.cleanupDeleted += 1;
        } catch {
          await repository.resolveCleanupTask({
            id: task.id,
            outcome: "retry",
            retryDelayMs: 60_000,
          });
          result.cleanupRetried += 1;
        }
      }

      return result;
    },
  };
}
