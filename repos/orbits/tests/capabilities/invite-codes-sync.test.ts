/**
 * R15 SC-R15-06（资料同步，内存 + 真实 PostgreSQL）：对方改资料 → 一轮后共享字段更新、旧值进历史、备注不动；
 * 我改过的字段暂停同步并出现在 `pausedFields`；改共享项目 → 下一轮清掉 / 写入；解除后不再同步；计数清理只删 2 天前的窗口。
 */
import assert from "node:assert/strict";
import test from "node:test";

type TestOptions = { skip?: string | boolean };

import { createMemoryInviteAttemptStore } from "../../features/invite-codes/rate-limit";
import { createInviteCodeService } from "../../features/invite-codes/service";
import { createInviteAttemptsCleanupMaintenanceTask, createInviteProfileSyncMaintenanceTask, INVITE_ATTEMPTS_CLEANUP_TASK, INVITE_PROFILE_SYNC_TASK, runInviteProfileSync } from "../../features/invite-codes/sync";
import { writeInviteFields } from "../../features/invite-codes/invite-fields";
import { migrateConfiguredTestDatabase } from "../support/migrated-configured-database";
import { ALICE, BOB, databaseTest, INVITE_WS, memoryHarness, profile, withInviteDatabase, type InviteHarness } from "../support/invite-codes-harness";

test.before(async () => {
  if (!databaseTest.skip) await migrateConfiguredTestDatabase();
});

const NOW = Date.parse("2026-10-11T03:00:00.000Z");

async function connect(harness: InviteHarness) {
  await harness.setProfile(profile(ALICE));
  await harness.setProfile(profile(BOB));
  let clock = NOW;
  const now = () => new Date(clock);
  const service = createInviteCodeService({ log: () => undefined, now, storage: harness.storage });
  const code = (await service.create(ALICE, { idempotencyKey: "c", maxUses: 10, shared: { displayName: "a" }, sharedKeys: ["organization", "offering"] })).code;
  const bobsAlice = (await service.redeem(BOB, code, { idempotencyKey: "r", sharedKeys: ["organization"] })).contactId;
  const alicesBob = (await service.linkedContactIds(ALICE))[0]!;
  const sync = () => {
    clock += 60_000;
    return runInviteProfileSync({ log: () => undefined, now, storage: harness.storage });
  };
  const read = async (id: string) => (await harness.contacts.getRecord({ collectionName: "contacts", includeDeleted: true, recordId: id, workspaceId: INVITE_WS }))!;
  return { alicesBob, bobsAlice, now, read, service, sync };
}

function suite(name: string, options: TestOptions, withHarness: (run: (harness: InviteHarness) => Promise<void>) => Promise<void>) {
  test(`${name}: a profile change reaches the other side in one pass, old values go to history, notes stay`, options, async () => {
    await withHarness(async (harness) => {
      const { bobsAlice, read, sync } = await connect(harness);
      assert.deepEqual(await sync(), { examined: 1, updated: 0 }, "nothing changed yet");
      // Bob 在 Alice 的联系人上写了备注；Alice 改了资料（公司、役職、提供できること、邮箱——邮箱没共享）。
      const before = await read(bobsAlice);
      await harness.contacts.updateRecordIfCurrent!({ ...before, payload: { ...before.payload, notes: "lunch on Friday", updatedAt: "2026-10-11T03:00:30.000Z" }, updatedAt: "2026-10-11T03:00:30.000Z" }, { updatedAt: before.updatedAt, userId: BOB });
      await harness.setProfile(profile(ALICE, { email: "new@example.invalid", offering: ["mentoring", "hiring"], organization: "Alice Labs", role: "CTO", updatedAt: "2026-10-12T00:00:00.000Z" }));
      assert.deepEqual(await sync(), { examined: 1, updated: 1 });
      const after = await read(bobsAlice);
      assert.deepEqual([after.payload.organization, after.payload.role, after.payload.notes, after.payload.primaryEmail], ["Alice Labs", "CTO", "lunch on Friday", undefined]);
      assert.deepEqual(after.payload.publicProfile, { offering: ["mentoring", "hiring"] });
      const history = (after.payload.fieldHistory as Array<{ field: string; previous: string | null; next: string | null; source: string }>).filter((entry) => entry.source === "invite_sync");
      assert.deepEqual(history.map((entry) => [entry.field, entry.previous, entry.next]), [
        ["organization", "alice Inc", "Alice Labs"],
        ["role", "CEO", "CTO"],
        ["offering", "alice offers advice", "mentoring、hiring"],
      ]);
      assert.deepEqual(await sync(), { examined: 1, updated: 0 }, "the next pass has nothing to do");
    });
  });

  test(`${name}: a field I changed myself stops syncing and shows in pausedFields`, options, async () => {
    await withHarness(async (harness) => {
      const { bobsAlice, now, read, service, sync } = await connect(harness);
      await writeInviteFields({ actorId: BOB, contactId: bobsAlice, now, source: "manual", store: harness.contacts, values: { role: "Founder" }, workspaceId: INVITE_WS });
      assert.deepEqual((await service.connection(BOB, bobsAlice)).pausedFields, ["organization"]);
      await harness.setProfile(profile(ALICE, { offering: ["new offer"], organization: "Alice Labs", role: "CTO", updatedAt: "2026-10-12T00:00:00.000Z" }));
      await sync();
      const after = await read(bobsAlice);
      assert.equal(after.payload.role, "Founder", "my value is kept");
      assert.equal(after.payload.organization, "Alice Labs", "the other field of the same key still syncs");
      assert.deepEqual(after.payload.publicProfile, { offering: ["new offer"] });
      assert.deepEqual((await service.connection(BOB, bobsAlice)).pausedFields, ["organization"]);
    });
  });

  test(`${name}: turning a shared item off clears it on the other side next pass; turning one on fills it`, options, async () => {
    await withHarness(async (harness) => {
      const { alicesBob, bobsAlice, read, service, sync } = await connect(harness);
      // Alice 不再共享会社・役職，改为共享电话。
      const view = await service.updateShare(ALICE, alicesBob, { idempotencyKey: "s", sharedKeys: ["offering", "phone"] });
      assert.deepEqual(view.sharedByMe, ["offering", "phone"]);
      assert.equal((await read(bobsAlice)).payload.organization, "alice Inc", "nothing changes until the next pass");
      await sync();
      const after = await read(bobsAlice);
      assert.deepEqual([after.payload.organization, after.payload.role, after.payload.primaryPhone], [undefined, undefined, "090-1234-5678"]);
      assert.deepEqual((await service.connection(BOB, bobsAlice)).sharedByPeer, ["offering", "phone"]);
      const cleared = (after.payload.fieldHistory as Array<{ field: string; next: string | null; source: string }>).filter((entry) => entry.source === "invite_sync" && entry.next === null).map((entry) => entry.field);
      assert.deepEqual(cleared, ["organization", "role"]);
    });
  });

  test(`${name}: after unlinking nothing syncs any more`, options, async () => {
    await withHarness(async (harness) => {
      const { bobsAlice, read, service, sync } = await connect(harness);
      await service.unlink(BOB, bobsAlice, { idempotencyKey: "u", keepAsContact: true });
      await harness.setProfile(profile(ALICE, { organization: "Alice Labs", updatedAt: "2026-10-12T00:00:00.000Z" }));
      assert.deepEqual(await sync(), { examined: 0, updated: 0 });
      assert.equal((await read(bobsAlice)).payload.organization, "alice Inc");
    });
  });
}

suite("memory", {}, (run) => run(memoryHarness()));
suite("postgres", databaseTest, (run) => withInviteDatabase(run));

test("maintenance tasks: names, skips when unconfigured, attempt cleanup keeps two days", async () => {
  const sync = createInviteProfileSyncMaintenanceTask({ resolve: () => null });
  const cleanup = createInviteAttemptsCleanupMaintenanceTask({ resolve: () => null });
  assert.deepEqual([sync.name, cleanup.name], [INVITE_PROFILE_SYNC_TASK, INVITE_ATTEMPTS_CLEANUP_TASK]);
  assert.deepEqual(await sync.run({ deadline: Date.now() + 1000, now: () => new Date(NOW) }), { skipped: "database_unconfigured" });
  assert.deepEqual(await cleanup.run({ deadline: Date.now() + 1000, now: () => new Date(NOW) }), { skipped: "database_unconfigured" });

  const store = createMemoryInviteAttemptStore();
  await store.increment("old", new Date(NOW - 3 * 24 * 60 * 60 * 1000));
  await store.increment("edge", new Date(NOW - 2 * 24 * 60 * 60 * 1000));
  await store.increment("new", new Date(NOW - 60 * 60 * 1000));
  const task = createInviteAttemptsCleanupMaintenanceTask({ resolve: () => store });
  assert.deepEqual(await task.run({ deadline: Date.now() + 1000, now: () => new Date(NOW) }), { deleted: 1 });
  assert.equal(store.rows.size, 2);

  const harness = memoryHarness();
  const configured = createInviteProfileSyncMaintenanceTask({ resolve: () => harness.storage });
  assert.deepEqual(await configured.run({ deadline: Date.now() + 1000, now: () => new Date(NOW) }), { examined: 0, updated: 0 });
});
