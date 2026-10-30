import { NextResponse } from "next/server";

import { unavailableSnapshotView } from "../../../../features/network-analysis/service";
import { getConfiguredNetworkAnalysisRuntime, readSnapshotProfile, type NetworkAnalysisRuntime } from "../../../../features/network-analysis/runtime";
import { markContactInsightsGoalDirty } from "../../../../features/contacts/insights/repository";
import type { SnapshotLanguage } from "../../../../features/network-analysis/contract";
import { failure, runtimeBoundaryHeaders, success } from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { redesignContractMode } from "../../../../features/redesign-contracts/route";
import { AppError, getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type AuthenticatedApiActor,
} from "../../_shared/authenticated-actor";

/**
 * W0048a：人脉分析快照的两个接口。
 *
 * - `GET /api/network/snapshot?lang=zh|en|ja` → `NetworkSnapshotView`（只带请求语言的块与依据、freshness、quota）。
 *   判定为自动重算时只 upsert 一行 job（不预留），并在响应之外尝试领取；维护任务兜底。
 * - `POST /api/network/snapshot/recompute`：手动重新分析，用户主动池 1 次操作，请求内同步生成；
 *   第 4 次 429 `MANUAL_REFRESH_LIMIT`、用户池总熔断用满 429 `USER_DAILY_LIMIT`（两者 0 次调用）；
 *   已确认联系人不足 3 位 409 `INSUFFICIENT_CONTACTS`（不预留）。
 */
export interface NetworkSnapshotRouteDependencies {
  resolveActor?: () => Promise<AuthenticatedApiActor | null>;
  runtime?: () => NetworkAnalysisRuntime | null;
  after?: (task: () => Promise<void>) => void;
  /** W0051（W51-1）：手动重新分析成功后把目标哈希不同的洞察统一标待更新（0 次 AI）；失败只记日志。 */
  markInsightsGoalDirty?: (runtime: NetworkAnalysisRuntime, actorId: string) => Promise<void>;
}

async function defaultMarkInsightsGoalDirty(runtime: NetworkAnalysisRuntime, actorId: string): Promise<void> {
  const goal = (await readSnapshotProfile(actorId)).goal;
  await markContactInsightsGoalDirty(runtime.client, { actorId, goal, workspaceId: runtime.workspaceId });
}

/** R11b（§2 B-7）：`lang=ja` 读日文叙述（旧快照没有时块为空，不回退）；`en`；其余 zh（旧行为）。 */
function language(request: Request): SnapshotLanguage {
  const lang = new URL(request.url).searchParams.get("lang");
  return lang === "en" ? "en" : lang === "ja" ? "ja" : "zh";
}

function isUndefinedTable(error: unknown): boolean {
  return (error as { code?: unknown })?.code === "42P01";
}

export function createNetworkSnapshotRouteHandlers(dependencies: NetworkSnapshotRouteDependencies = {}) {
  const resolveActor = dependencies.resolveActor ?? resolveAuthenticatedApiActor;
  const resolveRuntime = dependencies.runtime ?? (() => getConfiguredNetworkAnalysisRuntime());
  /** 排队后在响应之外尝试领取（next/server after）；不在请求作用域时交给维护任务。 */
  const schedule = (runtime: NetworkAnalysisRuntime, actorId: string) => {
    if (!dependencies.after) return;
    try {
      dependencies.after(async () => {
        try {
          await runtime.service.runWorker(actorId);
        } catch (error) {
          console.error(JSON.stringify({ actorId, error: error instanceof Error ? error.name : "unknown", event: "network_snapshot_after_failed" }));
        }
      });
    } catch {
      // 不在请求作用域：交给维护任务。
    }
  };

  return {
    async GET(request: Request): Promise<Response> {
      const mode = resolveFeatureMode();
      const headers = runtimeBoundaryHeaders(mode);
      const actor = await resolveActor();
      if (!actor?.id) return authenticatedApiActorRequiredResponse(mode);
      // R11b：人脈分析 mock（本机 ORBIT_REDESIGN_MOCK=network-analysis，非生产）读 fixture 世界的快照，不读库、不排队、不调 AI。
      if (!dependencies.runtime && redesignContractMode("network-analysis") === "mock") {
        const { fixtureNetworkSnapshotView } = await import("../../../../features/network-analysis/analysis-fixtures");
        return NextResponse.json(success(fixtureNetworkSnapshotView(actor.id, language(request))), { headers, status: 200 });
      }
      const runtime = resolveRuntime();
      if (!runtime) return NextResponse.json(success(unavailableSnapshotView()), { headers, status: 200 });
      try {
        const view = await runtime.service.readView(actor.id, language(request));
        if (view.freshness.job === "queued") schedule(runtime, actor.id);
        return NextResponse.json(success(view), { headers, status: 200 });
      } catch (error) {
        if (isUndefinedTable(error)) return NextResponse.json(success(unavailableSnapshotView()), { headers, status: 200 });
        const appError = new AppError("SERVICE_UNAVAILABLE", "The network analysis is temporarily unavailable.", { cause: error });
        return NextResponse.json(failure(appError), { headers, status: getHttpStatusForAppErrorCode(appError.code) });
      }
    },

    async recompute(request: Request): Promise<Response> {
      const mode = resolveFeatureMode();
      const headers = runtimeBoundaryHeaders(mode);
      const fail = (appError: AppError, status: number, context?: Record<string, string>) =>
        NextResponse.json(failure(appError, context), { headers, status });
      const actor = await resolveActor();
      if (!actor?.id) return authenticatedApiActorRequiredResponse(mode);
      const body = await request.json().catch(() => ({}));
      const key = body && typeof body === "object" && typeof (body as { idempotencyKey?: unknown }).idempotencyKey === "string"
        ? (body as { idempotencyKey: string }).idempotencyKey.trim()
        : "";
      if (key && !/^[A-Za-z0-9:_-]{1,100}$/.test(key)) return fail(new AppError("VALIDATION_ERROR", "idempotencyKey is invalid."), 400);
      const runtime = resolveRuntime();
      const unavailable = () => fail(new AppError("SERVICE_UNAVAILABLE", "The network analysis is temporarily unavailable."), 503, { reason: "UNAVAILABLE" });
      if (!runtime) return unavailable();
      try {
        const outcome = await runtime.service.recomputeManually(actor.id, key ? { idempotencyKey: `snapshot:manual:${actor.id}:${key}` } : {});
        switch (outcome.status) {
          case "insufficient":
            return fail(new AppError("CONFLICT", "Add at least 3 contacts before analysing your network."), 409, { reason: "INSUFFICIENT_CONTACTS" });
          case "limited":
            return fail(
              new AppError("CONFLICT", "You have used today's analyses. Try again tomorrow."),
              429,
              { reason: outcome.limit === "manual" ? "MANUAL_REFRESH_LIMIT" : "USER_DAILY_LIMIT", ...(outcome.retryOn ? { retryOn: outcome.retryOn } : {}) },
            );
          case "in_progress":
            return fail(new AppError("CONFLICT", "This analysis is still being generated. Try again in a moment."), 409, { reason: "IN_PROGRESS" });
          case "unavailable":
            return unavailable();
          case "failed":
            return fail(new AppError("SERVICE_UNAVAILABLE", "The analysis could not be generated. Try again later."), 503, { reason: "SNAPSHOT_GENERATION_FAILED" });
          case "succeeded":
            await (dependencies.markInsightsGoalDirty ?? defaultMarkInsightsGoalDirty)(runtime, actor.id).catch((error: unknown) => {
              console.error(JSON.stringify({ actorId: actor.id, error: error instanceof Error ? error.name : "unknown", event: "contact_insight_goal_mark_failed" }));
            });
            return NextResponse.json(success(await runtime.service.readView(actor.id, language(request))), { headers, status: 200 });
        }
      } catch (error) {
        if (isUndefinedTable(error)) return unavailable();
        throw error;
      }
    },
  };
}
