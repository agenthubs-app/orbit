/**
 * R15 招待コード的路由（DESIGN add-and-invite §4.2、§6）。Owner: 甲 (R15).
 * Used by: `app/api/invite-codes/**` 的 route.ts（只 re-export 这里的函数）。
 *
 * - 模式按 `redesignContractMode("invite-codes")`：mock / hybrid（以及本机 `ORBIT_REDESIGN_MOCK` 点名时）走 R08 的演示世界
 *   （`features/redesign-contracts/handlers.ts`，不改）；live（生产永远是 live）走这里的真实实现。
 * - live：除公开预览外都要登录（未登录 401）；示例模式的写操作 403 `SAMPLE_READ_ONLY`（同 R12 口径：演示账号或
 *   `x-orbit-sample: 1`）；库未配置 503；预览与兑换的限流密钥缺失 503（不退化为不限流）。
 * - 防枚举（§6 第 2 条）：不存在 / 作废 / 被替换 / 格式错 / 过期超过 30 天 → 同一个 404 响应（逐字节相同）；
 *   被限流 → 同一个响应体、状态 429 + `Retry-After`。过期 / 满员 / 自己的码 / 资料没填 是各自的 409（都需要先拿到真码）。
 * - 日志只记 HMAC 后 IP 的前 16 位与码的前 2 位，不记完整码与原始 IP（§6 第 9 条）。
 */
import { NextResponse } from "next/server";
import type { ZodType } from "zod";

import {
  inviteCodeCreateInputSchema,
  inviteCodeHistoryResponseSchema,
  inviteCodePreviewSchema,
  inviteCodeRedeemInputSchema,
  inviteCodeRedeemResultSchema,
  inviteCodeSchema,
  inviteConnectionViewSchema,
  inviteMergeInputSchema,
  inviteShareUpdateInputSchema,
  inviteUnlinkInputSchema,
  inviteUnlinkResultSchema,
} from "../../shared/api-schema/invite-codes";
import { failure, runtimeBoundaryHeaders, success } from "../../shared/api/envelope";
import { AppError, getHttpStatusForAppErrorCode, SAFE_INTERNAL_ERROR_MESSAGE } from "../../shared/errors/app-error";
import { DEMO_ACTOR_ID } from "../../shared/mock/demo-world/fixtures";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../../app/api/_shared/authenticated-actor";
import * as mock from "../redesign-contracts/handlers";
import { redesignContractMode } from "../redesign-contracts/route";
import { inviteClientIp } from "./client-ip";
import { getConfiguredInviteCodeRuntime, getConfiguredInviteRateLimiter } from "./configured";
import { InviteCodeError } from "./contract";
import type { InviteRateLimiter } from "./rate-limit";
import type { InviteCodeService } from "./service";

export const INVITE_SAMPLE_REQUEST_HEADER = "x-orbit-sample";

type Params = Record<string, string>;
export type InviteRouteHandler = (request: Request, context?: { params?: Promise<Params> }) => Promise<Response>;

export interface InviteCodeLiveDeps {
  resolveActor?: ResolveAuthenticatedApiActor;
  /** 测试注入；null = 库未配置（503）。缺省 = live 装配。 */
  service?: InviteCodeService | null;
  /** 测试注入；null = 限流密钥或库缺失（预览 / 兑换 503）。缺省 = live 装配。 */
  limiter?: InviteRateLimiter | null;
  log?: (line: string) => void;
}

const LIVE_HEADERS = runtimeBoundaryHeaders("live");
const UNAVAILABLE_MESSAGE = "This invite code cannot be used.";

function json(body: unknown, status: number, extra: Record<string, string> = {}): Response {
  return NextResponse.json(body, { headers: { ...LIVE_HEADERS, ...extra }, status });
}

/** 防枚举：所有「不可用」与「被限流」共用同一个响应体。 */
function unavailableResponse(retryAfterSeconds?: number): Response {
  const body = failure(new AppError("NOT_FOUND", UNAVAILABLE_MESSAGE), { reason: "INVITE_UNAVAILABLE" });
  return retryAfterSeconds === undefined ? json(body, 404) : json(body, 429, { "Retry-After": String(retryAfterSeconds) });
}

function errorResponse(error: AppError, reason?: string): Response {
  return json(failure(error, reason ? { reason } : undefined), getHttpStatusForAppErrorCode(error.code));
}

function okResponse<T>(schema: ZodType<T>, data: unknown, status = 200): Response {
  const checked = schema.safeParse(data);
  if (!checked.success) {
    console.error(JSON.stringify({ event: "invite_code_response_schema_failed" }));
    return errorResponse(new AppError("INTERNAL_ERROR", SAFE_INTERNAL_ERROR_MESSAGE));
  }
  return json(success(checked.data), status);
}

/** 服务错误 → 响应（UNAVAILABLE 由调用方统一处理）。 */
function serviceErrorResponse(error: unknown): Response {
  if (error instanceof InviteCodeError) {
    switch (error.code) {
      case "UNAVAILABLE":
        return unavailableResponse();
      case "EXPIRED":
        return errorResponse(new AppError("CONFLICT", "This invite code cannot be used now."), "INVITE_EXPIRED");
      case "FULL":
        return errorResponse(new AppError("CONFLICT", "This invite code cannot be used now."), "INVITE_FULL");
      case "OWN_CODE":
        return errorResponse(new AppError("CONFLICT", "This invite code cannot be used now."), "OWN_CODE");
      case "PROFILE_REQUIRED":
        return errorResponse(new AppError("CONFLICT", error.message), "PROFILE_REQUIRED");
      case "NOT_FOUND":
        return errorResponse(new AppError("NOT_FOUND", "Not found."));
      case "INVALID":
        return errorResponse(new AppError("VALIDATION_ERROR", error.message), "INVALID");
      case "IDEMPOTENCY_CONFLICT":
      case "CONFLICT":
        return errorResponse(new AppError("CONFLICT", error.message), error.code);
    }
  }
  console.error(JSON.stringify({ error: error instanceof Error ? error.name : "unknown", event: "invite_code_route_failed" }));
  return errorResponse(new AppError("INTERNAL_ERROR", SAFE_INTERNAL_ERROR_MESSAGE));
}

function isSampleRequest(request: Request, actorId: string): boolean {
  return actorId === DEMO_ACTOR_ID || request.headers.get(INVITE_SAMPLE_REQUEST_HEADER)?.trim() === "1";
}

async function readJson(request: Request): Promise<unknown> {
  return request.json().catch(() => undefined);
}

/** 日志里码只留前 2 位。 */
function codePrefix(code: string): string {
  return code.normalize("NFKC").replace(/[^0-9A-Za-z]/gu, "").toUpperCase().slice(0, 2);
}

export function createInviteCodeLiveHandlers(deps: InviteCodeLiveDeps = {}) {
  const resolveActor = deps.resolveActor ?? resolveAuthenticatedApiActor;
  const log = deps.log ?? ((line: string) => console.warn(line));
  const service = (): InviteCodeService | null => (deps.service !== undefined ? deps.service : getConfiguredInviteCodeRuntime()?.service ?? null);
  const limiter = (): InviteRateLimiter | null => (deps.limiter !== undefined ? deps.limiter : getConfiguredInviteRateLimiter());
  const unconfigured = () => errorResponse(new AppError("SERVICE_UNAVAILABLE", "Invite codes require a configured live database."), "INVITE_CODES_UNCONFIGURED");
  const rateUnconfigured = () => errorResponse(new AppError("SERVICE_UNAVAILABLE", "Invite codes require a configured rate-limit secret."), "INVITE_RATE_UNCONFIGURED");

  function authed(write: boolean, body: (input: { actorId: string; request: Request; params: Params; service: InviteCodeService }) => Promise<Response>): InviteRouteHandler {
    return async (request, context) => {
      const actor = await resolveActor();
      if (!actor) return authenticatedApiActorRequiredResponse("live");
      if (write && isSampleRequest(request, actor.id)) {
        return errorResponse(new AppError("FORBIDDEN", "SAMPLE_READ_ONLY: sample data cannot be saved."), "SAMPLE_READ_ONLY");
      }
      const resolved = service();
      if (!resolved) return unconfigured();
      try {
        return await body({ actorId: actor.id, params: (await context?.params) ?? {}, request, service: resolved });
      } catch (error) {
        return serviceErrorResponse(error);
      }
    };
  }

  return {
    /** POST /api/invite-codes */
    create: authed(true, async ({ actorId, request, service }) => {
      const parsed = inviteCodeCreateInputSchema.safeParse(await readJson(request));
      if (!parsed.success) return errorResponse(new AppError("VALIDATION_ERROR", "The request body is not valid."));
      return okResponse(inviteCodeSchema, await service.create(actorId, parsed.data), 201);
    }),
    /** GET /api/invite-codes（履历） */
    history: authed(false, async ({ actorId, service }) => okResponse(inviteCodeHistoryResponseSchema, await service.history(actorId))),
    /** GET /api/invite-codes/current */
    current: authed(false, async ({ actorId, service }) => okResponse(inviteCodeSchema.nullable(), await service.current(actorId))),
    /** POST /api/invite-codes/[code]/revoke（只能作废自己的码；别人的 / 不存在 404） */
    revoke: authed(true, async ({ actorId, params, service }) => okResponse(inviteCodeSchema, await service.revoke(actorId, params.code ?? ""))),
    /** GET /api/invite-codes/connections/[contactId] */
    connection: authed(false, async ({ actorId, params, service }) => okResponse(inviteConnectionViewSchema, await service.connection(actorId, params.contactId ?? ""))),
    /** PUT /api/invite-codes/connections/[contactId]/share */
    share: authed(true, async ({ actorId, params, request, service }) => {
      const parsed = inviteShareUpdateInputSchema.safeParse(await readJson(request));
      if (!parsed.success) return errorResponse(new AppError("VALIDATION_ERROR", "The request body is not valid."));
      return okResponse(inviteConnectionViewSchema, await service.updateShare(actorId, params.contactId ?? "", parsed.data));
    }),
    /** POST /api/invite-codes/connections/[contactId]/unlink（不通知对方） */
    unlink: authed(true, async ({ actorId, params, request, service }) => {
      const parsed = inviteUnlinkInputSchema.safeParse(await readJson(request));
      if (!parsed.success) return errorResponse(new AppError("VALIDATION_ERROR", "The request body is not valid."));
      return okResponse(inviteUnlinkResultSchema, await service.unlink(actorId, params.contactId ?? "", parsed.data));
    }),
    /** POST /api/invite-codes/connections/[contactId]/merge（复核 S1：所有者确认「同じ人」，只补空） */
    merge: authed(true, async ({ actorId, params, request, service }) => {
      const parsed = inviteMergeInputSchema.safeParse(await readJson(request));
      if (!parsed.success) return errorResponse(new AppError("VALIDATION_ERROR", "The request body is not valid."));
      return okResponse(inviteConnectionViewSchema, await service.mergeConnection(actorId, params.contactId ?? "", parsed.data));
    }),
    /** POST /api/invite-codes/connections/[contactId]/merge/dismiss（复核 S1：「別の人」，幂等） */
    dismissMerge: authed(true, async ({ actorId, params, request, service }) => {
      const parsed = inviteMergeInputSchema.safeParse(await readJson(request));
      if (!parsed.success) return errorResponse(new AppError("VALIDATION_ERROR", "The request body is not valid."));
      return okResponse(inviteConnectionViewSchema, await service.dismissMerge(actorId, params.contactId ?? "", parsed.data));
    }),

    /** GET /api/invite-codes/[code]/preview（公开；登录时多给 inviterAlreadyConnected / isOwnCode） */
    async preview(request: Request, context?: { params?: Promise<Params> }): Promise<Response> {
      const resolved = service();
      if (!resolved) return unconfigured();
      const rate = limiter();
      if (!rate) return rateUnconfigured();
      const code = ((await context?.params) ?? {}).code ?? "";
      const actor = await resolveActor().catch(() => null);
      const actorId = actor?.id ?? null;
      const ip = inviteClientIp(request.headers);
      const decision = await rate.checkPreview({ actorId, ip });
      if ("retryAfterSeconds" in decision) {
        log(JSON.stringify({ code: codePrefix(code), event: "invite_code_preview_limited", ip: rate.logSubject(ip) }));
        return unavailableResponse(decision.retryAfterSeconds);
      }
      try {
        return okResponse(inviteCodePreviewSchema, await resolved.preview(code, actorId));
      } catch (error) {
        if (error instanceof InviteCodeError && error.code === "UNAVAILABLE") {
          await rate.recordPreviewFailure({ actorId, ip });
          log(JSON.stringify({ code: codePrefix(code), event: "invite_code_preview_unavailable", ip: rate.logSubject(ip) }));
          return unavailableResponse();
        }
        return serviceErrorResponse(error);
      }
    },

    /** POST /api/invite-codes/[code]/redeem（要登录；失败同时计入 IP 失败桶） */
    redeem: authed(true, async ({ actorId, params, request, service }) => {
      const rate = limiter();
      if (!rate) return rateUnconfigured();
      const parsed = inviteCodeRedeemInputSchema.safeParse(await readJson(request));
      if (!parsed.success) return errorResponse(new AppError("VALIDATION_ERROR", "The request body is not valid."));
      const code = params.code ?? "";
      const ip = inviteClientIp(request.headers);
      const decision = await rate.checkRedeem({ actorId, ip });
      if ("retryAfterSeconds" in decision) {
        log(JSON.stringify({ code: codePrefix(code), event: "invite_code_redeem_limited", ip: rate.logSubject(ip) }));
        return unavailableResponse(decision.retryAfterSeconds);
      }
      try {
        return okResponse(inviteCodeRedeemResultSchema, await service.redeem(actorId, code, parsed.data));
      } catch (error) {
        if (error instanceof InviteCodeError && error.code === "UNAVAILABLE") {
          await rate.recordRedeemFailure({ actorId, ip });
          log(JSON.stringify({ code: codePrefix(code), event: "invite_code_redeem_unavailable", ip: rate.logSubject(ip) }));
          return unavailableResponse();
        }
        throw error;
      }
    }),
  };
}

/** 按模式分派：live 走真实实现，其余走 R08 演示世界。 */
export function inviteCodeRoute(mockHandler: InviteRouteHandler, liveHandler: (live: ReturnType<typeof createInviteCodeLiveHandlers>) => InviteRouteHandler): InviteRouteHandler {
  let live: ReturnType<typeof createInviteCodeLiveHandlers> | null = null;
  return async (request, context) => {
    if (redesignContractMode("invite-codes") !== "live") return mockHandler(request, context);
    live ??= createInviteCodeLiveHandlers();
    return liveHandler(live)(request, context);
  };
}

export const createInviteCode = inviteCodeRoute(mock.createInviteCode, (live) => live.create);
export const listInviteCodeHistory = inviteCodeRoute(mock.listInviteCodeHistory, (live) => live.history);
export const getCurrentInviteCode = inviteCodeRoute(mock.getCurrentInviteCode, (live) => live.current);
export const revokeInviteCode = inviteCodeRoute(mock.revokeInviteCode, (live) => live.revoke);
export const previewInviteCode = inviteCodeRoute(mock.previewInviteCode, (live) => live.preview);
export const redeemInviteCode = inviteCodeRoute(mock.redeemInviteCode, (live) => live.redeem);
export const getInviteConnection = inviteCodeRoute(mock.getInviteConnection, (live) => live.connection);
export const updateInviteShare = inviteCodeRoute(mock.updateInviteShare, (live) => live.share);
export const unlinkInviteConnection = inviteCodeRoute(mock.unlinkInviteConnection, (live) => live.unlink);
export const mergeInviteConnection = inviteCodeRoute(mock.mergeInviteConnection, (live) => live.merge);
export const dismissInviteMerge = inviteCodeRoute(mock.dismissInviteMerge, (live) => live.dismissMerge);
