import { del } from "@vercel/blob";
import { send } from "@vercel/queue";
import { getConfiguredIngestV2 } from "../business-card-ingest-v2/configured";
import type { CardPipeline, CardQueueWake } from "../business-card-queue-dispatch";
import { usesPrivateBusinessCardBlob } from "./business-card-private-blob-store";
import { createCardUploadSourceRepository } from "./business-card-upload-sources";
import { createCardUploadSourceReader } from "./business-card-upload-source-reader";

/** Shares the ingest database so target records can use the source transaction. */
export async function getConfiguredCardUploadSources() {
  if (!usesPrivateBusinessCardBlob()) return null;
  const ingest = getConfiguredIngestV2();
  if (!ingest) return null;
  await ingest.ready;
  const repository = createCardUploadSourceRepository({
    pool: ingest.pool, workspaceId: ingest.workspaceId,
    async wake(pipeline, delaySeconds) {
      await send("business-card-processing", { version: 1, pipeline } satisfies CardQueueWake, {
        delaySeconds, retentionSeconds: 7 * 24 * 60 * 60,
      });
    },
  });
  return {
    repository,
    read: createCardUploadSourceReader({ workspaceId: ingest.workspaceId }),
    // The repository validates the server-generated workspace/actor path and
    // commits its deletion fence before invoking the SDK.
    reap: (pipeline: CardPipeline) => repository.reap(pipeline, async (key) => { await del(key); }),
  };
}
