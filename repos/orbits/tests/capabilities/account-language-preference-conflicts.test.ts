import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { userInfo } from "node:os";
import test from "node:test";
import { Pool } from "pg";

import { createLiveAccountLanguagePreferenceService } from "../../features/account-language/live-service";
import {
  createTransactionalStorageAccountLanguagePreferenceProvider,
} from "../../features/account-language/storage/account-language-live-record-provider";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import {
  createTransactionalPostgresClient,
  type TransactionalPostgresClient,
} from "../../shared/storage/transactional-postgres";

const socket = process.env.ORBIT_ACCOUNT_LANGUAGE_TEST_SOCKET_DIR;
const port = Number(process.env.ORBIT_ACCOUNT_LANGUAGE_TEST_PORT ?? "5432");
const skip = socket ? false : "Disposable account-language PostgreSQL socket is not configured";
if (socket && !/^\/tmp\/orbit-account-language-cas\.[A-Za-z0-9]+$/.test(socket)) {
  throw new Error("Use a disposable account-language PostgreSQL cluster socket");
}
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) {
  throw new Error("Use a valid disposable PostgreSQL port");
}
const actorId = "actor:account-language-cas";
const instant = "2026-09-15T05:10:00.000Z";

async function fixture(t: { after(callback: () => Promise<void>): void }) {
  const clients = [0, 1].map(() => createTransactionalPostgresClient({
    connectionString: "postgres://disposable-account-language.invalid/postgres",
    pool: new Pool({ host: socket, port, database: "postgres", user: userInfo().username, max: 2 }),
  }));
  t.after(async () => Promise.all(clients.map(client => client.close())).then(() => undefined));
  await clients[0].query(ORBIT_RECORDS_SCHEMA_SQL);
  const workspaceId = `account-language:${randomUUID()}`;
  const serviceFor = (client: TransactionalPostgresClient) =>
    createLiveAccountLanguagePreferenceService({
      now: () => instant,
      provider: createTransactionalStorageAccountLanguagePreferenceProvider({ client, workspaceId }),
    });
  return { clients, services: clients.map(serviceFor), serviceFor, workspaceId };
}

test("two database connections cannot both create or replace the same account preference version", { skip }, async t => {
  const { clients, services, workspaceId } = await fixture(t);
  const creates = await Promise.all(services.map((service, index) => service.save({
    actorId,
    input: {
      mode: "manual",
      language: index === 0 ? "ja" : "en",
      expectedUpdatedAt: null,
      mutationId: `create-${index}`,
    },
  })));
  assert.equal(creates.filter(result => result.success).length, 1);
  const conflict = creates.find(result => !result.success);
  assert.equal(conflict?.success, false);
  if (conflict && !conflict.success) assert.equal(conflict.error.code, "LANGUAGE_PREFERENCE_VERSION_CONFLICT");
  const winner = creates.find(result => result.success)!;
  if (!winner.success) return;

  const replacements = await Promise.all(services.map((service, index) => service.save({
    actorId,
    input: {
      mode: index === 0 ? "system" : "manual",
      language: index === 0 ? null : "zh",
      expectedUpdatedAt: winner.data.updatedAt,
      mutationId: `replace-${index}`,
    },
  })));
  assert.equal(replacements.filter(result => result.success).length, 1);
  const records = await clients[0].query<{ count: string }>(
    "select count(*) from orbit_records where workspace_id=$1 and collection_name='account_language_preferences'",
    [workspaceId],
  );
  assert.equal(records.rows[0].count, "1");
});

test("a mutation replays its original receipt and cannot be reused with another payload or actor", { skip }, async t => {
  const { services } = await fixture(t);
  const request = {
    mode: "manual" as const,
    language: "ja" as const,
    expectedUpdatedAt: null,
    mutationId: "stable-postgres-request",
  };
  const first = await services[0].save({ actorId, input: request });
  assert.equal(first.success, true);
  assert.deepEqual(await services[1].save({ actorId, input: request }), first);
  const collision = await services[1].save({ actorId, input: { ...request, language: "en" } });
  assert.equal(collision.success, false);
  if (!collision.success) assert.equal(collision.error.code, "LANGUAGE_PREFERENCE_MUTATION_ID_REUSED");

  const other = await services[1].save({ actorId: "actor:other", input: { ...request, language: "en" } });
  assert.equal(other.success, true);
  assert.deepEqual(await services[0].read({ actorId }), {
    success: true,
    data: {
      mode: "manual",
      language: "ja",
      updatedAt: instant,
    },
  });
});

test("a receipt failure rolls the preference back and the same mutation can recover", { skip }, async t => {
  const { clients, serviceFor, services, workspaceId } = await fixture(t);
  const broken: TransactionalPostgresClient = {
    ...clients[0],
    transaction: operation => clients[0].transaction(transaction => operation({
      async query<TRow>(sql: string, values?: readonly unknown[]) {
        if (sql.includes("insert into orbit_records") && values?.[1] === "account_language_preference_mutations") {
          throw new Error("private database failure");
        }
        return transaction.query<TRow>(sql, values);
      },
    })),
  };
  const request = {
    mode: "manual" as const,
    language: "en" as const,
    expectedUpdatedAt: null,
    mutationId: "rollback-and-retry",
  };
  const failed = await serviceFor(broken).save({ actorId, input: request });
  assert.equal(failed.success, false);
  if (!failed.success) assert.equal(failed.error.code, "LANGUAGE_PREFERENCE_SAVE_UNAVAILABLE");
  const afterFailure = await clients[1].query<{ count: string }>(
    "select count(*) from orbit_records where workspace_id=$1",
    [workspaceId],
  );
  assert.equal(afterFailure.rows[0].count, "0");
  const recovered = await services[1].save({ actorId, input: request });
  assert.equal(recovered.success, true);
});
