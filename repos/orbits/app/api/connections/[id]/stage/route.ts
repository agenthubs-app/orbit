import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { createRelationshipStageAndProfileService } from "../../../../../features/connections/service-factory";
import type {
  RelationshipStageUpdateInput,
} from "../../../../../features/connections/profile-contract";
import {
  connectionPatchHasBody,
  isConnectionPatchRecord,
  readConnectionPatchString,
  relationshipProfileResponseForResult,
} from "../route-support";

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
async function readStageBody(request: Request): Promise<StageBodyResult> {
  // JSON 解析失败单独标记，避免把 malformed body 当成空更新。
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
        relationshipStage: readConnectionPatchString(body.relationshipStage),
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
    const invalidResult = await profileService.invalidRelationshipProfileBody();

    return relationshipProfileResponseForResult(invalidResult, mode);
  }

  // route 不在这里判断 stage 是否允许，只把输入交给业务服务。
  const input: RelationshipStageUpdateInput = {
    connectionId: id,
    relationshipStage: stageBody.body.relationshipStage,
    scenario: searchParams.get("scenario") ?? stageBody.body.scenario,
  };

  const result = await profileService.updateStage(input);

  return relationshipProfileResponseForResult(result, mode);
}
