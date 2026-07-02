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
  RelationshipProfileUpdateInput,
} from "../../../../../features/connections/profile-contract";

export const dynamic = "force-dynamic";

// relationship profile route 用于更新一条关系的画像字段。
// route 只解析 PATCH body；关系类型、互惠价值、下一步动作的校验在 profile service 中。
interface RelationshipProfileRouteContext {
  params: Promise<{
    id: string;
  }>;
}

type ProfileBody = {
  context?: string;
  mutualValue?: {
    contactReceives?: string;
    orbitUserReceives?: string;
    valueTypes?: string[];
  };
  nextAction?: {
    dueAt?: string;
    label?: string;
    rationale?: string;
  };
  relationshipType?: string;
  scenario?: string;
};

type ProfileBodyResult =
  | {
      success: true;
      body: ProfileBody;
    }
  | {
      success: false;
    };

// profile PATCH body 允许嵌套对象，但每个字段仍做显式类型过滤。
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.filter((item): item is string => typeof item === "string");
}

function requestHasBody(request: Request): boolean {
  // Next Request 的 body 可能为 null；content-length=0 也视为没有更新字段。
  return request.body !== null && request.headers.get("content-length") !== "0";
}

function readMutualValue(
  value: unknown,
): ProfileBody["mutualValue"] | undefined {
  // mutualValue 是结构化字段，非对象输入直接忽略，由 service 判断是否足够更新。
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    contactReceives: readString(value.contactReceives),
    orbitUserReceives: readString(value.orbitUserReceives),
    valueTypes: readStringArray(value.valueTypes),
  };
}

function readNextAction(value: unknown): ProfileBody["nextAction"] | undefined {
  // nextAction 保留 label/dueAt/rationale 三个白名单字段。
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    dueAt: readString(value.dueAt),
    label: readString(value.label),
    rationale: readString(value.rationale),
  };
}

async function readProfileBody(request: Request): Promise<ProfileBodyResult> {
  // 空 PATCH body 合法进入 service，便于统一返回“无可更新字段”的业务结果。
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
        context: readString(body.context),
        mutualValue: readMutualValue(body.mutualValue),
        nextAction: readNextAction(body.nextAction),
        relationshipType: readString(body.relationshipType),
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
  // profile/stage 更新共享关系画像错误映射。
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
  context: RelationshipProfileRouteContext,
): Promise<Response> {
  // connectionId 来自 path，scenario 可由 query 覆盖 body，便于复现 mock 分支。
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const searchParams = new URL(request.url).searchParams;
  const profileService = createRelationshipStageAndProfileService();
  const profileBody = await readProfileBody(request);

  if (!profileBody.success) {
    // JSON 解析失败交给 service 产出标准 invalid body response。
    const invalidResult = await profileService.invalidRelationshipProfileBody();

    return responseForResult(invalidResult, mode);
  }

  // route 不直接修改关系数据，只把白名单字段传给 service。
  const input: RelationshipProfileUpdateInput = {
    connectionId: id,
    context: profileBody.body.context,
    mutualValue: profileBody.body.mutualValue,
    nextAction: profileBody.body.nextAction,
    relationshipType: profileBody.body.relationshipType,
    scenario: searchParams.get("scenario") ?? profileBody.body.scenario,
  };

  const result = await profileService.updateProfile(input);

  return responseForResult(result, mode);
}
