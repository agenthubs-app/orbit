import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import {
  externalContactsImportFailureContext,
  externalContactsImportFailureToAppError,
} from "../../../../../features/acquisition/external-import-contract";
import { createExternalContactsImportService } from "../../../../../features/acquisition/service-factory";

export const dynamic = "force-dynamic";

// external candidates route 返回外部来源中可导入的联系人候选。
// route 只读取 sourceKind/scenario；外部源模拟、候选过滤和 provenance 在 import service 中。
export async function GET(request: Request): Promise<Response> {
  // 当前实现是只读候选列表，不触发导入或写入联系人。
  const runtimeMode = process.env.ORBIT_MODULE_MODE ?? process.env.ORBIT_FEATURE_MODE;
  const mode = resolveFeatureMode(runtimeMode);
  const searchParams = new URL(request.url).searchParams;
  const candidatesService = createExternalContactsImportService(mode);
  const result = await candidatesService.listExternalContactCandidates({
    sourceKind: searchParams.get("sourceKind"),
    scenario: searchParams.get("scenario"),
  });

  if (result.success === false) {
    // external import failure 统一映射为 AppError/envelope。
    const appError = externalContactsImportFailureToAppError(result);

    return NextResponse.json(
      failure(appError, externalContactsImportFailureContext(result, mode)),
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
