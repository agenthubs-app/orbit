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

  try {
    const body = (await request.json()) as Partial<ConfirmationDecisionInput>;
    const safeBody = body && typeof body === "object" ? body : {};

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
  const mode = resolveFeatureMode();
  const confirmationService = createSensitiveActionConfirmationService();
  const { id } = await context.params;
  const result = confirmationService.approveConfirmation(
    await readConfirmationDecisionInput(request, id),
  );

  if (result.success === false) {
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
