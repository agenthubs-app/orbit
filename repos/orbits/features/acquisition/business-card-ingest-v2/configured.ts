import { Pool } from "pg";

import { resolveLiveDatabaseConnectionConfig } from "../../../shared/storage/live-database-config";
import {
  createPrivateBlobDerivativeStore,
  usesPrivateBusinessCardBlob,
} from "../storage/business-card-private-blob-store";
import {
  createFilesystemDerivativeStore,
  resolveIngestDerivativeRootDir,
  type IngestDerivativeStore,
} from "./derivative-store";
import { runBusinessCardIngestV2Migrations } from "./migrations";
import { createNormalizationGate } from "./normalization";
import {
  createBusinessCardIngestRepository,
  type BusinessCardIngestRepository,
} from "./repository";

// 进程级单例装配。迁移在首次使用时以 advisory lock 幂等执行（也可用
// scripts/migrate-business-card-ingest-v2.ts 手动预跑）。

interface ConfiguredIngest {
  pool: Pool;
  repository: BusinessCardIngestRepository;
  store: IngestDerivativeStore;
  workspaceId: string;
  ready: Promise<void>;
}

const globalCache = globalThis as unknown as {
  __orbitIngestV2?: ConfiguredIngest | null;
};

export function getConfiguredIngestV2(): ConfiguredIngest | null {
  if (globalCache.__orbitIngestV2 !== undefined) {
    return globalCache.__orbitIngestV2;
  }
  const config = resolveLiveDatabaseConnectionConfig();
  if (!config) {
    globalCache.__orbitIngestV2 = null;
    return null;
  }
  const pool = new Pool({ connectionString: config.connectionString, max: 5 });
  const repository = createBusinessCardIngestRepository({
    pool,
    workspaceId: config.workspaceId,
  });
  const store = usesPrivateBusinessCardBlob()
    ? createPrivateBlobDerivativeStore({ workspaceId: config.workspaceId })
    : createFilesystemDerivativeStore({ rootDir: resolveIngestDerivativeRootDir() });
  const ready = (async () => {
    const client = await pool.connect();
    try {
      await runBusinessCardIngestV2Migrations(client);
    } finally {
      client.release();
    }
  })();
  globalCache.__orbitIngestV2 = {
    pool,
    repository,
    store,
    workspaceId: config.workspaceId,
    ready,
  };
  return globalCache.__orbitIngestV2;
}

export const ingestNormalizationGate = createNormalizationGate({ globalLimit: 3 });
