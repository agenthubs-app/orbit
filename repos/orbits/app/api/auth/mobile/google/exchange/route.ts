import { resolveMobileAuthService } from "../../../../../../features/auth/mobile-service-factory";
import { resolveFeatureMode } from "../../../../../../shared/config/feature-mode";
import {
  mobileAuthFailureResponse,
  mobileAuthSessionResponse,
} from "../../http";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const mode = resolveFeatureMode();
  const service = resolveMobileAuthService(mode, {
    origin: new URL(request.url).origin,
  });
  const body = (await request.json().catch(() => ({}))) as {
    code?: unknown;
    codeVerifier?: unknown;
    state?: unknown;
  };
  const result = await service.exchangeGoogleCode({
    code: typeof body.code === "string" ? body.code : "",
    codeVerifier:
      typeof body.codeVerifier === "string" ? body.codeVerifier : "",
    state: typeof body.state === "string" ? body.state : "",
  });

  if (result.success === false) {
    return mobileAuthFailureResponse(result, mode);
  }

  return mobileAuthSessionResponse(result.data, mode);
}
