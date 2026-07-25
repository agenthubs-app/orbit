import { NextResponse } from "next/server";

import {
  ORBIT_INTEGRATION_PROVIDERS,
  type OrbitIntegrationProvider,
} from "../../../../features/integrations/contract";
import { createConfiguredOrbitIntegrationService } from "../../../../features/integrations/service-factory";

interface Context {
  params: Promise<{ provider: string }>;
}

function asProvider(value: string): OrbitIntegrationProvider | null {
  return (ORBIT_INTEGRATION_PROVIDERS as readonly string[]).includes(value)
    ? (value as OrbitIntegrationProvider)
    : null;
}

export async function DELETE(
  _request: Request,
  context: Context,
): Promise<Response> {
  const selected = asProvider((await context.params).provider);
  const service = createConfiguredOrbitIntegrationService();
  if (!selected || !service) {
    return NextResponse.json(
      {
        error: {
          code: "INTEGRATION_NOT_CONFIGURED",
          message: "Integration is not configured.",
        },
      },
      { status: 404 },
    );
  }
  await service.revoke(selected, new Date().toISOString());
  return NextResponse.json({ data: { provider: selected, status: "revoked" } });
}
