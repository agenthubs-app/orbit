import { after, NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { AppError, getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import {
  contactDetailTagStatusFailureContext,
  contactDetailTagStatusFailureToAppError,
  type ContactDetailLastInteractionInput,
  type ContactDetailNoteInput,
  type ContactDetailTagStatusResult,
  type ContactDetailUpdateInput,
} from "../../../../features/contacts/detail-contract";
import { createContactDetailTagStatusService } from "../../../../features/contacts/service-factory";
import { parseStrictTokyoInstant } from "../../../../shared/compute/tokyo-calendar-days";
import type { MemoExtractionJobInput } from "../../../../features/contacts/memo-extraction/job";
import { runConfiguredMemoExtraction } from "../../../../features/contacts/memo-extraction/store";
import { isDemoContactRouteId } from "../../../../shared/domain/guide-demo-contact";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../../_shared/authenticated-actor";

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
  primaryIndustryId?: string | null;
  secondaryIndustryId?: string | null;
  /** W0045：职级（六档）／规范地区；null 清空。具体校验在 contact detail service。 */
  seniorityLevel?: string | null;
  region?: { countryCode: string; city?: string | null } | null;
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

const MEMO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const MEMO_EVENT_ID_MAX = 256;

function readNote(value: unknown): ContactDetailNoteInput | string | undefined | "invalid" {
  // note 既可传纯文本，也可传带 authorLabel 的结构化对象（App 与旧编辑器的写法，照常可用）。
  if (typeof value === "string") {
    return value;
  }

  if (!isRecord(value) || typeof value.body !== "string") {
    return undefined;
  }

  const base = {
    body: value.body,
    authorLabel:
      typeof value.authorLabel === "string" ? value.authorLabel : undefined,
  };
  if (value.kind === undefined || value.kind === null) return base;
  // W0046「写 memo」：kind = "memo"，日期必填（东京日期 YYYY-MM-DD），关联活动可选；形状不对整条 PATCH 拒绝。
  if (value.kind !== "memo") return "invalid";
  if (typeof value.occurredAt !== "string" || !MEMO_DAY.test(value.occurredAt) || parseStrictTokyoInstant(value.occurredAt) === null) return "invalid";
  if (value.eventId !== undefined && value.eventId !== null && (typeof value.eventId !== "string" || value.eventId.length > MEMO_EVENT_ID_MAX)) return "invalid";
  return {
    ...base,
    kind: "memo",
    occurredAt: value.occurredAt,
    ...(typeof value.eventId === "string" && value.eventId.trim() ? { eventId: value.eventId.trim() } : {}),
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

// W0045：region 只接受 { countryCode: string, city?: string | null } 或 null；其他形状整条 PATCH 拒绝。
function readRegion(value: unknown): PatchBody["region"] | "invalid" {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!isRecord(value) || typeof value.countryCode !== "string") return "invalid";
  if (value.city !== undefined && value.city !== null && typeof value.city !== "string") return "invalid";
  return { countryCode: value.countryCode, city: typeof value.city === "string" ? value.city : null };
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

    if (["primaryIndustryId", "secondaryIndustryId", "seniorityLevel"].some((field) =>
      body[field] !== undefined && body[field] !== null && typeof body[field] !== "string",
    )) {
      return { success: false };
    }
    const region = readRegion(body.region);
    if (region === "invalid") {
      return { success: false };
    }
    const note = readNote(body.note);
    if (note === "invalid") {
      return { success: false };
    }

    return {
      success: true,
      body: {
        addTags: readStringList(body.addTags ?? body.addTag),
        lastInteraction: readLastInteraction(body.lastInteraction),
        note,
        primaryIndustryId:
          body.primaryIndustryId === null
            ? null
            : typeof body.primaryIndustryId === "string"
              ? body.primaryIndustryId
              : undefined,
        secondaryIndustryId:
          body.secondaryIndustryId === null
            ? null
            : typeof body.secondaryIndustryId === "string"
              ? body.secondaryIndustryId
              : undefined,
        seniorityLevel:
          body.seniorityLevel === null
            ? null
            : typeof body.seniorityLevel === "string"
              ? body.seniorityLevel
              : undefined,
        region,
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

/**
 * 引导期示例联系人（`demo:` 前缀，W0005）只存在于前端、不对应任何存储记录：
 * 写接口在读 body、建 service 之前直接拒绝。
 */
function demoContactWriteRejectedResponse(mode: ReturnType<typeof resolveFeatureMode>): Response {
  return NextResponse.json(
    failure(new AppError("NOT_FOUND", "Demo contacts are examples and cannot be changed."), {
      boundary: "runtime",
      mode,
      privacy: "guide-demo-contact",
      provenance: "The request was rejected before the contact detail service or any storage provider ran.",
      service: "contact-detail",
    }),
    { headers: runtimeBoundaryHeaders(mode), status: 404 },
  );
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

export function createContactDetailGetHandler(
  resolveActor: ResolveAuthenticatedApiActor = resolveAuthenticatedApiActor,
) {
  return async function GET(
    request: Request,
    context: ContactDetailRouteContext,
  ): Promise<Response> {
    const mode = resolveFeatureMode();
    const actor = await resolveActor();
    if (!actor) return authenticatedApiActorRequiredResponse(mode);

    const { id } = await context.params;
    const scenario = new URL(request.url).searchParams.get("scenario");
    const contactDetailService = createContactDetailTagStatusService();
    const result = await contactDetailService.getContactDetail({
      actorId: actor.id,
      contactId: id,
      scenario,
    });

    return responseForResult(result, mode);
  };
}

/**
 * W0046：memo 保存成功后在响应之外排一次提取作业（next/server `after`）。保存请求本身只写
 * contact_detail_states；作业经「始终拒绝」闸门只落一条 disabled 记录，provider 0 次调用。
 */
export function scheduleMemoExtractionAfterResponse(job: MemoExtractionJobInput): void {
  try {
    after(() => runConfiguredMemoExtraction(job).then(() => undefined));
  } catch {
    // 不在请求作用域（脚本、测试直接调用）：不排作业。
  }
}

function savedMemoJob(input: ContactDetailUpdateInput, result: ContactDetailTagStatusResult, actorId: string): MemoExtractionJobInput | null {
  const note = input.note;
  if (!result.success || typeof note !== "object" || note === null || note.kind !== "memo") return null;
  const contact = result.data.contact;
  const saved = contact?.notes.find((item) => item.noteWriteExecuted && item.body === note.body.trim());
  if (!contact || !saved) return null;
  return {
    actorId,
    contactId: contact.id,
    noteId: saved.noteId,
    body: saved.body,
    contact: { organization: contact.organization, role: contact.role },
  };
}

export function createContactDetailPatchHandler(
  resolveActor: ResolveAuthenticatedApiActor = resolveAuthenticatedApiActor,
  dependencies: { onMemoSaved?: (job: MemoExtractionJobInput) => void } = {},
) {
  return async function PATCH(
    request: Request,
    context: ContactDetailRouteContext,
  ): Promise<Response> {
    const mode = resolveFeatureMode();
    const actor = await resolveActor();
    if (!actor) return authenticatedApiActorRequiredResponse(mode);

    const { id } = await context.params;
    if (isDemoContactRouteId(id)) return demoContactWriteRejectedResponse(mode);
    const searchParams = new URL(request.url).searchParams;
    const patchBody = await readPatchBody(request);
    const contactDetailService = createContactDetailTagStatusService();

    if (!patchBody.success) {
      const invalidResult = await contactDetailService.invalidPatchBody();

      return responseForResult(invalidResult, mode);
    }

    const { body } = patchBody;
    const input: ContactDetailUpdateInput = {
      actorId: actor.id,
      addTags: body.addTags,
      contactId: id,
      lastInteraction: body.lastInteraction,
      note: body.note,
      primaryIndustryId: body.primaryIndustryId,
      secondaryIndustryId: body.secondaryIndustryId,
      seniorityLevel: body.seniorityLevel,
      region: body.region,
      removeTags: body.removeTags,
      scenario: searchParams.get("scenario") ?? body.scenario,
      status: body.status,
      tags: body.tags,
    };
    const result = await contactDetailService.updateContactDetail(input);
    const memoJob = savedMemoJob(input, result, actor.id);
    if (memoJob) (dependencies.onMemoSaved ?? scheduleMemoExtractionAfterResponse)(memoJob);

    return responseForResult(result, mode);
  };
}
