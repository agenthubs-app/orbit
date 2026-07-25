import { NextResponse } from "next/server";

import { ORBIT_INTEGRATION_PROVIDERS } from "../../../features/integrations/contract";
import { createConfiguredOrbitIntegrationService } from "../../../features/integrations/service-factory";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const service = createConfiguredOrbitIntegrationService();
  if (!service) {
    return NextResponse.json({
      data: ORBIT_INTEGRATION_PROVIDERS.map((provider) => ({
        provider,
        status: "unavailable",
        scopes: [],
      })),
    });
  }
  return NextResponse.json({
    data: await service.listAuthorizations(),
  });
}
