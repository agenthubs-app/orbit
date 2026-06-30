import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import { createConnectionEvidenceService } from "../../../../../features/connections/service-factory";
import {
  connectionEvidenceFailureContext,
  connectionEvidenceFailureToAppError,
} from "../../../../../features/connections/service";
import type {
  ConnectionAddEvidenceInput,
  ConnectionEvidenceAddResult,
} from "../../../../../features/connections/contract";

export const dynamic = "force-dynamic";

// add evidence route 用于给一条关系追加证据。
// route 负责把 JSON body 收敛成 ConnectionAddEvidenceInput；
// evidence 的有效性、去重和 provenance 由 connection service 负责。
interface ConnectionEvidenceRouteContext {
  params: Promise<{
    id: string;
  }>;
}

type AddEvidenceBody = {
  contribution?: string;
  evidenceId?: string;
  excerpt?: string;
  occurredAt?: string;
  scenario?: string;
  sourceLabel?: string;
  sourceType?: string;
  title?: string;
};

type AddEvidenceBodyResult =
  | {
      success: true;
      body: AddEvidenceBody;
    }
  | {
      success: false;
    };

// body 中只允许一组明确字段通过，避免任意 JSON 字段进入关系证据模型。
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

async function readAddEvidenceBody(
  request: Request,
): Promise<AddEvidenceBodyResult> {
  // JSON 解析失败和非对象 body 分开处理：前者是无效请求，后者交给 service 做缺字段判断。
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
        contribution: readString(body.contribution),
        evidenceId: readString(body.evidenceId),
        excerpt: readString(body.excerpt),
        occurredAt: readString(body.occurredAt),
        scenario: readString(body.scenario),
        sourceLabel: readString(body.sourceLabel),
        sourceType: readString(body.sourceType),
        title: readString(body.title),
      },
    };
  } catch {
    return {
      success: false,
    };
  }
}

function responseForResult(
  result: ConnectionEvidenceAddResult,
  mode: ReturnType<typeof resolveFeatureMode>,
): Response {
  // 添加证据失败统一转成 connection AppError，避免 route 泄露内部失败枚举。
  if (result.success === false) {
    const appError = connectionEvidenceFailureToAppError(result);

    return NextResponse.json(
      failure(appError, connectionEvidenceFailureContext(result, mode)),
      {
        headers: runtimeBoundaryHeaders(mode),
        status: getHttpStatusForAppErrorCode(appError.code),
      },
    );
  }

  // 成功添加证据是资源创建语义，因此返回 201。
  return NextResponse.json(success(result.data), {
    headers: runtimeBoundaryHeaders(mode),
    status: 201,
  });
}

export async function POST(
  request: Request,
  context: ConnectionEvidenceRouteContext,
): Promise<Response> {
  // connectionId 来自 path，scenario 可由 query 覆盖 body，方便 mock 调试。
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const searchParams = new URL(request.url).searchParams;
  const connectionService = createConnectionEvidenceService();
  const addEvidenceBody = await readAddEvidenceBody(request);

  if (!addEvidenceBody.success) {
    // JSON 解析失败走 service 的 invalid body 分支，保持错误格式一致。
    return responseForResult(connectionService.invalidAddEvidenceBody(), mode);
  }

  const { body } = addEvidenceBody;
  // route 只组装 input，不在这里解释 sourceType 或 contribution 的业务含义。
  const input: ConnectionAddEvidenceInput = {
    connectionId: id,
    contribution: body.contribution,
    evidenceId: body.evidenceId,
    excerpt: body.excerpt,
    occurredAt: body.occurredAt,
    scenario: searchParams.get("scenario") ?? body.scenario,
    sourceLabel: body.sourceLabel,
    sourceType: body.sourceType,
    title: body.title,
  };
  const result = connectionService.addEvidence(input);

  return responseForResult(result, mode);
}
