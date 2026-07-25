import { createHash } from "node:crypto";
import type { LiveRecordStoreLike } from "../../shared/storage/live-record-store";
import type { OrbitIntegrationProvider } from "./contract";

interface OAuthStatePayload extends Record<string, unknown> {
  provider: OrbitIntegrationProvider;
  stateHash: string;
  expiresAt: string;
  consumedAt?: string;
}

function stateHash(state: string): string {
  return createHash("sha256").update(state).digest("hex");
}

export interface IntegrationOAuthStateStore {
  register: (input: {
    provider: OrbitIntegrationProvider;
    state: string;
    expiresAt: string;
    now: string;
  }) => Promise<void>;
  consume: (input: {
    provider: OrbitIntegrationProvider;
    state: string;
    now: string;
  }) => Promise<boolean>;
}

export function createIntegrationOAuthStateStore(input: {
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}): IntegrationOAuthStateStore {
  return {
    async register(request) {
      const hash = stateHash(request.state);
      await input.store.upsertRecord({
        workspaceId: input.workspaceId,
        collectionName: "integrationOAuthStates",
        recordId: `oauth-state:${hash}`,
        sourceType: "system",
        sourceId: `integration:${request.provider}`,
        sourceLabel: "Orbit integration one-time OAuth state",
        evidenceIds: [],
        targetType: "account",
        targetId: input.workspaceId,
        occurredAt: request.now,
        lifecycleState: "active",
        searchText: request.provider,
        payload: {
          provider: request.provider,
          stateHash: hash,
          expiresAt: request.expiresAt,
        },
        createdAt: request.now,
        updatedAt: request.now,
      });
    },
    async consume(request) {
      const hash = stateHash(request.state);
      const record = await input.store.getRecord({
        workspaceId: input.workspaceId,
        collectionName: "integrationOAuthStates",
        recordId: `oauth-state:${hash}`,
      });
      const payload = record?.payload;
      if (
        !record ||
        !payload ||
        payload.provider !== request.provider ||
        payload.stateHash !== hash ||
        typeof payload.expiresAt !== "string" ||
        Date.parse(payload.expiresAt) < Date.parse(request.now) ||
        typeof payload.consumedAt === "string"
      ) {
        return false;
      }
      await input.store.upsertRecord({
        ...record,
        payload: {
          ...payload,
          consumedAt: request.now,
        },
        lifecycleState: "archived",
        updatedAt: request.now,
      });
      return true;
    },
  };
}
