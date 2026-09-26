import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { createRelationshipStageAndProfileService } from "../../../../../features/connections/service-factory";
import type {
  RelationshipProfileUpdateInput,
} from "../../../../../features/connections/profile-contract";
import {
  connectionPatchHasBody,
  isConnectionPatchRecord,
  readConnectionPatchString,
  relationshipProfileResponseForResult,
} from "../route-support";

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
function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.filter((item): item is string => typeof item === "string");
}

function readMutualValue(
  value: unknown,
): ProfileBody["mutualValue"] | undefined {
  // mutualValue 是结构化字段，非对象输入直接忽略，由 service 判断是否足够更新。
  if (!isConnectionPatchRecord(value)) {
    return undefined;
  }

  return {
    contactReceives: readConnectionPatchString(value.contactReceives),
    orbitUserReceives: readConnectionPatchString(value.orbitUserReceives),
    valueTypes: readStringArray(value.valueTypes),
  };
}

function readNextAction(value: unknown): ProfileBody["nextAction"] | undefined {
  // nextAction 保留 label/dueAt/rationale 三个白名单字段。
  if (!isConnectionPatchRecord(value)) {
    return undefined;
  }

  return {
    dueAt: readConnectionPatchString(value.dueAt),
    label: readConnectionPatchString(value.label),
    rationale: readConnectionPatchString(value.rationale),
  };
}

async function readProfileBody(request: Request): Promise<ProfileBodyResult> {
  // 空 PATCH body 合法进入 service，便于统一返回“无可更新字段”的业务结果。
  if (!connectionPatchHasBody(request)) {
    return {
      success: true,
      body: {},
    };
  }

  try {
    const body: unknown = await request.json();

    if (!isConnectionPatchRecord(body)) {
      return {
        success: true,
        body: {},
      };
    }

    return {
      success: true,
      body: {
        context: readConnectionPatchString(body.context),
        mutualValue: readMutualValue(body.mutualValue),
        nextAction: readNextAction(body.nextAction),
        relationshipType: readConnectionPatchString(body.relationshipType),
        scenario: readConnectionPatchString(body.scenario),
      },
    };
  } catch {
    return {
      success: false,
    };
  }
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

    return relationshipProfileResponseForResult(invalidResult, mode);
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

  return relationshipProfileResponseForResult(result, mode);
}
