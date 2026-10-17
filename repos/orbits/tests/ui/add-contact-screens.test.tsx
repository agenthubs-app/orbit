import assert from "node:assert/strict";
import test from "node:test";
import type { Browser, Page } from "playwright";

import { buildScanBatchView } from "../../app/(app)/app/contacts/new/_add/scan-batch-view";
import { groupIngestItemsByCardId, initialCardDraft } from "../../app/(app)/app/contacts/ingest-v2/ingest-v2-route-view-model";
import type { ScanBatchView } from "../../app/(app)/app/orbit-2026/add/scan-types";
import type { IngestItemDTO } from "../../features/acquisition/business-card-ingest-v2/contract";
import { bundle, errorsOf, launch, open } from "./support/orbit-2026-harness";
import { SHELL_STUBS } from "./support/orbit-2026-shell-harness";

// R12 (DESIGN §2.1–§2.3 Web): 人脈を追加 rendered for real inside the shell — the doors,
// the 手入力 drawer (instant duplicate check with only a name, 統合 by field, the signature
// split, ⌘↵, the 元に戻す toast from the shell), 名刺 upload (はじめての方へ on the first three
// visits) and the batch screen (tiles, sections, one 会った場所, 重複 side by side, the
// three buttons of an unreadable card, 完成). fetch is stubbed and every call recorded.
type Reply = { status: number; body: unknown };
type Handler = { method: string; url: string; replies: Reply[] };
type Fixture = { view: "doors" | "manual" | "upload" | "batch"; handlers?: Handler[]; visits?: number; batch?: ScanBatchView; available?: boolean; lang?: string; settleResult?: string };
type Call = { url: string; method: string; body?: any };

const ok = (data: unknown, status = 200): Reply => ({ body: { data, success: true }, status });
let browser: Browser;
let code: { js: string; css: string };

test.before(async () => {
  code = await bundle(`
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { Orbit2026Shell } from "./app/(app)/app/orbit-2026/shell/Orbit2026Shell";
    import { OrbitAskProvider } from "./app/(app)/app/orbit-global-ask/orbit-ask-context";
    import { AddContactScreen } from "./app/(app)/app/orbit-2026/add/AddContactScreen";
    import { ScanUploadScreen } from "./app/(app)/app/orbit-2026/add/ScanUploadScreen";
    import { ScanBatchScreen } from "./app/(app)/app/orbit-2026/add/ScanBatchScreen";
    const f = window.shellFixture;
    const store = new Map(f.visits ? [["orbit.add.scanGuideVisits.v1", String(f.visits)]] : []);
    Object.defineProperty(window, "localStorage", { configurable: true, value: { getItem: (k) => store.has(k) ? store.get(k) : null, setItem: (k, v) => { store.set(k, String(v)); }, removeItem: (k) => { store.delete(k); } } });
    window.guideStore = store;
    const counts = {};
    window.fetch = async (url, init = {}) => {
      const method = init.method || "GET";
      const body = init.body ? JSON.parse(init.body) : undefined;
      f.fetches.push({ url: String(url), method, body });
      const index = (f.handlers || []).findIndex((h) => h.method === method && new RegExp(h.url).test(String(url)));
      if (index === -1) return new Response(JSON.stringify({ success: false, error: { code: "NOT_FOUND", message: "no stub" } }), { status: 404 });
      const handler = f.handlers[index];
      const n = counts[index] = (counts[index] ?? -1) + 1;
      const reply = handler.replies[Math.min(n, handler.replies.length - 1)];
      return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { "content-type": "application/json" } });
    };
    const record = (entry) => { f.calls.push(entry); };
    const actions = {
      setDraft: (cardId, draft) => record({ setDraft: cardId, name: draft.fields.displayName }),
      settle: async (cardId, kind) => { record({ settle: [cardId, kind] }); return f.settleResult || "created"; },
      refresh: async () => record({ refresh: true }),
      retryRecognition: async (cardId) => record({ retry: cardId }),
      replace: async (cardId) => { record({ replace: cardId }); return true; },
      chooseEvent: (eventId) => record({ chooseEvent: eventId }),
      retryUpload: () => record({ retryUpload: true }),
      reattach: () => record({ reattach: true }),
    };
    const view = {
      doors: () => <AddContactScreen />,
      manual: () => <AddContactScreen manualOpen />,
      upload: () => <ScanUploadScreen available={f.available !== false} maxPhotos={100} maxBytes={10485760} onStart={async (cards) => { record({ start: cards.map((c) => [c.front.file.name, c.back ? c.back.file.name : null]) }); return { ok: true, batchId: "b-new" }; }} />,
      batch: () => <ScanBatchScreen view={f.batch} actions={actions} />,
    }[f.view];
    createRoot(document.getElementById("root")).render(<OrbitAskProvider><Orbit2026Shell language={f.lang} signedIn><>{view()}</></Orbit2026Shell></OrbitAskProvider>);
  `, SHELL_STUBS);
  browser = await launch();
});
test.after(async () => { await browser?.close(); });

async function screen(t: { after: (fn: () => Promise<void>) => void }, fixture: Fixture, options: { width?: number; dark?: boolean; reducedMotion?: boolean } = {}): Promise<Page> {
  const page = await open(browser, code, { ...options, html: `<div id="root"></div><script>window.shellFixture=${JSON.stringify({ calls: [], fetches: [], lang: "ja", path: "/app/contacts/new", unread: false, ...fixture })}</script>` });
  t.after(async () => { const errors = errorsOf(page); await page.close(); assert.deepEqual(errors, []); });
  return page;
}

const fetches = (page: Page): Promise<Call[]> => page.evaluate(() => (window as any).shellFixture.fetches);
const calls = (page: Page): Promise<any[]> => page.evaluate(() => (window as any).shellFixture.calls);
// Numbers count up (CountUp): wait for the settled value.
const settles = (page: Page, selector: string, value: number) => page.waitForFunction(([css, n]) => document.querySelector(css as string)?.textContent?.startsWith(String(n)), [selector, value] as const);

/* ---------- 入口 ---------- */

test("doors (b12 W-R12-01): a 560 dialog 人脈を追加 with 名刺 / 招待コード / 手入力 and その他 連絡先 · LinkedIn (R16 import pages)", async (t) => {
  const page = await screen(t, { view: "doors" }, { width: 1440 });
  await page.locator("[data-add-doors]").waitFor();
  const dialog = page.getByRole("dialog", { name: "人脈を追加" });
  await dialog.waitFor();
  assert.ok(Math.abs((await dialog.boundingBox())!.width - 560) <= 20, "kit .wmodal.w560");
  const doors = await page.locator("[data-add-door]").evaluateAll((nodes) => nodes.map((node) => [node.getAttribute("data-add-door"), node.getAttribute("href")]));
  assert.deepEqual(doors, [
    ["scan", "/app/contacts/new/scan"],
    ["invite", null],
    ["manual", null],
    ["contacts", "/app/contacts/new/import?method=contacts"],
    ["linkedin", "/app/contacts/new/import?method=linkedin"],
  ]);
  assert.equal(await page.locator('[data-add-door="invite"]').getByText("招待コード").count(), 1);
  assert.match(await dialog.innerText(), /関係まで/);
});

test("doors: 1024 is the same layout; 390 is one column", async (t) => {
  const wide = await screen(t, { view: "doors" }, { width: 1024 });
  // Same row for 名刺 and 手入力 at 1024 (同构), stacked at 390.
  const sameRow = (page: Page) => page.evaluate(() => {
    const [scan, manual] = ["scan", "manual"].map((key) => document.querySelector(`[data-add-door="${key}"]`)!.getBoundingClientRect().top);
    return Math.abs(scan! - manual!) < 2;
  });
  await wide.locator("[data-add-doors]").waitFor();
  assert.equal(await sameRow(wide), true);
  const narrow = await screen(t, { view: "doors" }, { width: 390 });
  await narrow.locator("[data-add-doors]").waitFor();
  assert.equal(await sameRow(narrow), false);
});

test("Reduce Motion: the cards only fade (no rise)", async (t) => {
  const moving = await screen(t, { view: "doors" });
  const name = (page: Page) => page.locator('[data-add-door="scan"]').evaluate((node) => getComputedStyle(node).animationName);
  assert.match(await name(moving), /rise/);
  const still = await screen(t, { view: "doors" }, { reducedMotion: true });
  const reduced = await name(still);
  assert.match(reduced, /fade/);
  assert.doesNotMatch(reduced, /rise/);
});

/* ---------- 手入力 ---------- */

const EVENTS: Handler = { method: "GET", url: "^/api/events$", replies: [ok({ events: [{ id: "ev-near", title: "CFO Night Tokyo", startsAt: new Date(Date.now() - 4 * 86_400_000).toISOString() }] })] };
const CANDIDATE = { address: "", contactId: "c-9", displayName: "石川 洋介", email: "", identical: false, matchedOn: ["name"], organization: "ミライ精機", phone: "", role: "部長" };

test("手入力: only a name is enough for the instant check (400 ms); 統合 lists only differing fields; ⌘↵ saves and opens the person with a shell toast", async (t) => {
  const page = await screen(t, { view: "manual", handlers: [EVENTS,
    { method: "POST", url: "^/api/contacts/manual/duplicates$", replies: [ok({ candidates: [CANDIDATE] })] },
    { method: "GET", url: "^/api/contacts/manual/organizations", replies: [ok({ organizations: [] })] },
    { method: "POST", url: "^/api/contacts/manual$", replies: [ok({ outcome: "merged", contactId: "c-9" })] }] });
  const name = page.locator('[data-manual-field="displayName"]');
  await name.fill("石川 洋介");
  await page.locator('[data-manual-candidate="c-9"]').waitFor();
  const checks = (await fetches(page)).filter((call) => call.url === "/api/contacts/manual/duplicates");
  assert.deepEqual(checks.map((call) => call.body), [{ displayName: "石川 洋介" }], "one debounced check, name only");
  await page.locator('[data-manual-field="organization"]').fill("ミライ精機株式会社");
  await page.locator('[data-manual-merge="c-9"]').click();
  const fields = await page.locator("[data-merge-field]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-merge-field")));
  assert.deepEqual(fields, ["organization"], "same name is not asked; an empty field is only filled");
  await page.locator('[data-merge-field="organization"] [role="radio"]').first().click();
  await name.focus();
  await page.keyboard.press("Meta+Enter");
  await page.waitForFunction(() => (window as any).shellFixture.calls.some((c: any) => c.push));
  const save = (await fetches(page)).find((call) => call.url === "/api/contacts/manual" && call.method === "POST")!;
  assert.equal(save.body.mergeIntoContactId, "c-9");
  assert.deepEqual(save.body.fieldChoices, { organization: "existing" });
  assert.ok(save.body.idempotencyKey);
  assert.deepEqual((await calls(page)).filter((c) => c.push).map((c) => c.push), ["/app/contacts/c-9"]);
  await page.getByRole("status").filter({ hasText: "既存の人に統合しました" }).waitFor();
});

test("手入力: saved → 「人脈に追加しました · 手入力」 with 元に戻す from the shell; 元に戻す calls undo", async (t) => {
  const page = await screen(t, { view: "manual", handlers: [EVENTS,
    { method: "POST", url: "^/api/contacts/manual/duplicates$", replies: [ok({ candidates: [] })] },
    { method: "POST", url: "^/api/contacts/manual$", replies: [ok({ outcome: "created", contactId: "c-new", undoUntil: "2026-10-11T03:10:00.000Z" }, 201)] },
    { method: "POST", url: "^/api/contacts/manual/c-new/undo$", replies: [ok({ outcome: "undone" })] }] });
  // 出会った場所: the person's recent event is offered.
  await page.getByRole("button", { name: /CFO Night Tokyo/ }).click();
  await page.locator('[data-manual-field="displayName"]').fill("石川 陽介");
  await page.locator("[data-manual-save]").click();
  const toast = page.getByRole("status").filter({ hasText: "人脈に追加しました" });
  await toast.waitFor();
  assert.match(await toast.textContent() ?? "", /石川 陽介 · 手入力/);
  const save = (await fetches(page)).find((call) => call.url === "/api/contacts/manual")!;
  assert.deepEqual(save.body.metContext, { eventId: "ev-near", kind: "event", label: "CFO Night Tokyo" });
  await toast.getByRole("button", { name: "元に戻す" }).click();
  await page.getByRole("status").filter({ hasText: "追加を取り消しました" }).waitFor();
  assert.ok((await fetches(page)).some((call) => call.url === "/api/contacts/manual/c-new/undo" && call.method === "POST"));
});

test("手入力: an empty name cannot be saved; a duplicate_review answer shows the candidates", async (t) => {
  const page = await screen(t, { view: "manual", handlers: [EVENTS,
    { method: "POST", url: "^/api/contacts/manual/duplicates$", replies: [ok({ candidates: [] })] },
    { method: "POST", url: "^/api/contacts/manual$", replies: [ok({ outcome: "duplicate_review", candidates: [CANDIDATE] })] }] });
  await page.locator("[data-manual-save]").click();
  await page.getByText("名前を入れてください。").waitFor();
  assert.equal((await fetches(page)).filter((call) => call.url === "/api/contacts/manual").length, 0);
  await page.locator('[data-manual-field="displayName"]').fill("石川 洋介");
  await page.locator("[data-manual-save]").click();
  await page.locator("[data-manual-review-needed]").waitFor();
  await page.locator("[data-manual-separate-button]").click();
  await page.locator("[data-manual-separate]").waitFor();
});

test("手入力 (b9 A4 Web): a pasted signature is coloured where it was split, listed by item, and becomes the form", async (t) => {
  const page = await screen(t, { view: "manual", handlers: [EVENTS, { method: "POST", url: "^/api/contacts/manual/duplicates$", replies: [ok({ candidates: [] })] }] });
  await page.locator("[data-manual-paste-open]").click();
  await page.locator("[data-manual-signature]").fill("石川 陽介\n石川デザイン事務所　代表\n〒150-0001 東京都渋谷区神宮前 2-x-x\nTEL 03-1234-5678\nyosuke@ishikawa-design.example");
  await page.locator("[data-manual-form] b").first().click();
  const marks = await page.locator("[data-manual-signature-preview] mark").evaluateAll((nodes) => nodes.map((node) => [node.getAttribute("data-span"), node.textContent]));
  assert.deepEqual(marks.find(([field]) => field === "email"), ["email", "yosuke@ishikawa-design.example"]);
  assert.deepEqual(marks.find(([field]) => field === "role"), ["role", "代表"]);
  assert.equal(marks.some(([field]) => field === "address"), false, "an address is a guess: listed as 推定, not coloured");
  assert.match(await page.locator('[data-paste-row="address"]').innerText(), /推定/);
  await page.locator('[data-paste-row="displayName"]').click();
  assert.equal(await page.locator('[data-manual-field="displayName"]').inputValue(), "石川 陽介");
  assert.equal(await page.locator('[data-manual-field="organization"]').inputValue(), "石川デザイン事務所");
});

/* ---------- 名刺 · アップロード ---------- */

test("名刺 upload: はじめての方へ is open on visits 1–3 and a single line from the 4th; the count is kept on the device", async (t) => {
  const first = await screen(t, { view: "upload" });
  await first.locator('[data-scan-guide="open"]').waitFor();
  assert.equal(await first.evaluate(() => (window as any).guideStore.get("orbit.add.scanGuideVisits.v1")), "1");
  const third = await screen(t, { view: "upload", visits: 2 });
  await third.locator('[data-scan-guide="open"]').waitFor();
  const fourth = await screen(t, { view: "upload", visits: 3 });
  await fourth.locator('[data-scan-guide="collapsed"]').waitFor();
  await fourth.locator("[data-scan-guide-show]").click();
  await fourth.locator('[data-scan-guide="open"]').waitFor();
});

test("名刺 upload: dropped photos are staged, a back pairs with the card before it, PDFs are refused, start opens the batch", async (t) => {
  const page = await screen(t, { view: "upload", visits: 5 });
  await page.locator("[data-scan-input]").setInputFiles([
    { name: "front.jpg", mimeType: "image/jpeg", buffer: Buffer.from("a") },
    { name: "back.jpg", mimeType: "image/jpeg", buffer: Buffer.from("b") },
    { name: "other.png", mimeType: "image/png", buffer: Buffer.from("c") },
    { name: "deck.pdf", mimeType: "application/pdf", buffer: Buffer.from("d") },
  ]);
  await page.locator("[data-scan-error]").waitFor();
  assert.equal(await page.locator("[data-staged-card]").count(), 3);
  await page.locator("[data-staged-pair]").first().click();
  assert.deepEqual(await page.locator("[data-staged-card]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-staged-sides"))), ["2", "1"]);
  await page.locator("[data-scan-start]").click();
  await page.waitForFunction(() => (window as any).shellFixture.calls.some((c: any) => c.push));
  const recorded = await calls(page);
  assert.deepEqual(recorded.find((c) => c.start)?.start, [["front.jpg", "back.jpg"], ["other.png", null]]);
  assert.deepEqual(recorded.filter((c) => c.push).map((c) => c.push), ["/app/contacts/new/scan/b-new"]);
});

/* ---------- 名刺 · まとめて確認 / 完成 ---------- */

function item(patch: Partial<IngestItemDTO> & { id: string; cardId: string }): IngestItemDTO {
  return {
    attemptCount: 1, batchId: "b1", cardIdentityExplicit: true, clientDigest: `d-${patch.id}`, confirmedContactId: null, createdAt: "2026-10-07T10:00:00Z",
    derivativeObjectKey: "k", derivativeSize: 1, errorCode: null, errorStage: null, extraction: null, extractionSchemaVersion: 3, idempotencyKey: "",
    imageDigest: `sha256:${patch.id}`, leaseExpiresAt: null, nextRetryAt: null, rawMimeType: "image/jpeg", rawSize: 1, reviewIssues: [], seq: 1, side: "front",
    sourceFileName: `${patch.id}.jpg`, status: "extracted", updatedAt: "2026-10-07T10:00:00Z", usage: null, version: 1, ...patch,
  } as IngestItemDTO;
}
const extraction = (name: string, organization: string, email = "") => ({
  addresses: [], certifications: [], contactPoints: [], departments: [], detectedLanguages: ["ja"], emails: email ? [{ label: null, value: email }] : [], fullName: name, nativeFullName: name,
  organization, romanizedFullName: null, title: "部長", website: null,
});

/** `serverMerged`: the server marks each confirmed item (R12 review m4) and this device has no ledger (opened elsewhere). */
function batchView(stage: "review" | "done", completed = false, serverMerged = false): ScanBatchView {
  const items = [
    item({ id: "auto", cardId: "c-auto", seq: 1, status: "confirmed", confirmedContactId: "p1", extraction: extraction("高山 亮", "ミライ精機") }),
    item({ id: "dup", cardId: "c-dup", seq: 2, extraction: extraction("高橋 美咲", "青葉ベンチャーズ", "misaki@aoba.example") }),
    item({ id: "guess", cardId: "c-guess", seq: 3, extraction: extraction("松本 千尋", "関西テクノ"), reviewIssues: [{ code: "ORG_SUFFIX_MISSING", field: "organization" }] as never }),
    item({ id: "held", cardId: "c-held", seq: 4, extraction: extraction("伊達 修平", "北辰製作所", "shuhei@hokushin.example") }),
    item({ id: "fail", cardId: "c-fail", seq: 5, status: "terminal_failed", errorCode: "IMAGE_INVALID" }),
  ];
  const done = stage === "done";
  const finalItems = done ? items.map((entry) => entry.cardId === "c-fail" ? { ...entry, status: "skipped" as const } : { ...entry, status: "confirmed" as const, confirmedContactId: `p-${entry.id}`, ...(serverMerged ? { confirmedMerged: entry.cardId === "c-dup" } : {}) }) : items;
  const cards = groupIngestItemsByCardId(finalItems);
  const drafts = Object.fromEntries(groupIngestItemsByCardId(items).filter((card) => card.reviewable).map((card) => [card.cardId, initialCardDraft(card)]));
  const pending = done ? [] : cards.filter((card) => card.cardId !== "c-auto");
  return buildScanBatchView({
    attributed: done ? { "c-held": "ev-1" } : {}, attribution: { cards: { "c-held": "ev-1" }, events: [{ eventId: "ev-1", startsAt: "2026-10-07T10:00:00Z", title: "CFO Night Tokyo" }] },
    attributionDecisions: {}, autoCount: serverMerged ? 0 : 1, autoPending: false, autoRunning: false, batchId: "b1", cards,
    detail: { batch: { createdAt: "2026-10-07T10:00:00Z" }, items: finalItems } as never,
    drafts, duplicates: new Set(done ? [] : ["c-dup"]), finished: done, loadFailed: false,
    matches: done ? {} : { "c-dup": { address: "", contactId: "p9", displayName: "高橋 美咲", email: "misaki@aoba.example", identical: false, matchedOn: ["email"], organization: "青葉 VC", phone: "", role: "パートナー" } },
    mergedCount: done && !serverMerged ? 1 : 0, missing: 0, pending, queue: pending, reviewing: true, settledCount: 5, stage: "review", status: completed ? "completed" : "ready_for_review", uploadFailed: false, userCount: done && !serverMerged ? 1 : 0,
  });
}

test("まとめて確認 (b9 ④ Web 统一): three tiles, 重複 as checked rows, 要確認 by reason, 会った場所 and unreadable cards below", async (t) => {
  const page = await screen(t, { view: "batch", batch: batchView("review") });
  await page.locator("[data-unified-review]").waitFor();
  await settles(page, '[data-review-tile="duplicate"] b', 1);
  await settles(page, '[data-review-tile="review"] b', 1);
  await settles(page, '[data-review-tile="asIs"] b', 2); // 1 already added + 1 held for 会った場所
  assert.match(await page.locator('[data-review-duplicate="c-dup"]').innerText(), /高橋 美咲 · 青葉 VC[\s\S]*高橋 美咲 · 青葉ベンチャーズ/);
  assert.equal(await page.locator('[data-review-duplicate="c-dup"] [role="checkbox"]').getAttribute("aria-checked"), "true");
  await page.locator('[data-review-group="orgSuffix"]').waitFor();
  await page.locator("[data-scan-met]").getByRole("button", { name: "付けない" }).click();
  assert.deepEqual((await calls(page)).filter((c) => "chooseEvent" in c), [{ chooseEvent: null }]);
  for (const button of ["retake", "manual", "skip"]) await page.locator(`[data-failed-${button}="c-fail"]`).waitFor();
  // 1件ずつ見る opens the cards of 要確認 to edit.
  await page.locator("[data-review-one-by-one]").click();
  await page.locator('[data-review-edit="c-guess"]').click();
  await page.locator('[data-field-editor="c-guess"] input').first().fill("松本 千尋さん");
  assert.ok((await calls(page)).some((c) => c.setDraft === "c-guess" && c.name === "松本 千尋さん"));
  // 「N人を人脈に追加」: duplicates (統合 when checked), 要確認 and the held one — not the unreadable card.
  assert.equal(await page.locator("[data-review-add-all]").getAttribute("data-review-add-all"), "3");
  await page.locator("[data-review-add-all]").click();
  await page.waitForFunction(() => (window as any).shellFixture.calls.some((c: any) => c.refresh));
  assert.deepEqual((await calls(page)).filter((c) => c.settle).map((c) => c.settle), [["c-dup", "merge"], ["c-guess", "confirm"], ["c-held", "confirm"]]);
});

test("まとめて確認: 選んだ N件を統合 merges the checked rows; unchecked ones are added as someone else; 提案どおりに直す confirms 要確認", async (t) => {
  const page = await screen(t, { view: "batch", batch: batchView("review") });
  await page.locator("[data-unified-review]").waitFor();
  assert.equal(await page.locator("[data-review-merge]").textContent(), "選んだ 1件を統合");
  await page.locator("[data-review-merge]").click();
  await page.waitForFunction(() => (window as any).shellFixture.calls.some((c: any) => c.settle));
  await page.locator("[data-review-apply]").click();
  await page.waitForFunction(() => (window as any).shellFixture.calls.filter((c: any) => c.settle).length >= 2);
  assert.deepEqual((await calls(page)).filter((c) => c.settle).map((c) => c.settle), [["c-dup", "merge"], ["c-guess", "confirm"]]);
});

test("まとめて確認 keyboard (1件ずつ): → moves to the next card, S skips it, ↵ confirms", async (t) => {
  const page = await screen(t, { view: "batch", batch: batchView("review") });
  await page.locator("[data-unified-review]").waitFor();
  await page.locator("[data-review-one-by-one]").click();
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => (window as any).shellFixture.calls.some((c: any) => c.settle));
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("s");
  await page.waitForFunction(() => (window as any).shellFixture.calls.filter((c: any) => c.settle).length >= 2);
  assert.deepEqual((await calls(page)).filter((c) => c.settle).map((c) => c.settle).slice(0, 1), [["c-guess", "confirm"]]);
});

test("完成: new / merged / unreadable (unreadable not counted as added); plan line waits for the batch to complete", async (t) => {
  const page = await screen(t, { view: "batch", batch: batchView("done") });
  await page.locator("[data-scan-done]").waitFor();
  assert.equal(await page.locator("[data-scan-done] h2").textContent(), "3人を人脈に追加しました");
  await settles(page, '[data-done-tile="created"]', 2);
  await settles(page, '[data-done-tile="merged"]', 1);
  await settles(page, '[data-done-tile="unreadable"]', 1);
  await page.locator('[data-done-plan="pending"]').getByText("確認が終わると表示されます").waitFor();
  assert.match(await page.locator("[data-scan-done]").innerText(), /CFO Night Tokyo/);
  const completed = await screen(t, { view: "batch", batch: batchView("done", true) });
  await completed.locator('[data-done-plan="ready"]').getByRole("button", { name: "プランで見る" }).click();
  await completed.locator("[data-done-more]").click();
  assert.deepEqual((await calls(completed)).filter((c) => c.push).map((c) => c.push), ["/app/tasks?tab=plan", "/app/contacts/new/scan"]);
});

test("完成 (R12 review m4 / m11): merged comes from the server, not this device; the density bar counts the new people", async (t) => {
  const page = await screen(t, { view: "batch", batch: batchView("done", false, true) });
  await page.locator("[data-scan-done]").waitFor();
  assert.equal(await page.locator("[data-scan-done] h2").textContent(), "4人を人脈に追加しました");
  await settles(page, '[data-done-tile="created"]', 3);
  await settles(page, '[data-done-tile="merged"]', 1);
  // 高山 / 松本: name only (●○○); 伊達: email + 会った場所 (●●○). The merged one is not counted.
  assert.equal(await page.locator("[data-done-density]").getAttribute("data-done-density"), "2,1,0");
  assert.match(await page.locator("[data-done-density]").innerText(), /身元だけ/);
  // Without the server marks (older server) the bar is not shown.
  const old = await screen(t, { view: "batch", batch: batchView("done") });
  await old.locator("[data-scan-done]").waitFor();
  assert.equal(await old.locator("[data-done-density]").count(), 0);
});

test("手入力 (b11 A3 Web): a 520 drawer, the save row follows the fields (保存 ⌘↵); 390 is full screen without the shortcut", async (t) => {
  for (const width of [1440, 1024]) {
    const page = await screen(t, { view: "manual", handlers: [EVENTS] }, { width });
    await page.locator("[data-manual-form]").waitFor();
    const box = await page.locator('[role="dialog"]').boundingBox();
    assert.equal(Math.round(box!.width), 520, `${width}: 520 wide`);
    const layout = await page.evaluate(() => {
      const save = document.querySelector("[data-manual-save]") as HTMLButtonElement;
      const form = document.querySelector("[data-manual-form]") as HTMLFormElement;
      return { linked: save.form === form, kbdInSave: Boolean(save.querySelector("kbd")) };
    });
    assert.equal(layout.linked, true, `${width}: the save button submits the form`);
    assert.equal(layout.kbdInSave, true, `${width}: ⌘↵ sits inside 保存`);
  }
  const narrow = await screen(t, { view: "manual", handlers: [EVENTS] }, { width: 390 });
  await narrow.locator("[data-manual-form]").waitFor();
  await narrow.locator('[role="dialog"]').evaluate((node) => Promise.all(node.getAnimations().map((animation) => animation.finished)));
  const box = await narrow.locator('[role="dialog"]').boundingBox();
  assert.deepEqual(box && [box.x, box.y, box.width, box.height], [0, 0, 390, 900], "full screen at 390");
  assert.equal(await narrow.locator("[data-manual-save] kbd").isVisible(), false, "no keyboard shortcut on a phone");
  await narrow.locator('[data-manual-field="displayName"]').fill("山田 太郎");
  await narrow.locator("[data-manual-save]").click();
  await narrow.waitForFunction(() => (window as any).shellFixture.fetches.some((c: any) => c.url === "/api/contacts/manual" && c.method === "POST"));
});

test("dark mode and 390 render without errors", async (t) => {
  const dark = await screen(t, { view: "batch", batch: batchView("review") }, { dark: true });
  await dark.locator("[data-unified-review]").waitFor();
  const narrow = await screen(t, { view: "manual", handlers: [EVENTS] }, { width: 390 });
  await narrow.locator("[data-manual-form]").waitFor();
});
