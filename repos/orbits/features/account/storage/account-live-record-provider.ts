import type { AccountDTO, UserProfileDTO } from "../../../shared/domain/contracts";
import type { OrbitLanguage } from "../../../shared/contract/language";
import { parseOrbitLanguage } from "../../../shared/i18n/orbit-language";
import {
  createConfiguredPostgresLiveRecordStore,
  type LiveRecordCustomRead,
} from "../../../shared/storage/configured-live-record-store";
import type { LiveDatabaseEnv } from "../../../shared/storage/live-database-config";
import type {
  LiveRecord,
  LiveRecordStoreLike,
} from "../../../shared/storage/live-record-store";
import { jsDateSafeTimestampSql } from "../../../shared/storage/postgres-js-date-sql";
import type { LiveRecordSqlClient } from "../../../shared/storage/postgres-live-record-store";

export interface LiveAccountProfileRecord extends UserProfileDTO {
  headline?: string;
  homeMarket?: string;
  preferredFollowUpWindow?: string;
  preferredLanguage?: OrbitLanguage;
  relationshipGoal?: string;
}

export interface LiveAccountSessionGraph {
  accounts: readonly AccountDTO[];
  evidenceIds: readonly string[];
  generatedAt: string;
  profiles: readonly LiveAccountProfileRecord[];
}

/**
 * What `resolveAuthenticatedApiActorIdentity` needs to map a session subject to
 * an account: valid profiles (id, owning account, display name) and valid
 * accounts (id). `LiveAccountSessionGraph` satisfies it structurally.
 */
export interface LiveAccountSessionIdentity {
  accounts: readonly Pick<AccountDTO, "id">[];
  profiles: readonly Pick<LiveAccountProfileRecord, "id" | "accountId" | "displayName">[];
}

export type LiveAccountSessionProviderResult<TResult> = TResult | Promise<TResult>;

export type LiveAccountSessionIdentityInput = { userId?: string | null; accountId?: string | null; profileId?: string | null };

export interface LiveAccountSessionProvider {
  source: string;
  sourceLabel: string;
  readAccountSessionGraph: (identity?: LiveAccountSessionIdentityInput) => LiveAccountSessionProviderResult<LiveAccountSessionGraph>;
  /**
   * Same statements, order, fallback and failure semantics as
   * `readAccountSessionGraph`, returning only the identity fields (W0030).
   * Optional: callers fall back to the full graph when a provider lacks it.
   */
  readAccountSessionIdentity?: (identity?: LiveAccountSessionIdentityInput) => LiveAccountSessionProviderResult<LiveAccountSessionIdentity>;
}

export const ACCOUNT_SESSION_LIVE_RECORD_COLLECTIONS = {
  accounts: "accounts",
  profiles: "profiles",
} as const;

// Exact inputs consumed by accountFromRecord/profileFromRecord. Imported
// documents, avatars and search indexes belong to profile/detail reads, not
// every request's persisted identity lookup. Row ownership/evidence is retained.
const ACCOUNT_SESSION_FIELDS = ["id", "name", "createdAt", "updatedAt"];
const PROFILE_SESSION_FIELDS = [
  "id", "accountId", "displayName", "role", "timezone", "headline", "homeMarket",
  "preferredFollowUpWindow", "preferredLanguage", "relationshipGoal", "createdAt", "updatedAt",
];

/**
 * Direct SQL for `readAccountSessionIdentity`. `read` must apply the same
 * read-budget gate and in-flight dedupe as `store` reads (the configured
 * store's `customRead`), and `client` must be the configured (metered) client.
 * Without it the provider maps its full graph read.
 */
export interface AccountSessionIdentitySql {
  client: LiveRecordSqlClient;
  read: LiveRecordCustomRead;
}

export interface StorageAccountSessionProviderOptions {
  identitySql?: AccountSessionIdentitySql;
  requireIdentity?: boolean;
  source?: string;
  sourceLabel?: string;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}

export interface ConfiguredStorageAccountSessionProviderOptions {
  env?: LiveDatabaseEnv;
  sourceLabel?: string;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function optionalString(value: unknown): string | undefined {
  return nonEmptyString(value) ? value : undefined;
}

function accountFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): AccountDTO | null {
  const payload = record.payload;

  if (
    !nonEmptyString(payload.id) ||
    !nonEmptyString(payload.name) ||
    !nonEmptyString(payload.createdAt) ||
    !nonEmptyString(payload.updatedAt)
  ) {
    return null;
  }

  return {
    id: payload.id,
    name: payload.name,
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
  };
}

function profileFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): LiveAccountProfileRecord | null {
  const payload = record.payload;

  if (
    !nonEmptyString(payload.id) ||
    !nonEmptyString(payload.accountId) ||
    !nonEmptyString(payload.displayName) ||
    !nonEmptyString(payload.createdAt) ||
    !nonEmptyString(payload.updatedAt)
  ) {
    return null;
  }

  return {
    id: payload.id,
    accountId: payload.accountId,
    displayName: payload.displayName,
    role: optionalString(payload.role),
    timezone: optionalString(payload.timezone),
    headline: optionalString(payload.headline),
    homeMarket: optionalString(payload.homeMarket),
    preferredFollowUpWindow: optionalString(payload.preferredFollowUpWindow),
    preferredLanguage: parseOrbitLanguage(
      typeof payload.preferredLanguage === "string"
        ? payload.preferredLanguage
        : null,
    ) ?? "zh",
    relationshipGoal: optionalString(payload.relationshipGoal),
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
  };
}

function latestTimestamp(
  records: readonly LiveRecord<Record<string, unknown>>[],
): string {
  return (
    records
      .map((record) => record.updatedAt)
      .filter(nonEmptyString)
      .sort()
      .at(-1) ?? new Date(0).toISOString()
  );
}

function evidenceIdsFor(
  records: readonly LiveRecord<Record<string, unknown>>[],
): readonly string[] {
  const ids = records.flatMap((record) => record.evidenceIds);

  return ids.length > 0 ? [...new Set(ids)] : ["evidence:account-live-store-empty"];
}

// Only what accountFromRecord/profileFromRecord validate and the resolver reads.
const ACCOUNT_IDENTITY_FIELDS = ["id", "name", "createdAt", "updatedAt"];
const PROFILE_IDENTITY_FIELDS = ["id", "accountId", "displayName", "createdAt", "updatedAt"];

// `rowToRecord` (the full read) throws on these rows, so the identity read
// must reject on them too (W30-3 A / D20):
//   * created_at / updated_at must parse to a valid JS Date;
//   * occurred_at / deleted_at may be null or ±infinity (read as null), but a
//     finite value outside the JS Date range makes `toISOString` throw.
const IDENTITY_ROW_READABLE = `(
        coalesce(${jsDateSafeTimestampSql("created_at")}, false)
        and coalesce(${jsDateSafeTimestampSql("updated_at")}, false)
        and not coalesce(isfinite(occurred_at) and not ${jsDateSafeTimestampSql("occurred_at")}, false)
        and not coalesce(isfinite(deleted_at) and not ${jsDateSafeTimestampSql("deleted_at")}, false)
      )`;

// Where clause, payload projection and order are those `listQuery` generates for
// the full read (same parameter order), so the same rows come back in the same
// order and non-object payloads fail the same way; only the returned columns differ.
function identitySql(lookupField: "id" | "accountId"): string {
  return `
      select
        (select coalesce(jsonb_object_agg(field.key, field.value), '{}'::jsonb)
          from jsonb_each(payload) field where field.key = any($4::text[])) as payload,
        ${IDENTITY_ROW_READABLE} as readable
      from orbit_records
      where workspace_id = $1 and payload ->> '${lookupField}' = $2 and collection_name = $3 and lifecycle_state <> 'deleted'
      order by coalesce(occurred_at, updated_at) desc, updated_at desc
    `;
}

const PROFILE_BY_ID_SQL = identitySql("id");
const PROFILE_BY_ACCOUNT_ID_SQL = identitySql("accountId");
const ACCOUNT_BY_ID_SQL = PROFILE_BY_ID_SQL;

interface IdentityRow {
  payload: Record<string, unknown>;
  readable: boolean;
}

function identityRecord(payload: Record<string, unknown>): LiveRecord<Record<string, unknown>> {
  return { payload } as LiveRecord<Record<string, unknown>>;
}

function accountIdentity(account: AccountDTO): Pick<AccountDTO, "id"> {
  return { id: account.id };
}

function profileIdentity(
  profile: Pick<LiveAccountProfileRecord, "id" | "accountId" | "displayName">,
): Pick<LiveAccountProfileRecord, "id" | "accountId" | "displayName"> {
  return { accountId: profile.accountId, displayName: profile.displayName, id: profile.id };
}

function identityFromGraph(graph: LiveAccountSessionGraph): LiveAccountSessionIdentity {
  return { accounts: graph.accounts.map(accountIdentity), profiles: graph.profiles.map(profileIdentity) };
}

function createIdentitySqlReader(
  { client, read }: AccountSessionIdentitySql,
  workspaceId: string,
) {
  return (
    collectionName: "accounts" | "profiles",
    lookupField: "id" | "accountId",
    value: string,
  ): Promise<Record<string, unknown>[]> => {
    const text = lookupField === "accountId"
      ? PROFILE_BY_ACCOUNT_ID_SQL
      : collectionName === "accounts" ? ACCOUNT_BY_ID_SQL : PROFILE_BY_ID_SQL;
    const fields = collectionName === "accounts" ? ACCOUNT_IDENTITY_FIELDS : PROFILE_IDENTITY_FIELDS;

    return read({
      collectionName,
      key: JSON.stringify(["account-session-identity", workspaceId, collectionName, lookupField, value]),
      read: async () => {
        const { rows } = await client.query<IdentityRow>(text, [workspaceId, value, collectionName, fields]);

        return rows.map((row) => {
          if (row.readable !== true) {
            throw new Error("orbit_records.created_at/updated_at is required");
          }
          return row.payload;
        });
      },
    });
  };
}

export function createStorageAccountSessionProvider({
  identitySql: identitySqlOption,
  requireIdentity = false,
  source,
  sourceLabel = "Account shared live storage",
  store,
  workspaceId,
}: StorageAccountSessionProviderOptions): LiveAccountSessionProvider {
  const readIdentityRows = identitySqlOption ? createIdentitySqlReader(identitySqlOption, workspaceId) : null;

  const provider: LiveAccountSessionProvider = {
    source: source ?? `live-record-store:account-session:${workspaceId}`,
    sourceLabel,
    async readAccountSessionIdentity(identity): Promise<LiveAccountSessionIdentity> {
      const subject = (identity?.profileId ?? identity?.userId ?? identity?.accountId)?.trim();
      if (!readIdentityRows || !subject) {
        // No SQL (memory stores, scripts, tests) or no subject: the full read
        // decides (it returns the empty identity-required graph without SQL).
        return identityFromGraph(await provider.readAccountSessionGraph(identity));
      }
      // Same statements and order as the full read: profiles by id, then by
      // accountId only when the first returned no raw rows (an invalid profile
      // hit by id still blocks the fallback), then every distinct raw accountId.
      let profilePayloads = await readIdentityRows("profiles", "id", subject);
      if (profilePayloads.length === 0) {
        profilePayloads = await readIdentityRows("profiles", "accountId", identity?.accountId ?? subject);
      }
      const ids = [...new Set(profilePayloads.map(payload => payload.accountId).filter(nonEmptyString))];
      const accountPayloads = (await Promise.all(ids.map(payloadId => readIdentityRows("accounts", "id", payloadId)))).flat();
      return {
        accounts: accountPayloads
          .map((payload) => accountFromRecord(identityRecord(payload)))
          .filter((item): item is AccountDTO => item !== null)
          .map(accountIdentity),
        profiles: profilePayloads
          .map((payload) => profileFromRecord(identityRecord(payload)))
          .filter((item): item is LiveAccountProfileRecord => item !== null)
          .map(profileIdentity),
      };
    },
    async readAccountSessionGraph(identity): Promise<LiveAccountSessionGraph> {
      const subject = (identity?.profileId ?? identity?.userId ?? identity?.accountId)?.trim();
      if (!subject && requireIdentity) {
        return { accounts: [], profiles: [], evidenceIds: ["evidence:account-identity-required"], generatedAt: new Date(0).toISOString() };
      }
      if (subject) {
        let profileRecords = await store.listRecords({
          limit: "unbounded",
          workspaceId,
          collectionName: ACCOUNT_SESSION_LIVE_RECORD_COLLECTIONS.profiles,
          payloadFields: PROFILE_SESSION_FIELDS,
          omitSearchText: true,
          payloadId: subject,
        });
        if (profileRecords.length === 0) {
          profileRecords = await store.listRecords({
            limit: "unbounded",
            workspaceId,
            collectionName: ACCOUNT_SESSION_LIVE_RECORD_COLLECTIONS.profiles,
            payloadFields: PROFILE_SESSION_FIELDS,
            omitSearchText: true,
            payloadAccountId: identity?.accountId ?? subject,
          });
        }
        const ids = [...new Set(profileRecords.map(record => record.payload.accountId).filter(nonEmptyString))];
        const accountRecords = (await Promise.all(ids.map(payloadId => store.listRecords({
          limit: "unbounded",
          workspaceId,
          collectionName: ACCOUNT_SESSION_LIVE_RECORD_COLLECTIONS.accounts,
          payloadFields: ACCOUNT_SESSION_FIELDS,
          omitSearchText: true,
          payloadId,
        })))).flat();
        const records = [...accountRecords, ...profileRecords];
        return {
          accounts: accountRecords.map(accountFromRecord).filter((item): item is AccountDTO => item !== null),
          profiles: profileRecords.map(profileFromRecord).filter((item): item is LiveAccountProfileRecord => item !== null),
          evidenceIds: evidenceIdsFor(records),
          generatedAt: latestTimestamp(records),
        };
      }
      const [accountRecords, profileRecords] = await Promise.all([
        store.listRecords({
          limit: "unbounded",
          workspaceId,
          collectionName: ACCOUNT_SESSION_LIVE_RECORD_COLLECTIONS.accounts,
          payloadFields: ACCOUNT_SESSION_FIELDS,
          omitSearchText: true,
        }),
        store.listRecords({
          limit: "unbounded",
          workspaceId,
          collectionName: ACCOUNT_SESSION_LIVE_RECORD_COLLECTIONS.profiles,
          payloadFields: PROFILE_SESSION_FIELDS,
          omitSearchText: true,
        }),
      ]);
      const records = [...accountRecords, ...profileRecords];

      return {
        accounts: accountRecords
          .map(accountFromRecord)
          .filter((account): account is AccountDTO => account !== null),
        evidenceIds: evidenceIdsFor(records),
        generatedAt: latestTimestamp(records),
        profiles: profileRecords
          .map(profileFromRecord)
          .filter(
            (profile): profile is LiveAccountProfileRecord => profile !== null,
          ),
      };
    },
  };

  return provider;
}

export function createConfiguredStorageAccountSessionProvider({
  env,
  sourceLabel = "Account Postgres live storage",
}: ConfiguredStorageAccountSessionProviderOptions = {}): LiveAccountSessionProvider | null {
  const configuredStore = createConfiguredPostgresLiveRecordStore({
    env,
  });

  if (!configuredStore) {
    return null;
  }

  return createStorageAccountSessionProvider({
    identitySql: { client: configuredStore.client, read: configuredStore.customRead },
    requireIdentity: true,
    source: `postgres-live-record-store:account-session:${configuredStore.workspaceId}`,
    sourceLabel,
    store: configuredStore.store,
    workspaceId: configuredStore.workspaceId,
  });
}
