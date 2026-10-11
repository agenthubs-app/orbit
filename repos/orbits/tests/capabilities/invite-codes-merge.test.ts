/**
 * R15 复核 S1 / M1（内存 + 真实 PostgreSQL）：兑换不再用对方自报的资料覆盖我已有的联系人。
 * - 兑换总是新建一条「本人入力」；我人脈里可能是同一人的已有联系人只记成连接上的建议，一个字段都不改。
 * - 所有者确认（merge）才统合：已有字段只补空、不同的不覆盖（停止同步）、新建那条墓碑删除；「別の人」（dismiss）只去掉建议。
 * - 解除时「保留」只清招待写入且之后没被改过的字段，统合前原有的值不动。
 * - 他人隔离：别人不能统合 / 去掉我的建议。
 */
import assert from "node:assert/strict";
import test from "node:test";

type TestOptions = { skip?: string | boolean };

import { InviteCodeError } from "../../features/invite-codes/contract";
import { createInviteCodeService, type InviteCodeService } from "../../features/invite-codes/service";
import { runInviteProfileSync } from "../../features/invite-codes/sync";
import { migrateConfiguredTestDatabase } from "../support/migrated-configured-database";
import { ALICE, BOB, CAROL, databaseTest, INVITE_WS, memoryHarness, profile, seedContact, withInviteDatabase, type InviteHarness } from "../support/invite-codes-harness";

test.before(async () => {
  if (!databaseTest.skip) await migrateConfiguredTestDatabase();
});

const MALLORY = "actor:mallory";
let clock = Date.parse("2026-10-11T03:00:00.000Z");
const now = () => new Date(clock);

function service(harness: InviteHarness): InviteCodeService {
  return createInviteCodeService({ log: () => undefined, now, storage: harness.storage });
}

async function read(harness: InviteHarness, id: string) {
  return harness.contacts.getRecord({ collectionName: "contacts", includeDeleted: true, recordId: id, workspaceId: INVITE_WS });
}

/** 比较时去掉存储层每次都会变的东西以外，什么都不许变。 */
async function snapshot(harness: InviteHarness, id: string) {
  const record = await read(harness, id);
  return JSON.stringify({ lifecycle: record?.lifecycleState, payload: record?.payload, updatedAt: record?.updatedAt });
}

async function expectError(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (error: unknown) => error instanceof InviteCodeError && error.code === code);
}

/** Alice 的人脈里有「田中 太郎 · Sony」的名刺；Mallory 把资料填成田中 + Sony + 自己的邮箱电话（REVIEW P6）。 */
async function impersonation(harness: InviteHarness) {
  await harness.setProfile(profile(ALICE));
  await harness.setProfile(profile(MALLORY, { displayName: "田中 太郎", email: "mallory@evil.example", organization: "Sony", phone: "090-6666-6666", role: "Hacker" }));
  await seedContact(harness.contacts, {
    contactId: "card-tanaka",
    ownerId: ALICE,
    payload: { displayName: "田中 太郎", notes: "met at CEATEC", organization: "Sony", primaryEmail: "tanaka@sony.example", primaryPhone: "03-1234-5678", role: "部長" },
    workspaceId: INVITE_WS,
  });
  const invite = service(harness);
  const code = (await invite.create(ALICE, { idempotencyKey: "c", maxUses: 10, shared: { displayName: "a" }, sharedKeys: ["organization", "email"] })).code;
  const before = await snapshot(harness, "card-tanaka");
  const result = await invite.redeem(MALLORY, code, { idempotencyKey: "r", sharedKeys: ["organization", "email", "phone", "offering"] });
  const [alicesMallory] = await invite.linkedContactIds(ALICE);
  return { alicesMallory: alicesMallory!, before, code, invite, result };
}

function suite(name: string, options: TestOptions, withHarness: (run: (harness: InviteHarness) => Promise<void>) => Promise<void>) {
  test(`${name}: REVIEW P6 — an impersonator redeeming my code does not touch my existing card; a suggestion is recorded instead`, options, async () => {
    await withHarness(async (harness) => {
      const { alicesMallory, before, invite, result } = await impersonation(harness);
      assert.equal(result.outcome, "connected", "always a new self-entered contact");
      assert.notEqual(alicesMallory, "card-tanaka");
      assert.equal(await snapshot(harness, "card-tanaka"), before, "not one field of the existing card changed");
      const mine = await read(harness, alicesMallory);
      assert.deepEqual([mine?.payload.displayName, mine?.payload.primaryEmail, mine?.payload.primaryPhone], ["田中 太郎", "mallory@evil.example", "090-6666-6666"]);
      const view = await invite.connection(ALICE, alicesMallory);
      assert.deepEqual(view.mergeSuggestion, { contactId: "card-tanaka", displayName: "田中 太郎", matchedOn: ["name_organization"] });
      const history = await invite.history(ALICE);
      assert.deepEqual(history.items[0]!.joined.map((person) => [person.contactId, person.mergeSuggestion?.contactId]), [[alicesMallory, "card-tanaka"]]);
    });
  });

  test(`${name}: REVIEW H1 — an inviter with a hidden email that matches my boss does not rename my boss`, options, async () => {
    await withHarness(async (harness) => {
      await harness.setProfile(profile(ALICE, { displayName: "Fake Name", email: "boss@corp.example", organization: "Other" }));
      await harness.setProfile(profile(BOB));
      await seedContact(harness.contacts, { contactId: "contact-boss", ownerId: BOB, payload: { displayName: "Real Boss", organization: "Corp", primaryEmail: "boss@corp.example" }, workspaceId: INVITE_WS });
      const invite = service(harness);
      const code = (await invite.create(ALICE, { idempotencyKey: "c", maxUses: 10, shared: { displayName: "x" }, sharedKeys: ["organization", "email"] })).code;
      const before = await snapshot(harness, "contact-boss");
      const result = await invite.redeem(BOB, code, { idempotencyKey: "r", sharedKeys: [] });
      assert.equal(result.outcome, "connected");
      assert.notEqual(result.contactId, "contact-boss");
      assert.equal(await snapshot(harness, "contact-boss"), before, "my boss is still my boss");
      assert.deepEqual((await invite.connection(BOB, result.contactId)).mergeSuggestion, { contactId: "contact-boss", displayName: "Real Boss", matchedOn: ["email"] });
    });
  });

  test(`${name}: the owner confirms — empty fields are filled, different ones are kept and paused, the invite card is tombstoned`, options, async () => {
    await withHarness(async (harness) => {
      await harness.setProfile(profile(ALICE));
      await harness.setProfile(profile(BOB));
      // Alice 的名刺：邮箱相同、公司不同、没有电话和役職。
      await seedContact(harness.contacts, { contactId: "card-bob", ownerId: ALICE, payload: { displayName: "Bob E.", notes: "met at expo", organization: "Old Corp", primaryEmail: "bob@example.invalid" }, workspaceId: INVITE_WS });
      const invite = service(harness);
      const code = (await invite.create(ALICE, { idempotencyKey: "c", maxUses: 10, shared: { displayName: "a" } })).code;
      const redeemed = await invite.redeem(BOB, code, { idempotencyKey: "r", sharedKeys: ["organization", "email", "phone"] });
      const [created] = await invite.linkedContactIds(ALICE);
      assert.notEqual(created, "card-bob");
      await expectError(invite.mergeConnection(CAROL, created!, { idempotencyKey: "m" }), "NOT_FOUND");
      await expectError(invite.mergeConnection(BOB, created!, { idempotencyKey: "m" }), "NOT_FOUND");
      await expectError(invite.dismissMerge(BOB, created!, { idempotencyKey: "d" }), "NOT_FOUND");

      const merged = await invite.mergeConnection(ALICE, created!, { idempotencyKey: "m" });
      assert.equal(merged.contactId, "card-bob");
      assert.equal(merged.mergeSuggestion, undefined);
      assert.deepEqual(merged.pausedFields, ["organization"], "the company differs: mine stays and stops syncing");
      const card = await read(harness, "card-bob");
      assert.deepEqual(
        [card?.payload.displayName, card?.payload.organization, card?.payload.role, card?.payload.primaryEmail, card?.payload.primaryPhone, card?.payload.notes],
        ["Bob E.", "Old Corp", "CEO", "bob@example.invalid", "090-1234-5678", "met at expo"],
        "only empty fields were filled",
      );
      assert.equal((await read(harness, created!))?.lifecycleState, "deleted", "the invite card is tombstoned (recoverable)");
      assert.deepEqual(await invite.linkedContactIds(ALICE), ["card-bob"]);
      assert.deepEqual(await invite.mergeConnection(ALICE, created!, { idempotencyKey: "m" }), merged, "a retry gives the same answer");
      assert.equal((await invite.history(ALICE)).items[0]!.joined[0]!.contactId, "card-bob");
      assert.equal(redeemed.outcome, "connected");

      // Bob 改资料：我自己的公司不被覆盖；补上的役職跟着变。
      clock += 60_000;
      await harness.setProfile(profile(BOB, { organization: "Bob Labs", role: "CTO", updatedAt: "2026-10-12T00:00:00.000Z" }));
      await runInviteProfileSync({ log: () => undefined, now, storage: harness.storage });
      const synced = await read(harness, "card-bob");
      assert.deepEqual([synced?.payload.organization, synced?.payload.role], ["Old Corp", "CTO"]);
    });
  });

  test(`${name}: "a different person" drops the suggestion and changes nothing`, options, async () => {
    await withHarness(async (harness) => {
      const { alicesMallory, before, invite } = await impersonation(harness);
      await expectError(invite.dismissMerge(CAROL, alicesMallory, { idempotencyKey: "d" }), "NOT_FOUND");
      const view = await invite.dismissMerge(ALICE, alicesMallory, { idempotencyKey: "d" });
      assert.deepEqual([view.contactId, view.mergeSuggestion], [alicesMallory, undefined]);
      assert.deepEqual(await invite.dismissMerge(ALICE, alicesMallory, { idempotencyKey: "d-2" }), view, "dismissing again is harmless");
      await expectError(invite.mergeConnection(ALICE, alicesMallory, { idempotencyKey: "m" }), "NOT_FOUND");
      assert.equal(await snapshot(harness, "card-tanaka"), before);
      assert.deepEqual(await invite.linkedContactIds(ALICE), [alicesMallory]);
    });
  });

  test(`${name}: until the owner merges, sync only touches the new card; a card already linked to someone else is never suggested`, options, async () => {
    await withHarness(async (harness) => {
      const { alicesMallory, before, code, invite } = await impersonation(harness);
      clock += 60_000;
      await harness.setProfile(profile(MALLORY, { displayName: "田中 太郎", email: "other@evil.example", organization: "Sony", phone: "090-7777-7777", role: "Boss", updatedAt: "2026-10-12T00:00:00.000Z" }));
      await runInviteProfileSync({ log: () => undefined, now, storage: harness.storage });
      assert.equal((await read(harness, alicesMallory))?.payload.primaryEmail, "other@evil.example");
      assert.equal(await snapshot(harness, "card-tanaka"), before, "the existing card is still untouched");
      // 另一个人也冒充田中：Mallory 那条（已是招待连接）不会被当成候选。
      await harness.setProfile(profile(CAROL, { displayName: "田中 太郎", email: "carol@evil.example", organization: "Sony" }));
      const second = await invite.redeem(CAROL, code, { idempotencyKey: "r-carol", sharedKeys: ["organization", "email"] });
      assert.equal(second.outcome, "connected");
      const carolsCard = (await invite.linkedContactIds(ALICE)).find((id) => id !== alicesMallory)!;
      assert.equal((await invite.connection(ALICE, carolsCard)).mergeSuggestion?.contactId, "card-tanaka");
      assert.equal(await snapshot(harness, "card-tanaka"), before);
    });
  });

  test(`${name}: REVIEW M1 — unlink "keep" after a merge restores nothing it should not: the card's own values stay, filled ones are cleared`, options, async () => {
    await withHarness(async (harness) => {
      await harness.setProfile(profile(ALICE));
      await harness.setProfile(profile(BOB));
      await seedContact(harness.contacts, { contactId: "card-bob", ownerId: ALICE, payload: { displayName: "Bob Example", notes: "from the card", organization: "bob Inc", primaryEmail: "bob@card.example", role: "部長" }, workspaceId: INVITE_WS });
      const invite = service(harness);
      const code = (await invite.create(ALICE, { idempotencyKey: "c", maxUses: 10, shared: { displayName: "a" } })).code;
      await invite.redeem(BOB, code, { idempotencyKey: "r", sharedKeys: ["organization", "email", "phone", "offering"] });
      const [created] = await invite.linkedContactIds(ALICE);
      await invite.mergeConnection(ALICE, created!, { idempotencyKey: "m" });
      const merged = await read(harness, "card-bob");
      assert.deepEqual([merged?.payload.primaryEmail, merged?.payload.primaryPhone, merged?.payload.role], ["bob@card.example", "090-1234-5678", "部長"]);
      const result = await invite.unlink(ALICE, "card-bob", { idempotencyKey: "u", keepAsContact: true });
      assert.deepEqual(result, { keptContactId: "card-bob", outcome: "unlinked" });
      const kept = await read(harness, "card-bob");
      assert.deepEqual(
        [kept?.lifecycleState, kept?.payload.displayName, kept?.payload.organization, kept?.payload.role, kept?.payload.primaryEmail, kept?.payload.primaryPhone, kept?.payload.publicProfile, kept?.payload.notes],
        ["active", "Bob Example", "bob Inc", "部長", "bob@card.example", undefined, undefined, "from the card"],
        "my own values from before the merge stay; what the invite filled in is cleared",
      );
    });
  });

  test(`${name}: REVIEW M1 — unlink "keep" on an invite-created card clears only what the invite wrote and I did not change since`, options, async () => {
    await withHarness(async (harness) => {
      await harness.setProfile(profile(ALICE));
      await harness.setProfile(profile(BOB));
      const invite = service(harness);
      const code = (await invite.create(ALICE, { idempotencyKey: "c", maxUses: 10, shared: { displayName: "a" }, sharedKeys: ["organization", "email", "phone"] })).code;
      const { contactId } = await invite.redeem(BOB, code, { idempotencyKey: "r", sharedKeys: [] });
      // Bob 自己改了 Alice 的电话（之后就是 Bob 的值，不是招待写的）。
      const record = (await read(harness, contactId))!;
      clock += 1000;
      await harness.contacts.updateRecordIfCurrent!({ ...record, payload: { ...record.payload, primaryPhone: "03-9999-0000" }, updatedAt: now().toISOString() }, { updatedAt: record.updatedAt, userId: BOB });
      await invite.unlink(BOB, contactId, { idempotencyKey: "u", keepAsContact: true });
      const kept = await read(harness, contactId);
      assert.deepEqual([kept?.payload.displayName, kept?.payload.organization, kept?.payload.role, kept?.payload.primaryEmail, kept?.payload.primaryPhone],
        ["Alice Example", "alice Inc", undefined, undefined, "03-9999-0000"]);
    });
  });
}

suite("memory", {}, (run) => run(memoryHarness()));
suite("postgres", databaseTest, (run) => withInviteDatabase(run));
