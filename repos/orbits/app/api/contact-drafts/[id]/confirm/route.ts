import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import {
  manualContactCreationFailureContext,
  manualContactCreationFailureToAppError,
} from "../../../../../features/acquisition/manual-contract";
import {
  QR_SCAN_CONNECT_LIVE_DRAFT_ID_PREFIX,
  qrScanConnectFailureContext,
  qrScanConnectFailureToAppError,
} from "../../../../../features/acquisition/qr-contract";
import {
  BUSINESS_CARD_REVIEW_LIVE_DRAFT_ID_PREFIX,
  businessCardReviewFailureContext,
  businessCardReviewFailureToAppError,
} from "../../../../../features/acquisition/business-card-review-contract";
import { createBusinessCardReviewService } from "../../../../../features/acquisition/service-factory";
import { createManualContactCreationService } from "../../../../../features/acquisition/service-factory";
import { createQrScanConnectService } from "../../../../../features/acquisition/service-factory";
import { createContactAcquisitionDraftService } from "../../../../../features/acquisition/service-factory";
import {
  contactAcquisitionDraftFailureContext,
  contactAcquisitionDraftFailureToAppError,
} from "../../../../../features/acquisition/service";

export const dynamic = "force-dynamic";

// confirm contact draft 是联系人草稿的确认入口。
// demo 草稿根据来源分派到对应服务；通用草稿走 acquisition draft service。
interface ConfirmContactDraftRouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function POST(
  request: Request,
  context: ConfirmContactDraftRouteContext,
): Promise<Response> {
  // scenario 来自 query，用于复现不同确认状态；confirmation 逻辑在各 service 内部。
  const mode = resolveFeatureMode(
    process.env.ORBIT_MODULE_MODE ?? process.env.ORBIT_FEATURE_MODE,
  );
  const { id } = await context.params;
  const scenario = new URL(request.url).searchParams.get("scenario");

  if (
    id === "demo-qr-draft" ||
    id.startsWith(QR_SCAN_CONNECT_LIVE_DRAFT_ID_PREFIX)
  ) {
    // QR 草稿有独立 confirm 路径，因为它的证据来源和字段结构不同。
    const qrService = createQrScanConnectService(
      id.startsWith(QR_SCAN_CONNECT_LIVE_DRAFT_ID_PREFIX) ? mode : "mock",
    );
    const result = await qrService.confirmQrConnectionDraft({
      draftId: id,
      scenario,
    });

    if (result.success === false) {
      // QR 失败使用 qr contract 的上下文。
      const appError = qrScanConnectFailureToAppError(result);

      return NextResponse.json(
        failure(appError, qrScanConnectFailureContext(result, mode)),
        {
          headers: runtimeBoundaryHeaders(mode),
          status: getHttpStatusForAppErrorCode(appError.code),
        },
      );
    }

    return NextResponse.json(success(result.data), {
      headers: runtimeBoundaryHeaders(mode),
      status: 200,
    });
  }

  if (
    id === "demo-business-card-draft" ||
    id.startsWith(BUSINESS_CARD_REVIEW_LIVE_DRAFT_ID_PREFIX)
  ) {
    // 名片草稿确认前通常已经经过 reviewedFields 复核。
    const reviewService = createBusinessCardReviewService(
      id.startsWith(BUSINESS_CARD_REVIEW_LIVE_DRAFT_ID_PREFIX) ? mode : "mock",
    );
    const result = await reviewService.confirmReviewedDraft({
      draftId: id,
      scenario,
    });

    if (result.success === false) {
      // 名片复核失败使用 review contract 的上下文。
      const appError = businessCardReviewFailureToAppError(result);

      return NextResponse.json(
        failure(appError, businessCardReviewFailureContext(result, mode)),
        {
          headers: runtimeBoundaryHeaders(mode),
          status: getHttpStatusForAppErrorCode(appError.code),
        },
      );
    }

    return NextResponse.json(success(result.data), {
      headers: runtimeBoundaryHeaders(mode),
      status: 200,
    });
  }

  if (id === "demo-manual-draft" || id.startsWith("manual-draft:live:")) {
    // 手动草稿确认走 manual service，保留手工录入来源说明。
    const manualService = createManualContactCreationService(mode);
    const result = await manualService.confirmManualContactDraft({
      draftId: id,
      scenario,
    });

    if (result.success === false) {
      // 手动创建失败使用 manual contract 的上下文。
      const appError = manualContactCreationFailureToAppError(result);

      return NextResponse.json(
        failure(appError, manualContactCreationFailureContext(result, mode)),
        {
          headers: runtimeBoundaryHeaders(mode),
          status: getHttpStatusForAppErrorCode(appError.code),
        },
      );
    }

    return NextResponse.json(success(result.data), {
      headers: runtimeBoundaryHeaders(mode),
      status: 200,
    });
  }

  // 其他 draft id 走通用草稿确认服务，后续真实数据源也从这里扩展。
  const draftService = createContactAcquisitionDraftService(mode);
  const result = await draftService.confirmContactDraft({
    draftId: id,
    scenario,
  });

  if (result.success === false) {
    // 通用草稿失败使用 acquisition draft contract 的上下文。
    const appError = contactAcquisitionDraftFailureToAppError(result);

    return NextResponse.json(
      failure(appError, contactAcquisitionDraftFailureContext(result, mode)),
      {
        headers: runtimeBoundaryHeaders(mode),
        status: getHttpStatusForAppErrorCode(appError.code),
      },
    );
  }

  return NextResponse.json(success(result.data), {
    headers: runtimeBoundaryHeaders(mode),
    status: 200,
  });
}
