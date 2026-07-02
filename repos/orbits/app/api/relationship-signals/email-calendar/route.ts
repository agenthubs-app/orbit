import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import {
  emailCalendarSignalFailureContext,
  emailCalendarSignalFailureToAppError,
} from "../../../../features/acquisition/email-calendar-contract";
import { createEmailCalendarSignalService } from "../../../../features/acquisition/service-factory";

export const dynamic = "force-dynamic";

// email-calendar signals route 返回邮件/日历来源中的关系信号。
// route 只读取 sourceKind/scenario；外部来源模拟、信号解释和证据由 acquisition service 负责。
export async function GET(request: Request): Promise<Response> {
  // GET 是只读信号列表，不确认信号，也不访问真实邮箱/日历。
  const runtimeMode = process.env.ORBIT_MODULE_MODE ?? process.env.ORBIT_FEATURE_MODE;
  const mode = resolveFeatureMode(runtimeMode);
  const searchParams = new URL(request.url).searchParams;
  const service = createEmailCalendarSignalService(mode);
  const result = await service.listEmailCalendarSignals({
    sourceKind: searchParams.get("sourceKind"),
    scenario: searchParams.get("scenario"),
  });

  if (result.success === false) {
    // email/calendar signal failure 统一映射成 AppError/envelope。
    const appError = emailCalendarSignalFailureToAppError(result);

    return NextResponse.json(
      failure(appError, emailCalendarSignalFailureContext(result, mode)),
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
