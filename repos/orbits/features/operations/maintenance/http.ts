import { timingSafeEqual } from "node:crypto";
import { ensureConfiguredMaintenanceHeartbeat, runConfiguredMaintenancePass } from "./configured";
import type { EnsureMaintenanceHeartbeatResult } from "./heartbeat";
import type { MaintenancePassResult } from "./pass";

// Same contract as the dispatch-scan entry points: CRON_SECRET bearer compared
// in constant time, at least 32 characters, no query parameters, aggregate-only
// body, 503 when any task failed so an external monitor can alert.

export interface MaintenanceRequestDependencies {
  run: () => Promise<MaintenancePassResult>;
  ensureHeartbeat: () => Promise<EnsureMaintenanceHeartbeatResult | null>;
}

const configuredDependencies: MaintenanceRequestDependencies = {
  run: () => runConfiguredMaintenancePass("maintenance-http"),
  ensureHeartbeat: ensureConfiguredMaintenanceHeartbeat,
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
  // The heartbeat first: switched off, this is what parks a running chain, and it must not depend on the pass
  // succeeding (a throwing pass used to skip it and leave the chain running).
  let heartbeat: EnsureMaintenanceHeartbeatResult["outcome"] | "disabled" | "failed" = "disabled";
  try {
    heartbeat = (await dependencies.ensureHeartbeat())?.outcome ?? "disabled";
  } catch {
    heartbeat = "failed";
  }
  let pass: MaintenancePassResult;
  try {
    pass = await dependencies.run();
  } catch {
    return Response.json({ error: { code: "MAINTENANCE_UNAVAILABLE" } }, { status: 503, headers });
  }
  const status = pass.failed > 0 || heartbeat === "failed" ? 503 : 200;
  return Response.json({ data: { heartbeat, pass } }, { status, headers });
}
