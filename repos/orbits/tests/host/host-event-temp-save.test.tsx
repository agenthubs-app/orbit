// 新建活动：说明 2000 字 + 一時保存（端末保存 / 復元 / 期限 / アカウント別）— 2026-11-13。
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { DESC_MAX, HostEventFormView, clearTempDraft, draftFromEvent, draftHasInput, draftToInput, readTempDraft, writeTempDraft } from "../../app/(app)/app/orbit-2026/host/HostEventForm";
import { DESC_MAX as SETUP_DESC_MAX } from "../../app/(app)/app/orbit-2026/host/setup-model";
import { hostSetupDraftInputObject } from "../../shared/api-schema/host-console";
import { hostEventInputObject } from "../../shared/api-schema/host-events";

function memoryStorage() {
  const map = new Map<string, string>();
  return { getItem: (key: string) => map.get(key) ?? null, removeItem: (key: string) => { map.delete(key); }, setItem: (key: string, value: string) => { map.set(key, value); }, size: () => map.size };
}

const NOW = new Date("2026-11-13T10:00:00.000Z");
const blank = draftFromEvent(null, [{ profileId: "prof-1" } as never]);

test("説明は 2000 字まで（画面・申込設定・サーバーの入力すべて）", () => {
  assert.equal(DESC_MAX, 2000);
  assert.equal(SETUP_DESC_MAX, 2000);
  const long = "あ".repeat(2000);
  const base = { endsAt: "2026-12-01T12:00:00.000Z", feeKind: "free", organizerProfileId: "prof-1", startsAt: "2026-12-01T10:00:00.000Z", title: "勉強会" };
  assert.ok(hostEventInputObject.safeParse({ ...base, description: long }).success);
  assert.equal(hostEventInputObject.safeParse({ ...base, description: `${long}あ` }).success, false);
  assert.ok(hostSetupDraftInputObject.shape.description.safeParse(long).success);
  const html = renderToStaticMarkup(<HostEventFormView mode="create" draft={{ ...blank, description: "こんにちは" }} profiles={[]} language="ja" />);
  assert.match(html, /maxLength="2000"/);
  assert.match(html, /2000字まで/);
});

test("一時保存: an incomplete form is kept on this device, per account, and comes back", () => {
  const storage = memoryStorage();
  const partial = { ...blank, title: "勉強会 vol.1", description: "メモ" };
  assert.equal(draftToInput(partial).problem !== null, true, "date / venue missing: not yet a server draft");
  assert.ok(writeTempDraft(storage, "user_a", partial, NOW));
  assert.deepEqual(readTempDraft(storage, "user_a", NOW)?.draft, partial);
  assert.equal(readTempDraft(storage, "user_b", NOW), null, "another account on the same browser does not see it");
  assert.equal(readTempDraft(storage, "user_a", new Date(NOW.getTime() + 31 * 86_400_000)), null, "expires after 30 days");
  assert.equal(storage.size(), 0, "the expired copy is removed");
});

test("一時保存: nothing typed means nothing stored; clearing removes it", () => {
  const storage = memoryStorage();
  assert.equal(draftHasInput(blank), false);
  writeTempDraft(storage, "user_a", blank, NOW);
  assert.equal(storage.size(), 0);
  writeTempDraft(storage, "user_a", { ...blank, title: "x" }, NOW);
  clearTempDraft(storage, "user_a");
  assert.equal(readTempDraft(storage, "user_a", NOW), null);
  assert.equal(readTempDraft(null, "user_a", NOW), null, "blocked storage reads as nothing");
  assert.equal(writeTempDraft(null, "user_a", { ...blank, title: "x" }, NOW), false);
});

test("作成時の質問: sent with the event; an empty question or a choice with fewer than 2 options stops saving", () => {
  const filled = { ...blank, title: "勉強会", date: "2026-12-01", venueName: "渋谷", questions: [{ id: "a", kind: "single" as const, options: ["A", " B ", ""], prompt: " 立場 ", required: true }] };
  const ok = draftToInput(filled);
  assert.deepEqual(ok.input?.questions, [{ id: "a", kind: "single", options: ["A", "B"], prompt: "立場", required: true }]);
  assert.equal(draftToInput({ ...filled, questions: [{ id: "a", kind: "single", options: ["A"], prompt: "立場", required: true }] }).problem, "evInvalidQuestion");
  assert.equal(draftToInput({ ...filled, questions: [{ id: "a", kind: "free", options: [], prompt: "  ", required: false }] }).problem, "evInvalidQuestion");
  assert.equal(draftToInput({ ...filled, questions: [] }).input?.questions, undefined, "no questions: nothing sent");
});
