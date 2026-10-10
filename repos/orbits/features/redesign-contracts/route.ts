import { NextResponse } from "next/server";
import type { ZodType } from "zod";

import { failure, runtimeBoundaryHeaders, success } from "../../shared/api/envelope";
import { resolveFeatureMode, type FeatureMode } from "../../shared/config/feature-mode";
import { AppError, getHttpStatusForAppErrorCode, SAFE_INTERNAL_ERROR_MESSAGE } from "../../shared/errors/app-error";
import { resolveRedesignContract, type RedesignContractCapability } from "./service-factory";

// R08: one wrapper for the redesign contract routes. Mock (dev / tests) answers
// from the demo world; live — always in production — answers 503 with
// `reason: NOT_IMPLEMENTED` (the same shape the plan routes use), never fixtures.
// Responses are validated against the contract schema before they leave; a
// response that fails its own schema is a 500 in the envelope, never sent.
export type ContractReply = { data: unknown; status?: number } | { error: AppError; context?: Record<string, string> };
type Params = Record<string, string>;

/**
 * The mode for one capability. Outside production, `ORBIT_REDESIGN_MOCK` (a comma
 * list of capability ids, or `all`) turns the demo world on for just those
 * contracts while the rest of the app stays on its own mode — so a feature Sprint
 * can build on mock data against a local live database. Production is always live.
 */
export function redesignContractMode(capability: RedesignContractCapability): FeatureMode {
  const mode = resolveFeatureMode();
  if (mode === "live" && process.env.NODE_ENV !== "production") {
    const listed = (process.env.ORBIT_REDESIGN_MOCK ?? "").split(",").map((item) => item.trim());
    if (listed.includes("all") || listed.includes(capability)) return "mock";
  }
  return mode;
}

export function redesignContractRoute<T>(capability: RedesignContractCapability, schema: ZodType<T> | null, handle: (request: Request, params: Params) => Promise<ContractReply> | ContractReply) {
  return async function route(request: Request, context?: { params?: Promise<Params> }): Promise<Response> {
    const mode = redesignContractMode(capability);
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
    if (!schema) return NextResponse.json(success(reply.data), { headers, status: reply.status ?? 200 });
    const checked = schema.safeParse(reply.data);
    if (!checked.success) {
      console.error(`[redesign-contract] ${capability} response failed its schema`, checked.error.issues.slice(0, 5));
      return NextResponse.json(failure(new AppError("INTERNAL_ERROR", SAFE_INTERNAL_ERROR_MESSAGE)), { headers, status: 500 });
    }
    return NextResponse.json(success(checked.data), { headers, status: reply.status ?? 200 });
  };
}

/** Body parse that turns a schema failure into a 400. */
export async function readBody<T>(request: Request, schema: ZodType<T>): Promise<{ ok: true; value: T } | { ok: false; reply: ContractReply }> {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, reply: { error: new AppError("VALIDATION_ERROR", "The request body is not valid.") } };
}
