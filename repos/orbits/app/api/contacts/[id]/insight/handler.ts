import { NextResponse } from "next/server";

import { readContactInsightStatus } from "../../../../../features/contacts/insights/read";
import { contactInsightView } from "../../../../../features/contacts/insights/view";
import { failure, runtimeBoundaryHeaders, success } from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { AppError } from "../../../../../shared/errors/app-error";
import { authenticatedApiActorRequiredResponse, resolveAuthenticatedApiActor, type AuthenticatedApiActor } from "../../../_shared/authenticated-actor";

/**
 * W0057（SC-02）：`GET /api/contacts/:id/insight`——详情面板「正在生成」时每 5 秒轮询一次的只读状态。
 *
 * 只读本人一行洞察（+ 当前目标、当日用户池用量，与详情页同口径），返回面板视图；他人的联系人 404。
 * 不 import 生成器、执行器、运行时或配额预留：轮询 0 次模型调用、0 次扣减（`tests/architecture/contact-insights-read-paths.test.ts`）。
 */
export interface ContactInsightStatusDependencies {
  resolveActor?: () => Promise<AuthenticatedApiActor | null>;
  readStatus?: typeof readContactInsightStatus;
  now?: () => Date;
}

export function createContactInsightStatusHandler(dependencies: ContactInsightStatusDependencies = {}) {
  const resolveActor = dependencies.resolveActor ?? resolveAuthenticatedApiActor;
  const readStatus = dependencies.readStatus ?? readContactInsightStatus;
  return async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
    const mode = resolveFeatureMode();
    const headers = runtimeBoundaryHeaders(mode);
    const actor = await resolveActor();
    if (!actor?.id) return authenticatedApiActorRequiredResponse(mode);
    const { id } = await context.params;
    const contactId = typeof id === "string" ? decodeURIComponent(id).trim() : "";
    if (!contactId || contactId.length > 512) {
      return NextResponse.json(failure(new AppError("VALIDATION_ERROR", "Contact id is invalid.")), { headers, status: 400 });
    }
    const now = (dependencies.now ?? (() => new Date()))();
    const read = await readStatus({ actorId: actor.id, contactId, now }).catch(() => undefined);
    if (read === undefined) {
      return NextResponse.json(failure(new AppError("SERVICE_UNAVAILABLE", "Insights are temporarily unavailable.")), { headers, status: 503 });
    }
    if (read === null) return NextResponse.json(failure(new AppError("NOT_FOUND", "Contact not found.")), { headers, status: 404 });
    const view = contactInsightView(read.row, { contactId, goal: read.goal, goalKnown: read.goalKnown, now });
    return NextResponse.json(success({ quotaExhausted: read.quotaExhausted, view }), { headers, status: 200 });
  };
}
