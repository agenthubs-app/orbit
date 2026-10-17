import { after, NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../shared/errors/app-error";
import { createProfileService } from "../../../features/profile/service-factory";
import type {
  ManualProfileUpdateInput,
  ProfileScenario,
} from "../../../features/profile/contract";
import {
  profileFailureContext,
  profileFailureToAppError,
} from "../../../features/profile/service";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../_shared/authenticated-actor";
import type { AccountDesignVariant, createAccountDesignFixtureStore } from "../../../features/profile/design-fixtures/service";

// profile route 是当前用户资料的读写入口。
// route 只处理 scenario 和 JSON body；资料完整性、默认值和失败语义由 profile service 负责。
function getScenario(request: Request): ProfileScenario | undefined {
  const scenario = new URL(request.url).searchParams.get("scenario");

  // 只接受 profile contract 支持的三种场景，避免任意 query 影响服务分支。
  if (scenario === "empty" || scenario === "pending" || scenario === "complete") {
    return scenario;
  }

  return undefined;
}

function accountDesignVariant(request: Request): AccountDesignVariant | null {
  const value = new URL(request.url).searchParams.get("design");
  return value === "25" || value === "50" || value === "100" ? value : null;
}

async function readProfileUpdateInput(
  request: Request,
): Promise<ManualProfileUpdateInput> {
  // PUT 允许空 body 或非法 JSON 回落为空对象，由 service 返回明确校验结果。
  try {
    const body = (await request.json()) as ManualProfileUpdateInput;

    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

export interface ProfileRouteDependencies {
  resolveActor?: ResolveAuthenticatedApiActor;
  /**
   * W0057（W57-2）：关系目标从空变为非空保存成功后——解封本人 `blocked_no_goal` 洞察行并在响应之外即时生成。
   * 只在「之前为空、这次非空」时调用；失败只记日志，不影响保存结果。
   */
  onRelationshipGoalSet?: (actorId: string) => Promise<void>;
  /** 测试注入：资料服务（缺省 `createProfileService()`）。 */
  profileService?: () => ReturnType<typeof createProfileService>;
  /** Focused tests may inject an isolated development fixture store. */
  designFixtureStore?: ReturnType<typeof createAccountDesignFixtureStore>;
  designFixturesEnabled?: boolean;
}

async function liveOnRelationshipGoalSet(actorId: string): Promise<void> {
  const mark = await import("../../../features/contacts/insights/mark");
  const unblocked = await mark.unblockNoGoalContactInsightsBestEffort({ actorId });
  if (!unblocked.length) return;
  mark.scheduleInstantInsightGeneration(
    (task) => after(task),
    async (input) => (await import("../../../features/contacts/insights/instant")).runConfiguredInstantInsightGeneration(input),
    { actorId, contactIds: unblocked },
  );
}

export function createProfileRouteHandlers(
  dependencies: ProfileRouteDependencies = {},
) {
  const resolveActor =
    dependencies.resolveActor ?? resolveAuthenticatedApiActor;
  const designFixturesEnabled = dependencies.designFixturesEnabled ?? process.env.NODE_ENV !== "production";

  async function designStore() {
    if (dependencies.designFixtureStore) return dependencies.designFixtureStore;
    // The fixture module is never imported at runtime by the production route.
    const fixtures = await import("../../../features/profile/design-fixtures/service");
    return fixtures.accountDesignFixtureStore;
  }

  return {
    async GET(request: Request): Promise<Response> {
      const mode = resolveFeatureMode();
      const actor = await resolveActor();
      if (!actor) return authenticatedApiActorRequiredResponse(mode);

      const design = designFixturesEnabled ? accountDesignVariant(request) : null;
      if (design) {
        const result = (await designStore()).read(actor.id, design);
        return NextResponse.json(success(result.data), {
          headers: { ...runtimeBoundaryHeaders(mode), "Cache-Control": "no-store" },
          status: 200,
        });
      }

      const profileService = createProfileService();
      const result = await profileService.getProfile({
        actorId: actor.id,
        scenario: getScenario(request),
      });

      if (result.success === false) {
        const appError = profileFailureToAppError(result);

        return NextResponse.json(
          failure(appError, profileFailureContext(result, mode)),
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
    },
    async PUT(request: Request): Promise<Response> {
      const mode = resolveFeatureMode();
      const actor = await resolveActor();
      if (!actor) return authenticatedApiActorRequiredResponse(mode);

      const design = designFixturesEnabled ? accountDesignVariant(request) : null;
      if (design) {
        const input = await readProfileUpdateInput(request);
        const result = (await designStore()).update(actor.id, design, input);
        if (result.success === false) {
          const appError = profileFailureToAppError(result);
          return NextResponse.json(failure(appError, profileFailureContext(result, mode)), {
            headers: { ...runtimeBoundaryHeaders(mode), "Cache-Control": "no-store" },
            status: getHttpStatusForAppErrorCode(appError.code),
          });
        }
        return NextResponse.json(success(result.data), {
          headers: { ...runtimeBoundaryHeaders(mode), "Cache-Control": "no-store" },
          status: 200,
        });
      }

      const profileService = (dependencies.profileService ?? createProfileService)();
      const input = await readProfileUpdateInput(request);
      // W0057（W57-2）：只有提交了非空目标时才多读一次旧目标，判断是否「空 → 非空」。
      const settingGoal = typeof input.relationshipGoal === "string" && input.relationshipGoal.trim().length > 0;
      const previousGoal = settingGoal
        ? await (async () => profileService.getProfile({ actorId: actor.id }))().then(
            (current) => (current.success === false ? null : current.data.profile?.relationshipGoal ?? ""),
            () => null,
          )
        : null;
      const result = await profileService.updateProfile(input, { actorId: actor.id });

      if (result.success === false) {
        const appError = profileFailureToAppError(result);

        return NextResponse.json(
          failure(appError, profileFailureContext(result, mode)),
          {
            headers: runtimeBoundaryHeaders(mode),
            status: getHttpStatusForAppErrorCode(appError.code),
          },
        );
      }

      if (settingGoal && previousGoal !== null && !previousGoal.trim()) {
        await (dependencies.onRelationshipGoalSet ?? liveOnRelationshipGoalSet)(actor.id).catch((error: unknown) => {
          console.error(JSON.stringify({ error: error instanceof Error ? error.name : "unknown", event: "contact_insight_goal_set_failed" }));
        });
      }

      return NextResponse.json(success(result.data), {
        headers: runtimeBoundaryHeaders(mode),
        status: 200,
      });
    },
  };
}
