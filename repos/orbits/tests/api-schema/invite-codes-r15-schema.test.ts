import assert from "node:assert/strict";
import test from "node:test";

import {
  inviteCodeCreateInputSchema, inviteCodeHistoryItemSchema, inviteCodeHistoryResponseSchema, inviteCodePreviewSchema, inviteCodeRedeemInputSchema,
  inviteCodeRedeemResultSchema, inviteConnectionViewSchema, inviteMergeInputSchema, inviteShareUpdateInputSchema, inviteUnlinkInputSchema, inviteUnlinkResultSchema,
} from "../../shared/api-schema/invite-codes";

// R15（DESIGN §4.2，契约规则 10）：响应宽进（未知状态兜底、未知键跳过、读不出的条目跳过），请求严格。
const preview = { code: "K7QX-2M9P", expiresAt: "2026-10-14T09:00:00+09:00", shared: { displayName: "佐藤 健一" } };
const history = { code: "K7QX-2M9P", createdAt: "2026-10-07T09:00:00+09:00", expiresAt: "2026-10-14T09:00:00+09:00", status: "active", usedCount: 1, maxUses: 10, joined: [] };
const connection = { contactId: "c-1", connectedAt: "2026-10-07T10:00:00+09:00", via: { code: "K7QX-2M9P" }, sharedByMe: ["organization"], sharedByPeer: ["offering"], pausedFields: [] };

test("preview: an R08 preview still reads; status / inviterAlreadyConnected / isOwnCode are optional", () => {
  assert.deepEqual(inviteCodePreviewSchema.parse(preview), preview);
  const full = inviteCodePreviewSchema.parse({ ...preview, status: "full", inviterAlreadyConnected: true, isOwnCode: false });
  assert.deepEqual([full.status, full.inviterAlreadyConnected, full.isOwnCode], ["full", true, false]);
});

test("preview: an unknown status reads as expired (never as usable)", () => {
  assert.equal(inviteCodePreviewSchema.parse({ ...preview, status: "paused" }).status, "expired");
});

test("shared fields: offering / seeking lists and contact details read when present", () => {
  const result = inviteCodeRedeemResultSchema.parse({ outcome: "connected", contactId: "c-1", peer: { displayName: "佐藤", offering: ["採用"], seeking: ["資金調達"], email: "a@example.com", phone: "03-0000-0000" } });
  assert.deepEqual(result.peer?.offering, ["採用"]);
  assert.equal(inviteCodeRedeemResultSchema.parse({ outcome: "already_connected", contactId: "c-1" }).peer, undefined);
});

test("history: unknown status → expired; an unreadable item or joined person is skipped, the rest kept", () => {
  assert.equal(inviteCodeHistoryItemSchema.parse({ ...history, status: "archived" }).status, "expired");
  const read = inviteCodeHistoryResponseSchema.parse({
    items: [
      { ...history, status: "superseded", joined: [{ contactId: "c-1", displayName: "高橋 美咲", joinedAt: "2026-10-08T10:00:00+09:00" }, { contactId: "" }] },
      { code: "bad" },
    ],
  });
  assert.equal(read.items.length, 1);
  assert.equal(read.items[0].status, "superseded");
  assert.deepEqual(read.items[0].joined.map((person) => person.displayName), ["高橋 美咲"]);
});

test("connection view: unknown field keys are skipped", () => {
  const view = inviteConnectionViewSchema.parse({ ...connection, sharedByMe: ["organization", "birthday"], pausedFields: ["phone", "avatar"] });
  assert.deepEqual([view.sharedByMe, view.pausedFields], [["organization"], ["phone"]]);
});

test("R15 review S1: merge suggestion on the connection view and on a joined person is optional and tolerant", () => {
  const suggestion = { contactId: "card-1", displayName: "田中 太郎", matchedOn: ["email", "fingerprint"] };
  assert.deepEqual(inviteConnectionViewSchema.parse({ ...connection, mergeSuggestion: suggestion }).mergeSuggestion, { ...suggestion, matchedOn: ["email"] }, "unknown reasons are skipped");
  assert.equal(inviteConnectionViewSchema.parse(connection).mergeSuggestion, undefined, "an R15 view without it still reads");
  assert.equal(inviteConnectionViewSchema.parse({ ...connection, mergeSuggestion: { contactId: "" } }).mergeSuggestion, undefined, "an unreadable suggestion reads as none");
  const read = inviteCodeHistoryItemSchema.parse({ ...history, joined: [{ contactId: "c-1", displayName: "高橋", joinedAt: "2026-10-08T10:00:00+09:00", mergeSuggestion: suggestion }] });
  assert.equal(read.joined[0].mergeSuggestion?.contactId, "card-1");
  assert.equal(inviteMergeInputSchema.safeParse({ idempotencyKey: "k" }).success, true);
  assert.equal(inviteMergeInputSchema.safeParse({ idempotencyKey: "k", contactId: "x" }).success, false, "strict");
  assert.equal(inviteMergeInputSchema.safeParse({}).success, false);
});

test("unlink result: an unknown outcome still reads as unlinked", () => {
  assert.deepEqual(inviteUnlinkResultSchema.parse({ outcome: "unlinked", keptContactId: "c-1" }), { outcome: "unlinked", keptContactId: "c-1" });
  assert.equal(inviteUnlinkResultSchema.parse({ outcome: "archived" }).outcome, "unlinked");
});

test("requests are strict: sharedKeys in the enum, no repeats, at most five; idempotencyKey 1–200; no extra keys", () => {
  const redeem = (body: unknown) => inviteCodeRedeemInputSchema.safeParse(body).success;
  assert.equal(redeem({ idempotencyKey: "k", sharedKeys: [] }), true, "only the name");
  assert.equal(redeem({ idempotencyKey: "k", sharedKeys: ["organization", "offering", "seeking", "email", "phone"] }), true);
  assert.equal(redeem({ idempotencyKey: "k", sharedKeys: ["organization", "organization"] }), false, "repeat");
  assert.equal(redeem({ idempotencyKey: "k", sharedKeys: ["displayName"] }), false, "not a key");
  assert.equal(redeem({ idempotencyKey: "k" }), false, "sharedKeys required");
  assert.equal(redeem({ idempotencyKey: "", sharedKeys: [] }), false);
  assert.equal(redeem({ idempotencyKey: "k".repeat(201), sharedKeys: [] }), false);
  assert.equal(redeem({ idempotencyKey: "k", sharedKeys: [], shared: { email: "x@example.com" } }), false, "values are never sent");

  const share = (body: unknown) => inviteShareUpdateInputSchema.safeParse(body).success;
  assert.equal(share({ sharedKeys: ["email"], idempotencyKey: "k" }), true);
  assert.equal(share({ sharedKeys: ["email"], idempotencyKey: "k", extra: 1 }), false);

  const unlink = (body: unknown) => inviteUnlinkInputSchema.safeParse(body).success;
  assert.equal(unlink({ keepAsContact: true, idempotencyKey: "k" }), true);
  assert.equal(unlink({ keepAsContact: "yes", idempotencyKey: "k" }), false);
  assert.equal(unlink({ idempotencyKey: "k" }), false);

  const create = (body: unknown) => inviteCodeCreateInputSchema.safeParse(body).success;
  const base = { shared: { displayName: "佐藤" }, maxUses: 10, idempotencyKey: "k" };
  assert.equal(create(base), true, "R08 body still valid");
  assert.equal(create({ ...base, sharedKeys: ["organization", "seeking"] }), true);
  assert.equal(create({ ...base, sharedKeys: ["seeking", "seeking"] }), false);
});
