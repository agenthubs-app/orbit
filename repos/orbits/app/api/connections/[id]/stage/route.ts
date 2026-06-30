import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import {
  createRelationshipStageAndProfileService,
  relationshipProfileFailureContext,
  relationshipProfileFailureToAppError,
} from "../../../../../features/connections/service-factory";
import type {
  RelationshipProfileResult,
  RelationshipStageUpdateInput,
} from "../../../../../features/connections/profile-contract";

export const dynamic = "force-dynamic";

// relationship stage route 只更新关系阶段这一类轻量状态。
// route 解析 PATCH body，阶段合法性和状态转移规则由 profile service 负责。
interface RelationshipStageRouteContext {
  params: Promise<{
    id: string;
  }>;
}

type StageBody = {
  relationshipStage?: string;
  scenario?: string;
};

type StageBodyResult =
  | {
      success: true;
      body: StageBody;
    }
  | {
      success: false;
    };

// stage 更新只允许 relationshipStage 和 scenario 两个输入字段。
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function requestHasBody(request: Request): boolean {
  // body 为空时仍进入 service，让业务层返回统一的缺字段或 pending 状态。
  return request.body !== null && request.headers.get("content-length") !== "0";
}

async function readStageBody(request: Request): Promise<StageBodyResult> {
  // JSON 解析失败单独标记，避免把 malformed body 当成空更新。
  if (!requestHasBody(request)) {
    return {
      success: true,
      body: {},
    };
  }

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
        relationshipStage: readString(body.relationshipStage),
        scenario: readString(body.scenario),
      },
    };
  } catch {
    return {
      success: false,
    };
  }
}

function responseForResult(
  result: RelationshipProfileResult,
  mode: ReturnType<typeof resolveFeatureMode>,
): Response {
  // stage/profile 共享关系画像失败上下文。
  if (result.success === false) {
    const appError = relationshipProfileFailureToAppError(result);

    return NextResponse.json(
      failure(appError, relationshipProfileFailureContext(result, mode)),
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

export async function PATCH(
  request: Request,
  context: RelationshipStageRouteContext,
): Promise<Response> {
  // connectionId 来自 path，scenario 可由 query 覆盖 body。
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const searchParams = new URL(request.url).searchParams;
  const profileService = createRelationshipStageAndProfileService();
  const stageBody = await readStageBody(request);

  if (!stageBody.success) {
    // malformed JSON 交给 service 的 invalid body 分支，保持 envelope 一致。
    return responseForResult(
      profileService.invalidRelationshipProfileBody(),
      mode,
    );
  }

  // route 不在这里判断 stage 是否允许，只把输入交给业务服务。
  const input: RelationshipStageUpdateInput = {
    connectionId: id,
    relationshipStage: stageBody.body.relationshipStage,
    scenario: searchParams.get("scenario") ?? stageBody.body.scenario,
  };

  return responseForResult(profileService.updateStage(input), mode);
}
