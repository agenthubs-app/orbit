import assert from "node:assert/strict";
import test from "node:test";
import type { Browser, Page } from "playwright";

import { bundle, errorsOf, launch, open } from "./support/orbit-2026-harness";

// R15 招待コード · 接收方 /i/<code> and /i (DESIGN §2.5, b9 A5 ② + 1–3/3, b11 A2 ④⑤⑦⑧): every state
// rendered for real — signed out, the short profile, signed in (share switches, no in-browser 「same person」 guess),
// done, expired, full, unavailable, rate-limited, already connected, own code — and the hand-typed code.
type Reply = { status: number; body: unknown };
type Handler = { method: string; url: string; replies: Reply[] };
type Call = { url: string; method: string; body?: any };
type Fixture = {
  view?: "landing" | "entry";
  lang?: string;
  initial?: unknown;
  signedIn?: boolean;
  accountName?: string | null;
  handlers?: Handler[];
  legacy?: boolean;
};

const ok = (data: unknown, status = 200): Reply => ({ body: { data, success: true }, status });
const fail = (status: number, code: string, reason?: string): Reply => ({ body: { success: false, error: { code, message: "x", ...(reason ? { context: { reason } } : {}) } }, status });

const PREVIEW = {
  code: "H8MW-4QZT",
  expiresAt: "2026-10-14T09:00:00.000Z",
  shared: { displayName: "佐藤 健一", organization: "株式会社ミナトリンク", role: "代表取締役 CEO", offering: ["製造業 SaaS の導入知見"], seeking: ["投資家の紹介"] },
  status: "active",
};
const OPEN = { kind: "preview", preview: PREVIEW };
const MY_PROFILE = { profile: { displayName: "高橋 美咲", organization: "青葉ベンチャーズ", role: "パートナー", offering: ["投資"], seeking: ["起業家との出会い"], handles: { email: "misaki@aoba.example", phone: "090-0000-0000" }, updatedAt: "2026-10-01T00:00:00.000Z" } };
const EMPTY_PROFILE = { profile: { displayName: "", organization: "", role: "", offering: [], seeking: [], updatedAt: "2026-10-01T00:00:00.000Z" } };
const PROFILE_GET: Handler = { method: "GET", url: "^/api/profile$", replies: [ok(MY_PROFILE)] };
const REDEEMED = { outcome: "connected", contactId: "contact:invite:abc", peer: { ...PREVIEW.shared, email: "kenichi@minato.example" } };

let browser: Browser;
let code: { js: string; css: string };

test.before(async () => {
  code = await bundle(`
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { InviteLanding } from "./app/(app)/app/orbit-2026/invite-landing/InviteLanding";
    import { InviteCodeEntry } from "./app/(app)/app/orbit-2026/invite-landing/InviteCodeEntry";
    const f = window.landingFixture;
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
    const navigate = (href) => f.navigations.push(href);
    createRoot(document.getElementById("root")).render(f.view === "entry"
      ? <InviteCodeEntry language={f.lang} navigate={navigate} legacyLink={Boolean(f.legacy)} />
      : <InviteLanding language={f.lang} initial={f.initial} signedIn={f.signedIn} accountName={f.accountName} navigate={navigate} />);
  `);
  browser = await launch();
});
test.after(async () => { await browser?.close(); });

async function landing(t: { after: (fn: () => Promise<void>) => void }, fixture: Fixture, options: { width?: number; dark?: boolean } = {}): Promise<Page> {
  const page = await open(browser, code, { width: options.width ?? 390, dark: options.dark, html: `<div id="root"></div><script>window.landingFixture=${JSON.stringify({ copied: [], fetches: [], navigations: [], lang: "ja", initial: OPEN, signedIn: false, accountName: null, ...fixture })}</script>` });
  t.after(async () => { const errors = errorsOf(page); await page.close(); assert.deepEqual(errors, []); });
  return page;
}

const fetches = (page: Page): Promise<Call[]> => page.evaluate(() => (window as any).landingFixture.fetches);
const state = (page: Page) => page.locator("[data-invite-landing]").getAttribute("data-invite-landing");

test("signed out: the inviter's card (no e-mail / phone), code and date, 登録 / ログイン come back to /i/<code>", async (t) => {
  const page = await landing(t, {});
  await page.locator("[data-invite-open]").waitFor();
  const card = page.locator("[data-invite-inviter]");
  for (const text of ["招待が届いています", "佐藤 健一 さん", "株式会社ミナトリンク · 代表取締役 CEO", "製造業 SaaS の導入知見", "投資家の紹介", "提供できること", "求めていること"]) assert.equal(await card.getByText(text, { exact: true }).count(), 1, text);
  assert.equal(await card.getByText("登録すると、お互いの人脈に追加されます。あなたが選んだ項目だけが相手に届きます。").count(), 1);
  assert.equal(await page.locator("[data-invite-code-line]").textContent(), "H8MW-4QZT · 10/14 まで有効");
  assert.equal(await page.locator("[data-invite-signup]").getAttribute("href"), "/app/account/signup?next=%2Fi%2FH8MW-4QZT");
  assert.equal(await page.locator("[data-invite-signup]").textContent(), "無料で登録してつながる");
  assert.equal(await page.locator("[data-invite-login]").getAttribute("href"), "/app/account/login?next=%2Fi%2FH8MW-4QZT");
  assert.equal(await page.getByText("登録は1分 · クレジットカード不要 · アプリは不要").count(), 1);
  assert.deepEqual(await fetches(page), [], "nothing is read or written for a signed-out visitor");
  assert.doesNotMatch((await page.locator("body").textContent())!, /@|090-/u);
});

test("signed in, no name yet: the short profile (name required, prefilled from the account; chips + free input) saves through /api/profile and moves on", async (t) => {
  const page = await landing(t, { signedIn: true, accountName: "misaki", handlers: [
    { method: "GET", url: "^/api/profile$", replies: [ok(EMPTY_PROFILE), ok(MY_PROFILE)] },
    { method: "PUT", url: "^/api/profile$", replies: [ok({ mutationId: "m" })] },
  ] });
  await page.locator("[data-invite-profile]").waitFor();
  assert.equal(await page.getByRole("heading", { name: "あなたのことを教えてください" }).count(), 1);
  const name = page.locator('[data-invite-field="displayName"]');
  assert.equal(await name.inputValue(), "misaki", "prefilled with the account name");
  await name.fill("");
  await page.locator("[data-invite-profile-next]").click();
  await page.getByText("名前を入れてください。").waitFor();
  assert.equal((await fetches(page)).filter((call) => call.method === "PUT").length, 0, "no save without a name");
  await name.fill("高橋 美咲");
  await page.locator('[data-invite-field="organization"]').fill("青葉ベンチャーズ");
  await page.locator('[data-invite-field="role"]').fill("パートナー");
  await page.locator('[data-invite-tag="人の紹介"]').first().click();
  const custom = page.getByLabel("自由に追加").first();
  await custom.fill("投資");
  await custom.press("Enter");
  await page.locator('[data-invite-tag="顧客の紹介"]').click();
  await page.locator("[data-invite-profile-next]").click();
  await page.locator("[data-invite-confirm]").waitFor();
  const put = (await fetches(page)).find((call) => call.method === "PUT")!;
  assert.deepEqual({ ...put.body, mutationId: undefined }, { displayName: "高橋 美咲", organization: "青葉ベンチャーズ", role: "パートナー", offering: ["人の紹介", "投資"], seeking: ["顧客の紹介"], expectedUpdatedAt: "2026-10-01T00:00:00.000Z", mutationId: undefined });
  assert.match(put.body.mutationId, /^invite-profile-/);
});

test("signed in (b11 #12): つながりますか？, 佐藤さんに見せる情報 as chips; 変更 opens switches — 名前 always (cannot be turned off), 会社 / 提供 / 求めている on, メール / 電話 off; つながる sends keys only and lands on 完了", async (t) => {
  const page = await landing(t, { signedIn: true, handlers: [PROFILE_GET, { method: "POST", url: "^/api/invite-codes/H8MW-4QZT/redeem$", replies: [ok(REDEEMED)] }] });
  const confirm = page.locator("[data-invite-confirm]");
  await confirm.waitFor();
  assert.equal(await confirm.getByRole("heading", { name: "佐藤 健一さんとつながりますか？" }).count(), 1);
  assert.equal(await confirm.getByText(/^新しいアカウントは作りません。\s*お互いの人脈に追加されます。$/u).count(), 1);
  assert.equal(await confirm.getByText("高橋 美咲 でログイン中").count(), 1);
  assert.equal(await confirm.getByText("佐藤さんに見せる情報", { exact: true }).count(), 1, "running text calls the inviter by family name");
  assert.deepEqual(await confirm.locator("[data-invite-share-chips] span").allTextContents(), ["会社・役職", "提供できること", "求めていること", "連絡先（オフ）"]);
  await confirm.locator("[data-invite-share-edit]").click();
  const switches = await confirm.locator("[data-invite-switch]").evaluateAll((rows) => rows.map((row) => { const s = row.querySelector('[role="switch"]')!; return [row.getAttribute("data-invite-switch"), s.getAttribute("aria-checked"), (s as HTMLButtonElement).disabled]; }));
  assert.deepEqual(switches, [["displayName", "true", true], ["organization", "true", false], ["offering", "true", false], ["seeking", "true", false], ["email", "false", false], ["phone", "false", false]]);
  await confirm.locator('[data-invite-switch="seeking"] [role="switch"]').click();
  await confirm.locator('[data-invite-switch="phone"] [role="switch"]').click();
  await page.locator("[data-invite-connect]").click();
  await page.locator("[data-invite-done]").waitFor();
  const redeem = (await fetches(page)).find((call) => call.url.endsWith("/redeem"))!;
  assert.deepEqual(Object.keys(redeem.body).sort(), ["idempotencyKey", "sharedKeys"], "only keys, never values");
  assert.deepEqual(redeem.body.sharedKeys, ["organization", "offering", "phone"]);
  assert.match(redeem.body.idempotencyKey, /^invite-redeem-/);
  assert.equal(await state(page), "done");
});

test("完了 (b11 #10): two avatars, what they got from me, あとから変える note, アプリで続ける = orbit://i/<code>", async (t) => {
  const page = await landing(t, { signedIn: true, handlers: [PROFILE_GET, { method: "POST", url: "/redeem$", replies: [ok(REDEEMED)] }] });
  await page.locator("[data-invite-connect]").click();
  const done = page.locator("[data-invite-done]");
  await done.waitFor();
  assert.equal(await done.getByRole("heading", { name: "佐藤さんとつながりました" }).count(), 1);
  assert.equal(await done.locator('[role="img"]').count() >= 2, true);
  assert.equal(await page.locator("header").getByText("つながりました", { exact: true }).count(), 1, "an existing account did not sign up here");
  assert.deepEqual(await page.locator("[data-invite-to-peer] span").allTextContents(), ["名前", "会社・役職", "提供できること", "求めていること"]);
  assert.equal(await page.getByText("佐藤さんに届いたあなたの情報").count(), 1);
  assert.equal(await page.getByText("あとから変えると、佐藤さん側も自動で更新されます（本人入力）").count(), 1);
  assert.equal(await page.locator("[data-invite-app]").getAttribute("href"), "orbit://i/H8MW-4QZT");
});

test("R15 复核 S1: the confirm step no longer guesses 「already in your network」 in the browser — one neutral line, and my network is not read", async (t) => {
  const page = await landing(t, { signedIn: true, handlers: [PROFILE_GET, { method: "POST", url: "^/api/contacts/manual/duplicates$", replies: [ok({ candidates: [{ contactId: "c-1", displayName: "佐藤 健一", organization: "株式会社ミナトリンク", role: "", email: "", phone: "", address: "", identical: false, matchedOn: ["name_organization"] }] })] }] });
  const confirm = page.locator("[data-invite-confirm]");
  await confirm.waitFor();
  await page.waitForTimeout(150);
  assert.equal(await page.locator("[data-invite-check-later] p").textContent(), "つながったあと、同じ人かどうか確認できます。");
  assert.doesNotMatch((await page.locator("body").textContent())!, /すでにあなたの人脈|統合されます/u);
  assert.deepEqual((await fetches(page)).map((call) => call.url), ["/api/profile"], "only my profile is read");
});

test("m7: 「アプリなしで登録できます」 only on the signed-out open page — not on confirm or done", async (t) => {
  const head = (page: Page) => page.locator("header").textContent();
  const out = await landing(t, {});
  await out.locator("[data-invite-open]").waitFor();
  assert.match((await head(out))!, /アプリなしで登録できます/u);
  const signedIn = await landing(t, { signedIn: true, handlers: [PROFILE_GET, { method: "POST", url: "/redeem$", replies: [ok(REDEEMED)] }] });
  await signedIn.locator("[data-invite-confirm]").waitFor();
  assert.doesNotMatch((await head(signedIn))!, /アプリなしで登録できます/u);
  await signedIn.locator("[data-invite-connect]").click();
  await signedIn.locator("[data-invite-done]").waitFor();
  assert.doesNotMatch((await head(signedIn))!, /アプリなしで登録できます/u);
});

test("今はしない leaves without writing anything", async (t) => {
  const page = await landing(t, { signedIn: true, handlers: [PROFILE_GET] });
  await page.locator("[data-invite-not-now]").click();
  assert.deepEqual(await page.evaluate(() => (window as any).landingFixture.navigations), ["/app/home"]);
  assert.deepEqual((await fetches(page)).filter((call) => call.method !== "GET"), []);
});

test("redeem answers: PROFILE_REQUIRED → short profile; INVITE_FULL → 上限 page; 429 → unavailable with しばらくしてから; other failures stay with an error", async (t) => {
  const profile = await landing(t, { signedIn: true, handlers: [PROFILE_GET, { method: "POST", url: "/redeem$", replies: [fail(409, "CONFLICT", "PROFILE_REQUIRED")] }] });
  await profile.locator("[data-invite-connect]").click();
  await profile.locator("[data-invite-profile]").waitFor();
  const full = await landing(t, { signedIn: true, handlers: [PROFILE_GET, { method: "POST", url: "/redeem$", replies: [fail(409, "CONFLICT", "INVITE_FULL")] }] });
  await full.locator("[data-invite-connect]").click();
  await full.locator('[data-invite-notice="full"]').waitFor();
  const limited = await landing(t, { signedIn: true, handlers: [PROFILE_GET, { method: "POST", url: "/redeem$", replies: [fail(429, "NOT_FOUND", "INVITE_UNAVAILABLE")] }] });
  await limited.locator("[data-invite-connect]").click();
  await limited.locator('[data-invite-notice="limited"]').waitFor();
  const broken = await landing(t, { signedIn: true, handlers: [PROFILE_GET, { method: "POST", url: "/redeem$", replies: [fail(500, "INTERNAL_ERROR")] }] });
  await broken.locator("[data-invite-connect]").click();
  await broken.getByText("つながれませんでした。もう一度お試しください。").waitFor();
  assert.equal(await state(broken), "confirm");
});

test("期限切れ: the inviter's name and date, and a resend request draft (copy / LINE) — Orbit never sends", async (t) => {
  const page = await landing(t, { initial: { kind: "preview", preview: { ...PREVIEW, status: "expired" } } });
  const notice = page.locator('[data-invite-notice="expired"]');
  await notice.waitFor();
  assert.equal(await notice.getByRole("heading").textContent(), "この招待コードは期限切れです");
  assert.equal(await notice.getByText("佐藤 健一さんのコード（10/14 まで）· 有効期限は 7日間です").count(), 1);
  assert.equal(await page.getByText("佐藤さんに新しいコードを頼む").count(), 1);
  assert.match((await page.locator("[data-invite-sender-note]").textContent())!, /再発行は 1タップ/u);
  const draft = "佐藤さん、Orbit の招待リンクの期限が切れていました。お手数ですが、もう一度送っていただけますか？";
  assert.equal(await page.locator("[data-invite-ask-text]").textContent(), draft);
  assert.equal(await page.locator("[data-invite-ask-line]").getAttribute("href"), `https://line.me/R/share?text=${encodeURIComponent(draft)}`);
  await page.locator("[data-invite-ask-copy]").click();
  await page.getByText("下書きをコピーしました").waitFor();
  assert.deepEqual(await page.evaluate(() => (window as any).landingFixture.copied), [draft]);
  assert.equal(await page.getByText("Orbit からは送信しません").count(), 1);
  assert.deepEqual((await page.locator("button, a").allTextContents()).filter((text) => /送信|^送る$/u.test(text)), []);
});

test("満員: its own title, the same resend draft", async (t) => {
  const page = await landing(t, { signedIn: true, initial: { kind: "preview", preview: { ...PREVIEW, status: "full" } } });
  await page.locator('[data-invite-notice="full"]').waitFor();
  assert.equal(await page.getByRole("heading").textContent(), "この招待コードは人数の上限に達しました");
  assert.equal(await page.getByText("佐藤 健一さんのコード · 1つのコードは 10人まで使えます").count(), 1);
  assert.equal(await page.locator("[data-invite-ask-text]").count(), 1);
});

test("unavailable (unknown / turned off / malformed) and rate-limited are the same page; limited adds しばらくしてから", async (t) => {
  const page = await landing(t, { initial: { kind: "unavailable", limited: false } });
  await page.locator('[data-invite-notice="unavailable"]').waitFor();
  assert.equal(await page.getByRole("heading").textContent(), "このコードは使えません");
  assert.equal(await page.locator("[data-invite-limited]").count(), 0);
  assert.equal(await page.locator("[data-invite-enter-another]").getAttribute("href"), "/i");
  const limited = await landing(t, { initial: { kind: "unavailable", limited: true } });
  await limited.locator('[data-invite-notice="limited"]').waitFor();
  assert.equal(await limited.getByRole("heading").textContent(), "このコードは使えません");
  assert.equal(await limited.locator("[data-invite-limited]").textContent(), "しばらくしてから、もう一度お試しください。");
});

test("already connected: すでにつながっています + 人脈で見る; own code: 自分のコードです + 共有画面へ", async (t) => {
  const already = await landing(t, { signedIn: true, initial: { kind: "preview", preview: { ...PREVIEW, inviterAlreadyConnected: true, isOwnCode: false } } });
  await already.locator('[data-invite-notice="already"]').waitFor();
  assert.equal(await already.getByRole("heading").textContent(), "すでにつながっています");
  assert.equal(await already.locator("[data-invite-view-network]").getAttribute("href"), "/app/contacts");
  assert.deepEqual(await fetches(already), [], "nothing is read or written");
  const own = await landing(t, { signedIn: true, initial: { kind: "preview", preview: { ...PREVIEW, isOwnCode: true, inviterAlreadyConnected: false } } });
  await own.locator('[data-invite-notice="own"]').waitFor();
  assert.equal(await own.getByRole("heading").textContent(), "自分のコードです");
  assert.equal(await own.locator("[data-invite-to-share]").getAttribute("href"), "/app/contacts/new?add=invite");
});

test("/i: typing upper-cases and adds the hyphen; characters outside the code alphabet are flagged at once; a short code only on 開く", async (t) => {
  const page = await landing(t, { view: "entry" });
  const field = page.locator("[data-invite-entry-field]");
  await field.waitFor();
  assert.equal(await page.getByRole("heading").textContent(), "招待コードを入力");
  await field.pressSequentially("h8mw4q");
  assert.equal(await field.inputValue(), "H8MW-4Q");
  assert.equal(await page.getByRole("alert").count(), 0, "no complaint while typing a valid prefix");
  await page.locator("[data-invite-entry-open]").click();
  await page.getByText("コードは 8文字です").waitFor();
  assert.deepEqual(await page.evaluate(() => (window as any).landingFixture.navigations), []);
  await field.fill("");
  await field.pressSequentially("H8M0");
  await page.getByText("使えない文字が含まれています").waitFor();
  await field.fill("");
  await field.pressSequentially("h8mw 4qzt");
  assert.equal(await field.inputValue(), "H8MW-4QZT");
  await page.locator("[data-invite-entry-open]").click();
  assert.deepEqual(await page.evaluate(() => (window as any).landingFixture.navigations), ["/i/H8MW-4QZT"]);
});

test("m3: /i?expired=legacy (an old /app/invitations link) says the link no longer works and asks for a code; plain /i does not", async (t) => {
  const legacy = await landing(t, { view: "entry", legacy: true });
  await legacy.locator("[data-invite-entry-field]").waitFor();
  assert.equal(await legacy.locator("[data-invite-legacy]").textContent(), "このリンクは使えなくなりました。招待コードを入力してください。");
  const plain = await landing(t, { view: "entry" });
  await plain.locator("[data-invite-entry-field]").waitFor();
  assert.equal(await plain.locator("[data-invite-legacy]").count(), 0);
  const zh = await landing(t, { view: "entry", legacy: true, lang: "zh" });
  await zh.locator("[data-invite-legacy]").waitFor();
  assert.equal(await zh.locator("[data-invite-legacy]").textContent(), "这个链接已经不能用了。请输入邀请码。");
});

test("responsive: 390 fills the width (18 gutters); 1024 centres a 560 column; dark mode uses the dark tokens", async (t) => {
  const phone = await landing(t, {}, { width: 390 });
  await phone.locator("[data-invite-open]").waitFor();
  const narrow = await phone.locator("[data-invite-landing]").evaluate((node) => { const r = node.getBoundingClientRect(); return { left: r.left, width: r.width }; });
  assert.deepEqual(narrow, { left: 0, width: 390 });
  const wide = await landing(t, {}, { width: 1024 });
  await wide.locator("[data-invite-open]").waitFor();
  const column = await wide.locator("[data-invite-landing]").evaluate((node) => { const r = node.getBoundingClientRect(); return { left: r.left, width: r.width }; });
  assert.deepEqual(column, { left: 232, width: 560 });
  const dark = await landing(t, {}, { dark: true });
  await dark.locator("[data-invite-open]").waitFor();
  const bg = await dark.locator("main[data-orbit-2026]").evaluate((node) => getComputedStyle(node).backgroundColor);
  const light = await phone.locator("main[data-orbit-2026]").evaluate((node) => getComputedStyle(node).backgroundColor);
  assert.notEqual(bg, light);
});

test("language: Chinese and English pages read in their language", async (t) => {
  const zh = await landing(t, { lang: "zh" });
  await zh.locator("[data-invite-signup]").waitFor();
  assert.equal(await zh.locator("[data-invite-signup]").textContent(), "免费注册并建立联系");
  assert.equal(await zh.locator("[data-invite-code-line]").textContent(), "H8MW-4QZT · 10月14日前有效");
  const en = await landing(t, { lang: "en" });
  await en.locator("[data-invite-signup]").waitFor();
  assert.equal(await en.locator("[data-invite-signup]").textContent(), "Sign up free and connect");
});
