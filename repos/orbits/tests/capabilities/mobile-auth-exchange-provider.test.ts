import assert from "node:assert/strict";
import test from "node:test";

import { MOBILE_AUTH_CALLBACK_URI } from "../../features/auth/mobile-contract";
import {
  createMemoryMobileAuthExchangeProvider,
  createPostgresMobileAuthExchangeProvider,
  type MobileAuthExchangeRecord,
} from "../../features/auth/storage/mobile-auth-exchange-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import type { LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";

const now = new Date("2026-07-24T00:00:00.000Z");
const record: MobileAuthExchangeRecord = {
  codeChallenge: "a".repeat(43),
  codeHash: "code-hash",
  encryptedCookieHeader: "encrypted-cookie",
  expiresAt: "2026-07-24T00:02:00.000Z",
  issuedAt: now.toISOString(),
  redirectUri: MOBILE_AUTH_CALLBACK_URI,
  state: "b".repeat(32),
  user: {
    email: "person@example.com",
    id: "user_1",
    name: "Person",
  },
};

test("memory exchange provider consumes a code exactly once", async () => {
  const provider = createMemoryMobileAuthExchangeProvider();
  await provider.save(record);

  const [left, right] = await Promise.all([
    provider.consume(record.codeHash, now),
    provider.consume(record.codeHash, now),
  ]);

  assert.equal([left, right].filter(Boolean).length, 1);
});

test("expired records cannot be consumed", async () => {
  const provider = createMemoryMobileAuthExchangeProvider();
  await provider.save({
    ...record,
    expiresAt: "2026-07-23T23:59:59.000Z",
  });

  assert.equal(await provider.consume(record.codeHash, now), null);
});

test("Postgres exchange consumption is one conditional update", async () => {
  const calls: { text: string; values?: readonly unknown[] }[] = [];
  const client: LiveRecordSqlClient = {
    async query<TRow>(text: string, values?: readonly unknown[]) {
      calls.push({ text, values });

      return {
        rows: [{ payload: record }] as TRow[],
      };
    },
  };
  const provider = createPostgresMobileAuthExchangeProvider({
    client,
    store: createMemoryLiveRecordStore(),
    workspaceId: "workspace:test",
  });

  const consumed = await provider.consume(record.codeHash, now);

  assert.equal(consumed?.codeHash, record.codeHash);
  assert.equal(calls.length, 1);
  assert.match(calls[0]?.text ?? "", /update orbit_records/iu);
  assert.match(calls[0]?.text ?? "", /lifecycle_state = 'active'/iu);
  assert.match(calls[0]?.text ?? "", /expiresAt/iu);
  assert.match(calls[0]?.text ?? "", /returning payload/iu);
  assert.doesNotMatch(calls[0]?.text ?? "", /\bselect\b/iu);
  assert.deepEqual(calls[0]?.values, [
    "workspace:test",
    "mobile_auth_exchanges",
    `mobile_auth_exchange:${record.codeHash}`,
    now.toISOString(),
  ]);
});

test("Postgres exchange provider rejects malformed returned payloads", async () => {
  const client: LiveRecordSqlClient = {
    async query<TRow>() {
      return {
        rows: [{ payload: { codeHash: record.codeHash } }] as TRow[],
      };
    },
  };
  const provider = createPostgresMobileAuthExchangeProvider({
    client,
    store: createMemoryLiveRecordStore(),
    workspaceId: "workspace:test",
  });

  assert.equal(await provider.consume(record.codeHash, now), null);
});
