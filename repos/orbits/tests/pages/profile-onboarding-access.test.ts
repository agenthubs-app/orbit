import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import Module, { createRequire } from "node:module";
import { userInfo } from "node:os";
import test from "node:test";
import { Pool } from "pg";
import { transformSync } from "esbuild";

import { readProfileOnboardingAccess } from "../../app/(app)/app/profile/profile-onboarding-access.server";
import {
  createTransactionalPostgresClient,
  type TransactionalPostgresClient,
} from "../../shared/storage/transactional-postgres";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";

const socket = process.env.ORBIT_PROFILE_TEST_SOCKET_DIR;
const skip = socket
  ? false
  : "Disposable profile test PostgreSQL socket is not configured";
if (socket && !/^\/tmp\/orbit-profile-cas\.[A-Za-z0-9]+$/.test(socket)) {
  throw new Error("Use a disposable profile test cluster socket");
}

const profileTime = "2026-09-18T00:00:00.000Z";

function schemaIdentifier(): string {
  return `w1_gate_${randomUUID().replaceAll("-", "")}`;
}

type StubAccessOptions = {
  actor?: { id: string } | null;
  actorError?: Error;
  factoryError?: Error;
  profileError?: Error;
  profileResult?: unknown;
};

function loadStubbedAccess(options: StubAccessOptions) {
  const helperPath = require.resolve(
    "../../app/(app)/app/profile/profile-onboarding-access.server",
  );
  const compiled = transformSync(readFileSync(helperPath, "utf8"), {
    format: "cjs",
    loader: "ts",
    platform: "node",
    supported: { "dynamic-import": false },
  });
  const baseRequire = createRequire(helperPath);
  const helperModule = new Module(helperPath);
  helperModule.filename = helperPath;
  helperModule.loaded = true;
  helperModule.exports = {};

  const actor = options.actor === undefined
    ? { id: "account:stub-canonical" }
    : options.actor;
  const profileResult = options.profileResult ?? {
    success: true,
    data: {
      profile: {},
      onboarding: {
        policyVersion: 1,
        status: "complete",
        missingFields: [],
      },
    },
  };
  new Function("require", "module", "exports", compiled.code)(
    (request: string) => {
      if (request.includes("authenticated-actor")) {
        return {
          resolveAuthenticatedApiActorFromSession: async () => {
            if (options.actorError) throw options.actorError;
            return actor;
          },
        };
      }
      if (request.includes("features/profile/service-factory")) {
        return {
          createProfileService: () => {
            if (options.factoryError) throw options.factoryError;
            return {
              getProfile: async () => {
                if (options.profileError) throw options.profileError;
                return profileResult;
              },
            };
          },
        };
      }
      return baseRequire(request);
    },
    helperModule,
    helperModule.exports,
  );

  return helperModule.exports as typeof import("../../app/(app)/app/profile/profile-onboarding-access.server");
}

function connectionString(schema: string): string {
  return `postgresql:///postgres?${[
    `host=${encodeURIComponent(socket!)}`,
    `user=${encodeURIComponent(userInfo().username)}`,
    `options=${encodeURIComponent(`-c search_path=${schema},public`)}`,
  ].join("&")}`;
}

function rawRecord(input: {
  workspaceId: string;
  collectionName: "accounts" | "profiles";
  recordId: string;
  userId?: string | null;
  payload: unknown;
}) {
  return {
    workspaceId: input.workspaceId,
    collectionName: input.collectionName,
    recordId: input.recordId,
    userId: input.userId ?? null,
    sourceType: "manual",
    sourceId: `source:${input.recordId}`,
    sourceLabel: "Profile onboarding gate test",
    provider: "profile-onboarding-gate-test",
    providerRecordId: input.recordId,
    evidenceIds: [`evidence:${input.recordId}`],
    targetType: "profile",
    targetId: input.recordId,
    occurredAt: null,
    lifecycleState: "active",
    searchText: "",
    payload: input.payload,
    createdAt: profileTime,
    updatedAt: profileTime,
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

function accountPayload(accountId: string) {
  return {
    id: accountId,
    name: "Gate Account",
    createdAt: profileTime,
    updatedAt: profileTime,
  };
}

function profilePayload(input: {
  accountId: string;
  profileId: string;
  birthDate?: string | null;
  complete?: boolean;
}) {
  const complete = input.complete ?? true;
  return {
    id: input.profileId,
    accountId: input.accountId,
    displayName: "Gate Profile",
    birthDate: input.birthDate ?? (complete ? "2000-02-29" : null),
    role: "Founder",
    timezone: "Asia/Tokyo",
    headline: "Gate headline",
    handles: { email: "gate@example.test" },
    homeMarket: "Tokyo",
    organization: "Orbit",
    preferredFollowUpWindow: "48 hours",
    preferredIntroChannels: ["email"],
    preferredLanguage: "en",
    relationshipGoal: "Learn",
    targetRelationshipTypes: ["founders"],
    spokenLanguages: ["en"],
    publicProfile: {
      bio: "Gate bio",
      primaryIndustryId: complete ? "technology_internet" : undefined,
      secondaryIndustryId: complete
        ? "technology_internet.enterprise_software"
        : undefined,
    },
    createdAt: profileTime,
    updatedAt: profileTime,
  };
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
    connectionString: "postgres://disposable-profile-gate.invalid/postgres",
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

  return {
    client,
    schema,
    workspaceId: `profile-gate:${randomUUID()}`,
  };
}

async function withGateEnv<T>(
  input: { schema: string; workspaceId: string; mode?: string; nodeEnvironment?: string },
  run: () => Promise<T>,
): Promise<T> {
  const env = process.env as Record<string, string | undefined>;
  const keys = [
    "NODE_ENV",
    "ORBIT_EVENT_DATABASE_URL",
    "ORBIT_LIVE_DATABASE_URL",
    "ORBIT_DATABASE_URL",
    "ORBIT_MODULE_MODE",
    "ORBIT_FEATURE_MODE",
    "ORBIT_WORKSPACE_ID",
  ] as const;
  const previous = new Map(keys.map((key) => [key, env[key]]));
  try {
    env.NODE_ENV = input.nodeEnvironment ?? "test";
    delete env.ORBIT_EVENT_DATABASE_URL;
    env.ORBIT_LIVE_DATABASE_URL = connectionString(input.schema);
    delete env.ORBIT_DATABASE_URL;
    if (input.mode === undefined) delete env.ORBIT_MODULE_MODE;
    else env.ORBIT_MODULE_MODE = input.mode;
    delete env.ORBIT_FEATURE_MODE;
    env.ORBIT_WORKSPACE_ID = input.workspaceId;
    return await run();
  } finally {
    for (const key of keys) {
      const value = previous.get(key);
      if (value === undefined) delete env[key];
      else env[key] = value;
    }
  }
}

async function seedMembership(
  client: TransactionalPostgresClient,
  workspaceId: string,
  input: { accountId: string; profileId: string; complete?: boolean },
) {
  await insertRaw(client, rawRecord({
    workspaceId,
    collectionName: "accounts",
    recordId: "gate-account-record",
    userId: input.accountId,
    payload: accountPayload(input.accountId),
  }));
  await insertRaw(client, rawRecord({
    workspaceId,
    collectionName: "profiles",
    recordId: "gate-profile-record",
    userId: input.accountId,
    payload: profilePayload(input),
  }));
}

test("non-live gate exits before loading the profile service factory", async () => {
  const require = createRequire(import.meta.url);
  const serviceFactoryPath = require.resolve("../../features/profile/service-factory");
  delete require.cache[serviceFactoryPath];

  await withGateEnv(
    {
      schema: "unused",
      workspaceId: "unused",
    },
    async () => {
      const access = await readProfileOnboardingAccess({ userId: "profile:non-live" });
      assert.deepEqual(access, { status: "unavailable" });
    },
  );

  assert.equal(require.cache[serviceFactoryPath], undefined);
});

test("live gate failures resolve to unavailable instead of escaping or treating malformed data as complete", async () => {
  const cases: Array<[string, StubAccessOptions]> = [
    ["missing canonical actor", { actor: null }],
    ["actor resolver failure", { actorError: new Error("actor lookup failed") }],
    ["profile factory failure", { factoryError: new Error("factory failed") }],
    ["profile query failure", { profileError: new Error("query failed") }],
    ["profile result failure", { profileResult: { success: false } }],
    [
      "missing onboarding contract",
      { profileResult: { success: true, data: { profile: {} } } },
    ],
    [
      "unknown onboarding policy",
      {
        profileResult: {
          success: true,
          data: {
            profile: {},
            onboarding: {
              policyVersion: 2,
              status: "complete",
              missingFields: [],
            },
          },
        },
      },
    ],
  ];

  for (const [label, options] of cases) {
    await withGateEnv(
      { schema: "unused", workspaceId: "unused", mode: "live" },
      async () => {
        const access = loadStubbedAccess(options);
        assert.deepEqual(
          await access.readProfileOnboardingAccess({ userId: "profile:stub" }),
          { status: "unavailable" },
          label,
        );
      },
    );
  }
});

test("live helper resolves a raw profile subject to the canonical account and complete status", { skip }, async t => {
  const { client, schema, workspaceId } = await fixture(t);
  const accountId = "account:gate-canonical";
  const profileId = "profile:gate-raw";
  await seedMembership(client, workspaceId, { accountId, profileId });

  await withGateEnv({ schema, workspaceId, mode: "live" }, async () => {
    type Query = (this: Pool, ...args: unknown[]) => unknown;
    const poolPrototype = Pool.prototype as unknown as { query: Query };
    const originalQuery = poolPrototype.query;
    const calls: Array<{ text: string; values: unknown[] | undefined }> = [];
    poolPrototype.query = function (this: Pool, ...args: unknown[]) {
      const text = typeof args[0] === "string"
        ? args[0]
        : typeof args[0] === "object" && args[0] !== null && "text" in args[0]
          ? String((args[0] as { text: unknown }).text)
          : "";
      const values = Array.isArray(args[1])
        ? (args[1] as unknown[])
        : undefined;
      if (text) calls.push({ text, values });
      return originalQuery.apply(this, args);
    };

    let rawQueryCount = 0;
    let legacyQueryCount = 0;
    try {
      const beforeRaw = calls.length;
      const rawAccess = await readProfileOnboardingAccess({
        email: "gate@example.test",
        name: "Gate Profile",
        userId: profileId,
      });
      rawQueryCount = calls.length - beforeRaw;
      const beforeLegacy = calls.length;
      const legacyAccess = await readProfileOnboardingAccess({
        userId: accountId,
      });
      legacyQueryCount = calls.length - beforeLegacy;
      assert.deepEqual(rawAccess, { actorId: accountId, status: "complete" });
      assert.deepEqual(legacyAccess, { actorId: accountId, status: "complete" });
    } finally {
      poolPrototype.query = originalQuery;
    }

    assert.equal(rawQueryCount, 4);
    assert.equal(legacyQueryCount, 5);
    assert.equal(calls.length, 9);
    const profileServiceActorIds = calls
      .filter(({ text }) => text.includes("collection_name = 'accounts'") || text.includes("collection_name = 'profiles'"))
      .map(({ values }) => values?.[1]);
    assert.deepEqual(profileServiceActorIds.slice(-2), [accountId, accountId]);
  });
});

test("live helper treats an incomplete persisted profile as incomplete", { skip }, async t => {
  const { client, schema, workspaceId } = await fixture(t);
  const accountId = "account:gate-incomplete";
  const profileId = "profile:gate-incomplete";
  await seedMembership(client, workspaceId, { accountId, profileId, complete: false });

  await withGateEnv({ schema, workspaceId, mode: "live" }, async () => {
    const access = await readProfileOnboardingAccess({ userId: profileId });
    assert.deepEqual(access, { actorId: accountId, status: "incomplete" });
  });
});

test("live helper fails closed for missing membership and a different workspace", { skip }, async t => {
  const { client, schema, workspaceId } = await fixture(t);
  const accountId = "account:gate-workspace";
  const profileId = "profile:gate-workspace";
  await seedMembership(client, workspaceId, { accountId, profileId });

  await withGateEnv({ schema, workspaceId: `${workspaceId}:other`, mode: "live" }, async () => {
    const access = await readProfileOnboardingAccess({ userId: profileId });
    assert.deepEqual(access, { status: "unavailable" });
  });
});

test("production mode stays live when mode variables are missing", { skip }, async t => {
  const { client, schema, workspaceId } = await fixture(t);
  const accountId = "account:gate-production";
  const profileId = "profile:gate-production";
  await seedMembership(client, workspaceId, { accountId, profileId });

  await withGateEnv(
    { schema, workspaceId, nodeEnvironment: "production" },
    async () => {
      const access = await readProfileOnboardingAccess({ userId: profileId });
      assert.deepEqual(access, { actorId: accountId, status: "complete" });
    },
  );
});
