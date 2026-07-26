import { NextResponse } from "next/server";

import { auth } from "../../../auth";
import { ORBIT_INTEGRATION_PROVIDERS } from "../../../features/integrations/contract";
import { createConfiguredOrbitIntegrationService } from "../../../features/integrations/service-factory";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Sign in is required." } },
      { status: 401 },
    );
  }
  const service = createConfiguredOrbitIntegrationService({
    actorId: session.user.id,
  });
  if (!service) {
    return NextResponse.json({
      data: ORBIT_INTEGRATION_PROVIDERS.map((provider) => ({
        provider,
        status: "unavailable",
        scopes: [],
        capabilities: [],
        healthStatus: "unavailable",
        healthMessage: "Provider configuration is unavailable.",
      })),
    });
  }
  return NextResponse.json({
    data: await service.listAuthorizations(),
  });
}
