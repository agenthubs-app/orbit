import { NextResponse } from "next/server";

import { auth } from "../../../../../auth";
import {
  ORBIT_INTEGRATION_PROVIDERS,
  type OrbitIntegrationProvider,
} from "../../../../../features/integrations/contract";
import { createConfiguredOrbitIntegrationService } from "../../../../../features/integrations/service-factory";

interface Context {
  params: Promise<{ provider: string }>;
}

function asProvider(value: string): OrbitIntegrationProvider | null {
  return (ORBIT_INTEGRATION_PROVIDERS as readonly string[]).includes(value)
    ? (value as OrbitIntegrationProvider)
    : null;
}

export async function POST(
  _request: Request,
  context: Context,
): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Sign in is required." } },
      { status: 401 },
    );
  }
  const provider = asProvider((await context.params).provider);
  const service = createConfiguredOrbitIntegrationService({
    actorId: session.user.id,
  });
  if (!provider || !service) {
    return NextResponse.json(
      {
        error: {
          code: "INTEGRATION_NOT_CONFIGURED",
          message: "Integration health checks are not configured.",
        },
      },
      { status: 503 },
    );
  }
  return NextResponse.json({
    data: await service.checkHealth(provider),
  });
}
