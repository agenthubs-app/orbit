import { timingSafeEqual } from "node:crypto";
import { runConfiguredMaintenancePass } from "./configured";
import type { MaintenancePassResult } from "./pass";

// Same contract as the dispatch-scan entry points: CRON_SECRET bearer compared
// in constant time, at least 32 characters, no query parameters, aggregate-only
// body, 503 when any task failed so an external monitor can alert.

export interface MaintenanceRequestDependencies {
  run: () => Promise<MaintenancePassResult>;
}

const configuredDependencies: MaintenanceRequestDependencies = {
  run: () => runConfiguredMaintenancePass("maintenance-http"),
};

export async function handleMaintenanceRequest(
  request: Request,
  dependencies: MaintenanceRequestDependencies = configuredDependencies,
  secret = process.env.CRON_SECRET?.trim(),
): Promise<Response> {
  const supplied = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const headers = { "cache-control": "no-store" };
  if (!secret || secret.length < 32 || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return new Response(null, { status: 401, headers });
  if (new URL(request.url).searchParams.size > 0) {
    return Response.json({ error: { code: "MAINTENANCE_PARAMETERS_FORBIDDEN" } }, { status: 400, headers });
  }
  let pass: MaintenancePassResult;
  try {
    pass = await dependencies.run();
  } catch {
    return Response.json({ error: { code: "MAINTENANCE_UNAVAILABLE" } }, { status: 503, headers });
  }
  return Response.json({ data: { pass } }, { status: pass.failed > 0 ? 503 : 200, headers });
}
