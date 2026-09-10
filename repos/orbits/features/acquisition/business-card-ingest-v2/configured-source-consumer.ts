import { enqueueCardBatch } from "../business-card-queue-dispatch";
import { getConfiguredCardUploadSources } from "../storage/business-card-upload-source-runtime";
import { getConfiguredIngestV2, ingestNormalizationGate } from "./configured";
import { createBusinessCardIngestRepository } from "./repository";
import { createIngestV2SourceConsumer } from "./source-consumer";

export async function getConfiguredIngestV2SourceConsumer() {
  const sources = await getConfiguredCardUploadSources();
  if (!sources) return null;
  const ingest = getConfiguredIngestV2();
  if (!ingest) return null;
  await ingest.ready;
  return createIngestV2SourceConsumer({
    sources: sources.repository, read: sources.read,
    // Use the base repository so no queue message escapes the outer transaction.
    repository: createBusinessCardIngestRepository({ pool: ingest.pool, workspaceId: ingest.workspaceId }),
    store: ingest.store, gate: ingestNormalizationGate, publish: () => enqueueCardBatch("v2"),
  });
}
