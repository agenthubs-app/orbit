import { NextResponse } from "next/server";

import { getConfiguredIngestV2 } from "../../../../../features/acquisition/business-card-ingest-v2/configured";
import type { BusinessCardIngestRepository } from "../../../../../features/acquisition/business-card-ingest-v2/repository";
import {
  attributionCardsFromItems,
  resolveEventAttribution,
  type EventAttributionSource,
} from "../../../../../features/plans/event-attribution";
import { failure, runtimeBoundaryHeaders, success } from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { AppError, getHttpStatusForAppErrorCode, toAppError } from "../../../../../shared/errors/app-error";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type AuthenticatedApiActor,
} from "../../../_shared/authenticated-actor";

/**
 * `GET /api/agent/event-attribution/candidates?batchId=`：名片审阅页顶部「是在 X 活动认识的吗？」
 * 的候选（RW-11 Q26A，Sprint W0015）。身份只在服务端解析；批次按本人读取（他人的批次 404），
 * 报名状态按本人的 Auth.js 用户 id 读取，活动标题与开始时间取 canonical 已发布目录。
 *
 * 返回 `{ events: [{ eventId, title, startsAt }], cards: { [cardId]: eventId | null } }`。
 * 活动目录未配置（功能关闭）时返回空候选（不询问），确认接口同样会拒绝任何活动 id；已配置的来源
 * 读取出错时返回 503，客户端当作读取失败处理（重试一次，仍失败才按没有候选继续）。
 *
 * W0021：批次只读 `getBatchCardStates`（card_id／seq／created_at 等小列），活动只读开始时间窗口内的
 * 三列（`EventStartWindowReader`）；返回结果与之前相同。
 */
export interface EventAttributionCandidateRouteDependencies {
  resolveActor?: () => Promise<AuthenticatedApiActor | null>;
  /** null = 名片批次库未配置 → 503。 */
  ingestRepository?: () => Promise<BusinessCardIngestRepository | null>;
  source?: () => Promise<EventAttributionSource | null>;
}

const ID_MAX = 200;

async function configuredIngestRepository(): Promise<BusinessCardIngestRepository | null> {
  const configured = getConfiguredIngestV2();
  if (!configured) return null;
  await configured.ready;
  return configured.repository;
}

async function configuredSource(): Promise<EventAttributionSource | null> {
  const runtime = await import("../../../../../features/plans/event-attribution-runtime");
  return runtime.createConfiguredEventAttributionSource();
}

export function createEventAttributionCandidateRouteHandlers(dependencies: EventAttributionCandidateRouteDependencies = {}) {
  const resolveActor = dependencies.resolveActor ?? resolveAuthenticatedApiActor;
  const ingestRepository = dependencies.ingestRepository ?? configuredIngestRepository;
  const source = dependencies.source ?? configuredSource;

  return {
    async GET(request: Request): Promise<Response> {
      const mode = resolveFeatureMode();
      const headers = runtimeBoundaryHeaders(mode);
      const fail = (appError: AppError) =>
        NextResponse.json(failure(appError), { headers, status: getHttpStatusForAppErrorCode(appError.code) });
      try {
        const actor = await resolveActor();
        if (!actor?.id) return authenticatedApiActorRequiredResponse(mode);
        const batchId = new URL(request.url).searchParams.get("batchId")?.trim() ?? "";
        if (!batchId || batchId.length > ID_MAX) throw new AppError("VALIDATION_ERROR", "batchId is required.");
        const repository = await ingestRepository();
        if (!repository) throw new AppError("SERVICE_UNAVAILABLE", "Business-card batches require a configured live database.");
        // W0021：只读分组与扫描时间所需的列（不读识别结果等大字段）。
        const detail = await repository.getBatchCardStates({ actorId: actor.id, batchId });
        if (!detail) throw new AppError("NOT_FOUND", "Batch not found.");
        const attributionSource = await source();
        if (!attributionSource) {
          return NextResponse.json(success({ cards: {}, events: [] }), { headers });
        }
        let result: Awaited<ReturnType<typeof resolveEventAttribution>>;
        try {
          result = await resolveEventAttribution(attributionSource, {
            cards: attributionCardsFromItems(detail.items),
            // 报名按账号 id（actor.id）记（报名路由 `registrationService.register({ userId: actor.id })`），
            // 不能用 Auth.js 会话 id：两者不同时会永远找不到候选。
            userId: actor.id,
          });
        } catch (error) {
          // 已配置的活动目录／报名读取出错：503，让客户端当作读取失败（重试一次），而不是「没有候选」。
          throw new AppError("SERVICE_UNAVAILABLE", "Event attribution candidates are temporarily unavailable.", { cause: error });
        }
        return NextResponse.json(success({ cards: result.byCard, events: result.events }), { headers });
      } catch (error) {
        return fail(toAppError(error));
      }
    },
  };
}
