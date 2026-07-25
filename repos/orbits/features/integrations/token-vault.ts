import {
  createCipheriv,
  createHash,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import type { LiveRecordStoreLike } from "../../shared/storage/live-record-store";
import type {
  IntegrationToken,
  OrbitIntegrationProvider,
} from "./contract";

interface EncryptedTokenPayload extends Record<string, unknown> {
  algorithm: "aes-256-gcm";
  ciphertext: string;
  iv: string;
  tag: string;
}

function tokenRecordId(input: {
  workspaceId: string;
  userId: string;
  provider: OrbitIntegrationProvider;
}): string {
  const subject = createHash("sha256")
    .update(`${input.workspaceId}\u0000${input.userId}\u0000${input.provider}`)
    .digest("base64url");
  return `integration-token:${subject}`;
}

function encryptionKey(value: string): Buffer {
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) {
    throw new Error(
      "ORBIT_INTEGRATION_TOKEN_KEY must be a base64-encoded 32-byte key.",
    );
  }
  return key;
}

export interface IntegrationTokenVault {
  save: (
    provider: OrbitIntegrationProvider,
    token: IntegrationToken,
    now: string,
  ) => Promise<void>;
  get: (
    provider: OrbitIntegrationProvider,
  ) => Promise<IntegrationToken | null>;
  revoke: (provider: OrbitIntegrationProvider, now: string) => Promise<void>;
}

export function createEncryptedIntegrationTokenVault(input: {
  encryptionKeyBase64: string;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
  userId: string;
}): IntegrationTokenVault {
  const key = encryptionKey(input.encryptionKeyBase64);
  const recordId = (provider: OrbitIntegrationProvider) =>
    tokenRecordId({
      workspaceId: input.workspaceId,
      userId: input.userId,
      provider,
    });

  return {
    async save(provider, token, now) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const ciphertext = Buffer.concat([
        cipher.update(JSON.stringify(token), "utf8"),
        cipher.final(),
      ]);
      const payload: EncryptedTokenPayload = {
        algorithm: "aes-256-gcm",
        ciphertext: ciphertext.toString("base64"),
        iv: iv.toString("base64"),
        tag: cipher.getAuthTag().toString("base64"),
      };
      await input.store.upsertRecord({
        workspaceId: input.workspaceId,
        collectionName: "integrationTokens",
        recordId: recordId(provider),
        userId: input.userId,
        sourceType: "system",
        sourceId: `integration:${provider}`,
        sourceLabel: "Encrypted Orbit integration token",
        evidenceIds: [],
        targetType: "account",
        targetId: input.userId,
        occurredAt: now,
        lifecycleState: "active",
        searchText: `${input.userId} ${provider}`,
        payload,
        createdAt: now,
        updatedAt: now,
      });
    },
    async get(provider) {
      const record = await input.store.getRecord({
        workspaceId: input.workspaceId,
        collectionName: "integrationTokens",
        recordId: recordId(provider),
      });
      if (
        !record ||
        record.userId !== input.userId ||
        record.payload.algorithm !== "aes-256-gcm"
      ) {
        return null;
      }
      const iv = Buffer.from(String(record.payload.iv), "base64");
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(Buffer.from(String(record.payload.tag), "base64"));
      const plaintext = Buffer.concat([
        decipher.update(
          Buffer.from(String(record.payload.ciphertext), "base64"),
        ),
        decipher.final(),
      ]).toString("utf8");
      return JSON.parse(plaintext) as IntegrationToken;
    },
    async revoke(provider, now) {
      await input.store.deleteRecord({
        workspaceId: input.workspaceId,
        collectionName: "integrationTokens",
        recordId: recordId(provider),
        deletedAt: now,
      });
    },
  };
}
