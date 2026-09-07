import type { createCardUploadSourceRepository } from "../storage/business-card-upload-sources";
import { persistNewBusinessCardBatch } from "../storage/business-card-new-batch";
import { createPostgresLiveRecordStore, type LiveRecordSqlClient } from "../../../shared/storage/postgres-live-record-store";
import type { createV1PreparationRepository } from "./repository";

export function createV1PreparationFinalizer({ workspaceId, jobs, sources, publish, prepareImages }: {
  workspaceId: string; jobs: ReturnType<typeof createV1PreparationRepository>;
  sources: ReturnType<typeof createCardUploadSourceRepository>; publish(): Promise<void>;
  /** Installs the V1 image-reference trigger before any target writes. */
  prepareImages(): Promise<void>;
}) {
  return async function finalize(actorId: string, jobId: string) {
    await prepareImages();
    const job = await jobs.get(actorId, jobId);
    if (job.state !== "ready" && job.state !== "completed") throw new Error("Preparation is not ready.");
    const claim = await sources.claim(actorId, job.sourceIds);
    if (claim.state === "consumed") {
      const completed = await jobs.get(actorId, jobId);
      if (claim.targetRef !== job.id || completed.state !== "completed" || completed.targetId !== job.id) throw new Error("Preparation receipt does not match.");
      await publish(); return job.id;
    }
    try {
      const receipt = await sources.consume({ actorId, ids: job.sourceIds, leaseKey: claim.leaseKey,
        writeTarget: (client) => jobs.complete({ client, actorId, jobId, sourceIds: job.sourceIds,
          async writeTarget(connection, ready) {
            const hash = (value: string) => createHash("sha256").update(value).digest("hex");
            const paths = ready.pages.map((page) => {
              if (page.imagePath !== `orbit-card-images/${hash(workspaceId)}/v1/${hash(ready.id)}/${hash(page.itemId)}.jpg`) {
                throw new Error("Preparation image scope does not match.");
              }
              return page.imagePath;
            });
            const intents = await connection.query(`SELECT object_key,state FROM bc_ingest_image_writes
              WHERE workspace_id=$1 AND pipeline='v1' AND object_key=ANY($2::text[]) ORDER BY object_key FOR UPDATE`, [workspaceId, paths]);
            if (intents.rows.length !== paths.length || intents.rows.some((row) => row.state !== "pending")) {
              throw new Error("Preparation image write is unavailable.");
            }
            const sql: LiveRecordSqlClient = { async query<TRow>(text: string, values?: readonly unknown[]) {
              const result = await connection.query(text, values ? [...values] : undefined); return { rows: result.rows as TRow[] };
            } };
            const store = createPostgresLiveRecordStore({ client: sql });
            if (await store.getRecord({ workspaceId, collectionName: "businessCardBatches", recordId: ready.id })) {
              throw new Error("Preparation target already exists.");
            }
            const time = await connection.query("SELECT clock_timestamp() AS time");
            await persistNewBusinessCardBatch({ store, workspaceId, batchId: ready.id, actorId,
              now: new Date(time.rows[0].time).toISOString(), totalItems: ready.pages.length,
              items: ready.pages.map((page) => ({ ...page, id: page.itemId })),
              sourceFiles: ready.sourceIds.map((id) => {
                const pages = ready.pages.filter((page) => page.sourceId === id);
                if (!pages.length) throw new Error("Preparation source has no pages.");
                return { fileName: pages[0].sourceFileName, kind: pages[0].sourcePage === null ? "image" : "pdf", itemCount: pages.length };
              }),
            });
            return ready.id;
          },
        }),
      });
      if (receipt !== job.id) throw new Error("Preparation receipt does not match.");
      await publish(); return receipt;
    } catch (error) {
      // A queue failure may follow a committed batch. The receipt handles that
      // retry; never delete images or undo the target on an uncertain result.
      await sources.release(actorId, job.sourceIds, claim.leaseKey).catch(() => {});
      throw error;
    }
  };
}
import { createHash } from "node:crypto";
