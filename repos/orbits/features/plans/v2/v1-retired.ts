/**
 * R25（DESIGN §12、SC-R25-09）：v1 计划的创建入口关闭。
 * `POST /api/agent/plans`、`POST /api/agent/plans/bootstrap`、`POST /api/agent/plans/reanalyze` 一律 409 `PLAN_V1_RETIRED`，
 * 响应带 v2 目標入力的地址；不论有没有 v2 计划，都不再生成 v1。已有的 v1 计划只读（`GET /api/agent/plans/legacy`）。
 */
import { NextResponse } from "next/server";

import { failure, runtimeBoundaryHeaders } from "../../../shared/api/envelope";
import { planNewGoalHref } from "../../../shared/compute/plan-href";
import { resolveFeatureMode, type FeatureMode } from "../../../shared/config/feature-mode";
import { AppError } from "../../../shared/errors/app-error";
import { authenticatedApiActorRequiredResponse, resolveAuthenticatedApiActor, type ResolveAuthenticatedApiActor } from "../../../app/api/_shared/authenticated-actor";

export interface PlanV1RetiredDependencies {
  resolveActor?: ResolveAuthenticatedApiActor;
  resolveMode?: () => FeatureMode;
}

export function createPlanV1RetiredHandler(dependencies: PlanV1RetiredDependencies = {}) {
  return async function POST(request: Request): Promise<Response> {
    const mode = (dependencies.resolveMode ?? resolveFeatureMode)();
    const headers = runtimeBoundaryHeaders(mode);
    const actor = await (dependencies.resolveActor ?? resolveAuthenticatedApiActor)();
    if (!actor?.id) return authenticatedApiActorRequiredResponse(mode);
    const platform = (new URL(request.url).searchParams.get("platform") ?? request.headers.get("x-orbit-platform") ?? "web").toLowerCase() === "app" ? "app" : "web";
    return NextResponse.json(
      failure(new AppError("CONFLICT", "Old-style plans can no longer be created. Start a new goal instead."), { href: planNewGoalHref(platform), reason: "PLAN_V1_RETIRED" }),
      { headers, status: 409 },
    );
  };
}

export const planV1RetiredPost = createPlanV1RetiredHandler();
