import assert from "node:assert/strict";
import test from "node:test";
import type { Browser, Page } from "playwright";

import { bundle, errorsOf, launch, open } from "./support/orbit-2026-harness";
import { SHELL_STUBS } from "./support/orbit-2026-shell-harness";

// R15 招待コード · 発出方 on the Web (DESIGN §2.4, b11 A2 ①–③ / Web, b5 E6): 人脈を追加 › 招待コード
// rendered for real inside the shell — 説明 the first time only, the QR card, the share switches and
// their defaults, the three draft tones (no 「送信」 button anywhere), 無効にする with a confirmation,
// これまでのコード with all five states, and the right rail. fetch is stubbed and every call recorded.
type Reply = { status: number; body: unknown };
type Handler = { method: string; url: string; replies: Reply[] };
type Fixture = { handlers?: Handler[]; guideSeen?: boolean; open?: boolean; lang?: string };
type Call = { url: string; method: string; body?: any };

const ok = (data: unknown, status = 200): Reply => ({ body: { data, success: true }, status });
const fail = (status: number, code: string, reason?: string): Reply => ({ body: { success: false, error: { code, message: "x", ...(reason ? { context: { reason } } : {}) } }, status });
const DAY = 86_400_000;
const iso = (offset: number) => new Date(Date.now() + offset).toISOString();

const CODE = {
  code: "K7QX-2M9P",
  link: "https://orbitailink.com/i/K7QX-2M9P",
  maxUses: 10,
  usedCount: 1,
  createdAt: iso(-1000),
  expiresAt: iso(7 * DAY - 60_000),
  shared: { displayName: "佐藤 健一", organization: "株式会社ミナトリンク", role: "代表取締役", offering: ["製造業 SaaS の導入知見"], seeking: ["投資家の紹介"] },
};
const NEW_CODE = { ...CODE, code: "P3XA-8HTC", link: "https://orbitailink.com/i/P3XA-8HTC", usedCount: 0, shared: { ...CODE.shared, email: "kenichi@minato.example" } };
const PROFILE = {
  profile: {
    displayName: "佐藤 健一", organization: "株式会社ミナトリンク", role: "代表取締役", offering: ["製造業 SaaS の導入知見"], seeking: ["投資家の紹介"],
    handles: { email: "kenichi@minato.example" }, updatedAt: "2026-10-01T00:00:00.000Z",
  },
};
const HISTORY = {
  items: [
    { code: "K7QX-2M9P", createdAt: iso(-1000), expiresAt: iso(7 * DAY), status: "active", usedCount: 1, maxUses: 10, joined: [{ contactId: "c-takahashi", displayName: "高橋 美咲", joinedAt: iso(-500) }] },
    { code: "M8RT-4QZW", createdAt: iso(-9 * DAY), expiresAt: iso(-2 * DAY), status: "expired", usedCount: 0, maxUses: 10, joined: [] },
    { code: "N2VB-7KJH", createdAt: iso(-12 * DAY), expiresAt: iso(-5 * DAY), status: "revoked", usedCount: 0, maxUses: 10, joined: [] },
    { code: "Q4WE-9RTY", createdAt: iso(-20 * DAY), expiresAt: iso(-13 * DAY), status: "superseded", usedCount: 2, maxUses: 10, joined: [{ contactId: "c-ito", displayName: "伊藤 直子", joinedAt: iso(-19 * DAY) }] },
    { code: "Z5XC-3VBN", createdAt: iso(-30 * DAY), expiresAt: iso(-23 * DAY), status: "full", usedCount: 10, maxUses: 10, joined: [] },
  ],
};

const CURRENT: Handler = { method: "GET", url: "^/api/invite-codes/current$", replies: [ok(CODE)] };
const NO_CURRENT: Handler = { method: "GET", url: "^/api/invite-codes/current$", replies: [ok(null)] };
const PROFILE_GET: Handler = { method: "GET", url: "^/api/profile$", replies: [ok(PROFILE)] };
const HISTORY_GET: Handler = { method: "GET", url: "^/api/invite-codes$", replies: [ok(HISTORY)] };

let browser: Browser;
let code: { js: string; css: string };

test.before(async () => {
  code = await bundle(`
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { Orbit2026Shell } from "./app/(app)/app/orbit-2026/shell/Orbit2026Shell";
    import { OrbitAskProvider } from "./app/(app)/app/orbit-global-ask/orbit-ask-context";
    import { AddContactScreen } from "./app/(app)/app/orbit-2026/add/AddContactScreen";
    const f = window.shellFixture;
    const store = new Map(f.guideSeen ? [["orbit.invite.guideSeen.v1", "1"]] : []);
    Object.defineProperty(window, "localStorage", { configurable: true, value: { getItem: (k) => store.has(k) ? store.get(k) : null, setItem: (k, v) => { store.set(k, String(v)); }, removeItem: (k) => { store.delete(k); } } });
    window.guideStore = store;
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text) => { f.copied.push(text); } } });
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
    createRoot(document.getElementById("root")).render(<OrbitAskProvider><Orbit2026Shell language={f.lang} signedIn><AddContactScreen inviteOpen={f.open !== false} /></Orbit2026Shell></OrbitAskProvider>);
  `, SHELL_STUBS);
  browser = await launch();
});
test.after(async () => { await browser?.close(); });

async function senderScreen(b: Browser, js: { js: string; css: string }, fixture: Fixture, options: { width?: number; dark?: boolean; reducedMotion?: boolean } = {}): Promise<Page> {
  return open(b, js, { ...options, html: `<div id="root"></div><script>window.shellFixture=${JSON.stringify({ calls: [], fetches: [], copied: [], lang: "ja", path: "/app/contacts/new", unread: false, ...fixture })}</script>` });
}

async function screen(t: { after: (fn: () => Promise<void>) => void }, fixture: Fixture, options: { width?: number; dark?: boolean; reducedMotion?: boolean } = {}): Promise<Page> {
  const page = await senderScreen(browser, code, fixture, options);
  t.after(async () => { const errors = errorsOf(page); await page.close(); assert.deepEqual(errors, []); });
  return page;
}

const fetches = (page: Page): Promise<Call[]> => page.evaluate(() => (window as any).shellFixture.fetches);
const writes = async (page: Page) => (await fetches(page)).filter((call) => call.method !== "GET");

test("first time: 説明 (3 steps + 3 questions) → コードをつくる creates a code with the default keys; the flag is remembered", async (t) => {
  const page = await screen(t, { handlers: [NO_CURRENT, PROFILE_GET, HISTORY_GET, { method: "POST", url: "^/api/invite-codes$", replies: [ok(CODE, 201)] }] });
  const intro = page.locator("[data-invite-intro]");
  await intro.waitFor();
  assert.equal(await page.getByRole("dialog").getByRole("heading", { level: 2 }).first().textContent(), "招待コード");
  for (const text of ["相手が自分で入力して、お互いの人脈に入ります", "3ステップ", "コードを見せる · 送る", "相手が登録・入力", "お互いの人脈に", "相手がもう Orbit を使っていたら？", "期限と回数は？", "Orbit から相手に送られますか？"]) {
    assert.equal(await intro.getByText(text, { exact: true }).count(), 1, text);
  }
  assert.deepEqual(await writes(page), [], "opening the dialog writes nothing");
  await page.locator("[data-invite-start]").click();
  await page.locator("[data-invite-code-card]").waitFor();
  const [create] = await writes(page);
  assert.equal(create!.url, "/api/invite-codes");
  assert.deepEqual(create!.body.sharedKeys, ["organization", "offering", "seeking"], "連絡先 is off by default");
  assert.equal(create!.body.maxUses, 10);
  assert.match(create!.body.idempotencyKey, /^invite-create-/);
  assert.equal(await page.evaluate(() => (window as any).guideStore.get("orbit.invite.guideSeen.v1")), "1");
});

test("second time: straight to 共有 — QR, 8-character code, link + コピー, QR を拡大, 有効期限 · あと N日, 残り N / 10人 · 登録済み N人", async (t) => {
  const page = await screen(t, { guideSeen: true, handlers: [CURRENT, PROFILE_GET, HISTORY_GET] });
  await page.locator("[data-invite-code-card]").waitFor();
  assert.equal(await page.locator("[data-invite-intro]").count(), 0, "説明 is skipped after the first time");
  assert.equal(await page.locator("[data-invite-code]").textContent(), "K7QX-2M9P");
  assert.equal(await page.locator("[data-invite-link]").textContent(), "orbitailink.com/i/K7QX-2M9P");
  const qr = page.locator('[data-invite-code-card] [data-invite-qr="md"] svg');
  assert.equal(await qr.getAttribute("aria-label"), "招待リンクの QR コード");
  assert.ok((await qr.locator("path").getAttribute("d"))!.length > 200, "a real QR matrix");
  assert.match((await page.locator("[data-invite-expires]").textContent())!, /^\d{1,2}\/\d{1,2} まで$/);
  assert.equal(await page.locator("[data-invite-days]").textContent(), "あと7日");
  assert.equal(await page.locator("[data-invite-uses]").textContent(), "残り 9 / 10人");
  assert.equal(await page.locator("[data-invite-joined]").textContent(), "登録済み 1人");
  await page.locator("[data-invite-copy-link]").click();
  await page.getByText("リンクをコピーしました").waitFor();
  assert.deepEqual(await page.evaluate(() => (window as any).shellFixture.copied), ["https://orbitailink.com/i/K7QX-2M9P"]);
  await page.locator("[data-invite-enlarge]").click();
  await page.locator('[data-invite-qr-big] [data-invite-qr="lg"]').waitFor();
  const size = await page.locator('[data-invite-qr="lg"]').evaluate((node) => node.getBoundingClientRect().width);
  assert.ok(size >= 300, `enlarged QR ${size}`);
  assert.equal(await page.getByText("Orbit からは送信しません · 共有はあなたの端末から").count(), 1);
});

test("相手に届くあなたの情報: chips by default; 変更 shows switches with my values (only what the profile has), e-mail off; applying remakes the code with the keys", async (t) => {
  const page = await screen(t, { guideSeen: true, handlers: [CURRENT, PROFILE_GET, HISTORY_GET, { method: "POST", url: "^/api/invite-codes$", replies: [ok(NEW_CODE, 201)] }] });
  const share = page.locator("[data-invite-share]");
  await share.waitFor();
  assert.deepEqual(await share.locator("[data-invite-share-chips] span[title]").allTextContents(), ["会社・役職", "提供できること", "求めていること", "連絡先（オフ）"]);
  await page.locator("[data-invite-share-edit]").click();
  const switches = await share.locator("[data-invite-switch]").evaluateAll((rows) => rows.map((row) => [row.getAttribute("data-invite-switch"), row.querySelector('[role="switch"]')!.getAttribute("aria-checked")]));
  assert.deepEqual(switches, [["organization", "true"], ["offering", "true"], ["seeking", "true"], ["email", "false"]], "no 電話 switch: the profile has no phone");
  assert.equal(await share.locator('[data-invite-switch="organization"]').getByText("株式会社ミナトリンク · 代表取締役").count(), 1);
  assert.equal(await share.locator('[data-invite-switch="email"]').getByText("kenichi@minato.example").count(), 1);
  assert.equal(await share.getByText("変えると新しいコードになり、今のコードとリンクは使えなくなります。").count(), 1);
  await share.locator('[data-invite-switch="email"] [role="switch"]').click();
  await page.locator("[data-invite-share-apply]").click();
  await page.locator('[data-invite-code]:text("P3XA-8HTC")').waitFor();
  const [create] = await writes(page);
  assert.deepEqual(create!.body.sharedKeys, ["organization", "offering", "seeking", "email"]);
});

test("メッセージの下書き: three fixed tones, copy / LINE / mail only — no 「送信」 button anywhere in the dialog", async (t) => {
  const page = await screen(t, { guideSeen: true, handlers: [CURRENT, PROFILE_GET, HISTORY_GET] });
  await page.locator("[data-invite-code-card]").waitFor();
  await page.getByRole("button", { name: "メッセージの下書き" }).click();
  const draft = page.locator("[data-invite-draft-text]");
  await draft.waitFor();
  assert.match((await draft.textContent())!, /^先日はありがとうございました。\n[^\n]+\nhttps:\/\/orbitailink\.com\/i\/K7QX-2M9P（\d{1,2}\/\d{1,2} まで）\n佐藤 健一$/u);
  await page.getByRole("tab", { name: "カジュアル" }).click();
  assert.match((await draft.textContent())!, /^この前はありがとうございました！/u);
  await page.getByRole("tab", { name: "英語" }).click();
  assert.match((await draft.textContent())!, /^Thank you for the other day\.\n[^\n]+\nhttps:\/\/orbitailink\.com\/i\/K7QX-2M9P \(until [A-Z][a-z]{2} \d{1,2}\)\n佐藤 健一$/u);
  const english = (await draft.textContent())!;
  assert.match((await page.locator("[data-invite-draft-line]").getAttribute("href"))!, /^https:\/\/line\.me\/R\/share\?text=/);
  assert.equal(await page.locator("[data-invite-draft-line]").getAttribute("href"), `https://line.me/R/share?text=${encodeURIComponent(english)}`);
  assert.match((await page.locator("[data-invite-draft-mail]").getAttribute("href"))!, /^mailto:\?subject=Orbit%20%E3%81%B8%E3%81%AE%E6%8B%9B%E5%BE%85&body=/);
  await page.locator("[data-invite-draft-copy]").click();
  await page.getByText("下書きをコピーしました").waitFor();
  assert.deepEqual(await page.evaluate(() => (window as any).shellFixture.copied), [english]);
  const controls = await page.getByRole("dialog").locator("button, a").allTextContents();
  assert.deepEqual(controls.filter((text) => /送信|^送る$|Send/u.test(text)), [], "Orbit never sends: no send button");
  assert.equal(await page.getByText("あなたのアプリから送ります · Orbit は送信しません").count(), 1);
});

test("無効にする asks first (scrim does not dismiss); confirming turns the code off and offers a new one", async (t) => {
  const page = await screen(t, { guideSeen: true, handlers: [CURRENT, PROFILE_GET, HISTORY_GET, { method: "POST", url: "^/api/invite-codes/K7QX-2M9P/revoke$", replies: [ok({ ...CODE, revokedAt: iso(0) })] }] });
  await page.locator("[data-invite-revoke]").click();
  const confirm = page.getByRole("alertdialog");
  await confirm.waitFor();
  assert.equal(await confirm.getByRole("heading").textContent(), "このコードを無効にしますか？");
  assert.deepEqual(await writes(page), [], "nothing happens before the confirmation");
  await confirm.getByRole("button", { name: "無効にする" }).click();
  await page.locator("[data-invite-nocode]").waitFor();
  const calls = await writes(page);
  assert.deepEqual(calls.map((call) => call.url), ["/api/invite-codes/K7QX-2M9P/revoke"]);
  await page.getByText("コードを無効にしました").waitFor();
  assert.equal(await page.locator("[data-invite-code-card]").count(), 0);
});

test("これまでのコード: 有効 / 期限切れ / 無効 / 置き換え / 上限, joined people link to their page, 新しいコードを発行 on expired and replaced rows", async (t) => {
  const page = await screen(t, { guideSeen: true, handlers: [CURRENT, PROFILE_GET, HISTORY_GET, { method: "POST", url: "^/api/invite-codes$", replies: [ok(NEW_CODE, 201)] }] });
  const rows = page.locator("[data-invite-history-row]");
  await rows.first().waitFor();
  assert.deepEqual(await rows.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-invite-history-row"))), ["active", "expired", "revoked", "superseded", "full"]);
  const chips = await rows.evaluateAll((nodes) => nodes.map((node) => node.querySelector("span[title]")!.textContent));
  assert.deepEqual(chips, ["有効", "期限切れ", "無効", "置き換え", "上限"]);
  assert.deepEqual(await page.locator("[data-invite-joined-link]").evaluateAll((links) => links.map((link) => [link.textContent, link.getAttribute("href")])), [["高橋 美咲", "/app/contacts/c-takahashi"], ["伊藤 直子", "/app/contacts/c-ito"]]);
  assert.deepEqual(await rows.evaluateAll((nodes) => nodes.map((node) => Boolean(node.querySelector("[data-invite-reissue]")))), [false, true, false, true, false]);
  assert.equal(await rows.nth(2).getByText("まだ誰も登録していません").count(), 1);
  await rows.nth(1).locator("[data-invite-reissue]").click();
  await page.locator('[data-invite-code]:text("P3XA-8HTC")').waitFor();
  const [create] = await writes(page);
  assert.deepEqual(create!.body.sharedKeys, ["organization", "offering", "seeking"], "the new code keeps the current keys");
});

test("no profile name: コードをつくる explains what to do instead of failing silently", async (t) => {
  const page = await screen(t, { guideSeen: true, handlers: [NO_CURRENT, { method: "GET", url: "^/api/profile$", replies: [ok({ profile: null })] }, HISTORY_GET, { method: "POST", url: "^/api/invite-codes$", replies: [fail(409, "CONFLICT", "PROFILE_REQUIRED")] }] });
  await page.locator("[data-invite-create]").click();
  await page.locator('[data-invite-notice="profile"]').waitFor();
  assert.equal(await page.locator('[data-invite-notice="profile"] a').getAttribute("href"), "/app/profile");
});

test("the door and the right rail open the dialog", async (t) => {
  const page = await screen(t, { guideSeen: true, open: false, handlers: [CURRENT, PROFILE_GET, HISTORY_GET] });
  await page.locator('[data-add-door="invite"]').click();
  await page.locator("[data-invite-code-card]").waitFor();
  await page.keyboard.press("Escape");
  await page.locator("[data-invite-code-card]").waitFor({ state: "detached" });
  const rail = page.locator("[data-invite-rail]");
  await rail.waitFor();
  for (const text of ["いちばん早い方法", "招待コードを 3人に送る", "相手が自分で入力するので、最初から ●●● で入ります。"]) assert.equal(await rail.getByText(text).count(), 1, text);
  await page.locator("[data-invite-rail-create]").click();
  await page.locator("[data-invite-code-card]").waitFor();
});

test("390: the dialog is a bottom sheet; 1024: a centred 560 dialog", async (t) => {
  const phone = await screen(t, { guideSeen: true, handlers: [CURRENT, PROFILE_GET, HISTORY_GET] }, { width: 390 });
  await phone.locator("[data-invite-code-card]").waitFor();
  await phone.waitForTimeout(450);
  const sheet = await phone.getByRole("dialog").first().evaluate((node) => { const r = node.getBoundingClientRect(); return { left: r.left, width: r.width, bottom: r.bottom, height: innerHeight }; });
  assert.equal(sheet.left, 0);
  assert.equal(sheet.width, 390);
  assert.ok(sheet.bottom >= sheet.height, `sheet sits on the bottom edge (${sheet.bottom} vs ${sheet.height})`);
  const wide = await screen(t, { guideSeen: true, handlers: [CURRENT, PROFILE_GET, HISTORY_GET] }, { width: 1024 });
  await wide.locator("[data-invite-code-card]").waitFor();
  await wide.waitForTimeout(450);
  const dialog = await wide.getByRole("dialog").first().evaluate((node) => { const r = node.getBoundingClientRect(); return { width: r.width, center: r.left + r.width / 2 }; });
  assert.equal(dialog.width, 560);
  assert.ok(Math.abs(dialog.center - 512) < 2);
});

test("dark: the QR keeps dark modules on a light ground (cameras read it)", async (t) => {
  const page = await screen(t, { guideSeen: true, handlers: [CURRENT, PROFILE_GET, HISTORY_GET] }, { dark: true });
  const qr = page.locator('[data-invite-code-card] [data-invite-qr="md"]');
  await qr.waitFor();
  const { fg, bg } = await qr.evaluate((node) => ({ fg: getComputedStyle(node).color, bg: getComputedStyle(node).backgroundColor }));
  const lum = (value: string) => { const [r, g, b] = (value.match(/[\d.]+/g) ?? []).map(Number); return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!; };
  assert.ok(lum(bg) > lum(fg) + 100, `light ground ${bg}, dark modules ${fg}`);
});

// R15 复核 S1: a code no longer merges on its own; the owner decides per person in これまでのコード.
const SUGGESTED = { contactId: "c-tanaka-old", displayName: "田中 太郎", matchedOn: ["name_organization"] };
const HISTORY_SUGGEST = { items: [{ ...HISTORY.items[0], joined: [{ contactId: "c-invite-new", displayName: "田中 太郎", joinedAt: iso(-500), mergeSuggestion: SUGGESTED }] }] };
const HISTORY_MERGED = { items: [{ ...HISTORY.items[0], joined: [{ contactId: "c-tanaka-old", displayName: "田中 太郎", joinedAt: iso(-500) }] }] };
const HISTORY_DISMISSED = { items: [{ ...HISTORY.items[0], joined: [{ contactId: "c-invite-new", displayName: "田中 太郎", joinedAt: iso(-500) }] }] };
const CONNECTION = (contactId: string) => ({ contactId, connectedAt: iso(-500), via: { code: "K7QX-2M9P" }, sharedByMe: [], sharedByPeer: [], pausedFields: [] });

test("これまでのコード · 同じ人かも: 統合する posts merge for the new contact, then the list reloads (link points at the kept contact, the question is gone)", async (t) => {
  const page = await screen(t, { guideSeen: true, handlers: [CURRENT, PROFILE_GET,
    { method: "GET", url: "^/api/invite-codes$", replies: [ok(HISTORY_SUGGEST), ok(HISTORY_MERGED)] },
    { method: "POST", url: "^/api/invite-codes/connections/c-invite-new/merge$", replies: [ok(CONNECTION("c-tanaka-old"))] }] });
  const suggestion = page.locator("[data-invite-merge]");
  await suggestion.waitFor();
  assert.equal(await suggestion.getByText("同じ人かも：田中 太郎", { exact: true }).count(), 1);
  assert.equal(await suggestion.getByRole("button", { name: "統合する" }).count(), 1);
  assert.equal(await suggestion.getByRole("button", { name: "別の人" }).count(), 1);
  await suggestion.getByRole("button", { name: "統合する" }).click();
  await page.locator("[data-invite-merge]").waitFor({ state: "detached" });
  const [merge, ...rest] = await writes(page);
  assert.equal(rest.length, 0);
  assert.equal(merge!.url, "/api/invite-codes/connections/c-invite-new/merge");
  assert.deepEqual(Object.keys(merge!.body), ["idempotencyKey"]);
  assert.match(merge!.body.idempotencyKey, /^invite-merge-/u);
  assert.deepEqual(await page.locator("[data-invite-joined-link]").evaluateAll((links) => links.map((link) => link.getAttribute("href"))), ["/app/contacts/c-tanaka-old"]);
});

test("これまでのコード · 同じ人かも: 別の人 posts dismiss and the question goes away; a failed merge keeps it and says so", async (t) => {
  const page = await screen(t, { guideSeen: true, handlers: [CURRENT, PROFILE_GET,
    { method: "GET", url: "^/api/invite-codes$", replies: [ok(HISTORY_SUGGEST), ok(HISTORY_DISMISSED)] },
    { method: "POST", url: "^/api/invite-codes/connections/c-invite-new/merge/dismiss$", replies: [ok(CONNECTION("c-invite-new"))] }] });
  await page.locator("[data-invite-merge]").getByRole("button", { name: "別の人" }).click();
  await page.locator("[data-invite-merge]").waitFor({ state: "detached" });
  assert.deepEqual((await writes(page)).map((call) => call.url), ["/api/invite-codes/connections/c-invite-new/merge/dismiss"]);
  assert.deepEqual(await page.locator("[data-invite-joined-link]").evaluateAll((links) => links.map((link) => link.getAttribute("href"))), ["/app/contacts/c-invite-new"]);

  const broken = await screen(t, { guideSeen: true, handlers: [CURRENT, PROFILE_GET,
    { method: "GET", url: "^/api/invite-codes$", replies: [ok(HISTORY_SUGGEST)] },
    { method: "POST", url: "/merge$", replies: [fail(500, "INTERNAL_ERROR")] }] });
  const suggestion = broken.locator("[data-invite-merge]");
  await suggestion.getByRole("button", { name: "統合する" }).click();
  await broken.getByText("保存できませんでした").waitFor();
  assert.equal(await suggestion.getByRole("button", { name: "統合する" }).isEnabled(), true, "can try again");
});
