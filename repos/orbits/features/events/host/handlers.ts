/**
 * R17 主催的路由处理。Owner: 甲 (R17). DESIGN §4。
 * - 模式跟 `host-operations`（`redesignContractMode`）：mock / hybrid → 示例世界（`mock.ts`）；live → `live.ts`。
 * - 演示账号（sample）在 live 下只读示例世界，写操作一律 403 SAMPLE_READ_ONLY（不写库、不发通知）。
 * - 主办侧全部要登录；公开主办方页与邀请预览可未登录读。
 * - 每个响应都过契约 schema。
 */
import { NextResponse } from "next/server";
import type { ZodType } from "zod";

import {
  hostCenterResponseSchema,
  hostCenterSummarySchema,
  hostDesktopLinkResultSchema,
  hostEventArchiveInputSchema,
  hostEventCancelInputSchema,
  hostEventCodeReissueInputSchema,
  hostEventInputSchema,
  hostEventPublishInputSchema,
  hostEventUpdateInputSchema,
  hostEventViewSchema,
  hostEventWriteResultSchema,
} from "../../../shared/api-schema/host-events";
import {
  hostAdmitOnSiteInputSchema,
  hostCheckInResultSchema,
  hostCheckInScanInputSchema,
  hostCheckInUndoInputSchema,
  hostKioskHeartbeatInputSchema,
  hostKioskHeartbeatResultSchema,
  hostKioskResponseSchema,
  hostKioskRosterResponseSchema,
  hostMatchingGenerateInputSchema,
  hostMatchingOverridesInputSchema,
  hostMatchingPublishInputSchema,
  hostMatchingResponseSchema,
  hostOverviewResponseSchema,
  hostPeopleDecisionInputSchema,
  hostPeopleDecisionResultSchema,
  hostPeopleResponseSchema,
  hostReportResponseSchema,
  hostSetupDraftInputSchema,
  hostSetupHostNoteInputSchema,
  hostSetupPublishInputSchema,
  hostSetupResponseSchema,
} from "../../../shared/api-schema/host-console";
import {
  hostCheckInEventsResponseSchema,
  hostCohostAcceptResultSchema,
  hostCohostInviteInputSchema,
  hostCohostInvitePreviewSchema,
  hostCohostInviteResultSchema,
  hostCohostRemoveInputSchema,
  hostCohostRoleInputSchema,
  hostCohostsResponseSchema,
} from "../../../shared/api-schema/host-cohosts";
import { hostNoticePreviewInputSchema, hostNoticePreviewSchema, hostNoticeSendInputSchema, hostNoticeSendResultSchema } from "../../../shared/api-schema/host-notices";
import { organizerProfileInputSchema, organizerProfileListResponseSchema, organizerProfileSchema, organizerPublicResponseSchema } from "../../../shared/api-schema/organizer-profile";
import { failure, runtimeBoundaryHeaders, success } from "../../../shared/api/envelope";
import type { FeatureMode } from "../../../shared/config/feature-mode";
import { AppError, getHttpStatusForAppErrorCode, SAFE_INTERNAL_ERROR_MESSAGE, type AppErrorCode } from "../../../shared/errors/app-error";
import { resolveAuthenticatedApiActor, type ResolveAuthenticatedApiActor } from "../../../app/api/_shared/authenticated-actor";
import { redesignContractMode } from "../../redesign-contracts/route";
import { createHostMockService, DEMO_ACTOR_ID } from "./mock";
import { HostError, type HostErrorCode, type HostService } from "./service";

type Params = Record<string, string>;
type RouteContext = { params?: Promise<Params> };
type Reply<T> = { data: T; status?: number } | { error: AppError; context?: Record<string, string> };

export interface HostRouteDeps {
  resolveActor?: ResolveAuthenticatedApiActor;
  resolveMode?: () => FeatureMode;
  /** Tests: the live service (null = unconfigured). */
  liveService?: () => Promise<HostService | null>;
}

export const HOST_SAMPLE_HEADER = "x-orbit-sample";

async function configuredLiveService(): Promise<HostService | null> {
  const { createConfiguredHostLiveService } = await import("./live");
  return createConfiguredHostLiveService();
}

const ERROR_MAP: Record<HostErrorCode, AppErrorCode> = {
  CAPACITY_FULL: "CONFLICT",
  FORBIDDEN: "FORBIDDEN",
  GENERATION_LIMIT: "CONFLICT",
  INVALID_STATE: "CONFLICT",
  NOT_CONFIGURED: "SERVICE_UNAVAILABLE",
  NOT_FOUND: "NOT_FOUND",
  RATE_LIMITED: "FORBIDDEN",
  TOKEN_INVALID: "NOT_FOUND",
  UNDO_EXPIRED: "CONFLICT",
  VALIDATION: "VALIDATION_ERROR",
  VERSION_CONFLICT: "CONFLICT",
};

function hostRoute<T>(
  options: { auth: "required" | "optional"; write?: boolean; schema: ZodType<T> },
  handle: (input: { request: Request; params: Params; service: HostService; actorId: string | null; sample: boolean }) => Promise<Reply<T> | T | null>,
  deps: HostRouteDeps = {},
) {
  return async function route(request: Request, routeContext?: RouteContext): Promise<Response> {
    const mode = (deps.resolveMode ?? (() => redesignContractMode("host-operations")))();
    const headers = { ...runtimeBoundaryHeaders(mode), "cache-control": "private, no-store" };
    const reply = (status: number, body: unknown) => NextResponse.json(body, { headers, status });
    const fail = (error: AppError, context?: Record<string, string>) => reply(getHttpStatusForAppErrorCode(error.code), failure(error, context));
    try {
      const actor = await (deps.resolveActor ?? resolveAuthenticatedApiActor)().catch(() => null);
      if (!actor && options.auth === "required" && mode === "live") return fail(new AppError("UNAUTHORIZED", "Sign in to access this resource."));
      const sample = mode !== "live" || actor?.id === DEMO_ACTOR_ID || request.headers.get(HOST_SAMPLE_HEADER)?.trim() === "1";
      if (mode === "live" && sample && options.write) return fail(new AppError("FORBIDDEN", "SAMPLE_READ_ONLY: sample data cannot be saved."), { reason: "SAMPLE_READ_ONLY" });
      const service = sample ? createHostMockService() : await (deps.liveService ?? configuredLiveService)();
      if (!service) return fail(new AppError("SERVICE_UNAVAILABLE", "Hosting requires a configured live database."), { reason: "HOST_UNCONFIGURED" });
      const params = (await routeContext?.params) ?? {};
      const actorId = actor?.id ?? (options.auth === "required" ? DEMO_ACTOR_ID : null);
      const result = await handle({ actorId, params, request, sample, service });
      if (result === null) return fail(new AppError("NOT_FOUND", "Not found."), { reason: "NOT_FOUND" });
      const normalized = (typeof result === "object" && result !== null && ("data" in result || "error" in result) ? result : { data: result }) as Reply<T>;
      if ("error" in normalized) return fail(normalized.error, normalized.context);
      const checked = options.schema.safeParse(normalized.data);
      if (!checked.success) {
        console.error(JSON.stringify({ event: "host_response_invalid", issues: checked.error.issues.slice(0, 3).map((issue) => issue.path.join(".")) }));
        return fail(new AppError("INTERNAL_ERROR", SAFE_INTERNAL_ERROR_MESSAGE));
      }
      const data = sample && checked.data && typeof checked.data === "object" && !Array.isArray(checked.data) ? { ...(checked.data as Record<string, unknown>), sample: true } : checked.data;
      return reply(normalized.status ?? 200, success(data));
    } catch (error) {
      if (error instanceof HostError && error.code === "RATE_LIMITED") return reply(429, failure(new AppError("FORBIDDEN", "Too many attempts. Try again later."), { reason: "RATE_LIMITED" }));
      if (error instanceof HostError) return fail(new AppError(ERROR_MAP[error.code], error.message), { reason: error.code === "INVALID_STATE" && error.message !== error.code ? error.message : error.code });
      if (error instanceof AppError) return fail(error);
      console.error(JSON.stringify({ error: error instanceof Error ? error.name : "unknown", event: "host_route_failed" }));
      return fail(new AppError("INTERNAL_ERROR", SAFE_INTERNAL_ERROR_MESSAGE));
    }
  };
}

async function body<T>(request: Request, schema: ZodType<T>): Promise<T> {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new HostError("VALIDATION", "The request body is not valid.");
  return parsed.data;
}

const id = (params: Params, key = "id") => decodeURIComponent((params[key] ?? "").trim());
const FILTERS = ["all", "upcoming", "live", "ended", "inactive"] as const;
const BUCKETS = ["pending", "approved", "waitlisted", "rejected"] as const;
/** 限流 / 防枚举用的客户端键（不记录、不回显）。 */
const clientKey = (request: Request) => (request.headers.get("x-forwarded-for")?.split(",")[0] ?? request.headers.get("x-real-ip") ?? "local").trim();

export function createHostRoutes(deps: HostRouteDeps = {}) {
  const r = <T>(options: { auth: "required" | "optional"; write?: boolean; schema: ZodType<T> }, handle: Parameters<typeof hostRoute<T>>[1]) => hostRoute(options, handle, deps);
  const required = { auth: "required" as const };
  const writes = { auth: "required" as const, write: true };
  return {
    center: r({ ...required, schema: hostCenterResponseSchema }, async ({ actorId, request, service }) => {
      const url = new URL(request.url);
      const filter = (FILTERS as readonly string[]).includes(url.searchParams.get("filter") ?? "") ? url.searchParams.get("filter") as (typeof FILTERS)[number] : "all";
      const page = Math.max(1, Math.min(100, Number(url.searchParams.get("page") ?? "1") || 1));
      return service.center(actorId!, { filter, page, q: (url.searchParams.get("q") ?? "").trim().slice(0, 80) });
    }),
    centerSummary: r({ ...required, schema: hostCenterSummarySchema }, async ({ actorId, service }) => service.centerSummary(actorId!)),
    createEvent: r({ ...writes, schema: hostEventWriteResultSchema }, async ({ actorId, request, service }) => ({ data: await service.createEvent(actorId!, await body(request, hostEventInputSchema)), status: 201 })),
    event: r({ ...required, schema: hostEventViewSchema }, async ({ actorId, params, service }) => service.event(actorId!, id(params))),
    updateEvent: r({ ...writes, schema: hostEventWriteResultSchema }, async ({ actorId, params, request, service }) => service.updateEvent(actorId!, id(params), await body(request, hostEventUpdateInputSchema))),
    publishEvent: r({ ...writes, schema: hostEventWriteResultSchema }, async ({ actorId, params, request, service }) => service.publishEvent(actorId!, id(params), await body(request, hostEventPublishInputSchema))),
    cancelEvent: r({ ...writes, schema: hostEventWriteResultSchema }, async ({ actorId, params, request, service }) => service.cancelEvent(actorId!, id(params), await body(request, hostEventCancelInputSchema))),
    archiveEvent: r({ ...writes, schema: hostEventWriteResultSchema }, async ({ actorId, params, request, service }) => service.archiveEvent(actorId!, id(params), await body(request, hostEventArchiveInputSchema))),
    reissueCode: r({ ...writes, schema: hostEventWriteResultSchema }, async ({ actorId, params, request, service }) => service.reissueCode(actorId!, id(params), await body(request, hostEventCodeReissueInputSchema))),

    overview: r({ ...required, schema: hostOverviewResponseSchema }, async ({ actorId, params, service }) => service.overview(actorId!, id(params))),
    matching: r({ ...required, schema: hostMatchingResponseSchema }, async ({ actorId, params, request, service }) => service.matching(actorId!, id(params), Number(new URL(request.url).searchParams.get("round") ?? "1") || 1)),
    generateMatching: r({ ...writes, schema: hostMatchingResponseSchema }, async ({ actorId, params, request, service }) => ({ data: await service.generateMatching(actorId!, id(params), await body(request, hostMatchingGenerateInputSchema)), status: 202 })),
    saveOverrides: r({ ...writes, schema: hostMatchingResponseSchema }, async ({ actorId, params, request, service }) => service.saveOverrides(actorId!, id(params), await body(request, hostMatchingOverridesInputSchema))),
    publishMatching: r({ ...writes, schema: hostMatchingResponseSchema }, async ({ actorId, params, request, service }) => service.publishMatching(actorId!, id(params), await body(request, hostMatchingPublishInputSchema))),

    people: r({ ...required, schema: hostPeopleResponseSchema }, async ({ actorId, params, request, service }) => {
      const url = new URL(request.url);
      const bucket = (BUCKETS as readonly string[]).includes(url.searchParams.get("bucket") ?? "") ? url.searchParams.get("bucket") as (typeof BUCKETS)[number] : "pending";
      return service.people(actorId!, id(params), { bucket, cursor: url.searchParams.get("cursor"), incomplete: url.searchParams.get("incomplete") === "1", q: (url.searchParams.get("q") ?? "").trim().slice(0, 80) });
    }),
    decide: r({ ...writes, schema: hostPeopleDecisionResultSchema }, async ({ actorId, params, request, service }) => service.decide(actorId!, id(params), id(params, "actorId"), await body(request, hostPeopleDecisionInputSchema))),

    kiosk: r({ ...required, schema: hostKioskResponseSchema }, async ({ actorId, params, request, service }) => service.kiosk(actorId!, id(params), (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 40))),
    kioskRoster: r({ ...required, schema: hostKioskRosterResponseSchema }, async ({ actorId, params, service }) => service.kioskRoster(actorId!, id(params))),
    scanCheckIn: r({ ...writes, schema: hostCheckInResultSchema }, async ({ actorId, params, request, service }) => service.scanCheckIn(actorId!, id(params), await body(request, hostCheckInScanInputSchema))),
    checkIn: r({ ...writes, schema: hostCheckInResultSchema }, async ({ actorId, params, request, service }) => service.checkIn(actorId!, id(params), id(params, "participantId"), (await body(request, hostCheckInUndoInputSchema)).idempotencyKey)),
    undoCheckIn: r({ ...writes, schema: hostCheckInResultSchema }, async ({ actorId, params, request, service }) => service.undoCheckIn(actorId!, id(params), id(params, "participantId"), await body(request, hostCheckInUndoInputSchema))),
    admitOnSite: r({ ...writes, schema: hostCheckInResultSchema }, async ({ actorId, params, request, service }) => service.admitOnSite(actorId!, id(params), id(params, "participantId"), await body(request, hostAdmitOnSiteInputSchema))),
    heartbeat: r({ ...writes, schema: hostKioskHeartbeatResultSchema }, async ({ actorId, params, request, service }) => service.heartbeat(actorId!, id(params), await body(request, hostKioskHeartbeatInputSchema))),

    setup: r({ ...required, schema: hostSetupResponseSchema }, async ({ actorId, params, service }) => service.setup(actorId!, id(params))),
    saveSetup: r({ ...writes, schema: hostSetupResponseSchema }, async ({ actorId, params, request, service }) => service.saveSetup(actorId!, id(params), await body(request, hostSetupDraftInputSchema))),
    publishSetup: r({ ...writes, schema: hostSetupResponseSchema }, async ({ actorId, params, request, service }) => service.publishSetup(actorId!, id(params), await body(request, hostSetupPublishInputSchema))),
    saveHostNote: r({ ...writes, schema: hostSetupResponseSchema }, async ({ actorId, params, request, service }) => service.saveHostNote(actorId!, id(params), await body(request, hostSetupHostNoteInputSchema))),

    report: r({ ...required, schema: hostReportResponseSchema }, async ({ actorId, params, request, service }) => service.report(actorId!, id(params), new URL(request.url).searchParams.get("view") === "mine" ? "mine" : "all")),

    cohosts: r({ ...required, schema: hostCohostsResponseSchema }, async ({ actorId, params, service }) => service.cohosts(actorId!, id(params))),
    inviteCohost: r({ ...writes, schema: hostCohostInviteResultSchema }, async ({ actorId, params, request, service }) => ({ data: await service.inviteCohost(actorId!, id(params), await body(request, hostCohostInviteInputSchema)), status: 201 })),
    revokeInvite: r({ ...writes, schema: hostCohostsResponseSchema }, async ({ actorId, params, service }) => service.revokeInvite(actorId!, id(params), id(params, "inviteId"))),
    changeCohostRole: r({ ...writes, schema: hostCohostsResponseSchema }, async ({ actorId, params, request, service }) => service.changeCohostRole(actorId!, id(params), id(params, "actorId"), await body(request, hostCohostRoleInputSchema))),
    removeCohost: r({ ...writes, schema: hostCohostsResponseSchema }, async ({ actorId, params, request, service }) => service.removeCohost(actorId!, id(params), id(params, "actorId"), await body(request, hostCohostRemoveInputSchema))),
    invitePreview: r({ auth: "optional", schema: hostCohostInvitePreviewSchema }, async ({ actorId, params, request, service }) => service.invitePreview(actorId, id(params, "code"), clientKey(request))),
    acceptInvite: r({ ...writes, schema: hostCohostAcceptResultSchema }, async ({ actorId, params, request, service }) => service.acceptInvite(actorId!, id(params, "code"), clientKey(request))),
    checkInEvents: r({ ...required, schema: hostCheckInEventsResponseSchema }, async ({ actorId, service }) => service.checkInEvents(actorId!)),

    noticePreview: r({ ...required, schema: hostNoticePreviewSchema }, async ({ actorId, params, request, service }) => service.noticePreview(actorId!, id(params), (await body(request, hostNoticePreviewInputSchema)).kind)),
    sendNotice: r({ ...writes, schema: hostNoticeSendResultSchema }, async ({ actorId, params, request, service }) => service.sendNotice(actorId!, id(params), await body(request, hostNoticeSendInputSchema))),
    desktopLink: r({ ...writes, schema: hostDesktopLinkResultSchema }, async ({ actorId, request, service }) => {
      const raw = (await request.json().catch(() => null)) as { path?: unknown } | null;
      const path = typeof raw?.path === "string" && /^\/app\/(events|host)(\/[A-Za-z0-9._~%-]+)*(\?[A-Za-z0-9=&_%-]*)?$/u.test(raw.path) ? raw.path : "/app/events/center";
      return service.desktopLink(actorId!, path);
    }),

    profiles: r({ ...required, schema: organizerProfileListResponseSchema }, async ({ actorId, service }) => service.profiles(actorId!)),
    createProfile: r({ ...writes, schema: organizerProfileSchema }, async ({ actorId, request, service }) => ({ data: await service.createProfile(actorId!, await body(request, organizerProfileInputSchema)), status: 201 })),
    updateProfile: r({ ...writes, schema: organizerProfileSchema }, async ({ actorId, params, request, service }) => service.updateProfile(actorId!, id(params), await body(request, organizerProfileInputSchema))),
    organizerPublic: r({ auth: "optional", schema: organizerPublicResponseSchema }, async ({ actorId, params, service }) => service.organizerPublic(actorId, id(params, "slug"))),
  };
}

/** 页面（server component）用：拿到当前模式下的服务（`/e/[slug]`、旧 `/app/o/[slug]` 跳转）。 */
export async function resolveHostServiceForPage(actorId: string | null): Promise<HostService | null> {
  const mode = redesignContractMode("host-operations");
  if (mode !== "live" || actorId === DEMO_ACTOR_ID) return createHostMockService();
  return configuredLiveService();
}
