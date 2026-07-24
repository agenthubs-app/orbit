import { NextResponse } from "next/server";

import { resolveMobileAuthService } from "../../../../../features/auth/mobile-service-factory";
import {
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const mode = resolveFeatureMode();
  const service = resolveMobileAuthService(mode, {
    origin: new URL(request.url).origin,
  });

  return NextResponse.json(
    success({ providers: service.enabledProviders() }),
    { headers: runtimeBoundaryHeaders(mode) },
  );
}
