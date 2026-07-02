import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../shared/errors/app-error";
import { createContactAcquisitionDraftService } from "../../../features/acquisition/service-factory";
import {
  contactAcquisitionDraftFailureContext,
  contactAcquisitionDraftFailureToAppError,
} from "../../../features/acquisition/service";

export const dynamic = "force-dynamic";

// contact-drafts list route 返回当前待确认的联系人草稿。
// route 只读取 scenario；草稿来源、排序和状态展示由 acquisition draft service 负责。
export async function GET(request: Request): Promise<Response> {
  // runtime boundary header 让 UI 能显示当前数据来自 mock/live/hybrid。
  const mode = resolveFeatureMode(
    process.env.ORBIT_MODULE_MODE ?? process.env.ORBIT_FEATURE_MODE,
  );
  const draftService = createContactAcquisitionDraftService(mode);
  const scenario = new URL(request.url).searchParams.get("scenario");
  const result = await draftService.listContactDrafts({ scenario });

  if (result.success === false) {
    // draft failure 统一映射为 AppError/envelope。
    const appError = contactAcquisitionDraftFailureToAppError(result);

    return NextResponse.json(
      failure(appError, contactAcquisitionDraftFailureContext(result, mode)),
      {
        headers: runtimeBoundaryHeaders(mode),
        status: getHttpStatusForAppErrorCode(appError.code),
      },
    );
  }

  // 成功 payload 完全由 service 生成，route 不补充业务字段。
  return NextResponse.json(success(result.data), {
    headers: runtimeBoundaryHeaders(mode),
    status: 200,
  });
}
