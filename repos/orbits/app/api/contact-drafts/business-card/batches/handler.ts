import { cardScanLimitError, chargeCardScan } from "../../../../../features/ai-quota/card-scan-quota";
import { DEFAULT_ACCOUNT_TIER } from "../../../../../features/ai-quota/tiers";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import {
  BUSINESS_CARD_BATCH_MAX_ITEMS,
  BUSINESS_CARD_BATCH_MAX_PDF_BYTES,
  type BusinessCardBatchSourceFile,
  type NewBusinessCardBatchItemInput,
} from "../../../../../features/acquisition/business-card-batch-contract";
import {
  createConfiguredBusinessCardBatchService,
  type BusinessCardBatchService,
} from "../../../../../features/acquisition/business-card-batch-service";
import {
  isBusinessCardUploadMimeType,
  normalizeBusinessCardUploadImage,
  resolveBusinessCardUploadMimeType,
} from "../../../../../features/acquisition/business-card-image-normalization";
import { paginatePdfToCardImages } from "../../../../../features/acquisition/business-card-pdf-pagination";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import {
  AppError,
  getHttpStatusForAppErrorCode,
} from "../../../../../shared/errors/app-error";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../../../_shared/authenticated-actor";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export interface BusinessCardBatchRejectedFile {
  fileName: string;
  reason:
    | "image_too_large"
    | "image_unreadable"
    | "pdf_too_large"
    | "pdf_unreadable"
    | "unsupported_type";
}

function digest(bytes: Buffer): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function appErrorResponse(error: AppError, mode: ReturnType<typeof resolveFeatureMode>): Response {
  return NextResponse.json(failure(error), {
    headers: runtimeBoundaryHeaders(mode),
    status: getHttpStatusForAppErrorCode(error.code),
  });
}

export function createBusinessCardBatchCollectionHandlers(
  resolveActor: ResolveAuthenticatedApiActor = resolveAuthenticatedApiActor,
  service: BusinessCardBatchService | null = createConfiguredBusinessCardBatchService(),
) {
  async function GET(): Promise<Response> {
    const mode = resolveFeatureMode(
      process.env.ORBIT_MODULE_MODE ?? process.env.ORBIT_FEATURE_MODE,
    );
    const actor = await resolveActor();

    if (!actor) {
      return authenticatedApiActorRequiredResponse(mode);
    }

    if (!service) {
      return appErrorResponse(
        new AppError(
          "SERVICE_UNAVAILABLE",
          "Business-card batch import requires a configured live database.",
        ),
        mode,
      );
    }

    return NextResponse.json(success({ batches: await service.listBatches(actor.id) }), {
      headers: runtimeBoundaryHeaders(mode),
      status: 200,
    });
  }

  async function POST(request: Request): Promise<Response> {
    const mode = resolveFeatureMode(
      process.env.ORBIT_MODULE_MODE ?? process.env.ORBIT_FEATURE_MODE,
    );
    const actor = await resolveActor();

    if (!actor) {
      return authenticatedApiActorRequiredResponse(mode);
    }

    if (!service) {
      return appErrorResponse(
        new AppError(
          "SERVICE_UNAVAILABLE",
          "Business-card batch import requires a configured live database.",
        ),
        mode,
      );
    }

    const formData = await request.formData();
    const files = formData
      .getAll("files")
      .filter((entry): entry is File => entry instanceof File);
    const items: NewBusinessCardBatchItemInput[] = [];
    const sourceFiles: BusinessCardBatchSourceFile[] = [];
    const rejectedFiles: BusinessCardBatchRejectedFile[] = [];

    for (const file of files) {
      const mimeType = resolveBusinessCardUploadMimeType({
        declaredType: file.type,
        fileName: file.name,
      });
      const bytes = Buffer.from(await file.arrayBuffer());

      if (
        mimeType === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf")
      ) {
        if (bytes.byteLength > BUSINESS_CARD_BATCH_MAX_PDF_BYTES) {
          rejectedFiles.push({ fileName: file.name, reason: "pdf_too_large" });
          continue;
        }

        let pages;

        try {
          pages = await paginatePdfToCardImages({
            maxPages: BUSINESS_CARD_BATCH_MAX_ITEMS - items.length,
            pdfBytes: bytes,
          });
        } catch (error) {
          if (error instanceof Error && error.message === "BUSINESS_CARD_BATCH_TOO_LARGE") {
            return appErrorResponse(
              new AppError(
                "VALIDATION_ERROR",
                "BUSINESS_CARD_BATCH_TOO_LARGE: a batch accepts at most 500 cards.",
              ),
              mode,
            );
          }

          rejectedFiles.push({ fileName: file.name, reason: "pdf_unreadable" });
          continue;
        }

        for (const page of pages) {
          items.push({
            imageDigest: digest(page.jpegBytes),
            imageJpegBase64: page.jpegBytes.toString("base64"),
            seq: items.length + 1,
            sourceFileName: file.name,
            sourcePage: page.page,
            uploadMimeType: "application/pdf",
          });
        }
        sourceFiles.push({ fileName: file.name, itemCount: pages.length, kind: "pdf" });
        continue;
      }

      if (!isBusinessCardUploadMimeType(mimeType)) {
        rejectedFiles.push({ fileName: file.name, reason: "unsupported_type" });
        continue;
      }

      if (bytes.byteLength > MAX_IMAGE_BYTES) {
        rejectedFiles.push({ fileName: file.name, reason: "image_too_large" });
        continue;
      }

      let normalized;

      try {
        normalized = await normalizeBusinessCardUploadImage({
          imageBase64: bytes.toString("base64"),
          mimeType,
        });
      } catch {
        rejectedFiles.push({ fileName: file.name, reason: "image_unreadable" });
        continue;
      }

      items.push({
        imageDigest: digest(bytes),
        imageJpegBase64: normalized.imageBase64,
        seq: items.length + 1,
        sourceFileName: file.name,
        sourcePage: null,
        uploadMimeType: mimeType,
      });
      sourceFiles.push({ fileName: file.name, itemCount: 1, kind: "image" });
    }

    if (items.length === 0) {
      return appErrorResponse(
        new AppError(
          "VALIDATION_ERROR",
          "BUSINESS_CARD_BATCH_EMPTY: no usable card image or PDF was uploaded.",
        ),
        mode,
      );
    }

    if (items.length > BUSINESS_CARD_BATCH_MAX_ITEMS) {
      return appErrorResponse(
        new AppError(
          "VALIDATION_ERROR",
          "BUSINESS_CARD_BATCH_TOO_LARGE: a batch accepts at most 500 cards.",
        ),
        mode,
      );
    }

    // 2026-11-27 分档：旧的 v1 批量也计扫名片的月上限（按图片张数）；放不下就整批不受理。
    const charge = await chargeCardScan({ actorId: actor.id, chunks: [items.length], tier: actor.tier ?? DEFAULT_ACCOUNT_TIER });
    if (charge.kind === "limited") {
      const body = cardScanLimitError(charge.notice);
      return NextResponse.json(failure(new AppError("CONFLICT", body.message), body.context), { headers: runtimeBoundaryHeaders(mode), status: 429 });
    }
    let batch: Awaited<ReturnType<typeof service.createBatch>>;
    try {
      batch = await service.createBatch({
        actorId: actor.id,
        items,
        now: new Date().toISOString(),
        sourceFiles,
      });
    } catch (error) {
      await charge.refund();
      throw error;
    }

    return NextResponse.json(
      success({ acceptedFiles: sourceFiles, batch, rejectedFiles }),
      { headers: runtimeBoundaryHeaders(mode), status: 200 },
    );
  }

  return { GET, POST };
}
