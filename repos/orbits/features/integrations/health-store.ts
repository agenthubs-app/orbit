import { createHash } from "node:crypto";

import type { LiveRecordStoreLike } from "../../shared/storage/live-record-store";
import type {
  IntegrationHealthRecord,
  OrbitIntegrationProvider,
} from "./contract";

export interface IntegrationHealthStore {
  get: (
    provider: OrbitIntegrationProvider,
  ) => Promise<IntegrationHealthRecord | null>;
  save: (record: IntegrationHealthRecord) => Promise<void>;
  remove: (
    provider: OrbitIntegrationProvider,
    now: string,
  ) => Promise<void>;
}

function healthRecordId(input: {
  workspaceId: string;
  userId: string;
  provider: OrbitIntegrationProvider;
}): string {
  const subject = createHash("sha256")
    .update(`${input.workspaceId}\u0000${input.userId}\u0000${input.provider}`)
    .digest("base64url");
  return `integration-health:${subject}`;
}

export function createMemoryIntegrationHealthStore(): IntegrationHealthStore {
  const records = new Map<OrbitIntegrationProvider, IntegrationHealthRecord>();
  return {
    async get(provider) {
      return records.get(provider) ?? null;
    },
    async save(record) {
      records.set(record.provider, { ...record });
    },
    async remove(provider) {
      records.delete(provider);
    },
  };
}

export function createIntegrationHealthStore(input: {
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
  userId: string;
}): IntegrationHealthStore {
  const recordId = (provider: OrbitIntegrationProvider) =>
    healthRecordId({
      workspaceId: input.workspaceId,
      userId: input.userId,
      provider,
    });

  return {
    async get(provider) {
      const record = await input.store.getRecord({
        workspaceId: input.workspaceId,
        collectionName: "integrationHealth",
        recordId: recordId(provider),
      });
      if (
        !record ||
        record.userId !== input.userId ||
        record.payload.provider !== provider ||
        (record.payload.status !== "healthy" &&
          record.payload.status !== "degraded")
      ) {
        return null;
      }
      const checkedAt =
        typeof record.payload.checkedAt === "string"
          ? record.payload.checkedAt
          : "";
      const message =
        typeof record.payload.message === "string"
          ? record.payload.message
          : "";
      const latencyMs =
        typeof record.payload.latencyMs === "number"
          ? record.payload.latencyMs
          : 0;
      return checkedAt && message
        ? {
            provider,
            status: record.payload.status,
            checkedAt,
            message,
            latencyMs,
          }
        : null;
    },
    async save(record) {
      await input.store.upsertRecord({
        workspaceId: input.workspaceId,
        collectionName: "integrationHealth",
        recordId: recordId(record.provider),
        userId: input.userId,
        sourceType: "system",
        sourceId: `integration:${record.provider}`,
        sourceLabel: "Orbit integration health check",
        evidenceIds: [],
        targetType: "account",
        targetId: input.userId,
        occurredAt: record.checkedAt,
        lifecycleState: "active",
        searchText: `${input.userId} ${record.provider} ${record.status}`,
        payload: { ...record },
        createdAt: record.checkedAt,
        updatedAt: record.checkedAt,
      });
    },
    async remove(provider, now) {
      await input.store.deleteRecord({
        workspaceId: input.workspaceId,
        collectionName: "integrationHealth",
        recordId: recordId(provider),
        deletedAt: now,
      });
    },
  };
}
