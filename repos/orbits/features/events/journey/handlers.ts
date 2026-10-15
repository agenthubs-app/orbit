/**
 * R27 活动参加者整条路的路由处理（探す / 搜索 / 详情 / 会う準備 / 会場 / 会後 / 興味なし / 关注 / 参加コード）。Owner: 甲 (R27).
 * - 模式跟契约 9（`redesignContractMode("event-recommendation-feedback")`）：mock / hybrid → 示例世界（`mock.ts`）；live → `service.ts`。
 * - 演示账号（sample）在 live 下只读示例世界，写操作一律 403 SAMPLE_READ_ONLY（不写库、不调 AI）。
 * - 未登录：探す（すべて）与详情可读（R26-08，公开目录）；其余要登录。
 * - 每个响应都过契约 schema（宽进 schema 也用来守输出形状）。
 */
import { NextResponse } from "next/server";
import type { ZodType } from "zod";

import { eventAfterConfirmInputSchema, eventAfterConfirmResultSchema, eventAfterResponseSchema } from "../../../shared/api-schema/event-after";
import { eventDiscoverQueryObject, eventDiscoverResponseSchema } from "../../../shared/api-schema/event-discover";
import { eventOverviewResponseSchema } from "../../../shared/api-schema/event-overview";
import { eventPrepChecklistPatchSchema, eventPrepResponseSchema } from "../../../shared/api-schema/event-prep";
import { eventRecommendationDismissInputSchema, eventRecommendationDismissResultSchema } from "../../../shared/api-schema/event-recommendation-feedback";
import { eventSearchQueryObject, eventSearchResponseSchema } from "../../../shared/api-schema/event-search";
import { eventVenueResponseSchema } from "../../../shared/api-schema/event-venue";
import { organizerFollowResultSchema } from "../../../shared/api-schema/organizer-follow";
import { failure, runtimeBoundaryHeaders, success } from "../../../shared/api/envelope";
import type { FeatureMode } from "../../../shared/config/feature-mode";
import { AppError, getHttpStatusForAppErrorCode, SAFE_INTERNAL_ERROR_MESSAGE } from "../../../shared/errors/app-error";
import { DEMO_ACTOR_ID } from "../../../shared/mock/demo-world/fixtures";
import { createConfiguredTransactionalPostgresRuntime } from "../../../shared/storage/transactional-postgres";
import { resolveAuthenticatedApiActor, type ResolveAuthenticatedApiActor } from "../../../app/api/_shared/authenticated-actor";
import { requestContext } from "../../plans/v2/flow-handlers";
import { redesignContractMode } from "../../redesign-contracts/route";
import { createPostgresActorRecordStore } from "../actor-records/store";
import { createEventFeedbackService, createOrganizerFollowService, createPrepChecklistService } from "./attendee-records";
import { createJourneyMockService } from "./mock";
import type { JourneyLanguage } from "./prep-core";
import { createJourneyService, type JourneyService } from "./service";
import { createJoinService, type JoinService } from "./join";
import { createJoinMockPorts } from "./join-mock";
import { eventJoinNextInputObject, eventJoinProfileInputObject, eventJoinProfileSchema, eventJoinResultSchema, eventJoinStepSchema, eventJoinSubmitInputObject, eventJoinTentativeInputObject, eventJoinTentativeResultSchema } from "../../../shared/api-schema/event-join";

type Params = Record<string, string>;
type RouteContext = { params?: Promise<Params> };
type Reply<T> = { data: T; status?: number } | { error: AppError; context?: Record<string, string> };

export interface JourneyRouteDeps {
  /** Tests: the live 参加登録 facade (null = unconfigured). */
  liveJoin?: () => Promise<JoinService | null>;
  resolveActor?: ResolveAuthenticatedApiActor;
  resolveMode?: () => FeatureMode;
  /** Tests: the live service (null = unconfigured). */
  liveService?: () => Promise<JourneyService | null>;
}

export const JOURNEY_SAMPLE_HEADER = "x-orbit-sample";

async function configuredLiveService(): Promise<JourneyService | null> {
  const runtime = createConfiguredTransactionalPostgresRuntime();
  if (!runtime) return null;
  const { createJourneyLivePorts } = await import("./live");
  const ports = createJourneyLivePorts();
  if (!ports) return null;
  const store = createPostgresActorRecordStore({ query: (sql, values) => runtime.client.query(sql, values as unknown[]) as Promise<{ rows: Array<Record<string, unknown>> }>, workspaceId: runtime.workspaceId });
  return createJourneyService({ ports, records: { checklist: createPrepChecklistService({ store }), feedback: createEventFeedbackService({ store }), follows: createOrganizerFollowService({ store }) } });
}

async function configuredJoinService(): Promise<JoinService | null> {
  const runtime = createConfiguredTransactionalPostgresRuntime();
  if (!runtime) return null;
  const { createJourneyLivePorts } = await import("./live");
  const journey = createJourneyLivePorts();
  if (!journey) return null;
  const { createJoinLivePorts } = await import("./join-live");
  return createJoinService({ ports: createJoinLivePorts({ journey, query: (sql, values) => runtime.client.query(sql, values as unknown[]) as Promise<{ rows: Array<Record<string, unknown>> }>, workspaceId: runtime.workspaceId }) });
}

const notFound = <T>(): Reply<T> => ({ context: { reason: "NOT_FOUND" }, error: new AppError("NOT_FOUND", "Not found.") });

function journeyRoute<T>(options: { auth: "required" | "optional"; write?: boolean; schema: ZodType<T> }, handle: (input: { request: Request; params: Params; service: JourneyService; join: () => Promise<JoinService | null>; actorId: string | null; language: JourneyLanguage; platform: "web" | "app" }) => Promise<Reply<T> | T | null>, deps: JourneyRouteDeps = {}) {
  return async function route(request: Request, routeContext?: RouteContext): Promise<Response> {
    const mode = (deps.resolveMode ?? (() => redesignContractMode("event-recommendation-feedback")))();
    const headers = { ...runtimeBoundaryHeaders(mode), "cache-control": "private, no-store" };
    const reply = (status: number, body: unknown) => NextResponse.json(body, { headers, status });
    const fail = (error: AppError, context?: Record<string, string>) => reply(getHttpStatusForAppErrorCode(error.code), failure(error, context));
    try {
      const actor = await (deps.resolveActor ?? resolveAuthenticatedApiActor)().catch(() => null);
      // live：要登录的接口没登录 → 401；mock（本机示例）同 R26 events-mine：没登录按演示账号读示例世界。
      if (!actor && options.auth === "required" && mode === "live") return fail(new AppError("UNAUTHORIZED", "Sign in to access this resource."));
      const sample = mode !== "live" || actor?.id === DEMO_ACTOR_ID || request.headers.get(JOURNEY_SAMPLE_HEADER)?.trim() === "1";
      if (mode === "live" && sample && options.write) return fail(new AppError("FORBIDDEN", "SAMPLE_READ_ONLY: sample data cannot be saved."), { reason: "SAMPLE_READ_ONLY" });
      const service = sample ? createJourneyMockService() : await (deps.liveService ?? configuredLiveService)();
      if (!service) return fail(new AppError("SERVICE_UNAVAILABLE", "Events require a configured live database."), { reason: "EVENT_JOURNEY_UNCONFIGURED" });
      const params = (await routeContext?.params) ?? {};
      const actorId = actor?.id ?? (options.auth === "required" ? DEMO_ACTOR_ID : null);
      const context = requestContext(request);
      const join = async () => (sample ? createJoinService({ ports: createJoinMockPorts() }) : await (deps.liveJoin ?? configuredJoinService)());
      const result = await handle({ actorId, join, language: context.language, params, platform: context.platform === "app" ? "app" : "web", request, service });
      if (result === null) return fail(new AppError("NOT_FOUND", "Not found."), { reason: "NOT_FOUND" });
      const normalized = (typeof result === "object" && result !== null && ("data" in result || "error" in result) ? result : { data: result }) as Reply<T>;
      if ("error" in normalized) return fail(normalized.error, normalized.context);
      const checked = options.schema.safeParse(normalized.data);
      if (!checked.success) {
        console.error(JSON.stringify({ event: "event_journey_response_invalid", issues: checked.error.issues.slice(0, 3).map((issue) => issue.path.join(".")) }));
        return fail(new AppError("INTERNAL_ERROR", SAFE_INTERNAL_ERROR_MESSAGE));
      }
      const data = sample && checked.data && typeof checked.data === "object" && !Array.isArray(checked.data) ? { ...(checked.data as Record<string, unknown>), sample: true } : checked.data;
      return reply(normalized.status ?? 200, success(data));
    } catch (error) {
      if (error instanceof AppError) return fail(error);
      console.error(JSON.stringify({ error: error instanceof Error ? error.name : "unknown", event: "event_journey_route_failed" }));
      return fail(new AppError("INTERNAL_ERROR", SAFE_INTERNAL_ERROR_MESSAGE));
    }
  };
}

async function body<T>(request: Request, schema: ZodType<T>): Promise<{ ok: true; value: T } | { ok: false; reply: Reply<never> }> {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, reply: { error: new AppError("VALIDATION_ERROR", "The request body is not valid.") } };
}

const eventId = (params: Params) => (params.id ?? "").trim();

export function createEventJourneyRoutes(deps: JourneyRouteDeps = {}) {
  return {
    discover: journeyRoute({ auth: "optional", schema: eventDiscoverResponseSchema }, async ({ actorId, language, request, service }) => {
      const url = new URL(request.url);
      const raw = Object.fromEntries([...url.searchParams.entries()].filter(([key]) => !["lang", "platform"].includes(key)));
      const parsed = eventDiscoverQueryObject.safeParse(raw);
      if (!parsed.success) return { error: new AppError("VALIDATION_ERROR", "Invalid query.") };
      return service.discover(actorId, parsed.data, language);
    }, deps),
    search: journeyRoute({ auth: "required", schema: eventSearchResponseSchema }, async ({ actorId, request, service }) => {
      const url = new URL(request.url);
      const parsed = eventSearchQueryObject.safeParse({ limit: url.searchParams.get("limit") ?? undefined, q: url.searchParams.get("q") ?? undefined });
      if (!parsed.success) return { error: new AppError("VALIDATION_ERROR", "Invalid query.") };
      return service.search(actorId!, parsed.data.q, parsed.data.limit);
    }, deps),
    overview: journeyRoute({ auth: "optional", schema: eventOverviewResponseSchema }, async ({ actorId, join, language, params, platform, service }) => {
      // 仮予定：审核结果出来后的改名 / 删除（读详情时顺带，失败只记日志，不影响页面）。
      if (actorId) void join().then((joinService) => joinService?.syncTentative(actorId, eventId(params), language)).catch((error: unknown) => console.warn(JSON.stringify({ error: error instanceof Error ? error.name : "unknown", event: "event_join_tentative_sync_failed" })));
      return service.overview(actorId, eventId(params), language, platform);
    }, deps),
    prep: journeyRoute({ auth: "required", schema: eventPrepResponseSchema }, async ({ actorId, language, params, service }) => service.prep(actorId!, eventId(params), language), deps),
    patchChecklist: journeyRoute({ auth: "required", schema: eventPrepResponseSchema, write: true }, async ({ actorId, language, params, request, service }) => {
      const parsed = await body(request, eventPrepChecklistPatchSchema);
      if (parsed.ok === false) return parsed.reply;
      await service.patchChecklist(actorId!, eventId(params), parsed.value.items);
      return service.prep(actorId!, eventId(params), language);
    }, deps),
    venue: journeyRoute({ auth: "required", schema: eventVenueResponseSchema }, async ({ actorId, params, service }) => service.venue(actorId!, eventId(params)), deps),
    after: journeyRoute({ auth: "required", schema: eventAfterResponseSchema }, async ({ actorId, language, params, service }) => service.after(actorId!, eventId(params), language), deps),
    confirmAfter: journeyRoute({ auth: "required", schema: eventAfterConfirmResultSchema, write: true }, async ({ actorId, params, request, service }) => {
      const parsed = await body(request, eventAfterConfirmInputSchema);
      if (parsed.ok === false) return parsed.reply;
      return service.confirmAfter(actorId!, eventId(params), parsed.value);
    }, deps),
    dismiss: journeyRoute({ auth: "required", schema: eventRecommendationDismissResultSchema, write: true }, async ({ actorId, params, request, service }) => {
      const parsed = await body(request, eventRecommendationDismissInputSchema);
      if (parsed.ok === false) return parsed.reply;
      return service.dismiss(actorId!, eventId(params), parsed.value);
    }, deps),
    joinNext: journeyRoute({ auth: "required", schema: eventJoinStepSchema }, async ({ join, language, params, request }) => {
      const parsed = await body(request, eventJoinNextInputObject);
      if (parsed.ok === false) return parsed.reply;
      const service = await join();
      if (!service) return { context: { reason: "EVENT_JOIN_UNCONFIGURED" }, error: new AppError("SERVICE_UNAVAILABLE", "Registration is unavailable.") };
      return service.next(eventId(params), parsed.value.answers, language);
    }, deps),
    joinProfile: journeyRoute({ auth: "required", schema: eventJoinProfileSchema }, async ({ actorId, join, language, params, request }) => {
      const parsed = await body(request, eventJoinProfileInputObject);
      if (parsed.ok === false) return parsed.reply;
      const service = await join();
      if (!service) return { context: { reason: "EVENT_JOIN_UNCONFIGURED" }, error: new AppError("SERVICE_UNAVAILABLE", "Registration is unavailable.") };
      return service.profile(actorId!, eventId(params), parsed.value.answers, parsed.value.draft, language);
    }, deps),
    joinSubmit: journeyRoute({ auth: "required", schema: eventJoinResultSchema, write: true }, async ({ join, language, params, request }) => {
      const parsed = await body(request, eventJoinSubmitInputObject);
      if (parsed.ok === false) return parsed.reply;
      const service = await join();
      if (!service) return { context: { reason: "EVENT_JOIN_UNCONFIGURED" }, error: new AppError("SERVICE_UNAVAILABLE", "Registration is unavailable.") };
      return service.submit(eventId(params), parsed.value.answers, language);
    }, deps),
    joinTentative: journeyRoute({ auth: "required", schema: eventJoinTentativeResultSchema, write: true }, async ({ actorId, join, language, params, request }) => {
      const parsed = await body(request, eventJoinTentativeInputObject);
      if (parsed.ok === false) return parsed.reply;
      const service = await join();
      if (!service) return { context: { reason: "EVENT_JOIN_UNCONFIGURED" }, error: new AppError("SERVICE_UNAVAILABLE", "Registration is unavailable.") };
      return service.tentative(actorId!, eventId(params), parsed.value.idempotencyKey, language);
    }, deps),
    follow: journeyRoute({ auth: "required", schema: organizerFollowResultSchema, write: true }, async ({ actorId, params, service }) => service.follow(actorId!, (params.id ?? "").trim(), true), deps),
    unfollow: journeyRoute({ auth: "required", schema: organizerFollowResultSchema, write: true }, async ({ actorId, params, service }) => service.follow(actorId!, (params.id ?? "").trim(), false), deps),
  };
}

/** 参加コード → 活动 id（页面层 `/register/[code]` 用；找不到返回 null）。 */
export async function resolveEventCode(code: string, deps: JourneyRouteDeps = {}): Promise<string | null> {
  const mode = (deps.resolveMode ?? (() => redesignContractMode("event-recommendation-feedback")))();
  const service = mode !== "live" ? createJourneyMockService() : await (deps.liveService ?? configuredLiveService)();
  return service ? service.eventIdByCode(code).catch(() => null) : null;
}

export { notFound };
