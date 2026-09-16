import { handleCallback } from "@vercel/queue";

import {
  getConfiguredEventOperationsCloudWorker,
  isEventOperationsQueueWake,
  runEventOperationsCloudTick,
} from "../../../../features/events/event-operations/cloud-worker";
import { bootstrapMaintenanceHeartbeat } from "../../../../features/operations/maintenance/configured";

export const maxDuration = 300;

// queue/v2beta makes this route private to Vercel's queue infrastructure. The
// database remains the source of truth; a message only wakes one bounded
// worker tick and is acknowledged after any continuation was durably queued.
const consume = handleCallback(async (message: unknown, metadata) => {
  if (!isEventOperationsQueueWake(message)) {
    console.warn(JSON.stringify({ event: "event_operations_queue_message_ignored" }));
    return;
  }

  const configured = getConfiguredEventOperationsCloudWorker();
  if (!configured) {
    throw new Error("Event operations cloud worker database is unavailable.");
  }
  if (message.workspaceId !== configured.workspaceId) {
    console.warn(JSON.stringify({
      event: "event_operations_queue_workspace_ignored",
      workspaceId: message.workspaceId,
    }));
    return;
  }

  const result = await runEventOperationsCloudTick({
    ready: configured.ready,
    worker: configured.worker,
    workspaceId: configured.workspaceId,
  });
  console.info(JSON.stringify({
    continuationEnqueued: result.continuationEnqueued,
    deliveryCount: metadata.deliveryCount,
    event: "event_operations_queue_tick",
    generationBatches: result.generationBatches,
    generationIds: result.generationIds,
    messageId: metadata.messageId,
    outboxCompleted: result.outboxCompleted,
    outboxFailed: result.outboxFailed,
    outboxRetried: result.outboxRetried,
    workClaimed: result.workClaimed,
  }));
  await bootstrapMaintenanceHeartbeat();
}, {
  retry: (_error, metadata) => ({
    afterSeconds: Math.min(300, 60 * 2 ** Math.min(4, Math.max(0, metadata.deliveryCount - 1))),
  }),
  visibilityTimeoutSeconds: 360,
});

export async function POST(request: Request): Promise<Response> {
  return consume(request);
}
