import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { userInfo } from "node:os";
import test from "node:test";
import { Pool } from "pg";
import { createLiveProfileService } from "../../features/profile/live-service";
import * as profileStorage from "../../features/profile/storage/profile-live-record-provider";
import { profileServiceFactory } from "../../features/profile/service-factory";
import { createProfileRouteHandlers } from "../../app/api/profile/handlers";
import type { ManualProfileUpdateInput, ProfileResult, ProfileSuccess } from "../../features/profile/contract";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { createTransactionalPostgresClient, createConfiguredTransactionalPostgresRuntime, type TransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";

// An explicitly selected disposable cluster only; never use business DB env vars.
const socket = process.env.ORBIT_PROFILE_TEST_SOCKET_DIR;
const skip = socket ? false : "Disposable profile test PostgreSQL socket is not configured";
if (socket && !/^\/tmp\/orbit-profile-cas\.[A-Za-z0-9]+$/.test(socket)) throw new Error("Use a disposable profile test cluster socket");
const instant = "2026-09-14T12:00:00.000Z";
const actorId = "actor:profile-cas";

function saved(result: ProfileResult): ProfileSuccess {
  assert.equal(result.success, true);
  return result;
}

function update(fields: Record<string, unknown>): ManualProfileUpdateInput {
  return fields as ManualProfileUpdateInput;
}

async function fixture(t: { after(callback: () => Promise<void>): void }) {
  const clients = [0, 1].map(() => createTransactionalPostgresClient({
    connectionString: "postgres://disposable-profile-test.invalid/postgres",
    pool: new Pool({ host: socket, database: "postgres", user: userInfo().username, max: 2 }),
  }));
  t.after(async () => { await Promise.all(clients.map(client => client.close())); });
  await clients[0].query(ORBIT_RECORDS_SCHEMA_SQL);
  const workspaceId = `profile-cas:${randomUUID()}`;
  const serviceFor = (client: TransactionalPostgresClient) => createLiveProfileService({
    now: () => instant,
    provider: profileStorage.createTransactionalStorageProfileProvider({ client, workspaceId }),
  });
  const services = clients.map(serviceFor);
  return { clients, services, workspaceId, serviceFor };
}

test("two database connections cannot both save the same profile version", { skip }, async t => {
  const { services, clients, workspaceId } = await fixture(t);
  const initial = saved(await services[0].updateProfile({ displayName: "本人", birthDate: "2000-02-29" }, { actorId }));
  const results = await Promise.all(services.map((service, index) => service.updateProfile(update({
    displayName: `修改${index}`, expectedUpdatedAt: initial.data.profile!.updatedAt, mutationId: `edit-${index}`,
  }), { actorId })));
  assert.equal(results.filter(result => result.success).length, 1, "a stale writer must not overwrite the winner");
  const rejected = results.find(result => !result.success)!;
  assert.equal(rejected.success, false);
  if (!rejected.success) assert.equal(rejected.error.code, "PROFILE_VERSION_CONFLICT");
  const winner = saved(results.find(result => result.success)!);
  assert.notEqual(winner.data.profile!.updatedAt, initial.data.profile!.updatedAt, "versions advance even when the clock is unchanged");
  const reopened = saved(await services[1].getProfile({ actorId }));
  assert.deepEqual(reopened.data.profile, winner.data.profile);
  assert.equal(reopened.data.profile!.birthDate, "2000-02-29");
  const records = await clients[0].query<{ count: string }>("select count(*) from orbit_records where workspace_id=$1 and collection_name='profiles'", [workspaceId]);
  assert.equal(records.rows[0].count, "1");
});

test("concurrent first creation accepts only one null-version mutation", { skip }, async t => {
  const { services } = await fixture(t);
  const results = await Promise.all(services.map((service, index) => service.updateProfile(update({
    displayName: `新用户${index}`, expectedUpdatedAt: null, mutationId: `create-${index}`,
  }), { actorId })));
  assert.equal(results.filter(result => result.success).length, 1);
  const failure = results.find(result => !result.success)!;
  assert.equal(failure.success, false);
  if (!failure.success) assert.equal(failure.error.code, "PROFILE_VERSION_CONFLICT");
});

test("same mutation replays its original receipt after a newer save without rewriting the profile", { skip }, async t => {
  const { services } = await fixture(t);
  const request = update({ displayName: "第一版", birthDate: "2000-02-29", expectedUpdatedAt: null, mutationId: "stable-retry" });
  const first = saved(await services[0].updateProfile(request, { actorId }));
  const second = saved(await services[1].updateProfile(update({ displayName: "第二版", expectedUpdatedAt: first.data.profile!.updatedAt, mutationId: "new-edit" }), { actorId }));
  const replay = await services[1].updateProfile(request, { actorId });
  assert.deepEqual(replay, first);
  assert.deepEqual(saved(await services[0].getProfile({ actorId })).data.profile, second.data.profile);
  const collision = await services[0].updateProfile(update({ ...request, displayName: "不能覆盖" }), { actorId });
  assert.equal(collision.success, false);
  if (!collision.success) assert.equal(collision.error.code, "PROFILE_MUTATION_ID_REUSED");
});

test("same concurrent mutation returns one identical receipt across connections and remains actor scoped", { skip }, async t => {
  const { services } = await fixture(t);
  const request = update({ displayName: "本人", expectedUpdatedAt: null, mutationId: "same-request" });
  const [first, second] = await Promise.all(services.map(service => service.updateProfile(request, { actorId })));
  assert.deepEqual(saved(first), saved(second));
  assert.equal(Reflect.get(saved(first).data, "mutationId"), "same-request");
  const other = saved(await services[1].updateProfile(update({ ...request, displayName: "另一个人" }), { actorId: "actor:other" }));
  assert.notEqual(other.data.profile!.id, saved(first).data.profile!.id);
  assert.equal(saved(await services[0].getProfile({ actorId })).data.profile!.displayName, "本人");
});

test("invalid mutation metadata fails before any profile or receipt write", { skip }, async t => {
  const { services, clients, workspaceId } = await fixture(t);
  for (const fields of [
    { mutationId: "without-version" }, { expectedUpdatedAt: null },
    { expectedUpdatedAt: "not-a-version", mutationId: "bad-version" },
    { expectedUpdatedAt: null, mutationId: "" }, { expectedUpdatedAt: null, mutationId: 42 },
    { expectedUpdatedAt: 42, mutationId: "numeric-version" },
  ]) {
    const result = await services[0].updateProfile(update({ displayName: "不能保存", ...fields }), { actorId });
    assert.equal(result.success, false, JSON.stringify(fields));
    if (!result.success) assert.equal(result.error.code, "PROFILE_MUTATION_INVALID");
  }
  const records = await clients[0].query<{ count: string }>("select count(*) from orbit_records where workspace_id=$1", [workspaceId]);
  assert.equal(records.rows[0].count, "0");
});

test("a failed receipt insert rolls back the profile too and the same request can recover", { skip }, async t => {
  const { clients, services, workspaceId, serviceFor } = await fixture(t);
  const initial = saved(await services[0].updateProfile({ displayName: "旧资料", birthDate: "2000-02-29" }, { actorId }));
  const broken: TransactionalPostgresClient = { ...clients[0],
    transaction: operation => clients[0].transaction(tx => operation({
      async query<TRow>(sql: string, values?: readonly unknown[]) {
        const result = await tx.query<TRow>(sql, values);
        if (sql.includes("insert into orbit_records") && values?.[1] === "profile_mutations") {
          throw new Error("private database failure must not appear in the response");
        }
        return result;
      },
    })),
  };
  const request = update({ displayName: "新资料", expectedUpdatedAt: initial.data.profile!.updatedAt, mutationId: "rollback-retry" });
  const failed = await serviceFor(broken).updateProfile(request, { actorId });
  assert.equal(failed.success, false);
  if (!failed.success) assert.equal(failed.error.code, "PROFILE_SAVE_UNAVAILABLE");
  assert.equal(JSON.stringify(failed).includes("private database failure"), false);
  assert.deepEqual(saved(await services[1].getProfile({ actorId })).data.profile, initial.data.profile);
  const receipts = await clients[1].query<{ count: string }>("select count(*) from orbit_records where workspace_id=$1 and collection_name='profile_mutations'", [workspaceId]);
  assert.equal(receipts.rows[0].count, "0");
  const recovered = saved(await services[1].updateProfile(request, { actorId }));
  assert.equal(recovered.data.profile!.displayName, "新资料");
  assert.equal(recovered.data.profile!.birthDate, "2000-02-29");
});

for (const failureCount of [1, 3]) test(`serialization failures retry at most twice and never leave partial writes (${failureCount})`, { skip }, async t => {
  const { clients, services, workspaceId, serviceFor } = await fixture(t);
  let attempts = 0;
  const interrupted: TransactionalPostgresClient = { ...clients[0],
    transaction: operation => clients[0].transaction(async tx => {
      attempts++;
      const result = await operation(tx);
      if (attempts <= failureCount) {
        await tx.query("do $$ begin raise exception using errcode = '40001', message = 'profile test serialization abort'; end $$");
      }
      return result;
    }),
  };
  const request = update({ displayName: "事务重试", expectedUpdatedAt: null, mutationId: "serial-retry" });
  const result = await serviceFor(interrupted).updateProfile(request, { actorId });
  assert.equal(attempts, failureCount === 1 ? 2 : 3);
  assert.equal(result.success, failureCount === 1);
  const count = await clients[1].query<{ count: string }>("select count(*) from orbit_records where workspace_id=$1", [workspaceId]);
  assert.equal(count.rows[0].count, failureCount === 1 ? "2" : "0", "profile and receipt must commit or roll back together");
  const recovered = saved(await services[1].updateProfile(request, { actorId }));
  assert.equal(recovered.data.mutationId, "serial-retry");
});

test("legacy sparse edits also merge inside the transaction without clearing the private date", { skip }, async t => {
  const { services } = await fixture(t);
  const initial = saved(await services[0].updateProfile({ displayName: "本人", birthDate: "2000-02-29" }, { actorId }));
  const results = await Promise.all([
    services[0].updateProfile({ organization: "新公司" }, { actorId }),
    services[1].updateProfile({ role: "新职位" }, { actorId }),
  ]);
  results.forEach(saved);
  const final = saved(await services[0].getProfile({ actorId })).data.profile!;
  assert.equal(final.organization, "新公司");
  assert.equal(final.role, "新职位");
  assert.equal(final.birthDate, "2000-02-29");
  assert.notEqual(final.updatedAt, initial.data.profile!.updatedAt);
});

test("HTTP save exposes a conflict and replays a receipt without leaking another actor", { skip }, async t => {
  const { services } = await fixture(t);
  const resolution = profileServiceFactory.create("mock");
  t.mock.method(profileServiceFactory, "create", () => ({ ...resolution, service: services[0] }));
  const routes = createProfileRouteHandlers({ resolveActor: async () => ({ id: actorId }) });
  const put = (body: unknown) => routes.PUT(new Request("https://profile.test/api/profile", {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }));
  const request = { displayName: "HTTP本人", birthDate: "2000-02-29", expectedUpdatedAt: null, mutationId: "http-save" };
  const first = await put(request);
  assert.equal(first.status, 200);
  const receipt = await first.json();
  assert.equal(receipt.data.mutationId, "http-save");
  const stale = await put({ ...request, mutationId: "stale-http-save" });
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).error.code, "CONFLICT");
  assert.deepEqual(await (await put(request)).json(), receipt);
  assert.equal((await put({ ...request, mutationId: 42 })).status, 400);
  const other = createProfileRouteHandlers({ resolveActor: async () => ({ id: "actor:other-http" }) });
  const read = await other.GET(new Request("https://profile.test/api/profile"));
  const otherPayload = await read.json();
  assert.equal(otherPayload.data.profile, null);
  assert.equal(JSON.stringify(otherPayload).includes("2000-02-29"), false);
});

test("configured production provider uses the transaction boundary, not an unprotected upsert", { skip }, async t => {
  const { workspaceId } = await fixture(t);
  const url = new URL("postgresql:///postgres");
  url.searchParams.set("host", socket!);
  url.searchParams.set("user", userInfo().username);
  const env = { ORBIT_LIVE_DATABASE_URL: url.toString(), ORBIT_WORKSPACE_ID: workspaceId };
  const provider = profileStorage.createConfiguredStorageProfileProvider({ env });
  assert.ok(provider);
  const runtime = createConfiguredTransactionalPostgresRuntime({ env });
  assert.ok(runtime);
  t.after(() => runtime.client.close());
  const service = createLiveProfileService({ provider, now: () => instant });
  const first = saved(await service.updateProfile(update({ displayName: "配置入口", expectedUpdatedAt: null, mutationId: "configured" }), { actorId }));
  assert.equal(first.data.mutationId, "configured");
  const reader = profileStorage.createConfiguredStorageProfileProvider({ env });
  assert.ok(reader);
  const readback = saved(await createLiveProfileService({ provider: reader }).getProfile({ actorId }));
  assert.equal(readback.data.profile?.displayName, "配置入口");
  assert.equal(readback.data.profile?.updatedAt, first.data.profile?.updatedAt);
  const stale = await service.updateProfile(update({ displayName: "拒绝覆盖", expectedUpdatedAt: null, mutationId: "configured-stale" }), { actorId });
  assert.equal(stale.success, false);
  if (!stale.success) assert.equal(stale.error.code, "PROFILE_VERSION_CONFLICT");
});

test("mutation fingerprint ignores JSON key order but not changed nested values", { skip }, async t => {
  const { services } = await fixture(t);
  const request = update({ displayName: "本人", handles: { email: "person@example.test", lineId: "line-one" }, expectedUpdatedAt: null, mutationId: "key-order" });
  const first = saved(await services[0].updateProfile(request, { actorId }));
  const reordered = update({ mutationId: "key-order", expectedUpdatedAt: null, handles: { lineId: "line-one", email: "person@example.test" }, displayName: "本人" });
  assert.deepEqual(await services[1].updateProfile(reordered, { actorId }), first);
  const collision = await services[1].updateProfile(update({ ...reordered, handles: { lineId: "changed", email: "person@example.test" } }), { actorId });
  assert.equal(collision.success, false);
  if (!collision.success) assert.equal(collision.error.code, "PROFILE_MUTATION_ID_REUSED");
});

test("the same mutation fingerprint does not depend on the API host's collation", { skip }, async t => {
  const { services } = await fixture(t);
  const request = update({ displayName: "本人", handles: { email: "person@example.test", lineId: "line-one" }, expectedUpdatedAt: null, mutationId: "host-collation" });
  const first = saved(await services[0].updateProfile(request, { actorId }));
  const compare = String.prototype.localeCompare;
  t.mock.method(String.prototype, "localeCompare", function (this: string, other: string) { return -compare.call(this, other); });
  assert.deepEqual(await services[1].updateProfile(request, { actorId }), first);
});

test("a nontransactional adapter cannot acknowledge a versioned save", { skip }, async t => {
  const { clients, workspaceId } = await fixture(t);
  const service = createLiveProfileService({ provider: profileStorage.createStorageProfileProvider({ store: createPostgresLiveRecordStore({ client: clients[0] }), workspaceId }) });
  const result = await service.updateProfile(update({ displayName: "不能保存", expectedUpdatedAt: null, mutationId: "unsafe" }), { actorId });
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "PROFILE_SAVE_UNAVAILABLE");
  assert.equal(saved(await service.getProfile({ actorId })).data.profile, null);
});
