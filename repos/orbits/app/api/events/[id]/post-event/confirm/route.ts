import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../../shared/errors/app-error";
import {
  postEventReviewFailureContext,
  postEventReviewFailureToAppError,
  type ConfirmPostEventContactsInput,
} from "../../../../../../features/events/post-event-review/contract";
import { createPostEventContactReviewService } from "../../../../../../features/events/service-factory";

export const dynamic = "force-dynamic";

// post-event confirm route 用于确认活动后要保留/创建的联系人草稿。
// route 解析 contactDraftIds；具体确认、去重和状态更新由 post-event review service 完成。
interface PostEventReviewConfirmRouteContext {
  params: Promise<{
    id: string;
  }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readFormText(
  formData: FormData,
  fieldName: string,
): string | undefined {
  const value = formData.get(fieldName);

  return typeof value === "string" ? value : undefined;
}

function splitContactDraftIds(value?: string | null): readonly string[] | null {
  // query/form 中用逗号分隔草稿 id；null 表示调用方没有指定范围。
  if (value === undefined || value === null) {
    return null;
  }

  return value
    .split(",")
    .map((contactDraftId) => contactDraftId.trim())
    .filter(Boolean);
}

async function readPostEventReviewConfirmInput(
  request: Request,
  eventId: string,
): Promise<ConfirmPostEventContactsInput> {
  const url = new URL(request.url);
  // eventId 来自 path，contactDraftIds 可以来自 query/form/json。
  const queryInput: ConfirmPostEventContactsInput = {
    contactDraftIds: splitContactDraftIds(url.searchParams.get("contactDraftIds")),
    eventId,
    scenario: url.searchParams.get("scenario"),
  };
  const contentType = request.headers.get("content-type") ?? "";

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    // 表单路径服务活动后复核页面的批量确认。
    const formData = await request.formData();

    return {
      ...queryInput,
      contactDraftIds:
        splitContactDraftIds(readFormText(formData, "contactDraftIds")) ??
        queryInput.contactDraftIds,
      scenario: readFormText(formData, "scenario") ?? queryInput.scenario,
    };
  }

  if (!contentType.includes("application/json")) {
    return queryInput;
  }

  const rawBody = await request.text();

  if (!rawBody.trim()) {
    return queryInput;
  }

  let parsedBody: unknown;

  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    // malformed JSON 回落 query 输入，避免非标准异常响应。
    return queryInput;
  }

  const body = isRecord(parsedBody) ? parsedBody : {};
  // JSON 路径中 contactDraftIds 必须是非空字符串数组。
  const bodyContactDraftIds = Array.isArray(body.contactDraftIds)
    ? body.contactDraftIds.filter(
        (contactDraftId): contactDraftId is string =>
          typeof contactDraftId === "string" && contactDraftId.trim() !== "",
      )
    : undefined;

  return {
    ...queryInput,
    contactDraftIds: bodyContactDraftIds ?? queryInput.contactDraftIds,
    scenario:
      typeof body.scenario === "string" ? body.scenario : queryInput.scenario,
  };
}

export async function POST(
  request: Request,
  context: PostEventReviewConfirmRouteContext,
): Promise<Response> {
  // confirmPostEventContacts 不在 route 层直接创建联系人，所有状态变更由 service contract 处理。
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const postEventReviewService = createPostEventContactReviewService();
  const result = await postEventReviewService.confirmPostEventContacts(
    await readPostEventReviewConfirmInput(request, id),
  );

  if (result.success === false) {
    // post-event failure 统一映射成 AppError/envelope。
    const appError = postEventReviewFailureToAppError(result);

    return NextResponse.json(
      failure(appError, postEventReviewFailureContext(result, mode)),
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
