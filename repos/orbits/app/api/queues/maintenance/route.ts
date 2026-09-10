import { handleCallback } from "@vercel/queue";
import { processConfiguredMaintenanceHeartbeat } from "../../../../features/operations/maintenance/configured";
import { isMaintenanceHeartbeatMessage } from "../../../../features/operations/maintenance/heartbeat";

export const maxDuration = 300;

// queue/v2beta restricts invocation to Vercel queue infrastructure. Each tick
// is validated against the heartbeat row, so redeliveries and ticks from a
// superseded chain are dropped without running a second pass.
const consume = handleCallback(async (message: unknown) => {
  if (!isMaintenanceHeartbeatMessage(message)) return;
  try {
    const result = await processConfiguredMaintenanceHeartbeat(message);
    console.info(JSON.stringify({ event: "maintenance_heartbeat_tick", seq: message.seq, outcome: result.outcome }));
  } catch {
    throw new Error("Maintenance heartbeat execution unavailable.");
  }
}, {
  visibilityTimeoutSeconds: 360,
  retry: () => ({ afterSeconds: 60 }),
});

export async function POST(request: Request): Promise<Response> { return consume(request); }
