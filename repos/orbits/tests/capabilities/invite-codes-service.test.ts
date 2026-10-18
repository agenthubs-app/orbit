/**
 * R15 SC-R15-01 / 02 / 03 / 05（服务层，内存 + 真实 PostgreSQL 各一套）：发码替换旧码、幂等、只认共享键；
 * 过期 / 作废 / 被替换 / 满员；并发兑换不超过上限；already_connected 不占用量；自己的码；双向建联系人且值来自资料；
 * 两个方向的统合（以对方为准、旧值进历史）；连接行；通知邀请人一条；双方入队计划候补；解除后再连；他人隔离。
 */
import assert from "node:assert/strict";
import test from "node:test";

type TestOptions = { skip?: string | boolean };

import { InviteCodeError } from "../../features/invite-codes/contract";
import { inviteProfileFromPayload } from "../../features/invite-codes/profile-reader";
import { createInviteCodeService, type InviteConnectedNotice } from "../../features/invite-codes/service";
import { migrateConfiguredTestDatabase } from "../support/migrated-configured-database";
import {
  ALICE, BOB, CAROL, databaseTest, INVITE_WS, memoryHarness, profile, seedContact, withInviteDatabase,
  type InviteHarness, type PlanMatchCall,
} from "../support/invite-codes-harness";

test.before(async () => {
  if (!databaseTest.skip) await migrateConfiguredTestDatabase();
});

const DAY = 24 * 60 * 60 * 1000;
const START = Date.parse("2026-10-11T03:00:00.000Z");

function setup(harness: InviteHarness, options: { generateCode?: () => string } = {}) {
  let clock = START;
  const notices: InviteConnectedNotice[] = [];
  const service = createInviteCodeService({
    linkOrigin: "https://orbit.example",
    log: () => undefined,
    notifier: { connected: async (notice) => void notices.push(notice) },
    now: () => new Date(clock),
    storage: harness.storage,
    ...(options.generateCode ? { generateCode: options.generateCode } : {}),
  });
  return { advance: (ms: number) => void (clock += ms), notices, service };
}

async function contact(harness: InviteHarness, id: string) {
  return harness.contacts.getRecord({ collectionName: "contacts", includeDeleted: true, recordId: id, workspaceId: INVITE_WS });
}

async function expectError(promise: Promise<unknown>, code: InviteCodeError["code"]) {
  await assert.rejects(promise, (error: unknown) => error instanceof InviteCodeError && error.code === code, code);
}

const key = (value: string) => ({ idempotencyKey: value });

test("invite profile reader preserves saved visibility and fails closed on malformed visibility", () => {
  const base = { displayName: "Alice", publicProfile: { offering: ["Offer"] } };
  const at = "2026-10-01T00:00:00.000Z";
  assert.equal(inviteProfileFromPayload(ALICE, base, at)?.publicFields, undefined, "legacy profiles remain visible");
  assert.deepEqual(inviteProfileFromPayload(ALICE, { ...base, publicFields: { companyRole: false, offeringSeeking: true, intro: false } }, at)?.publicFields,
    { companyRole: false, offeringSeeking: true, intro: false });
  assert.deepEqual(inviteProfileFromPayload(ALICE, { ...base, publicFields: { companyRole: "false" } }, at)?.publicFields,
    { companyRole: false, offeringSeeking: false, intro: false });
});

function suite(name: string, options: TestOptions, withHarness: (run: (harness: InviteHarness, planCalls: () => Promise<PlanMatchCall[]>) => Promise<void>) => Promise<void>) {
  test(`${name}: issuing a code supersedes the old one, replays by key, and reads shared values from the profile only`, options, async () => {
    await withHarness(async (harness) => {
      await harness.setProfile(profile(ALICE));
      const { advance, service } = setup(harness);
      const first = await service.create(ALICE, { maxUses: 10, shared: { displayName: "Spoofed", email: "spoof@example.invalid" }, ...key("c-1") });
      assert.match(first.code, /^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{4}$/u);
      assert.equal(first.link, `https://orbit.example/i/${first.code}`);
      assert.deepEqual(first.shared, { displayName: "Alice Example", offering: ["alice offers advice"], organization: "alice Inc", role: "CEO", seeking: ["alice seeks investors"] }, "default keys; the client's values are ignored");
      assert.equal(first.expiresAt, new Date(START + 7 * DAY).toISOString());
      assert.deepEqual(await service.create(ALICE, { maxUses: 10, shared: { displayName: "x" }, ...key("c-1") }), first, "same key replays");
      await expectError(service.create(ALICE, { maxUses: 3, shared: { displayName: "x" }, ...key("c-1") }), "IDEMPOTENCY_CONFLICT");

      advance(1000);
      const second = await service.create(ALICE, { maxUses: 3, shared: { displayName: "x" }, sharedKeys: ["email", "organization"], ...key("c-2") });
      assert.notEqual(second.code, first.code);
      assert.deepEqual(second.shared, { displayName: "Alice Example", email: "alice@example.invalid", organization: "alice Inc", role: "CEO" });
      assert.equal((await service.current(ALICE))?.code, second.code);
      const history = (await service.history(ALICE)).items;
      assert.deepEqual(history.map((item) => [item.code, item.status]), [[second.code, "active"], [first.code, "superseded"]]);
      await expectError(service.preview(first.code, null), "UNAVAILABLE");

      await expectError(service.create(BOB, { maxUses: 10, shared: { displayName: "Bob" }, ...key("c-3") }), "PROFILE_REQUIRED");
    });
  });

  test(`${name}: a code collision retries up to five times`, options, async () => {
    await withHarness(async (harness) => {
      await harness.setProfile(profile(ALICE));
      await harness.setProfile(profile(BOB));
      const queue = ["K7QX2M9P", "K7QX2M9P", "H8MW4QZT"];
      const { service } = setup(harness, { generateCode: () => queue.shift() ?? "K7QX2M9P" });
      assert.equal((await service.create(ALICE, { maxUses: 10, shared: { displayName: "a" }, ...key("a") })).code, "K7QX-2M9P");
      assert.equal((await service.create(BOB, { maxUses: 10, shared: { displayName: "b" }, ...key("b") })).code, "H8MW-4QZT", "one collision, then a fresh code");
      await expectError(service.create(BOB, { maxUses: 10, shared: { displayName: "b" }, ...key("b2") }), "CONFLICT");
    });
  });

  test(`${name}: the preview never shows contacts and hides revoked, superseded, unknown and long-expired codes`, options, async () => {
    await withHarness(async (harness) => {
      await harness.setProfile(profile(ALICE));
      await harness.setProfile(profile(BOB));
      const { advance, service } = setup(harness);
      const code = (await service.create(ALICE, { maxUses: 10, shared: { displayName: "a" }, sharedKeys: ["organization", "email", "phone", "offering"], ...key("p-1") })).code;
      const preview = await service.preview(code, null);
      assert.deepEqual(preview, { code, expiresAt: new Date(START + 7 * DAY).toISOString(), shared: { displayName: "Alice Example", offering: ["alice offers advice"], organization: "alice Inc", role: "CEO" }, status: "active" });
      assert.equal(JSON.stringify(preview).includes("@"), false);
      assert.deepEqual(await service.preview(code.toLowerCase().replace("-", " "), BOB).then((item) => [item.isOwnCode, item.inviterAlreadyConnected]), [false, false]);
      assert.equal((await service.preview(code, ALICE)).isOwnCode, true);
      await expectError(service.preview("K7QX-2M9O", null), "UNAVAILABLE");
      await expectError(service.preview("ZZZZ-ZZZZ", null), "UNAVAILABLE");
      advance(7 * DAY);
      assert.equal((await service.preview(code, null)).status, "expired");
      assert.equal(await service.current(ALICE), null, "an expired code is not current");
      advance(30 * DAY);
      assert.equal((await service.preview(code, null)).status, "expired", "exactly 30 days after expiry still previews");
      advance(1);
      await expectError(service.preview(code, null), "UNAVAILABLE");
      const fresh = (await service.create(ALICE, { maxUses: 10, shared: { displayName: "a" }, ...key("p-2") })).code;
      await service.revoke(ALICE, fresh);
      await expectError(service.preview(fresh, null), "UNAVAILABLE");
      await expectError(service.redeem(BOB, fresh, { sharedKeys: [], ...key("r-1") }), "UNAVAILABLE");
    });
  });

  test(`${name}: public visibility narrows only the pre-redemption preview`, options, async () => {
    await withHarness(async (harness) => {
      await harness.setProfile(profile(ALICE, {
        publicFields: { companyRole: false, offeringSeeking: false, intro: false },
      }));
      await harness.setProfile(profile(BOB));
      const { service } = setup(harness);
      const code = (await service.create(ALICE, {
        maxUses: 10, shared: { displayName: "ignored" }, sharedKeys: ["organization", "offering", "seeking", "email"], ...key("private-preview"),
      })).code;
      assert.deepEqual((await service.preview(code, null)).shared, { displayName: "Alice Example" });
      assert.deepEqual((await service.preview(code, BOB)).shared, { displayName: "Alice Example" });
      const redeemed = await service.redeem(BOB, code, { sharedKeys: [], ...key("private-redeem") });
      assert.deepEqual(redeemed.peer, {
        displayName: "Alice Example", email: "alice@example.invalid", offering: ["alice offers advice"],
        organization: "alice Inc", role: "CEO", seeking: ["alice seeks investors"],
      }, "explicit invite sharing still controls redeemed contacts");
    });
  });

  test(`${name}: redeeming connects both people with only the chosen keys, values from each profile`, options, async () => {
    await withHarness(async (harness, planCalls) => {
      await harness.setProfile(profile(ALICE));
      await harness.setProfile(profile(BOB));
      const { notices, service } = setup(harness);
      const code = (await service.create(ALICE, { maxUses: 10, shared: { displayName: "a" }, sharedKeys: ["organization", "email"], ...key("c") })).code;
      const result = await service.redeem(BOB, code, { sharedKeys: ["offering"], ...key("r") });
      assert.equal(result.outcome, "connected");
      assert.deepEqual(result.peer, { displayName: "Alice Example", email: "alice@example.invalid", organization: "alice Inc", role: "CEO" });

      const bobsAlice = await contact(harness, result.contactId);
      assert.equal(bobsAlice?.userId, BOB);
      assert.equal(bobsAlice?.payload.displayName, "Alice Example");
      assert.equal(bobsAlice?.payload.primaryEmail, "alice@example.invalid");
      assert.equal(bobsAlice?.payload.primaryPhone, undefined, "phone was not shared");
      assert.equal(bobsAlice?.sourceType, "referral");
      assert.deepEqual(bobsAlice?.payload.acquisition, { code, via: "invite_code" });
      assert.equal(bobsAlice?.payload.publicProfile, undefined);

      const linkedForAlice = await service.linkedContactIds(ALICE);
      assert.equal(linkedForAlice.length, 1);
      const alicesBob = await contact(harness, linkedForAlice[0]!);
      assert.equal(alicesBob?.userId, ALICE);
      assert.equal(alicesBob?.payload.displayName, "Bob Example");
      assert.deepEqual(alicesBob?.payload.publicProfile, { offering: ["bob offers advice"] });
      for (const hidden of ["organization", "primaryEmail", "primaryPhone"]) assert.equal(alicesBob?.payload[hidden], undefined, hidden);
      assert.deepEqual(await service.linkedContactIds(BOB), [result.contactId]);

      const view = await service.connection(BOB, result.contactId);
      assert.deepEqual([view.sharedByMe, view.sharedByPeer, view.pausedFields, view.via.code], [["offering"], ["organization", "email"], [], code]);
      assert.equal((await service.current(ALICE))?.usedCount, 1);
      assert.deepEqual((await service.history(ALICE)).items[0]!.joined.map((item) => [item.contactId, item.displayName]), [[linkedForAlice[0], "Bob Example"]]);

      assert.equal(notices.length, 1, "only the inviter is told");
      assert.deepEqual([notices[0]!.inviterActorId, notices[0]!.inviterContactId, notices[0]!.redeemerDisplayName], [ALICE, linkedForAlice[0], "Bob Example"]);
      assert.deepEqual((await planCalls()).filter((call) => call.op === "enqueue").map((call) => [call.actorId, call.contactId]).sort(), [[ALICE, linkedForAlice[0]], [BOB, result.contactId]].sort());

      // 同一个键重放：同样的结果，不再占用量、不再通知。
      assert.deepEqual(await service.redeem(BOB, code, { sharedKeys: ["offering"], ...key("r") }), result);
      assert.equal((await service.current(ALICE))?.usedCount, 1);
      assert.equal(notices.length, 1);
      // 已经连着：再用（换一个键）→ already_connected，不占用量；用 A 的新码也一样。
      const again = await service.redeem(BOB, code, { sharedKeys: [], ...key("r-2") });
      assert.deepEqual([again.outcome, again.contactId], ["already_connected", result.contactId]);
      const newCode = (await service.create(ALICE, { maxUses: 10, shared: { displayName: "a" }, ...key("c-2") })).code;
      assert.equal((await service.redeem(BOB, newCode, { sharedKeys: [], ...key("r-3") })).outcome, "already_connected");
      assert.equal((await service.current(ALICE))?.usedCount, 0);
      assert.equal((await service.preview(newCode, BOB)).inviterAlreadyConnected, true);
      // B 的码给 A 用：同一对人，也是 already_connected。
      const bobsCode = (await service.create(BOB, { maxUses: 10, shared: { displayName: "b" }, ...key("b-1") })).code;
      const reverse = await service.redeem(ALICE, bobsCode, { sharedKeys: [], ...key("r-4") });
      assert.deepEqual([reverse.outcome, reverse.contactId], ["already_connected", linkedForAlice[0]]);
      assert.equal((await service.current(BOB))?.usedCount, 0);
      await expectError(service.redeem(ALICE, newCode, { sharedKeys: [], ...key("own") }), "OWN_CODE");
      await expectError(service.redeem(BOB, "ABCD", { sharedKeys: [], ...key("bad") }), "UNAVAILABLE");
    });
  });

  test(`${name}: expired, full, and a redeemer without a profile fail without using the code`, options, async () => {
    await withHarness(async (harness) => {
      for (const actor of [ALICE, BOB, CAROL]) await harness.setProfile(profile(actor));
      const { advance, service } = setup(harness);
      const code = (await service.create(ALICE, { maxUses: 1, shared: { displayName: "a" }, ...key("c") })).code;
      await harness.removeProfile(CAROL);
      await expectError(service.redeem(CAROL, code, { sharedKeys: [], ...key("r-0") }), "PROFILE_REQUIRED");
      assert.equal((await service.current(ALICE))?.usedCount, 0);
      await harness.setProfile(profile(CAROL));
      await service.redeem(BOB, code, { sharedKeys: [], ...key("r-1") });
      assert.equal((await service.preview(code, null)).status, "full");
      await expectError(service.redeem(CAROL, code, { sharedKeys: [], ...key("r-2") }), "FULL");
      advance(1000);
      const expiring = (await service.create(ALICE, { maxUses: 10, shared: { displayName: "a" }, ...key("c-2") })).code;
      advance(7 * DAY);
      await expectError(service.redeem(CAROL, expiring, { sharedKeys: [], ...key("r-3") }), "EXPIRED");
      assert.deepEqual((await service.history(ALICE)).items.map((item) => item.status), ["expired", "superseded"]);
    });
  });

  test(`${name}: REVIEW S1 — an existing card of the other person (either direction) is left alone; each owner gets a suggestion and merges it himself`, options, async () => {
    await withHarness(async (harness) => {
      await harness.setProfile(profile(ALICE));
      await harness.setProfile(profile(BOB));
      // A 的人脈里已有 B 的名刺（同一个邮箱）；B 的人脈里已有 A 的名刺（姓名 + 公司相同）。
      await seedContact(harness.contacts, { contactId: "card-bob", ownerId: ALICE, payload: { displayName: "Bob E.", notes: "met at expo", organization: "Old Corp", primaryEmail: "bob@example.invalid", role: "Intern" }, workspaceId: INVITE_WS });
      await seedContact(harness.contacts, { contactId: "card-alice", ownerId: BOB, payload: { displayName: "Alice Example", organization: "alice Inc", primaryPhone: "03-0000-0000" }, workspaceId: INVITE_WS });
      const cards = async () => JSON.stringify([(await contact(harness, "card-bob"))?.payload, (await contact(harness, "card-alice"))?.payload]);
      const before = await cards();
      const { service } = setup(harness);
      const code = (await service.create(ALICE, { maxUses: 10, shared: { displayName: "a" }, sharedKeys: ["organization", "phone"], ...key("c") })).code;
      const result = await service.redeem(BOB, code, { sharedKeys: ["organization", "email"], ...key("r") });
      assert.equal(result.outcome, "connected");
      assert.notEqual(result.contactId, "card-alice");
      assert.equal(await cards(), before, "neither existing card changed");
      const [alicesBob] = await service.linkedContactIds(ALICE);
      assert.notEqual(alicesBob, "card-bob");
      assert.deepEqual((await service.connection(ALICE, alicesBob!)).mergeSuggestion, { contactId: "card-bob", displayName: "Bob E.", matchedOn: ["email"] });
      assert.deepEqual((await service.connection(BOB, result.contactId)).mergeSuggestion, { contactId: "card-alice", displayName: "Alice Example", matchedOn: ["name_organization"] });
      assert.equal((await harness.contacts.listRecords({ collectionName: "contacts", limit: 50, workspaceId: INVITE_WS })).length, 4, "two new self-entered cards");

      // 两个方向都由各自的主人确认统合：只补空，不同的值不覆盖。
      assert.equal((await service.mergeConnection(ALICE, alicesBob!, key("m-a"))).contactId, "card-bob");
      assert.equal((await service.mergeConnection(BOB, result.contactId, key("m-b"))).contactId, "card-alice");
      const alicesCard = await contact(harness, "card-bob");
      assert.deepEqual([alicesCard?.payload.displayName, alicesCard?.payload.organization, alicesCard?.payload.role, alicesCard?.payload.notes], ["Bob E.", "Old Corp", "Intern", "met at expo"]);
      const bobsCard = await contact(harness, "card-alice");
      assert.deepEqual([bobsCard?.payload.primaryPhone, bobsCard?.payload.role], ["03-0000-0000", "CEO"], "my phone stays; the empty role is filled");
      assert.deepEqual([await service.linkedContactIds(ALICE), await service.linkedContactIds(BOB)], [["card-bob"], ["card-alice"]]);
      assert.equal((await harness.contacts.listRecords({ collectionName: "contacts", limit: 50, workspaceId: INVITE_WS })).length, 2, "the two new cards were tombstoned");
    });
  });

  test(`${name}: twenty concurrent redemptions of a code with one use left produce exactly one connection`, options, async () => {
    await withHarness(async (harness) => {
      await harness.setProfile(profile(ALICE));
      const { service } = setup(harness);
      const code = (await service.create(ALICE, { maxUses: 2, shared: { displayName: "a" }, ...key("c") })).code;
      await harness.setProfile(profile("actor:first"));
      await service.redeem("actor:first", code, { sharedKeys: [], ...key("first") });
      const people = Array.from({ length: 20 }, (_, index) => `actor:r${index}`);
      for (const actor of people) await harness.setProfile(profile(actor));
      const results = await Promise.allSettled(people.map((actor) => service.redeem(actor, code, { sharedKeys: [], ...key(`k-${actor}`) })));
      const ok = results.filter((item) => item.status === "fulfilled");
      assert.equal(ok.length, 1, JSON.stringify(results.filter((item) => item.status === "rejected").map((item) => String((item as PromiseRejectedResult).reason?.code ?? (item as PromiseRejectedResult).reason))));
      for (const item of results) if (item.status === "rejected") assert.equal((item.reason as InviteCodeError).code, "FULL");
      assert.equal((await service.current(ALICE))?.usedCount, 2);
      assert.equal((await service.linkedContactIds(ALICE)).length, 2);
    });
  });

  test(`${name}: people can only act on their own codes and their own side of a connection; unlinking frees the pair`, options, async () => {
    await withHarness(async (harness) => {
      for (const actor of [ALICE, BOB, CAROL]) await harness.setProfile(profile(actor));
      const { service } = setup(harness);
      const code = (await service.create(ALICE, { maxUses: 10, shared: { displayName: "a" }, ...key("c") })).code;
      await expectError(service.revoke(BOB, code), "NOT_FOUND");
      const result = await service.redeem(BOB, code, { sharedKeys: [], ...key("r") });
      await expectError(service.connection(CAROL, result.contactId), "NOT_FOUND");
      await expectError(service.connection(ALICE, result.contactId), "NOT_FOUND");
      await expectError(service.updateShare(CAROL, result.contactId, { sharedKeys: ["email"], ...key("s") }), "NOT_FOUND");
      await expectError(service.unlink(CAROL, result.contactId, { keepAsContact: true, ...key("u") }), "NOT_FOUND");
      assert.equal((await service.history(BOB)).items.length, 0);

      await service.unlink(BOB, result.contactId, { keepAsContact: false, ...key("u") });
      assert.deepEqual(await service.linkedContactIds(ALICE), []);
      const again = await service.redeem(BOB, code, { sharedKeys: ["organization"], ...key("r-again") });
      assert.equal(again.outcome, "connected", "after unlinking the same two people can connect again");
      assert.equal((await service.current(ALICE))?.usedCount, 2);
      assert.equal((await service.linkedContactIds(ALICE)).length, 1);
    });
  });

  test(`${name}: P1 — the owner changes what the current code shares; the code stays the same, later previews and redemptions read the new keys, existing connections keep theirs`, options, async () => {
    await withHarness(async (harness) => {
      for (const actor of [ALICE, BOB, CAROL]) await harness.setProfile(profile(actor));
      const { advance, service } = setup(harness);
      const created = await service.create(ALICE, { maxUses: 5, shared: { displayName: "a" }, sharedKeys: ["organization", "email"], ...key("c") });
      const bob = await service.redeem(BOB, created.code, { sharedKeys: [], ...key("r-bob") });
      advance(1000);

      const updated = await service.updateCurrentShare(ALICE, { sharedKeys: ["seeking", "offering", "phone"], ...key("s-1") });
      const { shared: _old, ...sameCode } = { ...created, usedCount: 1 };
      const { shared, ...rest } = updated;
      assert.deepEqual(rest, sameCode, "code, link, expiry, uses and creation time do not change");
      assert.deepEqual(shared, { displayName: "Alice Example", offering: ["alice offers advice"], phone: "090-1234-5678", seeking: ["alice seeks investors"] }, "values come from the profile by the new keys");
      assert.deepEqual(await service.current(ALICE), updated);
      assert.deepEqual(await service.updateCurrentShare(ALICE, { sharedKeys: ["seeking", "offering", "phone"], ...key("s-1") }), updated, "the same request again gives the same answer");
      assert.deepEqual((await service.history(ALICE)).items.map((item) => [item.code, item.status, item.usedCount]), [[created.code, "active", 1]], "no new code");

      const preview = await service.preview(created.code, null);
      assert.deepEqual(preview.shared, { displayName: "Alice Example", offering: ["alice offers advice"], seeking: ["alice seeks investors"] }, "the preview reads the new keys and still never shows contacts");

      const carol = await service.redeem(CAROL, created.code, { sharedKeys: [], ...key("r-carol") });
      assert.deepEqual(carol.peer, shared, "a later redemption gets the new keys");
      assert.deepEqual((await service.connection(CAROL, carol.contactId)).sharedByPeer, ["offering", "seeking", "phone"]);
      assert.deepEqual((await service.connection(BOB, bob.contactId)).sharedByPeer, ["organization", "email"], "an existing connection keeps what it was given");
      assert.deepEqual((await contact(harness, bob.contactId))?.payload.primaryEmail, "alice@example.invalid");

      await expectError(service.updateCurrentShare(BOB, { sharedKeys: ["email"], ...key("s-bob") }), "NOT_FOUND");
      await expectError(service.updateCurrentShare(ALICE, { sharedKeys: [], idempotencyKey: " " }), "INVALID");
      assert.deepEqual((await service.updateCurrentShare(ALICE, { sharedKeys: [], ...key("s-2") })).shared, { displayName: "Alice Example" }, "only the name");
    });
  });

  // 复核 m4：改码与兑换并发——兑换要么整份拿旧键、要么整份拿新键；连接上记的共享项目与拿到的 peer 一致。
  test(`${name}: P1 — changing the share while people redeem: each redemption gets either all-old or all-new keys, and its connection records exactly those`, options, async () => {
    await withHarness(async (harness) => {
      await harness.setProfile(profile(ALICE));
      const { service } = setup(harness);
      const OLD = ["organization", "email"] as const;
      const NEW = ["seeking", "phone"] as const;
      const created = await service.create(ALICE, { maxUses: 10, shared: { displayName: "a" }, sharedKeys: [...OLD], ...key("c") });
      const oldShared = created.shared;
      const redeemers = Array.from({ length: 6 }, (_, index) => `actor:race${index}`);
      for (const actor of redeemers) await harness.setProfile(profile(actor));
      const [updated, ...results] = await Promise.all([
        service.updateCurrentShare(ALICE, { sharedKeys: [...NEW], ...key("s-race") }),
        ...redeemers.map((actor) => service.redeem(actor, created.code, { sharedKeys: [], ...key(`r-${actor}`) })),
      ]);
      assert.equal(updated.code, created.code);
      for (const [index, result] of results.entries()) {
        const isOld = JSON.stringify(result.peer) === JSON.stringify(oldShared);
        const isNew = JSON.stringify(result.peer) === JSON.stringify(updated.shared);
        assert.ok(isOld !== isNew, `peer is exactly one version: ${JSON.stringify(result.peer)}`);
        const { sharedByPeer } = await service.connection(redeemers[index]!, result.contactId);
        assert.deepEqual([...sharedByPeer].sort(), [...(isOld ? OLD : NEW)].sort(), "the connection records what the peer got");
      }
      assert.equal((await service.current(ALICE))?.usedCount, redeemers.length);
      assert.deepEqual(await service.current(ALICE), { ...updated, usedCount: redeemers.length });
    });
  });

  // 复核 m4：改码与发码并发——改动只落在「那一刻的当前码」上：要么旧码先改了再被替换（新码是发码时的键），
  // 要么新码先发出来、改动落在新码上（旧码保持原样）；绝不会改到已被替换的旧码，也不会让新码带上别的键。
  test(`${name}: P1 — changing the share while a new code is issued touches only the code that was current at that moment`, options, async () => {
    await withHarness(async (harness) => {
      await harness.setProfile(profile(ALICE));
      const { advance, service } = setup(harness);
      for (let round = 0; round < 4; round += 1) {
        const old = await service.create(ALICE, { maxUses: 5, shared: { displayName: "a" }, sharedKeys: ["organization"], ...key(`old-${round}`) });
        advance(1000);
        const [updated, fresh] = await Promise.all([
          service.updateCurrentShare(ALICE, { sharedKeys: ["phone"], ...key(`s-${round}`) }),
          service.create(ALICE, { maxUses: 5, shared: { displayName: "a" }, sharedKeys: ["email"], ...key(`new-${round}`) }),
        ]);
        assert.notEqual(fresh.code, old.code);
        assert.ok([old.code, fresh.code].includes(updated.code), "the change lands on one of the two codes");
        const current = (await service.current(ALICE))!;
        assert.equal(current.code, fresh.code, "the new code is the current one");
        if (updated.code === old.code) {
          assert.deepEqual(Object.keys(fresh.shared).sort(), ["displayName", "email"], "the new code keeps the keys it was issued with");
          assert.deepEqual(current, fresh);
        } else {
          assert.deepEqual(Object.keys(current.shared).sort(), ["displayName", "phone"], "the change applied to the new current code");
        }
        if (harness.pool) {
          const rows = (await harness.pool.query<{ code: string; shared_keys: string[] }>("select code, shared_keys from invite_codes where actor_id = $1 and code = any($2::text[])", [ALICE, [old.code, fresh.code].map((code) => code.replaceAll("-", ""))])).rows;
          const keysOf = (code: string) => rows.find((row) => row.code === code.replaceAll("-", ""))?.shared_keys;
          assert.deepEqual(keysOf(old.code), updated.code === old.code ? ["phone"] : ["organization"], "the replaced code never gets keys after it was replaced");
          assert.deepEqual(keysOf(fresh.code), updated.code === old.code ? ["email"] : ["phone"]);
        }
        advance(1000);
      }
    });
  });

  test(`${name}: P1 — no current code (revoked, expired, replaced by a new one) is a 404; no profile name is PROFILE_REQUIRED`, options, async () => {
    await withHarness(async (harness) => {
      await harness.setProfile(profile(ALICE));
      const { advance, service } = setup(harness);
      await expectError(service.updateCurrentShare(ALICE, { sharedKeys: ["email"], ...key("none") }), "NOT_FOUND");

      const first = await service.create(ALICE, { maxUses: 5, shared: { displayName: "a" }, ...key("c-1") });
      advance(1000);
      const second = await service.create(ALICE, { maxUses: 5, shared: { displayName: "a" }, ...key("c-2") });
      await service.updateCurrentShare(ALICE, { sharedKeys: ["email"], ...key("s-1") });
      assert.equal((await service.current(ALICE))?.code, second.code, "only the current code changes");
      await expectError(service.preview(first.code, null), "UNAVAILABLE");

      await harness.removeProfile(ALICE);
      await expectError(service.updateCurrentShare(ALICE, { sharedKeys: ["organization"], ...key("s-2") }), "PROFILE_REQUIRED");
      await harness.setProfile(profile(ALICE));

      await service.revoke(ALICE, second.code);
      await expectError(service.updateCurrentShare(ALICE, { sharedKeys: ["organization"], ...key("s-3") }), "NOT_FOUND");

      await service.create(ALICE, { maxUses: 5, shared: { displayName: "a" }, ...key("c-3") });
      advance(8 * DAY);
      await expectError(service.updateCurrentShare(ALICE, { sharedKeys: ["organization"], ...key("s-4") }), "NOT_FOUND");
    });
  });
}

suite("memory", {}, async (run) => {
  const calls: PlanMatchCall[] = [];
  await run(memoryHarness(calls), async () => calls);
});

suite("postgres", databaseTest, (run) =>
  withInviteDatabase((harness) =>
    run(harness, async () => {
      const rows = (await harness.pool!.query<{ actor_id: string; contact_id: string }>("select actor_id, contact_id from plan_match_job_contacts")).rows;
      return rows.map((row) => ({ actorId: row.actor_id, contactId: row.contact_id, op: "enqueue" as const }));
    })));

test("both invite participants receive their own contact notification through the real inbox service", databaseTest, async () => {
  const { inviteConnectedNotification } = await import("../../features/invite-codes/notification");
  const { createInboxInviteNotifier } = await import("../../features/invite-codes/configured");
  const { createInboxRuntime } = await import("../../features/notifications/inbox-record-service-factory");
  const shape = inviteConnectedNotification({ at: "2026-10-11T03:00:00.000Z", connectionId: "n1", contactRevision: "r", inviterActorId: ALICE, inviterContactId: "contact:x", redeemerDisplayName: "高橋 美咲" });
  assert.deepEqual([shape.kind, shape.sources[0]!.sourceKind, shape.target.kind, shape.target.href], ["update", "contact", "source", "/contacts/contact%3Ax"]);
  assert.deepEqual(Object.keys(shape.copy!).sort(), ["en", "ja", "zh"]);
  assert.equal(shape.copy!.ja.title, "高橋 美咲さんが招待から登録しました");

  await withInviteDatabase(async (harness) => {
    await harness.setProfile(profile(ALICE));
    await harness.setProfile(profile(BOB));
    const inbox = createInboxRuntime({ client: harness.client!, workspaceId: INVITE_WS });
    const notifier = createInboxInviteNotifier({ client: harness.client!, upsert: (notification) => inbox.service.upsert(notification), workspaceId: INVITE_WS });
    const service = createInviteCodeService({ notifier, storage: harness.storage });
    const code = (await service.create(ALICE, { idempotencyKey: "c", maxUses: 10, shared: { displayName: "a" } })).code;
    await service.redeem(BOB, code, { idempotencyKey: "r", sharedKeys: [] });
    const [contactId] = await service.linkedContactIds(ALICE);
    const alice = await inbox.service.list(ALICE, { limit: 10 });
    assert.equal(alice.items.length, 1);
    assert.deepEqual([alice.items[0]!.title, alice.items[0]!.target.href, alice.items[0]!.target.status], ["Bob Example通过你的邀请加入了", `/contacts/${encodeURIComponent(contactId!)}`, "available"], "listed in the account language (zh by default)");
    const bob = await inbox.service.list(BOB, { limit: 10 });
    const [bobContactId] = await service.linkedContactIds(BOB);
    assert.equal(bob.items.length, 1);
    assert.deepEqual([bob.items[0]!.kind,bob.items[0]!.sources[0]!.sourceKind,bob.items[0]!.target.href],['update','contact',`/contacts/${encodeURIComponent(bobContactId!)}`]);
    assert.notEqual(bob.items[0]!.id,alice.items[0]!.id);
  });
});
