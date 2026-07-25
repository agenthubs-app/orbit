import { NextResponse } from "next/server";
import { auth } from "../../../../../auth";
import { ORBIT_INTEGRATION_PROVIDERS, type OrbitIntegrationProvider } from "../../../../../features/integrations/contract";
import { verifyIntegrationOAuthState } from "../../../../../features/integrations/oauth-state";
import { createConfiguredOrbitIntegrationService } from "../../../../../features/integrations/service-factory";
import { integrationSessionBinding } from "../../../../../features/integrations/session-binding";

interface Context {
  params: Promise<{ provider: string }>;
}

function provider(value: string): OrbitIntegrationProvider | null {
  return (ORBIT_INTEGRATION_PROVIDERS as readonly string[]).includes(value)
    ? (value as OrbitIntegrationProvider)
    : null;
}

export async function GET(
  request: Request,
  context: Context,
): Promise<Response> {
  const session = await auth();
  const sessionBinding = integrationSessionBinding(request);
  if (!session?.user?.id || !sessionBinding) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Sign in is required." } },
      { status: 401 },
    );
  }
  const params = await context.params;
  const selected = provider(params.provider);
  const search = new URL(request.url).searchParams;
  const code = search.get("code");
  const state = search.get("state");
  const stateCookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((value) => value.trim())
    .find((value) =>
      value.startsWith(`orbit-integration-state-${selected ?? ""}=`),
    )
    ?.split("=")
    .slice(1)
    .join("=");
  const secret = process.env.ORBIT_INTEGRATION_STATE_SECRET?.trim();
  const service = createConfiguredOrbitIntegrationService({
    actorId: session.user.id,
  });
  if (
    !selected ||
    !code ||
    !state ||
    !stateCookie ||
    stateCookie !== state ||
    !secret ||
    !service ||
    !verifyIntegrationOAuthState({
      state,
      provider: selected,
      actorId: session.user.id,
      sessionBinding,
      secret,
    })
  ) {
    return NextResponse.json(
      {
        error: {
          code: "INTEGRATION_OAUTH_INVALID",
          message: "OAuth callback is invalid or expired.",
        },
      },
      { status: 400 },
    );
  }
  const now = new Date().toISOString();
  if (
    !(await service.consumeOAuthState({
      provider: selected,
      actorId: session.user.id,
      sessionBinding,
      state,
      now,
    }))
  ) {
    return NextResponse.json(
      {
        error: {
          code: "INTEGRATION_OAUTH_REPLAYED",
          message: "OAuth callback state was already used or is no longer valid.",
        },
      },
      { status: 400 },
    );
  }
  try {
    await service.exchangeCode({
      provider: selected,
      code,
      now,
    });
    const response = NextResponse.redirect(
      new URL("/app/contacts/all-actions?integration=connected", request.url),
    );
    response.cookies.set(`orbit-integration-state-${selected}`, "", {
      httpOnly: true,
      maxAge: 0,
      path: `/api/integrations/${selected}/callback`,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "INTEGRATION_OAUTH_FAILED",
          message:
            error instanceof Error ? error.message : "OAuth exchange failed.",
        },
      },
      { status: 502 },
    );
  }
}
