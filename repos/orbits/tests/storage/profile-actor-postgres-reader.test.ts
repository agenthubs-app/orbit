import assert from "node:assert/strict";
import test from "node:test";

import { createProfileActorPostgresReader } from "../../features/profile/storage/profile-actor-postgres-reader";
import type { LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";

type QueryCall = {
  text: string;
  values: readonly unknown[] | undefined;
};

function row(overrides: Record<string, unknown> = {}) {
  return {
    workspace_id: "workspace:reader",
    collection_name: "profiles",
    record_id: "record:profile",
    user_id: null,
    evidence_ids: null,
    created_at: new Date("2026-09-17T00:00:00.000Z"),
    updated_at: new Date("2026-09-17T00:01:00.000Z"),
    occurred_at: null,
    lifecycle_state: "active",
    payload: {},
    ...overrides,
  };
}

function clientFor(
  responses: readonly (readonly Record<string, unknown>[])[],
  calls: QueryCall[],
): LiveRecordSqlClient {
  let index = 0;
  return {
    async query<TRow = Record<string, unknown>>(text, values) {
      calls.push({ text, values });
      return { rows: (responses[index++] ?? []) as readonly TRow[] };
    },
  };
}

test("rejects blank actors before issuing either SQL query", async () => {
  const calls: QueryCall[] = [];
  const reader = createProfileActorPostgresReader({
    client: clientFor([], calls),
    workspaceId: "workspace:reader",
  });

  await assert.rejects(reader(" \t\n"), /actor/i);
  assert.equal(calls.length, 0);
});

test("uses strict JSON identity predicates and two narrow ordered queries", async () => {
  const calls: QueryCall[] = [];
  const reader = createProfileActorPostgresReader({
    client: clientFor([
      [row({
        collection_name: "accounts",
        record_id: "legacy-account-record",
        user_id: null,
        evidence_ids: null,
        lifecycle_state: "archived",
        payload: {
          id: "account:reader",
          name: "Reader account",
          createdAt: "2026-09-17T00:00:00.000Z",
          updatedAt: "2026-09-17T00:01:00.000Z",
        },
      })],
      [row({
        record_id: "legacy-profile-record",
        payload: {
          id: "profile:reader",
          accountId: "account:reader",
          displayName: "Reader profile",
          birthDate: null,
          handles: null,
          publicProfile: {
            bio: null,
            nested: { keep: true },
          },
          createdAt: "2026-09-17T00:00:00.000Z",
          updatedAt: "2026-09-17T00:01:00.000Z",
        },
      })],
    ], calls),
    workspaceId: "workspace:reader",
  });

  const graph = await reader(" account:reader ");
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((call) => call.values?.slice(0, 2)), [
    ["workspace:reader", " account:reader "],
    ["workspace:reader", " account:reader "],
  ]);

  const accountQuery = calls[0].text;
  assert.match(accountQuery, /workspace_id\s*=\s*\$1/);
  assert.match(accountQuery, /collection_name\s*=\s*'accounts'/);
  assert.match(accountQuery, /lifecycle_state\s*<>\s*'deleted'/);
  assert.match(accountQuery, /user_id\s*=\s*\$2\s+or\s+payload->'id'\s*=\s*to_jsonb\(\$2::text\)/i);
  assert.doesNotMatch(accountQuery, /payload->>\s*'id'/i);

  const profileQuery = calls[1].text;
  assert.match(profileQuery, /collection_name\s*=\s*'profiles'/);
  assert.match(profileQuery, /payload->'accountId'\s*=\s*to_jsonb\(\$2::text\)/i);
  assert.match(profileQuery, /user_id\s+is\s+null\s+or\s+user_id\s*=\s*\$2/i);
  assert.doesNotMatch(profileQuery, /payload->>\s*'accountId'/i);
  assert.match(profileQuery, /jsonb_typeof\(payload\)\s*=\s*'object'/i);
  assert.match(profileQuery, /order\s+by\s+coalesce\(occurred_at,\s*updated_at\)\s+desc,\s*updated_at\s+desc/i);
  assert.doesNotMatch(profileQuery, /\blimit\b/i);

  const accountFields = calls[0].values?.[2];
  const profileFields = calls[1].values?.[2];
  assert.deepEqual(accountFields, ["id", "name", "createdAt", "updatedAt"]);
  assert.deepEqual(profileFields, [
    "id", "accountId", "displayName", "displayNameConfirmed", "birthDate", "role", "timezone",
    "headline", "handles", "homeMarket", "organization",
    "preferredFollowUpWindow", "preferredIntroChannels", "preferredLanguage",
    "relationshipGoal", "targetRelationshipTypes", "spokenLanguages",
    "publicProfile", "createdAt", "updatedAt",
  ]);

  assert.equal(graph.accounts[0]?.recordId, "legacy-account-record");
  assert.equal(graph.accounts[0]?.userId, null);
  assert.deepEqual(graph.accounts[0]?.evidenceIds, []);
  const profilePayload = graph.profiles[0]?.payload as Record<string, unknown>;
  assert.deepEqual(profilePayload.handles, null);
  assert.deepEqual(profilePayload.publicProfile, {
    bio: null,
    nested: { keep: true },
  });
  assert.equal(Object.hasOwn(profilePayload, "birthDate"), true);
  assert.equal(profilePayload.unrelated, undefined);
});

test("preserves top-level JSON values for the existing mapper to classify", async () => {
  const calls: QueryCall[] = [];
  const values = [null, 123, ["array"], { object: true }];
  const reader = createProfileActorPostgresReader({
    client: clientFor([
      [],
      values.map((payload, index) => row({ record_id: `profile:${index}`, payload })),
    ], calls),
    workspaceId: "workspace:reader",
  });

  const graph = await reader("actor:json-values");
  assert.deepEqual(graph.profiles.map((record) => record.payload), values);
  assert.equal(calls.length, 2);
});

test("propagates SQL failures without trying a store or returning an empty graph", async () => {
  const calls: QueryCall[] = [];
  const failure = new Error("profile reader SQL failed");
  const client: LiveRecordSqlClient = {
    async query(text, values) {
      calls.push({ text, values });
      throw failure;
    },
  };
  const reader = createProfileActorPostgresReader({
    client,
    workspaceId: "workspace:reader",
  });

  await assert.rejects(reader("actor:sql-failure"), (error) => error === failure);
  assert.equal(calls.length, 2);
});
