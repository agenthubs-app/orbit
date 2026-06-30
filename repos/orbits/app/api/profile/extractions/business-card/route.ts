import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import type { ProfileDocumentExtractionInput } from "../../../../../features/profile/extraction-contract";
import {
  createProfileDocumentExtractionService,
  profileDocumentExtractionFailureContext,
  profileDocumentExtractionFailureToAppError,
} from "../../../../../features/profile/service-factory";

export const dynamic = "force-dynamic";

// business-card extraction route 从名片材料生成 profile 更新草稿。
// route 只合并 query scenario 和 JSON body；抽取逻辑和建议状态由 extraction service 负责。
async function readExtractionInput(
  request: Request,
): Promise<ProfileDocumentExtractionInput> {
  const scenario = new URL(request.url).searchParams.get("scenario");

  // query scenario 优先于 body，便于通过 URL 复现 mock 场景。
  try {
    const body = (await request.json()) as ProfileDocumentExtractionInput;
    const safeBody = body && typeof body === "object" ? body : {};

    return {
      ...safeBody,
      scenario: scenario ?? safeBody.scenario,
    };
  } catch {
    return {
      scenario,
    };
  }
}

export async function POST(request: Request): Promise<Response> {
  // extractBusinessCardDraft 只生成待复核草稿，不直接更新 profile。
  const mode = resolveFeatureMode();
  const extractionService = createProfileDocumentExtractionService();
  const result = extractionService.extractBusinessCardDraft(
    await readExtractionInput(request),
  );

  if (result.success === false) {
    // extraction failure 使用 profile document extraction contract 的上下文。
    const appError = profileDocumentExtractionFailureToAppError(result);

    return NextResponse.json(
      failure(appError, profileDocumentExtractionFailureContext(result, mode)),
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
