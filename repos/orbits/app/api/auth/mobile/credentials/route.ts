import { authClientIp, authRateLimitedResponse, getAuthRateLimiter } from "../../../../../features/auth/auth-rate-limit";
import { resolveMobileAuthService } from "../../../../../features/auth/mobile-service-factory";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import {
  mobileAuthFailureResponse,
  mobileAuthSessionResponse,
} from "../http";

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
  const email = typeof body.email === "string" ? body.email : "";
  const limiter = await getAuthRateLimiter();
  const gate = await limiter.checkLogin({ ip: authClientIp(request.headers), email });
  if (gate.allowed === false) return authRateLimitedResponse(gate.retryAfterSeconds);
  const result = await service.issueCredentialsSession({
    email,
    password: typeof body.password === "string" ? body.password : "",
  });

  if (result.success === false) {
    if (result.error.appCode === "UNAUTHORIZED") await limiter.recordLoginFailure({ email, ip: authClientIp(request.headers) });
    return mobileAuthFailureResponse(result, mode);
  }

  return mobileAuthSessionResponse(result.data, mode);
}
