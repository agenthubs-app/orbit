/**
 * R15 SC-R15-06（解除，内存 + 真实 PostgreSQL）：连接记 `unlinked_at`；我这边按勾选只留名字和公司 / 墓碑删除；
 * 对方那条招待新建的墓碑删除、统合进原有名刺的只结束连接；不发通知；同一个键重放；解除后可再连。
 */
import assert from "node:assert/strict";
import test from "node:test";

type TestOptions = { skip?: string | boolean };

import { createInviteCodeService, type InviteConnectedNotice } from "../../features/invite-codes/service";
import { migrateConfiguredTestDatabase } from "../support/migrated-configured-database";
import { ALICE, BOB, databaseTest, INVITE_WS, memoryHarness, profile, seedContact, withInviteDatabase, type InviteHarness } from "../support/invite-codes-harness";

test.before(async () => {
  if (!databaseTest.skip) await migrateConfiguredTestDatabase();
});

async function setup(harness: InviteHarness, options: { aliceHasBobsCard?: boolean } = {}) {
  await harness.setProfile(profile(ALICE));
  await harness.setProfile(profile(BOB));
  if (options.aliceHasBobsCard) {
    await seedContact(harness.contacts, { contactId: "card-bob", ownerId: ALICE, payload: { displayName: "Bob Example", notes: "from the card", primaryEmail: "bob@example.invalid", primaryPhone: "03-1111-2222" }, workspaceId: INVITE_WS });
  }
  const notices: InviteConnectedNotice[] = [];
  const service = createInviteCodeService({ log: () => undefined, notifier: { connected: async (notice) => void notices.push(notice) }, now: () => new Date("2026-10-11T03:00:00.000Z"), storage: harness.storage });
  const code = (await service.create(ALICE, { idempotencyKey: "c", maxUses: 10, shared: { displayName: "a" }, sharedKeys: ["organization", "email", "phone", "offering"] })).code;
  const bobsAlice = (await service.redeem(BOB, code, { idempotencyKey: "r", sharedKeys: ["organization", "email"] })).contactId;
  let alicesBob = (await service.linkedContactIds(ALICE))[0]!;
  // 复核 S1：兑换不再自动统合；Alice 自己确认「同じ人」后才统合进她的名刺。
  if (options.aliceHasBobsCard) alicesBob = (await service.mergeConnection(ALICE, alicesBob, { idempotencyKey: "m" })).contactId;
  const read = (id: string) => harness.contacts.getRecord({ collectionName: "contacts", includeDeleted: true, recordId: id, workspaceId: INVITE_WS });
  return { alicesBob, bobsAlice, code, notices, read, service };
}

function suite(name: string, options: TestOptions, withHarness: (run: (harness: InviteHarness) => Promise<void>) => Promise<void>) {
  test(`${name}: keep as contact leaves only name and company on my side; their invite-created card is deleted; nobody is told`, options, async () => {
    await withHarness(async (harness) => {
      const { alicesBob, bobsAlice, notices, read, service } = await setup(harness);
      const before = notices.length;
      const result = await service.unlink(BOB, bobsAlice, { idempotencyKey: "u", keepAsContact: true });
      assert.deepEqual(result, { keptContactId: bobsAlice, outcome: "unlinked" });
      const mine = await read(bobsAlice);
      assert.equal(mine?.lifecycleState, "active");
      assert.deepEqual([mine?.payload.displayName, mine?.payload.organization, mine?.payload.role, mine?.payload.primaryEmail, mine?.payload.primaryPhone, mine?.payload.publicProfile],
        ["Alice Example", "alice Inc", undefined, undefined, undefined, undefined]);
      const cleared = (mine?.payload.fieldHistory as Array<{ field: string; next: string | null }>).filter((entry) => entry.next === null).map((entry) => entry.field).sort();
      assert.deepEqual(cleared, ["email", "offering", "phone", "role"]);
      assert.equal((await read(alicesBob))?.lifecycleState, "deleted", "the other side's invite-created card is tombstoned (recoverable)");
      assert.equal(notices.length, before, "unlinking tells nobody");
      assert.deepEqual(await service.linkedContactIds(ALICE), []);
      assert.deepEqual(await service.linkedContactIds(BOB), []);
      await assert.rejects(service.connection(BOB, bobsAlice), /not an invite connection/u);
      assert.deepEqual(await service.unlink(BOB, bobsAlice, { idempotencyKey: "u", keepAsContact: true }), result, "the same key replays");
    });
  });

  test(`${name}: delete removes my card; a card merged into the other side's own business card only ends the link`, options, async () => {
    await withHarness(async (harness) => {
      const { alicesBob, bobsAlice, read, service } = await setup(harness, { aliceHasBobsCard: true });
      assert.equal(alicesBob, "card-bob", "Alice merged Bob into her existing card");
      assert.deepEqual(await service.unlink(BOB, bobsAlice, { idempotencyKey: "u", keepAsContact: false }), { outcome: "unlinked" });
      assert.equal((await read(bobsAlice))?.lifecycleState, "deleted");
      const card = await read("card-bob");
      assert.equal(card?.lifecycleState, "active", "Alice's own card stays");
      assert.deepEqual([card?.payload.notes, card?.payload.primaryPhone], ["from the card", "03-1111-2222"]);
      assert.deepEqual(await service.linkedContactIds(ALICE), [], "no longer self-entered");
    });
  });

  test(`${name}: either side can unlink, and the two can connect again with a new code`, options, async () => {
    await withHarness(async (harness) => {
      const { alicesBob, bobsAlice, read, service } = await setup(harness);
      await service.unlink(ALICE, alicesBob, { idempotencyKey: "u", keepAsContact: false });
      assert.equal((await read(alicesBob))?.lifecycleState, "deleted");
      assert.equal((await read(bobsAlice))?.lifecycleState, "deleted");
      const code = (await service.create(ALICE, { idempotencyKey: "c-2", maxUses: 10, shared: { displayName: "a" } })).code;
      const again = await service.redeem(BOB, code, { idempotencyKey: "r-2", sharedKeys: [] });
      assert.equal(again.outcome, "connected");
      assert.notEqual(again.contactId, bobsAlice, "a new connection is a new row with new cards");
      assert.equal((await service.linkedContactIds(BOB)).length, 1);
    });
  });
}

suite("memory", {}, (run) => run(memoryHarness()));
suite("postgres", databaseTest, (run) => withInviteDatabase(run));
