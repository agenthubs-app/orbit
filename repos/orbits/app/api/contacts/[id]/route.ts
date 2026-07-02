import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import {
  contactDetailTagStatusFailureContext,
  contactDetailTagStatusFailureToAppError,
  type ContactDetailLastInteractionInput,
  type ContactDetailNoteInput,
  type ContactDetailTagStatusResult,
  type ContactDetailUpdateInput,
} from "../../../../features/contacts/detail-contract";
import { createContactDetailTagStatusService } from "../../../../features/contacts/service-factory";

export const dynamic = "force-dynamic";

// contact detail route 支持读取联系人详情，以及更新标签、状态、备注和最近互动。
// route 只做 PATCH body 白名单解析；具体状态约束和 provenance 由 contact detail service 处理。
interface ContactDetailRouteContext {
  params: Promise<{
    id: string;
  }>;
}

type PatchBody = {
  addTags?: readonly string[];
  lastInteraction?: ContactDetailLastInteractionInput;
  note?: ContactDetailNoteInput | string;
  removeTags?: readonly string[];
  scenario?: string;
  status?: string;
  tags?: readonly string[];
};

type PatchBodyResult =
  | {
      success: true;
      body: PatchBody;
    }
  | {
      success: false;
    };

// PATCH body 可以包含数组、逗号字符串或嵌套对象；这里先做结构化归一。
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStringList(value: unknown): readonly string[] | undefined {
  // tag 字段兼容 "a,b" 和 ["a", "b"] 两种调用方式。
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (!Array.isArray(value)) {
    return undefined;
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function readNote(value: unknown): ContactDetailNoteInput | string | undefined {
  // note 既可传纯文本，也可传带 authorLabel 的结构化对象。
  if (typeof value === "string") {
    return value;
  }

  if (!isRecord(value) || typeof value.body !== "string") {
    return undefined;
  }

  return {
    body: value.body,
    authorLabel:
      typeof value.authorLabel === "string" ? value.authorLabel : undefined,
  };
}

function readLastInteraction(
  value: unknown,
): ContactDetailLastInteractionInput | undefined {
  // 最近互动只接受 channel/occurredAt/summary 三个字段。
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    channel: typeof value.channel === "string" ? value.channel : undefined,
    occurredAt:
      typeof value.occurredAt === "string" ? value.occurredAt : undefined,
    summary: typeof value.summary === "string" ? value.summary : undefined,
  };
}

async function readPatchBody(request: Request): Promise<PatchBodyResult> {
  // malformed JSON 与空对象分开处理，保证 invalidPatchBody 能被 service 统一返回。
  try {
    const body: unknown = await request.json();

    if (!isRecord(body)) {
      return {
        success: true,
        body: {},
      };
    }

    return {
      success: true,
      body: {
        addTags: readStringList(body.addTags ?? body.addTag),
        lastInteraction: readLastInteraction(body.lastInteraction),
        note: readNote(body.note),
        removeTags: readStringList(body.removeTags ?? body.removeTag),
        scenario:
          typeof body.scenario === "string" ? body.scenario : undefined,
        status: typeof body.status === "string" ? body.status : undefined,
        tags: readStringList(body.tags ?? body.tag),
      },
    };
  } catch {
    return {
      success: false,
    };
  }
}

function responseForResult(
  result: ContactDetailTagStatusResult,
  mode: ReturnType<typeof resolveFeatureMode>,
): Response {
  // contact detail 失败统一映射成 AppError/envelope。
  if (result.success === false) {
    const appError = contactDetailTagStatusFailureToAppError(result);

    return NextResponse.json(
      failure(appError, contactDetailTagStatusFailureContext(result, mode)),
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

export async function GET(
  request: Request,
  context: ContactDetailRouteContext,
): Promise<Response> {
  // GET 只读取详情，contactId 来自 path，scenario 用于 mock 状态切换。
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const scenario = new URL(request.url).searchParams.get("scenario");
  const contactDetailService = createContactDetailTagStatusService();
  const result = await contactDetailService.getContactDetail({
    contactId: id,
    scenario,
  });

  return responseForResult(result, mode);
}

export async function PATCH(
  request: Request,
  context: ContactDetailRouteContext,
): Promise<Response> {
  // PATCH 不直接更新数据源，只把白名单字段交给 contact detail service。
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const searchParams = new URL(request.url).searchParams;
  const patchBody = await readPatchBody(request);
  const contactDetailService = createContactDetailTagStatusService();

  if (!patchBody.success) {
    // JSON 解析失败走 service 的 invalid body 分支。
    const invalidResult = await contactDetailService.invalidPatchBody();

    return responseForResult(invalidResult, mode);
  }

  const { body } = patchBody;
  // scenario query 优先于 body，便于通过 URL 复现 mock 场景。
  const input: ContactDetailUpdateInput = {
    addTags: body.addTags,
    contactId: id,
    lastInteraction: body.lastInteraction,
    note: body.note,
    removeTags: body.removeTags,
    scenario: searchParams.get("scenario") ?? body.scenario,
    status: body.status,
    tags: body.tags,
  };
  const result = await contactDetailService.updateContactDetail(input);

  return responseForResult(result, mode);
}
