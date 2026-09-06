import { randomUUID } from "node:crypto";
import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import { createPostgresLiveRecordStore, type LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import { createStorageNotificationDeliveryService } from "../notifications/delivery-service";
import { createConfiguredBusinessCardBatchService } from "./business-card-batch-service";
import { createBusinessCardBatchWorker } from "./business-card-batch-worker";
import { createConfiguredBusinessCardCloudOcrProvider } from "./business-card-ocr-provider-selection";
import { getConfiguredIngestV2 } from "./business-card-ingest-v2/configured";
import { createIngestV2Worker } from "./business-card-ingest-v2/worker";
import { createBusinessCardBatchImageStore } from "./storage/business-card-batch-image-store";
import type { CardPipeline } from "./business-card-queue-dispatch";

const NOTIFIED = "businessCardBatchReadyNotifications";
const READY_V1 = `
  b.workspace_id = $1 AND b.collection_name = 'businessCardBatches'
  AND b.lifecycle_state <> 'deleted' AND b.payload->'batch'->>'status' = 'ready_for_review'
  AND NOT EXISTS (SELECT 1 FROM orbit_records n WHERE n.workspace_id = b.workspace_id
    AND n.collection_name = '${NOTIFIED}' AND n.record_id = b.record_id AND n.lifecycle_state <> 'deleted')
`;

export class CardWorkPending extends Error {
  constructor(readonly afterSeconds: number) { super("Business-card work remains pending."); }
}

export async function hasPendingCardWork(client: LiveRecordSqlClient, workspaceId: string, pipeline: CardPipeline): Promise<boolean> {
  const sql = pipeline === "v1" ? `SELECT (
    EXISTS (SELECT 1 FROM orbit_records i JOIN orbit_records b
      ON b.workspace_id = i.workspace_id AND b.collection_name = 'businessCardBatches'
      AND b.record_id = i.payload->'item'->>'batchId'
      WHERE i.workspace_id = $1 AND i.collection_name = 'businessCardBatchItems'
        AND i.lifecycle_state <> 'deleted' AND b.lifecycle_state <> 'deleted'
        AND b.payload->'batch'->>'status' = 'processing'
        AND i.payload->'item'->>'status' IN ('pending', 'processing'))
    OR EXISTS (SELECT 1 FROM orbit_records b WHERE ${READY_V1})
  ) AS pending` : `SELECT (
    EXISTS (SELECT 1 FROM bc_ingest_items WHERE workspace_id = $1 AND status IN ('queued','processing'))
    OR EXISTS (SELECT 1 FROM bc_ingest_notifications WHERE workspace_id = $1 AND status = 'pending')
    OR EXISTS (SELECT 1 FROM bc_ingest_cleanup_tasks WHERE workspace_id = $1 AND status = 'pending')
  ) AS pending`;
  const result = await client.query<{ pending: boolean }>(sql, [workspaceId]);
  return result.rows[0]?.pending === true;
}

export async function processCardQueueTick(pipeline: CardPipeline, runtime: {
  run(): Promise<{ claimed: number }>;
  pending(): Promise<boolean>;
}): Promise<void> {
  try {
    const result = await runtime.run();
    const pending = await runtime.pending();
    console.info(JSON.stringify({ event: "business_card_execution_tick", pipeline, claimed: result.claimed, pending }));
    if (pending) throw new CardWorkPending(result.claimed > 0 ? 1 : 60);
  } catch (error) {
    if (error instanceof CardWorkPending) throw error;
    throw new Error("Business-card background execution unavailable.");
  }
}

export async function runConfiguredCardQueueTick(pipeline: CardPipeline): Promise<void> {
  const configured = createConfiguredPostgresLiveRecordStore();
  if (!configured) throw new Error("Business-card background storage unavailable.");
  const provider = createConfiguredBusinessCardCloudOcrProvider();
  const notify = async (actorId: string, batchId: string, generation?: number) => {
    // Account-level in-app delivery has no dependency on a push device.
    await createStorageNotificationDeliveryService({
      actorId, store: createPostgresLiveRecordStore({ client: configured.client }),
      sqlClient: configured.client, workspaceId: configured.workspaceId,
    }).materialize({
      body: "名片批次状态有更新，请回到导入中心查看最新进度。",
      channel: "in_app", data: { batchId, ingestVersion: pipeline }, phase: "commitment",
      scheduledFor: new Date().toISOString(),
      signalId: generation === undefined ? `signal:business-card-batch:${batchId}` : `signal:business-card-ingest-v2:${batchId}`,
      signalRevision: String(generation ?? 1), title: "名片批量识别有更新",
    });
    if (generation === undefined) {
      const now = new Date().toISOString();
      await configured.store.upsertRecord({
        workspaceId: configured.workspaceId, collectionName: NOTIFIED, recordId: batchId,
        userId: actorId, sourceType: "business_card", sourceId: batchId,
        evidenceIds: [], lifecycleState: "active", payload: { batchId }, createdAt: now, updatedAt: now,
      });
    }
  };
  if (pipeline === "v1") {
    const service = createConfiguredBusinessCardBatchService();
    if (!service) throw new Error("Business-card background storage unavailable.");
    const worker = createBusinessCardBatchWorker({
      service, imageStore: createBusinessCardBatchImageStore(), provider, concurrency: 1,
      notify: ({ actorId, batchId }) => notify(actorId, batchId),
    });
    await processCardQueueTick(pipeline, {
      async run() {
        const result = await worker.runOnce({ workerId: `vercel-card:${randomUUID()}`, now: new Date().toISOString() });
        // Retry materialization even when an earlier completion already changed
        // the batch to ready_for_review and its best-effort notify failed.
        const pending = await configured.client.query<{ batch_id: string; actor_id: string }>(`
          SELECT b.record_id AS batch_id, b.payload->'batch'->>'actorId' AS actor_id
          FROM orbit_records b WHERE ${READY_V1} ORDER BY b.created_at LIMIT 10
        `, [configured.workspaceId]);
        for (const row of pending.rows) await notify(row.actor_id, row.batch_id);
        return result;
      },
      pending: () => hasPendingCardWork(configured.client, configured.workspaceId, pipeline),
    });
  } else {
    const ingest = getConfiguredIngestV2();
    if (!ingest) throw new Error("Business-card background storage unavailable.");
    await ingest.ready;
    const worker = createIngestV2Worker({
      repository: ingest.repository, store: ingest.store, provider, concurrency: 1,
      notify: ({ actorId, batchId, reviewGeneration }) => notify(actorId, batchId, reviewGeneration),
    });
    await processCardQueueTick(pipeline, {
      run: () => worker.runOnce(),
      pending: () => hasPendingCardWork(configured.client, configured.workspaceId, pipeline),
    });
  }
}
