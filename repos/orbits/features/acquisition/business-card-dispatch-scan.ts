import type { LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import { enqueueCardBatch, type CardPipeline } from "./business-card-queue-dispatch";
import { hasPendingCardWork } from "./business-card-queue-worker";

export interface CardDispatchScanResult { examined: number; published: number; failed: number }

export async function redispatchPendingCardWork({
  client, workspaceId, publish = enqueueCardBatch,
}: {
  client: LiveRecordSqlClient;
  workspaceId: string;
  publish?: (pipeline: CardPipeline) => Promise<void>;
}): Promise<CardDispatchScanResult> {
  const result = { examined: 0, published: 0, failed: 0 };
  // Database state is authoritative. No publish marker is written: a crashed
  // or failed send must stay eligible for the next independent scheduled scan.
  for (const pipeline of ["v1", "v2"] as const) {
    result.examined++;
    try {
      if (!await hasPendingCardWork(client, workspaceId, pipeline)) continue;
      await publish(pipeline);
      result.published++;
    } catch {
      result.failed++;
    }
  }
  return result;
}
