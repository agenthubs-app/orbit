import { NextResponse } from "next/server";

import { resolveMobileAuthService } from "../../../../../../features/auth/mobile-service-factory";
import { runtimeBoundaryHeaders } from "../../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../../shared/config/feature-mode";
import { mobileAuthFailureResponse } from "../../http";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const mode = resolveFeatureMode();
  const service = resolveMobileAuthService(mode, { origin: url.origin });
  const result = await service.createBrokerRequest({
    codeChallenge: url.searchParams.get("code_challenge") ?? "",
    next: url.searchParams.get("next") ?? undefined,
    redirectUri: url.searchParams.get("redirect_uri") ?? "",
    state: url.searchParams.get("state") ?? "",
  });

  if (result.success === false) {
    return mobileAuthFailureResponse(result, mode);
  }

  const brokerUrl = new URL("/app/account/mobile-google", request.url);
  brokerUrl.searchParams.set("request", result.data.request);

  return NextResponse.redirect(brokerUrl, {
    headers: runtimeBoundaryHeaders(mode),
    status: 302,
  });
}
