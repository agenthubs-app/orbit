import { NextResponse } from "next/server";
import { auth } from "../../../../../auth";
import { ORBIT_INTEGRATION_PROVIDERS, type OrbitIntegrationProvider } from "../../../../../features/integrations/contract";
import { createIntegrationOAuthState } from "../../../../../features/integrations/oauth-state";
import { createConfiguredOrbitIntegrationService } from "../../../../../features/integrations/service-factory";
import { integrationSessionBinding } from "../../../../../features/integrations/session-binding";
import type { OrbitIntegrationService } from "../../../../../features/integrations/service";

interface Context {
  params: Promise<{ provider: string }>;
}

function provider(value: string): OrbitIntegrationProvider | null {
  return (ORBIT_INTEGRATION_PROVIDERS as readonly string[]).includes(value)
    ? (value as OrbitIntegrationProvider)
    : null;
}

export function createIntegrationAuthorizeGetHandler(options: {
  resolveSession?: () => Promise<{ user?: { id?: string; email?: string | null; name?: string | null } } | null>;
  service?: (input: { actorId: string }) => Pick<OrbitIntegrationService, "registerOAuthState" | "authorizationUrl"> | null;
  secret?: () => string | undefined;
} = {}) {
  return async function GET(
    request: Request,
    context: Context,
  ): Promise<Response> {
    const session = await (options.resolveSession ?? auth)();
    const sessionBinding = integrationSessionBinding(request);
    if (!session?.user?.id || !sessionBinding) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Sign in is required." } },
        { status: 401 },
      );
    }
    const params = await context.params;
    const selected = provider(params.provider);
    const secret = (options.secret?.() ?? process.env.ORBIT_INTEGRATION_STATE_SECRET)?.trim();
    const service = (options.service ?? createConfiguredOrbitIntegrationService)({
      actorId: session.user.id,
    });
    if (!selected || !secret || !service) {
      return NextResponse.json(
        {
          error: {
            code: "INTEGRATION_NOT_CONFIGURED",
            message: "Integration OAuth is not configured.",
          },
        },
        { status: 503 },
      );
    }
    const state = createIntegrationOAuthState({
      provider: selected,
      actorId: session.user.id,
      sessionBinding,
      secret,
      returnTo: new URL(request.url).searchParams.get("returnTo"),
    });
    const now = new Date();
    await service.registerOAuthState({
      provider: selected,
      actorId: session.user.id,
      sessionBinding,
      state,
      now: now.toISOString(),
      expiresAt: new Date(now.getTime() + 10 * 60_000).toISOString(),
    });
    const response = NextResponse.redirect(
      service.authorizationUrl({ provider: selected, state }),
    );
    response.cookies.set(`orbit-integration-state-${selected}`, state, {
      httpOnly: true,
      maxAge: 10 * 60,
      path: `/api/integrations/${selected}/callback`,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    return response;
  };
}

export const GET = createIntegrationAuthorizeGetHandler();
