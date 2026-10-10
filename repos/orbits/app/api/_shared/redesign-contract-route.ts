import { NextResponse } from "next/server";
import type { ZodType } from "zod";

import { failure, runtimeBoundaryHeaders, success } from "../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../shared/config/feature-mode";
import { AppError, getHttpStatusForAppErrorCode } from "../../../shared/errors/app-error";
import { resolveRedesignContract, type RedesignContractCapability } from "../../../features/redesign-contracts/service-factory";

// R08: one wrapper for the redesign contract routes. Mock (dev / tests) answers
// from the demo world; live — always in production — answers 503 with
// `reason: NOT_IMPLEMENTED` (the same shape the plan routes use), never fixtures.
// Responses are validated against the contract schema before they leave.
export type ContractReply = { data: unknown; status?: number } | { error: AppError; context?: Record<string, string> };
type Params = Record<string, string>;

export function redesignContractRoute<T>(capability: RedesignContractCapability, schema: ZodType<T> | null, handle: (request: Request, params: Params) => Promise<ContractReply> | ContractReply) {
  return async function route(request: Request, context?: { params?: Promise<Params> }): Promise<Response> {
    const mode = resolveFeatureMode();
    const headers = runtimeBoundaryHeaders(mode);
    const resolution = resolveRedesignContract(capability, mode);
    if (resolution.success === false) {
      return NextResponse.json(failure(new AppError("SERVICE_UNAVAILABLE", resolution.error.message), {
        capabilityId: resolution.error.capabilityId,
        reason: resolution.error.code,
        requestedMode: resolution.error.requestedMode,
      }), { headers, status: getHttpStatusForAppErrorCode("SERVICE_UNAVAILABLE") });
    }
    const reply = await handle(request, (await context?.params) ?? {});
    if ("error" in reply) return NextResponse.json(failure(reply.error, reply.context), { headers, status: getHttpStatusForAppErrorCode(reply.error.code) });
    const data = schema ? schema.parse(reply.data) : reply.data;
    return NextResponse.json(success(data), { headers, status: reply.status ?? 200 });
  };
}

/** Body parse that turns a schema failure into a 400. */
export async function readBody<T>(request: Request, schema: ZodType<T>): Promise<{ ok: true; value: T } | { ok: false; reply: ContractReply }> {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, reply: { error: new AppError("VALIDATION_ERROR", "The request body is not valid.") } };
}
