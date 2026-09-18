import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { userInfo } from "node:os";
import test from "node:test";
import { Pool } from "pg";

import { createLiveProfileService } from "../../features/profile/live-service";
import {
  createConfiguredStorageProfileProvider,
  createStorageProfileProvider,
  createTransactionalStorageProfileProvider,
} from "../../features/profile/storage/profile-live-record-provider";
import {
  createTransactionalPostgresClient,
  type TransactionalPostgresClient,
} from "../../shared/storage/transactional-postgres";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import type { LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";

const socket = process.env.ORBIT_PROFILE_TEST_SOCKET_DIR;
const skip = socket
  ? false
  : "Disposable profile test PostgreSQL socket is not configured";
if (socket && !/^\/tmp\/orbit-profile-cas\.[A-Za-z0-9]+$/.test(socket)) {
  throw new Error("Use a disposable profile test cluster socket");
}

const profileTime = "2026-09-17T00:00:00.000Z";

function schemaIdentifier(): string {
  return `w1_profile_read_${randomUUID().replaceAll("-", "")}`;
}

function rawRecord(input: {
  workspaceId: string;
  collectionName: "accounts" | "profiles";
  recordId: string;
  userId?: string | null;
  payload: unknown;
  createdAt?: string;
  updatedAt?: string;
  occurredAt?: string | null;
  lifecycleState?: "active" | "archived" | "deleted";
  evidenceIds?: readonly string[] | null;
}) {
  return {
    workspaceId: input.workspaceId,
    collectionName: input.collectionName,
    recordId: input.recordId,
    userId: input.userId ?? null,
    sourceType: "manual",
    sourceId: `source:${input.recordId}`,
    sourceLabel: "Profile actor reader parity",
    provider: "profile-reader-test",
    providerRecordId: input.recordId,
    evidenceIds: input.evidenceIds ?? [],
    targetType: "profile",
    targetId: input.recordId,
    occurredAt: input.occurredAt ?? null,
    lifecycleState: input.lifecycleState ?? "active",
    searchText: "",
    payload: input.payload,
    createdAt: input.createdAt ?? profileTime,
    updatedAt: input.updatedAt ?? profileTime,
    deletedAt: null,
  };
}

async function insertRaw(
  client: TransactionalPostgresClient,
  record: ReturnType<typeof rawRecord>,
): Promise<void> {
  await client.query(
    `insert into orbit_records (
      workspace_id, collection_name, record_id, user_id,
      source_type, source_id, source_label, provider, provider_record_id,
      evidence_ids, target_type, target_id, occurred_at, lifecycle_state,
      search_text, payload, created_at, updated_at, deleted_at
    ) values (
      $1, $2, $3, $4, $5, $6, $7, $8, $9,
      $10, $11, $12, $13, $14, $15, $16::jsonb, $17, $18, $19
    )`,
    [
      record.workspaceId,
      record.collectionName,
      record.recordId,
      record.userId,
      record.sourceType,
      record.sourceId,
      record.sourceLabel,
      record.provider,
      record.providerRecordId,
      record.evidenceIds,
      record.targetType,
      record.targetId,
      record.occurredAt,
      record.lifecycleState,
      record.searchText,
      JSON.stringify(record.payload),
      record.createdAt,
      record.updatedAt,
      record.deletedAt,
    ],
  );
}

async function fixture(t: { after(callback: () => Promise<void>): void }) {
  const schema = schemaIdentifier();
  const admin = new Pool({
    host: socket,
    database: "postgres",
    user: userInfo().username,
    max: 1,
  });
  await admin.query(`create schema ${schema}`);
  await admin.end();

  const pool = new Pool({
    host: socket,
    database: "postgres",
    user: userInfo().username,
    max: 4,
    options: `-c search_path=${schema},public`,
  });
  const client = createTransactionalPostgresClient({
    connectionString: "postgres://disposable-profile-reader.invalid/postgres",
    pool,
  });
  t.after(async () => {
    await client.close();
    const cleanup = new Pool({
      host: socket,
      database: "postgres",
      user: userInfo().username,
      max: 1,
    });
    await cleanup.query(`drop schema if exists ${schema} cascade`);
    await cleanup.end();
  });

  await client.query(ORBIT_RECORDS_SCHEMA_SQL);
  const workspaceId = `profile-reader:${randomUUID()}`;

  return { client, schema, workspaceId };
}

async function actorReader(client: LiveRecordSqlClient, workspaceId: string) {
  const module = await import("../../features/profile/storage/profile-actor-postgres-reader");
  return module.createProfileActorPostgresReader({ client, workspaceId });
}

function validAccount(actorId: string, name = "Parity account") {
  return {
    id: actorId,
    name,
    createdAt: profileTime,
    updatedAt: profileTime,
  };
}

function validProfile(actorId: string, displayName = "Parity profile") {
  return {
    id: `profile:${actorId}`,
    accountId: actorId,
    displayName,
    birthDate: null,
    role: "Founder",
    timezone: "Asia/Tokyo",
    headline: "Parity headline",
    handles: { email: `${actorId}@example.test` },
    homeMarket: "Tokyo",
    organization: "Orbit",
    preferredFollowUpWindow: "48 hours",
    preferredIntroChannels: ["email"],
    preferredLanguage: "en",
    relationshipGoal: "Learn",
    targetRelationshipTypes: ["founders"],
    spokenLanguages: ["en"],
    publicProfile: {
      bio: "Parity bio",
      offering: ["Parity offer"],
      seeking: ["Parity seeking"],
      topics: ["Parity topic"],
    },
    createdAt: profileTime,
    updatedAt: profileTime,
  };
}

test("rejects blank actors before either provider reads storage", async () => {
  const calls: Array<{ text: string; values: readonly unknown[] | undefined }> = [];
  const client: TransactionalPostgresClient = {
    async query(text, values) {
      calls.push({ text, values });
      return { rows: [] };
    },
    async transaction(operation) {
      return operation({
        async query(text, values) {
          calls.push({ text, values });
          return { rows: [] };
        },
      });
    },
    async close() {},
  };
  const provider = createTransactionalStorageProfileProvider({
    client,
    workspaceId: "workspace:red",
  });

  await assert.rejects(
    Promise.resolve().then(() => provider.readProfileGraph(" \t")),
    /actor/i,
  );
  assert.equal(calls.length, 0);

  let customStoreCalls = 0;
  const customProvider = createStorageProfileProvider({
    workspaceId: "workspace:red",
    store: {
      async deleteRecord() {
        customStoreCalls += 1;
        return null;
      },
      async getRecord() {
        customStoreCalls += 1;
        return null;
      },
      async listRecords() {
        customStoreCalls += 1;
        return [];
      },
      async upsertRecord(record) {
        customStoreCalls += 1;
        return record;
      },
    },
  });
  await assert.rejects(async () => await customProvider.readProfileGraph(" \t"), /actor/i);
  assert.equal(customStoreCalls, 0);
});

test("transactional actor reads bind both SQL queries to the actor and project payloads", async () => {
  const calls: Array<{ text: string; values: readonly unknown[] | undefined }> = [];
  const client: TransactionalPostgresClient = {
    async query(text, values) {
      calls.push({ text, values });
      return { rows: [] };
    },
    async transaction(operation) {
      return operation({
        async query(text, values) {
          calls.push({ text, values });
          return { rows: [] };
        },
      });
    },
    async close() {},
  };
  const provider = createTransactionalStorageProfileProvider({
    client,
    workspaceId: "workspace:red",
  });

  await provider.readProfileGraph("actor:red");
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.values?.includes("actor:red")));
  assert.ok(calls.every((call) => /payload->/.test(call.text)));
  assert.ok(calls.every((call) => /lifecycle_state\s*<>\s*'deleted'/i.test(call.text)));
});

test("configured actor reader enforces workspace, owner, legacy id, lifecycle, and ordering parity", { skip }, async t => {
  const { client, workspaceId } = await fixture(t);
  const actorId = "actor:primary";
  const otherActor = "actor:other";
  const otherWorkspace = `${workspaceId}:other`;

  await insertRaw(client, rawRecord({
    workspaceId,
    collectionName: "accounts",
    recordId: "legacy-account-id",
    userId: null,
    payload: validAccount(actorId),
    occurredAt: "2026-09-17T00:20:00.000Z",
    updatedAt: "2026-09-17T00:02:00.000Z",
    evidenceIds: null,
  }));
  await insertRaw(client, rawRecord({
    workspaceId,
    collectionName: "accounts",
    recordId: "conflicting-account-owner",
    userId: otherActor,
    payload: validAccount(actorId, "Payload owner wins"),
    updatedAt: "2026-09-17T00:03:00.000Z",
  }));
  await insertRaw(client, rawRecord({
    workspaceId,
    collectionName: "accounts",
    recordId: "invalid-authorized-account",
    userId: actorId,
    payload: { id: actorId, createdAt: profileTime, updatedAt: profileTime },
    updatedAt: "2026-09-17T00:09:00.000Z",
  }));
  await insertRaw(client, rawRecord({
    workspaceId,
    collectionName: "accounts",
    recordId: "deleted-account",
    userId: actorId,
    payload: validAccount(actorId, "Deleted"),
    lifecycleState: "deleted",
    updatedAt: "2026-09-17T00:10:00.000Z",
  }));
  await insertRaw(client, rawRecord({
    workspaceId: otherWorkspace,
    collectionName: "accounts",
    recordId: "other-workspace-account",
    userId: actorId,
    payload: validAccount(actorId, "Other workspace"),
    updatedAt: "2026-09-17T00:11:00.000Z",
  }));
  await insertRaw(client, rawRecord({
    workspaceId,
    collectionName: "accounts",
    recordId: "other-actor-account",
    userId: otherActor,
    payload: validAccount(otherActor, "Other actor"),
    updatedAt: "2026-09-17T00:12:00.000Z",
  }));

  await insertRaw(client, rawRecord({
    workspaceId,
    collectionName: "profiles",
    recordId: "legacy-profile-id",
    userId: null,
    payload: validProfile(actorId),
    occurredAt: "2026-09-17T00:20:00.000Z",
    updatedAt: "2026-09-17T00:04:00.000Z",
    evidenceIds: null,
  }));
  await insertRaw(client, rawRecord({
    workspaceId,
    collectionName: "profiles",
    recordId: "conflicting-profile-owner",
    userId: otherActor,
    payload: validProfile(actorId, "Conflicting owner"),
    updatedAt: "2026-09-17T00:05:00.000Z",
  }));
  await insertRaw(client, rawRecord({
    workspaceId,
    collectionName: "profiles",
    recordId: "invalid-authorized-profile",
    userId: null,
    payload: { id: "profile:invalid", accountId: actorId, createdAt: profileTime, updatedAt: profileTime },
    updatedAt: "2026-09-17T00:13:00.000Z",
  }));
  await insertRaw(client, rawRecord({
    workspaceId,
    collectionName: "profiles",
    recordId: "archived-profile",
    userId: actorId,
    payload: validProfile(actorId, "Archived profile"),
    lifecycleState: "archived",
    updatedAt: "2026-09-17T00:06:00.000Z",
  }));
  await insertRaw(client, rawRecord({
    workspaceId,
    collectionName: "profiles",
    recordId: "deleted-profile",
    userId: actorId,
    payload: validProfile(actorId, "Deleted profile"),
    lifecycleState: "deleted",
    updatedAt: "2026-09-17T00:14:00.000Z",
  }));

  const provider = createTransactionalStorageProfileProvider({
    client,
    workspaceId,
    source: "parity-source",
    sourceLabel: "Parity source",
  });
  const legacyProvider = createStorageProfileProvider({
    store: createPostgresLiveRecordStore({ client }),
    workspaceId,
    source: "parity-source",
    sourceLabel: "Parity source",
  });
  const rawGraph = await (await actorReader(client, workspaceId))(actorId);
  assert.deepEqual(rawGraph.accounts.map((record) => record.recordId), [
    "legacy-account-id",
    "invalid-authorized-account",
    "conflicting-account-owner",
  ]);
  assert.deepEqual(rawGraph.profiles.map((record) => record.recordId), [
    "legacy-profile-id",
    "invalid-authorized-profile",
    "archived-profile",
  ]);
  const graph = await provider.readProfileGraph(actorId);
  const legacyGraph = await legacyProvider.readProfileGraph(actorId);
  assert.deepEqual(graph, legacyGraph);

  const [currentResult, legacyResult] = await Promise.all([
    createLiveProfileService({ provider }).getProfile({ actorId }),
    createLiveProfileService({ provider: legacyProvider }).getProfile({ actorId }),
  ]);
  assert.equal(currentResult.success, true);
  assert.equal(legacyResult.success, true);
  if (currentResult.success && legacyResult.success) {
    assert.deepEqual(currentResult.data.profile, legacyResult.data.profile);
  }

  assert.equal(provider.source, "parity-source");
  assert.equal(provider.sourceLabel, "Parity source");
  assert.deepEqual(graph.accounts.map((account) => account.name).sort(), [
    "Parity account",
    "Payload owner wins",
  ]);
  assert.deepEqual(graph.profiles.map((profile) => profile.displayName).sort(), [
    "Archived profile",
    "Parity profile",
  ]);
  assert.equal(graph.generatedAt, "2026-09-17T00:13:00.000Z");
  assert.equal(graph.profiles[0]?.evidenceIds[0], "evidence:profile:profile:actor:primary");
});

test("strict JSON identity excludes numeric, object, array, missing, and null actor fields", { skip }, async t => {
  const { client, workspaceId } = await fixture(t);
  const actorId = "123";
  const variants: readonly [string, unknown][] = [
    ["numeric", 123],
    ["string", actorId],
    ["object", { value: actorId }],
    ["array", [actorId]],
    ["missing", undefined],
    ["null", null],
  ];
  for (const [label, value] of variants) {
    const accountPayload = {
      name: label,
      createdAt: profileTime,
      updatedAt: profileTime,
      ...(value === undefined ? {} : { id: value }),
    };
    const profilePayload = {
      id: `profile:${label}`,
      displayName: label,
      createdAt: profileTime,
      updatedAt: profileTime,
      ...(value === undefined ? {} : { accountId: value }),
    };
    await insertRaw(client, rawRecord({
      workspaceId,
      collectionName: "accounts",
      recordId: `variant-account-${label}`,
      payload: accountPayload,
    }));
    await insertRaw(client, rawRecord({
      workspaceId,
      collectionName: "profiles",
      recordId: `variant-profile-${label}`,
      payload: profilePayload,
    }));
  }
  await insertRaw(client, rawRecord({
    workspaceId,
    collectionName: "accounts",
    recordId: "user-id-authorized-account",
    userId: actorId,
    payload: { id: 123, name: "User id authorized", createdAt: profileTime, updatedAt: profileTime },
  }));
  await insertRaw(client, rawRecord({
    workspaceId,
    collectionName: "accounts",
    recordId: "user-id-authorized-number",
    userId: actorId,
    payload: 123,
    updatedAt: "2026-09-17T00:20:00.000Z",
  }));
  await insertRaw(client, rawRecord({
    workspaceId,
    collectionName: "accounts",
    recordId: "user-id-authorized-array",
    userId: actorId,
    payload: ["array"],
    updatedAt: "2026-09-17T00:21:00.000Z",
  }));

  const reader = await actorReader(client, workspaceId);
  const graph = await reader(actorId);
  assert.deepEqual(graph.accounts.map((record) => record.recordId).sort(), [
    "variant-account-string",
    "user-id-authorized-account",
    "user-id-authorized-array",
    "user-id-authorized-number",
  ].sort());
  assert.deepEqual(graph.profiles.map((record) => record.recordId).sort(), ["variant-profile-string"].sort());
  assert.ok(graph.accounts.some((record) => record.recordId === "user-id-authorized-number"));
  assert.ok(graph.accounts.some((record) => record.recordId === "user-id-authorized-array"));

  const provider = createTransactionalStorageProfileProvider({ client, workspaceId });
  const mappedGraph = await provider.readProfileGraph(actorId);
  assert.deepEqual(mappedGraph.accounts.map((account) => account.name), ["string"]);
  assert.equal(mappedGraph.generatedAt, "2026-09-17T00:21:00.000Z");

  const textualIdentityRows = await client.query<{ record_id: string; actor_text: string }>(
    `select record_id, payload->>'id' as actor_text
       from orbit_records
      where workspace_id = $1
        and collection_name = 'accounts'
        and record_id = any($2::text[])
     union all
     select record_id, payload->>'accountId' as actor_text
       from orbit_records
      where workspace_id = $1
        and collection_name = 'profiles'
        and record_id = any($2::text[])`,
    [workspaceId, [
      "variant-account-object",
      "variant-account-array",
      "variant-profile-object",
      "variant-profile-array",
    ]],
  );
  assert.equal(textualIdentityRows.rows.length, 4);
  for (const row of textualIdentityRows.rows) {
    const textActorGraph = await reader(row.actor_text);
    assert.deepEqual(textActorGraph.accounts, [], `object/array account identity leaked for ${row.record_id}`);
    assert.deepEqual(textActorGraph.profiles, [], `object/array profile identity leaked for ${row.record_id}`);
  }
});

test("projection preserves null and missing nested fields while excluding large unrelated payload", { skip }, async t => {
  const { client, workspaceId } = await fixture(t);
  const actorId = "actor:projection";
  const largeUnrelated = "x".repeat(100_000);
  await insertRaw(client, rawRecord({
    workspaceId,
    collectionName: "profiles",
    recordId: "projection-profile",
    userId: null,
    payload: (() => {
      const profilePayload = { ...validProfile(actorId) };
      delete (profilePayload as Record<string, unknown>).preferredLanguage;
      return {
        ...profilePayload,
        handles: null,
        publicProfile: { bio: null, nested: { value: "kept" } },
        unrelatedLargeField: largeUnrelated,
      };
    })(),
    evidenceIds: null,
  }));

  const reader = await actorReader(client, workspaceId);
  const graph = await reader(actorId);
  const profile = graph.profiles[0];
  assert.ok(profile);
  const payload = profile.payload as Record<string, unknown>;
  assert.equal(payload.handles, null);
  assert.deepEqual(payload.publicProfile, {
    bio: null,
    nested: { value: "kept" },
  });
  assert.equal(Object.hasOwn(payload, "preferredLanguage"), false);
  assert.equal(Object.hasOwn(payload, "unrelatedLargeField"), false);
  assert.deepEqual(profile.evidenceIds, []);
});

test("outer configured reader failure does not replace transaction-local mutation reads", { skip }, async t => {
  const { client, workspaceId } = await fixture(t);
  const actorId = "actor:transaction";
  let outerQueries = 0;
  const guarded: TransactionalPostgresClient = {
    async query() {
      outerQueries += 1;
      throw new Error("outer reader must not be used by mutation");
    },
    transaction: client.transaction.bind(client),
    close: client.close.bind(client),
  };
  const provider = createTransactionalStorageProfileProvider({
    client: guarded,
    workspaceId,
  });
  const service = createLiveProfileService({
    now: () => "2026-09-17T00:01:00.000Z",
    provider,
  });
  const saved = await service.updateProfile({
    displayName: "Transaction profile",
    expectedUpdatedAt: null,
    mutationId: "transaction-reader-test",
  }, { actorId });

  assert.equal(saved.success, true);
  assert.equal(outerQueries, 0);
  const reopened = await createLiveProfileService({
    provider: createTransactionalStorageProfileProvider({ client, workspaceId }),
  }).getProfile({ actorId });
  assert.equal(reopened.success, true);
  if (reopened.success) assert.equal(reopened.data.profile?.displayName, "Transaction profile");
});


test("configured provider path preserves source and cache semantics", { skip }, async t => {
  const { client, schema, workspaceId } = await fixture(t);
  const actorId = "actor:configured";
  await insertRaw(client, rawRecord({
    workspaceId,
    collectionName: "accounts",
    recordId: "configured-account",
    userId: null,
    payload: validAccount(actorId, "Configured account"),
  }));
  await insertRaw(client, rawRecord({
    workspaceId,
    collectionName: "profiles",
    recordId: "configured-profile",
    userId: null,
    payload: validProfile(actorId, "Configured profile"),
  }));
  const connectionString = `postgresql:///postgres?${[
    `host=${encodeURIComponent(socket!)}`,
    `user=${encodeURIComponent(userInfo().username)}`,
    `options=${encodeURIComponent(`-c search_path=${schema},public`)}`,
  ].join("&")}`;
  const env = {
    ORBIT_LIVE_DATABASE_URL: connectionString,
    ORBIT_WORKSPACE_ID: workspaceId,
  };
  const previousEnv = {
    ORBIT_EVENT_DATABASE_URL: process.env.ORBIT_EVENT_DATABASE_URL,
    ORBIT_LIVE_DATABASE_URL: process.env.ORBIT_LIVE_DATABASE_URL,
    ORBIT_DATABASE_URL: process.env.ORBIT_DATABASE_URL,
    ORBIT_WORKSPACE_ID: process.env.ORBIT_WORKSPACE_ID,
  };
  delete process.env.ORBIT_EVENT_DATABASE_URL;
  delete process.env.ORBIT_DATABASE_URL;
  process.env.ORBIT_LIVE_DATABASE_URL = connectionString;
  process.env.ORBIT_WORKSPACE_ID = workspaceId;

  const provider = createConfiguredStorageProfileProvider();
  assert.ok(provider);
  const cachedProvider = createConfiguredStorageProfileProvider();
  assert.equal(provider, cachedProvider);
  const runtime = (await import("../../shared/storage/transactional-postgres")).createConfiguredTransactionalPostgresRuntime();
  assert.ok(runtime);
  const originalQuery = runtime.client.query;
  const observedQueries: Array<{ text: string; values: readonly unknown[] | undefined }> = [];
  runtime.client.query = async (text, values) => {
    observedQueries.push({ text, values });
    return originalQuery(text, values);
  };
  t.after(async () => {
    runtime.client.query = originalQuery;
    await runtime.client.close();
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  assert.equal(provider.source, `postgres-live-record-store:profiles:${workspaceId}`);
  assert.equal(provider.sourceLabel, "Profile Postgres live storage");
  const graph = await provider.readProfileGraph(actorId);
  assert.equal(observedQueries.length, 2);
  assert.ok(observedQueries.every((query) => query.values?.includes(actorId)));
  assert.ok(observedQueries.every((query) => !/search_text/i.test(query.text)));
  assert.equal(graph.profiles[0]?.displayName, "Configured profile");
});
