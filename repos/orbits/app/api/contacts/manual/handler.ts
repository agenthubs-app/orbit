/**
 * R12 手入力の接口（DESIGN §2.3、§4.1）。每个 `app/api/contacts/manual/**` 的 route.ts 只 re-export 这里的函数。
 *
 * - 都要登录（未登录 401）；不在 `proxy.ts` 的公开白名单里。
 * - live：服务 = `createConfiguredManualContactV2Service()`（库未配置 → 503）；mock / hybrid：进程内存储。
 * - 请求体严格（`shared/api-schema/manual-contact.ts`），响应先过契约 schema 再发出。
 * - 示例模式拦写：演示账号（`DEMO_ACTOR_ID`），或请求带 `x-orbit-sample: 1`（示例画面发出的请求），写接口一律 403 `SAMPLE_READ_ONLY`，
 *   不碰存储。界面侧的 `guardWrite` 本来就不发请求，这里是服务端的兜底。
 */
import { NextResponse } from "next/server";
import type { ZodType } from "zod";

import {
  manualContactCreateInputSchema,
  manualContactCreateResultSchema,
  manualContactDuplicateCheckInputSchema,
  manualContactDuplicateCheckResultSchema,
  manualContactOrganizationSuggestionsResultSchema,
  manualContactUndoResultSchema,
} from "../../../../shared/api-schema/manual-contact";
import { failure, runtimeBoundaryHeaders, success } from "../../../../shared/api/envelope";
import { resolveFeatureMode, type FeatureMode } from "../../../../shared/config/feature-mode";
import { AppError, getHttpStatusForAppErrorCode, SAFE_INTERNAL_ERROR_MESSAGE } from "../../../../shared/errors/app-error";
import { DEMO_ACTOR_ID } from "../../../../shared/mock/demo-world/fixtures";
import {
  createConfiguredManualContactV2Service,
  getMockManualContactV2Service,
} from "../../../../features/contacts/manual-contact-v2/configured";
import { ManualContactV2Error, type ManualContactV2Service } from "../../../../features/contacts/manual-contact-v2/service";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../../_shared/authenticated-actor";

export const SAMPLE_REQUEST_HEADER = "x-orbit-sample";

export interface ManualContactHandlerDeps {
  resolveActor?: ResolveAuthenticatedApiActor;
  /** 测试注入；null = 服务不可用（503）。缺省按模式取。 */
  service?: ManualContactV2Service | null;
  mode?: FeatureMode;
}

type Reply = { data: unknown; schema: ZodType<unknown>; status?: number } | { error: AppError; reason?: string };

function resolveService(deps: ManualContactHandlerDeps, mode: FeatureMode): ManualContactV2Service | null {
  if (deps.service !== undefined) return deps.service;
  return mode === "live" ? createConfiguredManualContactV2Service() : getMockManualContactV2Service();
}

function isSampleRequest(request: Request, actorId: string): boolean {
  return actorId === DEMO_ACTOR_ID || request.headers.get(SAMPLE_REQUEST_HEADER)?.trim() === "1";
}

function errorReply(error: unknown): Reply {
  if (error instanceof ManualContactV2Error) {
    switch (error.code) {
      case "INVALID":
        return { error: new AppError("VALIDATION_ERROR", error.message), reason: error.code };
      case "NOT_FOUND":
        return { error: new AppError("NOT_FOUND", error.message), reason: error.code };
      case "UNDO_EXPIRED":
      case "IDEMPOTENCY_CONFLICT":
      case "CONFLICT":
        return { error: new AppError("CONFLICT", `${error.code}: ${error.message}`), reason: error.code };
    }
  }
  throw error;
}

function run(
  deps: ManualContactHandlerDeps,
  options: { write: boolean },
  body: (input: { actorId: string; request: Request; service: ManualContactV2Service; params: Record<string, string> }) => Promise<Reply>,
) {
  return async function handler(request: Request, context?: { params?: Promise<Record<string, string>> }): Promise<Response> {
    const mode = deps.mode ?? resolveFeatureMode(process.env.ORBIT_MODULE_MODE ?? process.env.ORBIT_FEATURE_MODE);
    const headers = runtimeBoundaryHeaders(mode);
    const actor = await (deps.resolveActor ?? resolveAuthenticatedApiActor)();
    if (!actor) return authenticatedApiActorRequiredResponse(mode);
    if (options.write && isSampleRequest(request, actor.id)) {
      return NextResponse.json(failure(new AppError("FORBIDDEN", "SAMPLE_READ_ONLY: sample data cannot be saved."), { reason: "SAMPLE_READ_ONLY" }), { headers, status: 403 });
    }
    const service = resolveService(deps, mode);
    if (!service) {
      return NextResponse.json(failure(new AppError("SERVICE_UNAVAILABLE", "Manual contact entry requires a configured live database."), { reason: "MANUAL_CONTACT_UNCONFIGURED" }), { headers, status: 503 });
    }
    let reply: Reply;
    try {
      reply = await body({ actorId: actor.id, params: (await context?.params) ?? {}, request, service });
    } catch (error) {
      try {
        reply = errorReply(error);
      } catch {
        console.error(JSON.stringify({ error: error instanceof Error ? error.name : "unknown", event: "manual_contact_route_failed" }));
        return NextResponse.json(failure(new AppError("INTERNAL_ERROR", SAFE_INTERNAL_ERROR_MESSAGE)), { headers, status: 500 });
      }
    }
    if ("error" in reply) {
      return NextResponse.json(failure(reply.error, reply.reason ? { reason: reply.reason } : undefined), { headers, status: getHttpStatusForAppErrorCode(reply.error.code) });
    }
    const checked = reply.schema.safeParse(reply.data);
    if (!checked.success) {
      console.error(JSON.stringify({ event: "manual_contact_response_schema_failed" }));
      return NextResponse.json(failure(new AppError("INTERNAL_ERROR", SAFE_INTERNAL_ERROR_MESSAGE)), { headers, status: 500 });
    }
    return NextResponse.json(success(checked.data), { headers, status: reply.status ?? 200 });
  };
}

async function readJson(request: Request): Promise<unknown> {
  return request.json().catch(() => undefined);
}

function invalid(message: string): Reply {
  return { error: new AppError("VALIDATION_ERROR", message), reason: "INVALID" };
}

/** POST /api/contacts/manual */
export function createManualContactCreateHandler(deps: ManualContactHandlerDeps = {}) {
  return run(deps, { write: true }, async ({ actorId, request, service }) => {
    const parsed = manualContactCreateInputSchema.safeParse(await readJson(request));
    if (!parsed.success) return invalid("The manual contact input is invalid.");
    const result = await service.create(actorId, parsed.data);
    return { data: result, schema: manualContactCreateResultSchema, status: result.outcome === "created" ? 201 : 200 };
  });
}

/** POST /api/contacts/manual/duplicates（只读） */
export function createManualContactDuplicatesHandler(deps: ManualContactHandlerDeps = {}) {
  return run(deps, { write: false }, async ({ actorId, request, service }) => {
    const parsed = manualContactDuplicateCheckInputSchema.safeParse(await readJson(request));
    if (!parsed.success) return invalid("The duplicate check input is invalid.");
    return { data: await service.checkDuplicates(actorId, parsed.data), schema: manualContactDuplicateCheckResultSchema };
  });
}

/** GET /api/contacts/manual/organizations?q= */
export function createManualContactOrganizationsHandler(deps: ManualContactHandlerDeps = {}) {
  return run(deps, { write: false }, async ({ actorId, request, service }) => {
    const query = (new URL(request.url).searchParams.get("q") ?? "").slice(0, 200);
    return { data: await service.suggestOrganizations(actorId, query), schema: manualContactOrganizationSuggestionsResultSchema };
  });
}

/** POST /api/contacts/manual/[contactId]/undo */
export function createManualContactUndoHandler(deps: ManualContactHandlerDeps = {}) {
  return run(deps, { write: true }, async ({ actorId, params, service }) => {
    const contactId = (params.contactId ?? "").trim();
    if (!contactId || contactId.length > 512) return invalid("contactId is required.");
    return { data: await service.undo(actorId, contactId), schema: manualContactUndoResultSchema };
  });
}
