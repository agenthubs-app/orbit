import { createHash } from "node:crypto";
import type { LiveRecordStoreLike } from "../../shared/storage/live-record-store";
import type { LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import type { OrbitIntegrationProvider } from "./contract";

interface OAuthStatePayload extends Record<string, unknown> {
  provider: OrbitIntegrationProvider;
  actorId: string;
  sessionBinding: string;
  stateHash: string;
  expiresAt: string;
  consumedAt?: string;
}

function stateHash(state: string): string {
  return createHash("sha256").update(state).digest("hex");
}

function stateRecordId(input: {
  workspaceId: string;
  actorId: string;
  stateHash: string;
}): string {
  const subject = createHash("sha256")
    .update(`${input.workspaceId}\u0000${input.actorId}\u0000${input.stateHash}`)
    .digest("base64url");
  return `oauth-state:${subject}`;
}

export interface IntegrationOAuthStateAtomicConsume {
  (input: {
    recordId: string;
    provider: OrbitIntegrationProvider;
    actorId: string;
    sessionBinding: string;
    stateHash: string;
    now: string;
  }): Promise<boolean>;
}

export interface IntegrationOAuthStateStore {
  register: (input: {
    provider: OrbitIntegrationProvider;
    actorId: string;
    sessionBinding: string;
    state: string;
    expiresAt: string;
    now: string;
  }) => Promise<void>;
  consume: (input: {
    provider: OrbitIntegrationProvider;
    actorId: string;
    sessionBinding: string;
    state: string;
    now: string;
  }) => Promise<boolean>;
}

const consumeQueues = new Map<string, Promise<void>>();

async function serial<TValue>(
  key: string,
  task: () => Promise<TValue>,
): Promise<TValue> {
  const previous = consumeQueues.get(key) ?? Promise.resolve();
  const current = previous.then(task, task);
  const tail = current.then(
    () => undefined,
    () => undefined,
  );
  consumeQueues.set(key, tail);
  try {
    return await current;
  } finally {
    if (consumeQueues.get(key) === tail) consumeQueues.delete(key);
  }
}

export function createPostgresIntegrationOAuthStateAtomicConsume(input: {
  client: LiveRecordSqlClient;
  workspaceId: string;
}): IntegrationOAuthStateAtomicConsume {
  return async (request) => {
    const result = await input.client.query<{ record_id: string }>(
      `
        update orbit_records
        set payload = payload || jsonb_build_object('consumedAt', $7::text),
          lifecycle_state = 'archived',
          updated_at = $7::timestamptz
        where workspace_id = $1
          and collection_name = 'integrationOAuthStates'
          and record_id = $2
          and user_id = $3
          and lifecycle_state = 'active'
          and payload->>'provider' = $4
          and payload->>'actorId' = $3
          and payload->>'sessionBinding' = $5
          and payload->>'stateHash' = $6
          and (payload->>'expiresAt')::timestamptz >= $7::timestamptz
        returning record_id
      `,
      [
        input.workspaceId,
        request.recordId,
        request.actorId,
        request.provider,
        request.sessionBinding,
        request.stateHash,
        request.now,
      ],
    );
    return result.rows.length === 1;
  };
}

export function createIntegrationOAuthStateStore(input: {
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
  userId: string;
  atomicConsume?: IntegrationOAuthStateAtomicConsume;
}): IntegrationOAuthStateStore {
  return {
    async register(request) {
      const hash = stateHash(request.state);
      if (request.actorId !== input.userId) {
        throw new Error(
          "OAuth state actor does not match the integration owner.",
        );
      }
      const recordId = stateRecordId({
        workspaceId: input.workspaceId,
        actorId: request.actorId,
        stateHash: hash,
      });
      await input.store.upsertRecord({
        workspaceId: input.workspaceId,
        collectionName: "integrationOAuthStates",
        recordId,
        userId: request.actorId,
        sourceType: "system",
        sourceId: `integration:${request.provider}`,
        sourceLabel: "Orbit integration one-time OAuth state",
        evidenceIds: [],
        targetType: "account",
        targetId: request.actorId,
        occurredAt: request.now,
        lifecycleState: "active",
        searchText: `${request.actorId} ${request.provider}`,
        payload: {
          provider: request.provider,
          actorId: request.actorId,
          sessionBinding: request.sessionBinding,
          stateHash: hash,
          expiresAt: request.expiresAt,
        },
        createdAt: request.now,
        updatedAt: request.now,
      });
    },
    async consume(request) {
      const hash = stateHash(request.state);
      if (request.actorId !== input.userId) return false;
      const recordId = stateRecordId({
        workspaceId: input.workspaceId,
        actorId: request.actorId,
        stateHash: hash,
      });
      if (input.atomicConsume) {
        return input.atomicConsume({
          recordId,
          provider: request.provider,
          actorId: request.actorId,
          sessionBinding: request.sessionBinding,
          stateHash: hash,
          now: request.now,
        });
      }
      return serial(`${input.workspaceId}\u0000${recordId}`, async () => {
        const record = await input.store.getRecord({
          workspaceId: input.workspaceId,
          collectionName: "integrationOAuthStates",
          recordId,
        });
        const payload = record?.payload;
        if (
          !record ||
          record.userId !== request.actorId ||
          !payload ||
          payload.provider !== request.provider ||
          payload.actorId !== request.actorId ||
          payload.sessionBinding !== request.sessionBinding ||
          payload.stateHash !== hash ||
          typeof payload.expiresAt !== "string" ||
          Date.parse(payload.expiresAt) < Date.parse(request.now) ||
          typeof payload.consumedAt === "string" ||
          record.lifecycleState !== "active"
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
      });
    },
  };
}
