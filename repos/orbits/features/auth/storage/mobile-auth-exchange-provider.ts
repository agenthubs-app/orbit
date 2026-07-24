import { MOBILE_AUTH_CALLBACK_URI } from "../mobile-contract";
import type { MobileSessionUser } from "../mobile-contract";
import {
  createConfiguredPostgresLiveRecordStore,
} from "../../../shared/storage/configured-live-record-store";
import type { LiveDatabaseEnv } from "../../../shared/storage/live-database-config";
import type { LiveRecordStoreLike } from "../../../shared/storage/live-record-store";
import type { LiveRecordSqlClient } from "../../../shared/storage/postgres-live-record-store";

export const MOBILE_AUTH_EXCHANGE_COLLECTION = "mobile_auth_exchanges";

export interface MobileAuthExchangeRecord {
  codeHash: string;
  codeChallenge: string;
  encryptedCookieHeader: string;
  expiresAt: string;
  issuedAt: string;
  redirectUri: typeof MOBILE_AUTH_CALLBACK_URI;
  state: string;
  user: MobileSessionUser;
}

export interface MobileAuthExchangeProvider {
  save: (record: MobileAuthExchangeRecord) => Promise<void>;
  consume: (
    codeHash: string,
    now: Date,
  ) => Promise<MobileAuthExchangeRecord | null>;
}

interface CreatePostgresMobileAuthExchangeProviderOptions {
  client: LiveRecordSqlClient;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}

function recordId(codeHash: string): string {
  return `mobile_auth_exchange:${codeHash}`;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parsePayload(value: unknown): MobileAuthExchangeRecord | null {
  let payload = value;

  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload) as unknown;
    } catch {
      return null;
    }
  }

  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = payload as Record<string, unknown>;
  const user =
    candidate.user && typeof candidate.user === "object"
      ? (candidate.user as Record<string, unknown>)
      : null;

  if (
    !nonEmptyString(candidate.codeHash) ||
    !nonEmptyString(candidate.codeChallenge) ||
    !nonEmptyString(candidate.encryptedCookieHeader) ||
    !nonEmptyString(candidate.expiresAt) ||
    !nonEmptyString(candidate.issuedAt) ||
    candidate.redirectUri !== MOBILE_AUTH_CALLBACK_URI ||
    !nonEmptyString(candidate.state) ||
    !user ||
    !nonEmptyString(user.email) ||
    !nonEmptyString(user.id) ||
    !nonEmptyString(user.name)
  ) {
    return null;
  }

  return {
    codeChallenge: candidate.codeChallenge,
    codeHash: candidate.codeHash,
    encryptedCookieHeader: candidate.encryptedCookieHeader,
    expiresAt: candidate.expiresAt,
    issuedAt: candidate.issuedAt,
    redirectUri: MOBILE_AUTH_CALLBACK_URI,
    state: candidate.state,
    user: {
      email: user.email,
      id: user.id,
      name: user.name,
    },
  };
}

export function createMemoryMobileAuthExchangeProvider(): MobileAuthExchangeProvider {
  const records = new Map<string, MobileAuthExchangeRecord>();

  return {
    async save(record) {
      records.set(record.codeHash, structuredClone(record));
    },
    async consume(codeHash, now) {
      const record = records.get(codeHash);
      records.delete(codeHash);

      if (!record || Date.parse(record.expiresAt) <= now.getTime()) {
        return null;
      }

      return structuredClone(record);
    },
  };
}

export function createPostgresMobileAuthExchangeProvider({
  client,
  store,
  workspaceId,
}: CreatePostgresMobileAuthExchangeProviderOptions): MobileAuthExchangeProvider {
  return {
    async save(record) {
      await store.upsertRecord({
        collectionName: MOBILE_AUTH_EXCHANGE_COLLECTION,
        createdAt: record.issuedAt,
        evidenceIds: [],
        lifecycleState: "active",
        payload: {
          ...record,
          user: { ...record.user },
        },
        recordId: recordId(record.codeHash),
        searchText: "",
        sourceId: "mobile-auth",
        sourceLabel: "Orbit mobile auth exchange",
        sourceType: "system",
        updatedAt: record.issuedAt,
        workspaceId,
      });
    },
    async consume(codeHash, now) {
      const timestamp = now.toISOString();
      const result = await client.query<{ payload: unknown }>(
        `
          update orbit_records
          set lifecycle_state = 'deleted',
            deleted_at = $4,
            updated_at = $4
          where workspace_id = $1
            and collection_name = $2
            and record_id = $3
            and lifecycle_state = 'active'
            and (payload->>'expiresAt')::timestamptz > $4::timestamptz
          returning payload
        `,
        [
          workspaceId,
          MOBILE_AUTH_EXCHANGE_COLLECTION,
          recordId(codeHash),
          timestamp,
        ],
      );

      return result.rows[0] ? parsePayload(result.rows[0].payload) : null;
    },
  };
}

export function createConfiguredMobileAuthExchangeProvider(
  env?: LiveDatabaseEnv,
): MobileAuthExchangeProvider | null {
  const configured = createConfiguredPostgresLiveRecordStore({ env });

  if (!configured) {
    return null;
  }

  return createPostgresMobileAuthExchangeProvider({
    client: configured.client,
    store: configured.store,
    workspaceId: configured.workspaceId,
  });
}
