import assert from "node:assert/strict";
import test from "node:test";

import { createTranslator } from "../src/i18n/messages";
import {
  inviteDate,
  inviteDaysLeft,
  inviteDefaultKeys,
  inviteFieldsFromProfile,
  inviteKeysWithValues,
  inviteKeyValue,
  toggleTag,
  viewAfterProfile,
  viewForPreview,
  viewForPreviewFailure,
  viewForRedeemFailure,
  viewForRedeemResult,
} from "../src/screens/add/invite/invite-model";

// R15 招待コード: the pure rules the App invite screens share (same rules as the Web invite-model / landing-model).
const ja = createTranslator("ja");
const preview = { code: "K7QX-2M9P", expiresAt: "2026-10-14T09:00:00+09:00", shared: { displayName: "佐藤 健一" } };

test("dates are Japan time in the page language; days left round up and never go below 0", () => {
  assert.equal(inviteDate("2026-10-13T20:00:00Z", "ja", ja), "10/14");
  assert.equal(inviteDate("2026-10-13T20:00:00Z", "zh", createTranslator("zh")), "10月14日");
  assert.equal(inviteDate("2026-10-13T20:00:00Z", "en", createTranslator("en")), "Oct 14");
  assert.equal(inviteDate("not a date", "ja", ja), "");
  const now = Date.parse("2026-10-11T00:00:00Z");
  assert.equal(inviteDaysLeft("2026-10-18T00:00:00Z", now), 7);
  assert.equal(inviteDaysLeft("2026-10-11T00:00:01Z", now), 1);
  assert.equal(inviteDaysLeft("2026-10-10T00:00:00Z", now), 0);
});

test("share keys: only what the profile has; defaults leave e-mail and phone off; values never include an empty field", () => {
  const fields = inviteFieldsFromProfile({ displayName: " 高橋 ", handles: { email: "m@example.jp", phone: " " }, offering: ["", "人の紹介"], organization: "青葉", role: "" })!;
  assert.deepEqual(fields, { displayName: "高橋", email: "m@example.jp", offering: ["人の紹介"], organization: "青葉" });
  assert.deepEqual(inviteKeysWithValues(fields), ["organization", "offering", "email"]);
  assert.deepEqual(inviteDefaultKeys(inviteKeysWithValues(fields)), ["organization", "offering"]);
  assert.equal(inviteKeyValue("organization", { displayName: "x", organization: "青葉", role: "パートナー" }, ja), "青葉 · パートナー");
  assert.equal(inviteKeyValue("seeking", { displayName: "x", seeking: ["a", "b"] }, ja), "a、b");
});

test("which screen: own > already > expired / full > signed out; preview failures; redeem answers", () => {
  assert.deepEqual(viewForPreview({ ...preview, isOwnCode: true, inviterAlreadyConnected: true }, true), { view: "own" });
  assert.deepEqual(viewForPreview({ ...preview, inviterAlreadyConnected: true, status: "expired" }, true), { view: "already" });
  assert.deepEqual(viewForPreview({ ...preview, isOwnCode: true, status: "expired" }, false), { view: "expired" }, "own-code flags are only read signed in");
  assert.deepEqual(viewForPreview({ ...preview, status: "full" }, true), { view: "full" });
  assert.deepEqual(viewForPreview(preview, false), { view: "open" });
  assert.deepEqual(viewForPreview(preview, true), { view: "checking" });
  assert.deepEqual(viewForPreviewFailure(404, "INVITE_UNAVAILABLE"), { limited: false, view: "unavailable" });
  assert.deepEqual(viewForPreviewFailure(429, "INVITE_UNAVAILABLE"), { limited: true, view: "unavailable" });
  assert.deepEqual(viewForPreviewFailure(0, null), { view: "failed" });
  assert.deepEqual(viewForPreviewFailure(503, null), { view: "failed" });
  assert.deepEqual(viewAfterProfile("  "), { view: "profile" });
  assert.deepEqual(viewAfterProfile("高橋"), { view: "confirm" });
  assert.equal(viewForRedeemFailure(401, null), "login");
  assert.deepEqual(viewForRedeemFailure(409, "INVITE_EXPIRED"), { view: "expired" });
  assert.deepEqual(viewForRedeemFailure(409, "OWN_CODE"), { view: "own" });
  assert.deepEqual(viewForRedeemFailure(409, "PROFILE_REQUIRED"), { view: "profile" });
  assert.equal(viewForRedeemFailure(500, null), null);
  assert.deepEqual(viewForRedeemResult({ contactId: "c1", outcome: "already_connected" }), { contactId: "c1", view: "already" });
  assert.equal(viewForRedeemResult({ contactId: "c1", outcome: "merged" }).view, "done");
});

test("short-profile tags: dedupe like the profile save (NFKC, case), at most 5", () => {
  assert.deepEqual(toggleTag(["ＡＩ"], "ai"), []);
  assert.deepEqual(toggleTag(["a", "b", "c", "d", "e"], "f"), ["a", "b", "c", "d", "e"]);
  assert.deepEqual(toggleTag([], "  人の  紹介 "), ["人の 紹介"]);
});
