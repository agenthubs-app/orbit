import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import type { ConfirmationDecisionInput } from "../../../../../features/permissions/confirmation-contract";
import {
  confirmationGuardFailureContext,
  confirmationGuardFailureToAppError,
  createSensitiveActionConfirmationService,
} from "../../../../../features/permissions/service-factory";

export const dynamic = "force-dynamic";

// approve confirmation 是敏感动作确认流的通过入口。
// route 只传 confirmationId/actorLabel/scenario；真正的副作用边界由 permissions service 管。
interface ConfirmationDecisionRouteContext {
  params: Promise<{
    id: string;
  }>;
}

async function readConfirmationDecisionInput(
  request: Request,
  confirmationId: string,
): Promise<ConfirmationDecisionInput> {
  const scenario = new URL(request.url).searchParams.get("scenario");

  // body 可选：空 body 时仍允许按 confirmationId 进入 service，让 service 返回明确状态。
  try {
    const body = (await request.json()) as Partial<ConfirmationDecisionInput>;
    const safeBody = body && typeof body === "object" ? body : {};

    // query scenario 优先，方便复现 mock 的 pending/failure 等状态。
    return {
      confirmationId,
      actorLabel: safeBody.actorLabel,
      scenario: scenario ?? safeBody.scenario,
    };
  } catch {
    return {
      confirmationId,
      scenario,
    };
  }
}

export async function POST(
  request: Request,
  context: ConfirmationDecisionRouteContext,
): Promise<Response> {
  // 审批通过本身仍是 service 调用；route 不直接执行邮件、日历或联系人写入。
  const mode = resolveFeatureMode();
  const confirmationService = createSensitiveActionConfirmationService();
  const { id } = await context.params;
  const result = confirmationService.approveConfirmation(
    await readConfirmationDecisionInput(request, id),
  );

  if (result.success === false) {
    // confirmation guard 的错误统一封装，避免 UI 直接耦合权限模块内部失败形状。
    const appError = confirmationGuardFailureToAppError(result);

    return NextResponse.json(
      failure(appError, confirmationGuardFailureContext(result, mode)),
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
