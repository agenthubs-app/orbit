import { conditionalJsonRead, defaultConditionalReadDependencies, type ConditionalReadDependencies } from "../_shared/conditional-read";
import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../shared/errors/app-error";
import { createConnectionEvidenceService } from "../../../features/connections/service-factory";
import {
  connectionEvidenceFailureContext,
  connectionEvidenceFailureToAppError,
} from "../../../features/connections/service";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../_shared/authenticated-actor";

// Relationship evidence joins connections with contacts and their tasks across the workspace.
const CONNECTIONS_LIST_COLLECTIONS = ["connections", "contacts", "tasks"] as const;

// connections list route 返回关系证据链列表。
// route 只读取 scenario 并调用 connection evidence service；
// 证据聚合、排序和来源说明都在 service 层维护。
export function createConnectionsGetHandler(
  resolveActor: ResolveAuthenticatedApiActor = resolveAuthenticatedApiActor,
  conditionalRead?: ConditionalReadDependencies,
) {
  return async function GET(request: Request): Promise<Response> {
    // runtime boundary header 标明当前服务模式，便于页面和测试识别 mock/live/hybrid。
    const mode = resolveFeatureMode();
    const actor = mode === "mock" ? null : await resolveActor();

    if (mode !== "mock" && !actor) {
      return authenticatedApiActorRequiredResponse(mode);
    }

    const scenario = new URL(request.url).searchParams.get("scenario");
    const produce = async () => {
      const connectionService = createConnectionEvidenceService();
      const result = await connectionService.listConnections({
        actorId: actor?.id,
        scenario,
      });

      if (result.success === false) {
        // connection failure 统一映射为 AppError/envelope。
        const appError = connectionEvidenceFailureToAppError(result);

        return NextResponse.json(
          failure(appError, connectionEvidenceFailureContext(result, mode)),
          {
            headers: runtimeBoundaryHeaders(mode),
            status: getHttpStatusForAppErrorCode(appError.code),
          },
        );
      }

      // 列表 payload 不在 route 里二次加工，保持 API contract 和 service contract 一致。
      return NextResponse.json(success(result.data), {
        headers: runtimeBoundaryHeaders(mode),
        status: 200,
      });
    };
    if (!actor) return produce();
    return conditionalJsonRead(
      { routeKey: "connections.list", request, actorId: actor.id, workspaceId: actor.workspaceId, collections: [...CONNECTIONS_LIST_COLLECTIONS] },
      conditionalRead ?? defaultConditionalReadDependencies(),
      produce,
    );
  };
}
