import { getConfiguredIngestV2 } from "../business-card-ingest-v2/configured";
import { createNormalizationGate } from "../business-card-ingest-v2/normalization";
import { getConfiguredCardUploadSources } from "../storage/business-card-upload-source-runtime";
import { createBusinessCardBatchImageStore } from "../storage/business-card-batch-image-store";
import { enqueueCardBatch } from "../business-card-queue-dispatch";
import { createV1PreparationRepository } from "./repository";
import { createV1PreparationFinalizer } from "./finalize";
import { createV1PreparationWorker } from "./worker";

// A PDF can hold 50 MiB of compressed source data plus parser state. Permit one
// V1 conversion per process, independently of the number of queued requests.
const gate = createNormalizationGate({ globalLimit: 1 });

export async function getConfiguredV1Preparation() {
  const sources = await getConfiguredCardUploadSources();
  if (!sources) return null;
  const ingest = getConfiguredIngestV2();
  if (!ingest) return null;
  await ingest.ready;
  const publish = () => enqueueCardBatch("v1");
  const jobs = createV1PreparationRepository({ pool: ingest.pool, workspaceId: ingest.workspaceId, wake: publish });
  const images = createBusinessCardBatchImageStore();
  const prepareImages = async () => {
    if (!images.prepareWrites) throw new Error("Preparation image journal is unavailable.");
    await images.prepareWrites();
  };
  const finalize = createV1PreparationFinalizer({ workspaceId: ingest.workspaceId, sources: sources.repository,
    jobs, publish, prepareImages });
  return { jobs, worker: createV1PreparationWorker({ jobs, sources: sources.repository, read: sources.read,
    images, finalize, gate }) };
}
