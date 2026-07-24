import { NextResponse } from "next/server";

import { resolveMobileAuthService } from "../../../../../features/auth/mobile-service-factory";
import {
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { mobileAuthFailureResponse } from "../http";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const mode = resolveFeatureMode();
  const service = resolveMobileAuthService(mode, {
    origin: new URL(request.url).origin,
  });
  const body = (await request.json().catch(() => ({}))) as {
    email?: unknown;
    password?: unknown;
  };
  const result = await service.issueCredentialsSession({
    email: typeof body.email === "string" ? body.email : "",
    password: typeof body.password === "string" ? body.password : "",
  });

  if (result.success === false) {
    return mobileAuthFailureResponse(result, mode);
  }

  return NextResponse.json(success(result.data), {
    headers: runtimeBoundaryHeaders(mode),
  });
}
