import { after, NextResponse } from "next/server";

import { readDemoModeViewForActor } from "../../../../../(app)/app/_demo/demo-guide-view";
import { requestContactInsightRegeneration, type InsightRegenerationDeps } from "../../../../../../features/contacts/insights/regenerate";
import { getConfiguredContactInsightsRuntime } from "../../../../../../features/contacts/insights/runtime";
import { failure, runtimeBoundaryHeaders, success } from "../../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../../shared/config/feature-mode";
import { AppError } from "../../../../../../shared/errors/app-error";
import { authenticatedApiActorRequiredResponse, resolveAuthenticatedApiActor, type AuthenticatedApiActor } from "../../../../_shared/authenticated-actor";

/**
 * W0051：`POST /api/contacts/:id/insight/regenerate`（详情弹窗「重新生成」，W51-2）。
 *
 * 202 `{ state: "pending" }`：已排队（或已有执行器在跑，`inProgress: true`，0 次调用）；
 * 200 `{ state: "ready", unchanged: true }`：数据没变，不调用；
 * 429 `USER_DAILY_LIMIT`：用户主动池当日 10 次操作用满（0 次调用）；409 `NO_GOAL`／`RETRY_EXHAUSTED`；
 * 404：不是本人的联系人；403 `DEMO_MODE`；503：服务不可用。
 */
export interface ContactInsightRegenerateDependencies {
  resolveActor?: () => Promise<AuthenticatedApiActor | null>;
  isDemo?: (actor: AuthenticatedApiActor) => Promise<boolean>;
  deps?: () => Omit<InsightRegenerationDeps, "schedule"> | null;
  schedule?: (task: () => Promise<void>) => void;
}

async function defaultIsDemo(actor: AuthenticatedApiActor): Promise<boolean> {
  return (await readDemoModeViewForActor({ actorId: actor.id, userId: actor.userId ?? null })) !== null;
}

function isUndefinedTable(error: unknown): boolean {
  return (error as { code?: unknown })?.code === "42P01";
}

export function createContactInsightRegenerateHandler(dependencies: ContactInsightRegenerateDependencies = {}) {
  const resolveActor = dependencies.resolveActor ?? resolveAuthenticatedApiActor;
  const isDemo = dependencies.isDemo ?? defaultIsDemo;
  const resolveDeps = dependencies.deps ?? (() => getConfiguredContactInsightsRuntime());
  const schedule = dependencies.schedule ?? ((task: () => Promise<void>) => after(task));
  return async function POST(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
    const mode = resolveFeatureMode();
    const headers = runtimeBoundaryHeaders(mode);
    const fail = (appError: AppError, status: number, reason?: string, extra: Record<string, string> = {}) =>
      NextResponse.json(failure(appError, reason ? { reason, ...extra } : undefined), { headers, status });
    const actor = await resolveActor();
    if (!actor?.id) return authenticatedApiActorRequiredResponse(mode);
    const { id } = await context.params;
    const contactId = typeof id === "string" ? decodeURIComponent(id).trim() : "";
    if (!contactId || contactId.length > 512) return fail(new AppError("VALIDATION_ERROR", "Contact id is invalid."), 400);
    if (await isDemo(actor)) return fail(new AppError("FORBIDDEN", "The example contacts cannot be regenerated."), 403, "DEMO_MODE");
    const deps = resolveDeps();
    const unavailable = () => fail(new AppError("SERVICE_UNAVAILABLE", "Insights are temporarily unavailable."), 503, "UNAVAILABLE");
    if (!deps) return unavailable();
    try {
      const outcome = await requestContactInsightRegeneration({ ...deps, schedule }, { actorId: actor.id, contactId });
      switch (outcome.status) {
        case "scheduled":
          return NextResponse.json(success({ inProgress: false, state: "pending" }), { headers, status: 202 });
        case "in_progress":
          return NextResponse.json(success({ inProgress: true, state: "pending" }), { headers, status: 202 });
        case "unchanged":
          return NextResponse.json(success({ state: "ready", unchanged: true }), { headers, status: 200 });
        case "no_goal":
          return fail(new AppError("CONFLICT", "Set a relationship goal before generating insights."), 409, "NO_GOAL");
        case "not_found":
          return fail(new AppError("NOT_FOUND", "Contact not found."), 404);
        case "limited":
          return fail(new AppError("CONFLICT", "You have used today's AI actions. Try again tomorrow."), 429, "USER_DAILY_LIMIT", outcome.retryOn ? { retryOn: outcome.retryOn } : {});
        case "retry_exhausted":
          return fail(new AppError("CONFLICT", "This insight already failed twice for the same data."), 409, "RETRY_EXHAUSTED");
        case "unavailable":
          return unavailable();
      }
    } catch (error) {
      if (isUndefinedTable(error)) return unavailable();
      throw error;
    }
  };
}
