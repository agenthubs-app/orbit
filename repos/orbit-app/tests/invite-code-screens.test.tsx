import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";

import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

import { nativeUiStubs } from "./helpers/native-ui-stubs";

// R15 招待コード (DESIGN add-and-invite §2.4–§2.6, §9 #32; b11 A2 ①②③⑤⑦⑧, b9 A5, b5 E6): the App sender page
// `contacts/new/invite`, the receiver pages `i/<code>` / `i`, and the two sheets R11 mounts on an invite
// contact (共有する項目 / つながりを解除), rendered for real with react-native-web in Chromium. The clipboard,
// Linking and the device store are window-driven fakes; every request goes to the in-memory server below,
// which answers like the live routes (envelopes, 404 INVITE_UNAVAILABLE, 409 reasons, 429 rate limit).
const root = new URL("..", import.meta.url).pathname;
let browser: Browser;
let script: string;

test.before(async () => {
  const result = await build({
    stdin: { contents: `
import React from "react";
import { createRoot } from "react-dom/client";
import { AddContactScreen } from "./src/screens/add/AddContactScreen";
import { InviteSenderScreen } from "./src/screens/add/invite/InviteSenderScreen";
import { InviteLandingScreen } from "./src/screens/add/invite/InviteLandingScreen";
import { InviteCodeEntryScreen } from "./src/screens/add/invite/InviteCodeEntryScreen";
import { InviteShareSheet, InviteUnlinkSheet } from "./src/screens/add/invite/InviteConnectionSheets";
import { ToastProvider, UiPortalHost } from "./src/components/ui";
const fixedNow = () => Date.parse("2026-10-11T00:00:00Z");
function Screen({ path }) {
  const [pathname] = path.split("?");
  const landing = pathname.match(/^\\/i\\/([^/]+)$/);
  if (landing) return <InviteLandingScreen key={path} code={decodeURIComponent(landing[1])} />;
  if (pathname === "/i") return <InviteCodeEntryScreen key={path} />;
  if (pathname === "/contacts/new/invite") return <InviteSenderScreen key={path} now={fixedNow} />;
  if (pathname === "/contacts/new") return <AddContactScreen key={path} />;
  if (pathname === "/share-sheet") return <InviteShareSheet visible={window.sheetOpen !== false} contactId="contact-peer" name="松井 遥" onClose={() => { window.addNav.navigation.push({ method: "closeSheet" }); window.sheetOpen = false; window.addNav.render?.(); }} onMerged={(view) => window.addNav.navigation.push({ method: "merged", contactId: view.contactId })} />;
  if (pathname === "/unlink-sheet") return <InviteUnlinkSheet visible={window.sheetOpen !== false} contactId="contact-peer" name="松井 遥" onClose={() => { window.addNav.navigation.push({ method: "closeSheet" }); window.sheetOpen = false; window.addNav.render?.(); }} onUnlinked={(result) => window.addNav.navigation.push({ method: "unlinked", result })} />;
  return <div data-testid="elsewhere">{path}</div>;
}
function Root() {
  const [, force] = React.useState(0);
  window.addNav.render = () => force((n) => n + 1);
  const stack = window.addNav.stack;
  return <ToastProvider><UiPortalHost>{stack.map((path, index) => (
    <div key={index + ":" + path} data-testid={index === stack.length - 1 ? "top" : "below"} style={{ display: index === stack.length - 1 ? "flex" : "none", flexDirection: "column", height: "100%" }}><Screen path={path} /></div>
  ))}</UiPortalHost></ToastProvider>;
}
window.fetch = async (input, init) => {
  const parsed = new URL(String(input));
  const raw = init?.body;
  const body = typeof raw === "string" ? JSON.parse(raw) : null;
  const reply = await window.inviteServer(JSON.stringify({ method: init?.method ?? "GET", path: parsed.pathname + parsed.search, body }));
  return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { "Content-Type": "application/json" } });
};
createRoot(document.getElementById("root")).render(<Root />);
`, loader: "tsx", resolveDir: root },
    bundle: true, write: false, format: "iife", jsx: "automatic",
    define: { __ORBIT_LEGACY_TEST_LANGUAGE__: '"ja"', "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"],
    plugins: [nativeUiStubs, { name: "invite-screens", setup(plugin) {
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "invite-native" }));
      plugin.onResolve({ filter: /^react-native-web$/ }, () => ({ path: require.resolve("react-native-web") }));
      plugin.onLoad({ filter: /.*/, namespace: "invite-native" }, () => ({ contents: `
import * as RNW from "react-native-web";
export * from "react-native-web";
export const findNodeHandle = (instance) => instance ?? null;
export const AccessibilityInfo = { ...RNW.AccessibilityInfo, isReduceMotionEnabled: async () => false, addEventListener: () => ({ remove() {} }), setAccessibilityFocus: (node) => { (window.focused ??= []).push(node?.getAttribute?.("data-testid") ?? String(node)); } };
export const Linking = { ...RNW.Linking, openSettings: async () => {}, openURL: async (url) => { if (window.openFails) throw new Error("no app"); (window.opened ??= []).push(url); } };
export const AppState = { currentState: "active", addEventListener: () => ({ remove() {} }) };
// Android hardware back: listeners run newest first until one returns true (as React Native does).
export const BackHandler = {
  addEventListener: (_name, fn) => { const list = (window.backListeners ??= []); list.push(fn); return { remove() { const at = list.indexOf(fn); if (at >= 0) list.splice(at, 1); } }; },
  exitApp() {},
};
window.hardwareBack = () => { for (const fn of [...(window.backListeners ?? [])].reverse()) if (fn()) return true; return false; };
`, loader: "js", resolveDir: root }));
      plugin.onResolve({ filter: /^react-native-svg$/ }, () => ({ path: join(root, "tests/helpers/stubs/react-native-svg.js") }));
      plugin.onResolve({ filter: /^react-native-safe-area-context$/ }, () => ({ path: join(root, "tests/helpers/stubs/react-native-safe-area-context.js") }));
      plugin.onResolve({ filter: /^(expo-router|expo-clipboard|@react-native-async-storage\/async-storage)$/ }, (args) => ({ path: args.path, namespace: "invite-stub" }));
      plugin.onResolve({ filter: /(AuthSessionProvider|ApiBaseUrlProvider)$/ }, (args) => ({ path: args.path, namespace: "invite-stub" }));
      plugin.onLoad({ filter: /AuthSessionProvider$/, namespace: "invite-stub" }, () => ({ contents: `export const useOrbitAuthSession = () => (window.signedIn ? { ready: true, signedIn: true, actorId: "actor-r15", cookieHeader: "c", user: { id: "actor-r15", name: window.accountName ?? "", email: "me@example.com" } } : { ready: true, signedIn: false, actorId: null, cookieHeader: "", user: null });`, loader: "js" }));
      plugin.onLoad({ filter: /ApiBaseUrlProvider$/, namespace: "invite-stub" }, () => ({ contents: `export const useOrbitApiBaseUrl = () => ({ ready: true, baseUrl: "http://local.test" });`, loader: "js" }));
      plugin.onLoad({ filter: /^@react-native-async-storage\/async-storage$/, namespace: "invite-stub" }, () => ({ contents: `
const store = () => (window.deviceStore ??= {});
export default { getItem: async (key) => store()[key] ?? null, setItem: async (key, value) => { store()[key] = value; } };`, loader: "js" }));
      plugin.onLoad({ filter: /^expo-clipboard$/, namespace: "invite-stub" }, () => ({ contents: `
export const setStringAsync = async (text) => { if (window.clipboardFails) throw new Error("denied"); window.clipboard = text; return true; };`, loader: "js" }));
      plugin.onLoad({ filter: /^expo-router$/, namespace: "invite-stub" }, () => ({ contents: `
import { useEffect, useRef } from "react";
const nav = () => window.addNav;
const top = () => nav().stack[nav().stack.length - 1];
// A pushed page blurs the pages below it (they stay mounted, as in a native stack).
const blurBelow = () => { for (const onBlur of [...(nav().blurListeners ?? [])]) onBlur(); };
const router = {
  push: (href) => { nav().navigation.push({ method: "push", href }); blurBelow(); nav().stack.push(href); nav().render?.(); },
  replace: (href) => { nav().navigation.push({ method: "replace", href }); nav().stack[nav().stack.length - 1] = href; nav().render?.(); },
  back: () => { nav().navigation.push({ method: "back" }); if (nav().stack.length > 1) nav().stack.pop(); nav().render?.(); },
  canGoBack: () => nav().stack.length > 1,
  dismissTo: () => {}, dismissAll: () => {}, setParams() {},
};
export const useRouter = () => router;
export const usePathname = () => top().split("?")[0];
export const useLocalSearchParams = () => Object.fromEntries(new URLSearchParams(top().split("?")[1] ?? ""));
export const useGlobalSearchParams = useLocalSearchParams;
export const useFocusEffect = (effect) => {
  const latest = useRef(effect);
  latest.current = effect;
  useEffect(() => {
    let cleanup = latest.current();
    const listeners = (nav().blurListeners ??= new Set());
    const onBlur = () => { if (typeof cleanup === "function") cleanup(); cleanup = undefined; };
    listeners.add(onBlur);
    return () => { listeners.delete(onBlur); onBlur(); };
  }, []);
};
export const useIsFocused = () => true;
export const Redirect = () => null;
export const Stack = { Screen: () => null };
window.inviteRouter = router;`, loader: "js", resolveDir: root }));
    } }],
  });
  script = result.outputFiles[0]!.text;
  browser = await chromium.launch({ headless: true });
});

test.after(async () => { await browser?.close(); });

// ── the in-memory server ──

type Body = Record<string, unknown> | null;
interface Call { method: string; path: string; body: Body }
type Reply = { status: number; body: unknown };
const ok = (data: unknown, status = 200): Reply => ({ body: { data, success: true }, status });
const fail = (status: number, code: string, reason?: string): Reply => ({ body: { error: { code, message: code, ...(reason ? { context: { reason } } : {}) }, success: false }, status });

const LINK = (code: string) => `https://orbitailink.com/i/${code}`;
const MY_PROFILE = { displayName: "佐藤 健一", handles: { email: "sato@example.jp" }, offering: ["製造業 SaaS の導入知見"], organization: "株式会社ミナトリンク", role: "代表取締役", seeking: ["投資家の紹介"], updatedAt: "2026-10-01T00:00:00Z" };
const INVITER = { displayName: "佐藤 健一", offering: ["製造業 SaaS の導入知見"], organization: "株式会社ミナトリンク", role: "代表取締役CEO", seeking: ["投資家の紹介"] };

function code(value: string, overrides: Record<string, unknown> = {}) {
  return { code: value, createdAt: "2026-10-11T09:00:00+09:00", expiresAt: "2026-10-18T09:00:00+09:00", link: LINK(value), maxUses: 10, shared: { displayName: "佐藤 健一", offering: ["製造業 SaaS の導入知見"], organization: "株式会社ミナトリンク", role: "代表取締役" }, usedCount: 1, ...overrides };
}

class FakeInviteServer {
  calls: Call[] = [];
  current: ReturnType<typeof code> | null = code("K7QX-2M9P");
  profile: Record<string, unknown> | null = MY_PROFILE;
  createReason: string | null = null;
  history: unknown[] = [];
  preview: Reply = ok({ code: "K7QX-2M9P", expiresAt: "2026-10-14T09:00:00+09:00", shared: INVITER });
  redeem: Reply = ok({ contactId: "contact-sato", outcome: "connected", peer: INVITER });
  duplicates: unknown[] = [];
  connection: Reply = ok({ connectedAt: "2026-10-08T10:00:00+09:00", contactId: "contact-peer", pausedFields: ["seeking"], sharedByMe: ["organization", "offering"], sharedByPeer: ["organization"], via: { code: "K7QX-2M9P" } });
  mergeFails = false;
  seq = 0;

  /** POST …/merge (统合进已有那条：contactId 变成已有那条) and …/merge/dismiss (只去掉建议). */
  mergeOrDismiss(contactId: string, dismiss: boolean): Reply {
    if (this.mergeFails) return fail(500, "INTERNAL");
    type Joined = { contactId: string; mergeSuggestion?: { contactId: string } };
    const settle = <T extends Joined>(person: T): T => {
      if (person.contactId !== contactId) return person;
      const { mergeSuggestion, ...rest } = person;
      return { ...rest, contactId: dismiss ? person.contactId : (mergeSuggestion?.contactId ?? person.contactId) } as T;
    };
    this.history = (this.history as { joined: Joined[] }[]).map((item) => ({ ...item, joined: item.joined.map(settle) }));
    const view = (this.connection.body as { data: Joined }).data;
    const next = view.contactId === contactId ? settle(view) : view;
    this.connection = ok(next);
    return ok(next);
  }

  handle(call: Call): Reply {
    this.calls.push(call);
    const { method, path, body } = call;
    if (method === "GET" && path === "/api/invite-codes/current") return ok(this.current);
    if (method === "GET" && path === "/api/invite-codes") return ok({ items: this.history });
    if (method === "GET" && path === "/api/profile") return ok({ profile: this.profile });
    if (method === "PUT" && path === "/api/profile") {
      this.profile = { ...(this.profile ?? {}), ...(body ?? {}), updatedAt: "2026-10-11T01:00:00Z" };
      return ok({ profile: this.profile });
    }
    if (method === "POST" && path === "/api/invite-codes") {
      if (this.createReason === "PROFILE_REQUIRED") return fail(409, "CONFLICT", "PROFILE_REQUIRED");
      if (this.createReason === "SAMPLE_READ_ONLY") return fail(403, "FORBIDDEN", "SAMPLE_READ_ONLY");
      this.seq += 1;
      this.current = code(`N3WC-QDE${this.seq}`, { usedCount: 0 });
      return ok(this.current, 201);
    }
    const revoke = /^\/api\/invite-codes\/([^/]+)\/revoke$/u.exec(path);
    if (method === "POST" && revoke) {
      const revoked = { ...this.current!, revokedAt: "2026-10-11T10:00:00+09:00" };
      this.current = null;
      return ok(revoked);
    }
    if (method === "GET" && /^\/api\/invite-codes\/[^/]+\/preview$/u.test(path)) return this.preview;
    if (method === "POST" && /^\/api\/invite-codes\/[^/]+\/redeem$/u.test(path)) return this.redeem;
    if (method === "POST" && path === "/api/contacts/manual/duplicates") return ok({ candidates: this.duplicates });
    const merge = /^\/api\/invite-codes\/connections\/([^/]+)\/merge(\/dismiss)?$/u.exec(path);
    if (method === "POST" && merge) return this.mergeOrDismiss(decodeURIComponent(merge[1]!), Boolean(merge[2]));
    if (method === "GET" && path === "/api/invite-codes/connections/contact-peer") return this.connection;
    if (method === "PUT" && /^\/api\/invite-codes\/connections\/[^/]+\/share$/u.test(path)) return ok({ ...(this.connection.body as { data: object }).data, sharedByMe: body?.sharedKeys });
    if (method === "POST" && path === "/api/invite-codes/connections/contact-peer/unlink") return ok({ keptContactId: body?.keepAsContact ? "contact-peer" : undefined, outcome: "unlinked" });
    return fail(404, "NOT_FOUND");
  }

  writes() {
    return this.calls.filter((call) => call.method !== "GET" && call.path !== "/api/contacts/manual/duplicates");
  }
}

interface OpenOptions { signedIn?: boolean; accountName?: string; deviceStore?: Record<string, string>; setup?: (server: FakeInviteServer) => void; openFails?: boolean }

async function open(t: { after: (fn: () => Promise<void>) => void }, path: string, options: OpenOptions = {}): Promise<{ page: Page; server: FakeInviteServer }> {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(5000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  t.after(async () => { await page.close(); assert.deepEqual(errors, []); });
  const server = new FakeInviteServer();
  options.setup?.(server);
  await page.exposeFunction("inviteServer", async (raw: string) => server.handle(JSON.parse(raw) as Call));
  await page.setContent(`<!doctype html><html><body style="margin:0"><div id="root" style="height:100vh;display:flex;flex-direction:column"></div><script>
window.addNav=${JSON.stringify({ navigation: [], stack: [path] })};
window.deviceStore=${JSON.stringify(options.deviceStore ?? {})};
window.signedIn=${options.signedIn ?? true};
window.accountName=${JSON.stringify(options.accountName ?? "")};
window.openFails=${Boolean(options.openFails)};
</script></body></html>`);
  await page.addScriptTag({ content: script });
  return { page, server };
}

type W = { addNav: { navigation: { method: string; href?: string; result?: unknown }[]; stack: string[] }; clipboard?: string; opened?: string[]; deviceStore: Record<string, string>; focused?: string[] };
const state = <K extends keyof W>(page: Page, key: K) => page.evaluate((name) => (window as unknown as W)[name], key) as Promise<W[K]>;
const SEEN = { "orbit:add:invite-guide:v1": "true" };

async function noSendButton(page: Page) {
  const labels = await page.getByRole("button").allInnerTexts();
  assert.equal(labels.some((label) => /送信|^送る$/u.test(label.trim())), false, `no send button (${labels.join(" | ")})`);
}

// ── 発出方 ──

test("入口: the 招待コード door is open now and leads to contacts/new/invite", async (t) => {
  const { page } = await open(t, "/contacts/new");
  await page.getByTestId("add-door-invite").waitFor();
  await page.getByText("相手が自分で入力 → お互いの人脈に自動で追加").waitFor();
  await page.getByTestId("add-door-invite").click();
  assert.deepEqual((await state(page, "addNav")).navigation.at(-1), { href: "/contacts/new/invite", method: "push" });
});

test("説明: shown the first time (3 steps, 3 questions); コードをつくる makes a code with the default keys and remembers; the second visit opens on 共有", async (t) => {
  const { page, server } = await open(t, "/contacts/new/invite", { setup: (s) => { s.current = null; } });
  await page.getByTestId("invite-intro").waitFor();
  for (const text of ["相手が自分で入力して、お互いの人脈に入ります", "3ステップ", "コードを見せる · 送る", "相手が登録・入力", "お互いの人脈に", "相手がもう Orbit を使っていたら？", "期限と回数は？", "Orbit から相手に送られますか？", "送りません。共有はあなたの端末から行います。"]) {
    await page.getByText(text, { exact: false }).first().waitFor();
  }
  assert.deepEqual(server.writes(), [], "opening writes nothing");
  await page.getByTestId("invite-start").getByRole("button").click();
  await page.getByTestId("invite-code-card").waitFor();
  const created = server.writes().find((call) => call.path === "/api/invite-codes")!;
  assert.deepEqual(created.body?.sharedKeys, ["organization", "offering", "seeking"], "連絡先 (e-mail / phone) off by default");
  assert.equal(created.body?.maxUses, 10);
  assert.equal(typeof created.body?.idempotencyKey, "string");
  assert.equal((await state(page, "deviceStore"))["orbit:add:invite-guide:v1"], "true");
  // Second visit: straight to 共有, even without a current code.
  const again = await open(t, "/contacts/new/invite", { deviceStore: SEEN, setup: (s) => { s.current = null; } });
  await again.page.getByTestId("invite-nocode").waitFor();
  assert.equal(await again.page.getByTestId("invite-intro").count(), 0);
});

test("共有: big QR (drawn), the 8-character code and link, 有効期限 · あと N日, 残り N / 10人 · 登録済み N人, 相手に届くあなたの情報 with 連絡先（オフ）", async (t) => {
  const { page } = await open(t, "/contacts/new/invite", { deviceStore: SEEN });
  await page.getByTestId("invite-code-card").waitFor();
  const qrPath = await page.getByTestId("invite-qr").locator("path").getAttribute("d");
  assert.ok(qrPath && qrPath.split("M").length > 100, "the QR modules are drawn");
  assert.equal(await page.getByTestId("invite-qr").getAttribute("aria-label"), "招待リンクの QR コード");
  assert.equal(await page.getByTestId("invite-code").innerText(), "K7QX-2M9P");
  assert.equal(await page.getByTestId("invite-link").innerText(), "orbitailink.com/i/K7QX-2M9P");
  await page.getByText("10/18 まで").waitFor();
  await page.getByText("あと7日").waitFor();
  await page.getByText("残り 9 / 10人").waitFor();
  await page.getByText("登録済み 1人").waitFor();
  await page.getByText("Orbit からは送信しません · 共有はあなたの端末から").waitFor();
  const chips = await page.getByTestId("invite-share-chips").innerText();
  for (const label of ["会社・役職", "提供できること", "連絡先（オフ）"]) assert.ok(chips.includes(label), label);
  // QR を表示: the full sheet with a larger code to scan face to face.
  await page.getByTestId("invite-show-qr").getByRole("button").click();
  await page.getByTestId("invite-qr-sheet").waitFor();
  assert.equal(await page.getByTestId("invite-qr-large").locator("svg").getAttribute("width"), "280");
  await noSendButton(page);
});

test("リンクをコピー: the link goes to the clipboard with 「コピーしました」; a refused clipboard says so", async (t) => {
  const { page } = await open(t, "/contacts/new/invite", { deviceStore: SEEN });
  await page.getByTestId("invite-copy-link").getByRole("button").click();
  await page.getByText("コピーしました", { exact: true }).waitFor();
  assert.equal(await state(page, "clipboard"), "https://orbitailink.com/i/K7QX-2M9P");
  await page.evaluate(() => { (window as unknown as { clipboardFails: boolean }).clipboardFails = true; });
  await page.getByTestId("invite-copy-link").getByRole("button").click();
  await page.getByText("コピーできませんでした").waitFor();
});

test("メッセージで送る: three fixed tones (ていねい / カジュアル / 英語), コピー / LINE で開く / メールで開く, 「Orbit は送信しません」, no send button", async (t) => {
  const { page, server } = await open(t, "/contacts/new/invite", { deviceStore: SEEN });
  await page.getByTestId("invite-message").getByRole("button").click();
  const sheet = page.getByTestId("invite-draft-sheet");
  await sheet.waitFor();
  await sheet.getByText("あなたのアプリから送ります · Orbit は送信しません").waitFor();
  await sheet.getByText("Orbit は送信しません", { exact: true }).waitFor();
  const polite = await page.getByTestId("invite-draft-text").innerText();
  assert.ok(polite.startsWith("先日はありがとうございました。"), polite);
  assert.ok(polite.includes("https://orbitailink.com/i/K7QX-2M9P（10/18 まで）"), polite);
  assert.ok(polite.trim().endsWith("佐藤 健一"), "signed with my name");
  await sheet.getByRole("tab", { name: "カジュアル" }).click();
  await page.waitForFunction(() => document.querySelector("[data-testid=invite-draft-text]")?.textContent?.startsWith("この前"));
  const casual = await page.getByTestId("invite-draft-text").innerText();
  assert.ok(casual.startsWith("この前はありがとうございました！"), casual);
  await sheet.getByRole("tab", { name: "英語" }).click();
  await page.waitForFunction(() => document.querySelector("[data-testid=invite-draft-text]")?.textContent?.startsWith("Thank"));
  const english = await page.getByTestId("invite-draft-text").innerText();
  assert.ok(english.startsWith("Thank you for the other day."), english);
  assert.ok(english.includes("(until Oct 18)"), english);
  await noSendButton(page);
  await page.getByTestId("invite-draft-line").getByRole("button").click();
  await page.getByTestId("invite-draft-mail").getByRole("button").click();
  await page.getByTestId("invite-draft-copy").getByRole("button").click();
  assert.equal(await state(page, "clipboard"), english);
  const opened = await state(page, "opened");
  assert.equal(opened![0], `https://line.me/R/share?text=${encodeURIComponent(english)}`);
  assert.ok(opened![1]!.startsWith("mailto:?subject="), opened![1]);
  assert.deepEqual(server.writes(), [], "a draft writes nothing");
  // No app for the link: a toast, nothing else.
  const failing = await open(t, "/contacts/new/invite", { deviceStore: SEEN, openFails: true });
  await failing.page.getByTestId("invite-message").getByRole("button").click();
  await failing.page.getByTestId("invite-draft-line").getByRole("button").click();
  await failing.page.getByText("アプリを開けませんでした").waitFor();
});

test("無効にする: an action sheet with the consequences, focus on キャンセル; キャンセル keeps the code, 無効にする turns it off", async (t) => {
  const { page, server } = await open(t, "/contacts/new/invite", { deviceStore: SEEN });
  await page.getByTestId("invite-revoke").getByRole("button").click();
  await page.getByText("このコードを無効にしますか？").waitFor();
  await page.getByText("コードとリンクはすぐに使えなくなります。").waitFor();
  await page.getByText("登録済みの人とのつながりはそのままです。").waitFor();
  await page.getByRole("button", { name: "キャンセル" }).click();
  assert.deepEqual(server.writes(), []);
  await page.getByTestId("invite-revoke").getByRole("button").click();
  await page.getByRole("button", { name: "無効にする" }).last().click();
  await page.getByText("コードを無効にしました").waitFor();
  await page.getByTestId("invite-nocode").waitFor();
  assert.deepEqual(server.writes().map((call) => `${call.method} ${call.path}`), ["POST /api/invite-codes/K7QX-2M9P/revoke"]);
});

test("これまでのコード: five states, joined people open their contact, 期限切れ / 置き換え rows offer 新しいコードを発行", async (t) => {
  const history = [
    { code: "K7QX-2M9P", createdAt: "2026-10-11T09:00:00+09:00", expiresAt: "2026-10-18T09:00:00+09:00", joined: [{ contactId: "contact-matsui", displayName: "松井 遥", joinedAt: "2026-10-11T10:00:00+09:00" }], maxUses: 10, status: "active", usedCount: 1 },
    { code: "P3XA-7RTV", createdAt: "2026-10-02T09:00:00+09:00", expiresAt: "2026-10-09T09:00:00+09:00", joined: [], maxUses: 10, status: "expired", usedCount: 0 },
    { code: "M8RT-4KQW", createdAt: "2026-09-25T09:00:00+09:00", expiresAt: "2026-10-02T09:00:00+09:00", joined: [], maxUses: 10, status: "revoked", usedCount: 0 },
    { code: "H2NZ-9CDE", createdAt: "2026-09-18T09:00:00+09:00", expiresAt: "2026-09-25T09:00:00+09:00", joined: [], maxUses: 10, status: "superseded", usedCount: 0 },
    { code: "W5BX-3FGH", createdAt: "2026-09-10T09:00:00+09:00", expiresAt: "2026-09-17T09:00:00+09:00", joined: [], maxUses: 10, status: "full", usedCount: 10 },
  ];
  const { page, server } = await open(t, "/contacts/new/invite", { deviceStore: SEEN, setup: (s) => { s.history = history; } });
  const list = page.getByTestId("invite-history");
  await list.getByText("P3XA-7RTV").waitFor();
  for (const [status, label] of [["active", "有効"], ["expired", "期限切れ"], ["revoked", "無効"], ["superseded", "置き換え"], ["full", "上限"]]) {
    await page.getByTestId(`invite-history-${status}`).getByText(label, { exact: true }).waitFor();
  }
  assert.equal(await page.getByTestId("invite-reissue").count(), 2, "expired and replaced rows");
  await page.getByTestId("invite-joined").click();
  assert.deepEqual((await state(page, "addNav")).navigation.at(-1), { href: "/contacts/contact-matsui", method: "push" });
  await page.evaluate(() => { const w = window as unknown as W & { addNav: { stack: string[]; render?: () => void } }; w.addNav.stack.pop(); w.addNav.render?.(); });
  await page.getByTestId("invite-history-expired").getByTestId("invite-reissue").getByRole("button").click();
  await page.waitForFunction(() => document.querySelector("[data-testid=invite-code]")?.textContent !== "K7QX-2M9P");
  const reissued = server.writes().find((call) => call.path === "/api/invite-codes")!;
  assert.deepEqual(reissued.body?.sharedKeys, ["organization", "offering"], "the same keys as the current code");
});

test("相手に届くあなたの情報 [変更]: switches show my profile values (連絡先 off); この内容で作り直す makes a new code with the keys only", async (t) => {
  const { page, server } = await open(t, "/contacts/new/invite", { deviceStore: SEEN });
  await page.getByTestId("invite-share-edit").getByRole("button").click();
  await page.getByText("変えると新しいコードになり、今のコードとリンクは使えなくなります。").waitFor();
  await page.getByTestId("invite-switch-organization").getByText("株式会社ミナトリンク · 代表取締役").waitFor();
  assert.equal(await page.getByTestId("invite-switch-phone").count(), 0, "no phone in the profile → no switch");
  await page.getByTestId("invite-switch-email").getByRole("switch").click();
  await page.getByTestId("invite-switch-offering").getByRole("switch").click();
  await page.getByTestId("invite-share-apply").getByRole("button").click();
  await page.getByTestId("invite-share-chips").waitFor();
  const body = server.writes().find((call) => call.path === "/api/invite-codes")!.body!;
  assert.deepEqual(body.sharedKeys, ["organization", "email"]);
  assert.deepEqual(body.shared, { displayName: "佐藤 健一" }, "values are never sent, only keys");
});

test("PROFILE_REQUIRED: no name in the profile → a notice with プロフィールへ (profile/edit); SAMPLE_READ_ONLY → its own line", async (t) => {
  const { page } = await open(t, "/contacts/new/invite", { setup: (s) => { s.current = null; s.profile = null; s.createReason = "PROFILE_REQUIRED"; } });
  await page.getByTestId("invite-start").getByRole("button").click();
  await page.getByTestId("invite-notice-profile").waitFor();
  await page.getByText("コードを作る前に、プロフィールに名前を入れてください。").waitFor();
  await page.getByRole("button", { name: "プロフィールへ" }).click();
  assert.deepEqual((await state(page, "addNav")).navigation.at(-1), { href: "/profile/edit", method: "push" });
  const sample = await open(t, "/contacts/new/invite", { deviceStore: SEEN, setup: (s) => { s.current = null; s.createReason = "SAMPLE_READ_ONLY"; } });
  await sample.page.getByTestId("invite-nocode").getByRole("button").click();
  await sample.page.getByText("サンプルデータではコードを作れません。").waitFor();
});

// ── 受け取る側 ──

test("i/<code> signed out: the inviter's card (no e-mail or phone), 登録 / ログイン come back to i/<code>", async (t) => {
  const { page, server } = await open(t, "/i/k7qx2m9p", { signedIn: false, setup: (s) => { s.preview = ok({ code: "K7QX-2M9P", expiresAt: "2026-10-14T09:00:00+09:00", shared: { ...INVITER, email: "leak@example.jp" } }); } });
  await page.getByTestId("invite-open").waitFor();
  for (const text of ["招待が届いています", "佐藤 健一 さん", "株式会社ミナトリンク · 代表取締役CEO", "製造業 SaaS の導入知見", "投資家の紹介", "K7QX-2M9P · 10/14 まで有効", "登録すると、お互いの人脈に追加されます。あなたが選んだ項目だけが相手に届きます。"]) await page.getByText(text, { exact: true }).waitFor();
  assert.equal(await page.getByText("leak@example.jp").count(), 0, "a preview never shows e-mail");
  assert.equal(server.calls[0]!.path, "/api/invite-codes/K7QX-2M9P/preview", "the code is tidied before asking");
  await page.getByTestId("invite-login").getByRole("button").click();
  assert.deepEqual((await state(page, "addNav")).navigation.at(-1), { href: "/account/login?next=%2Fi%2FK7QX-2M9P", method: "push" });
  await page.evaluate(() => { const w = window as unknown as { addNav: { stack: string[]; render?: () => void } }; w.addNav.stack.pop(); w.addNav.render?.(); });
  await page.getByTestId("invite-signup").getByRole("button").click();
  assert.deepEqual((await state(page, "addNav")).navigation.at(-1), { href: "/account/signup?next=%2Fi%2FK7QX-2M9P", method: "push" });
  assert.deepEqual(server.writes(), []);
});

test("i/<code> signed in without a name: short profile (名前 required, prefilled from the account), saved through /api/profile, then 共有する項目", async (t) => {
  const { page, server } = await open(t, "/i/K7QX-2M9P", { accountName: "", setup: (s) => { s.profile = null; } });
  await page.getByTestId("invite-profile").waitFor();
  await page.getByText("あなたのことを教えてください").waitFor();
  await page.getByTestId("invite-profile-next").getByRole("button").click();
  await page.getByText("名前を入れてください。").waitFor();
  assert.deepEqual(server.writes(), []);
  await page.getByTestId("invite-field-name").fill("高橋 美咲");
  await page.getByTestId("invite-field-company").fill("青葉ベンチャーズ");
  await page.getByTestId("invite-tags-offering").getByRole("checkbox", { name: "人の紹介" }).click();
  await page.getByTestId("invite-profile-next").getByRole("button").click();
  await page.getByTestId("invite-confirm").waitFor();
  const saved = server.writes().find((call) => call.method === "PUT")!;
  assert.equal(saved.path, "/api/profile");
  assert.equal(saved.body?.displayName, "高橋 美咲");
  assert.equal(saved.body?.organization, "青葉ベンチャーズ");
  assert.deepEqual(saved.body?.offering, ["人の紹介"]);
  assert.equal(saved.body?.expectedUpdatedAt, null);
});

test("i/<code> signed in: 共有する項目 defaults (名前 always; 会社・役職 / 提供 / 求めている on; メール off), a neutral 「同じ人か確認できます」 line (no client-side network check), つながる sends keys only → 完了", async (t) => {
  const { page, server } = await open(t, "/i/K7QX-2M9P", { setup: (s) => { s.duplicates = [{ contactId: "contact-sato-card", matchedOn: ["email"] }]; } });
  await page.getByTestId("invite-confirm").waitFor();
  await page.getByText("佐藤 健一さんとつながりますか？").waitFor();
  await page.getByText("新しいアカウントは作りません。お互いの人脈に追加されます。").waitFor();
  assert.equal(await page.getByTestId("invite-switch-displayName").getByRole("switch").isDisabled(), true, "名前 cannot be turned off");
  // R15 复核 S1: the page no longer guesses 「すでにあなたの人脈にいます」 (the server never merges on its own now).
  await page.getByTestId("invite-same-later").getByText("つながったあと、同じ人かどうか確認できます。").waitFor();
  assert.equal(await page.getByTestId("invite-known").count(), 0);
  assert.equal(server.calls.some((call) => call.path === "/api/contacts/manual/duplicates"), false, "no client-side duplicate lookup");
  await page.getByTestId("invite-switch-seeking").getByRole("switch").click();
  await page.getByTestId("invite-connect").getByRole("button").click();
  await page.getByTestId("invite-done-connected").waitFor();
  await page.getByText("佐藤 健一さんとつながりました").waitFor();
  await page.getByText("お互いの人脈に追加されました").waitFor();
  const toPeer = await page.getByTestId("invite-to-peer").innerText();
  assert.ok(toPeer.includes("会社・役職") && toPeer.includes("提供できること") && !toPeer.includes("求めていること"), toPeer);
  const redeem = server.writes().find((call) => call.path.endsWith("/redeem"))!;
  assert.deepEqual(Object.keys(redeem.body!).sort(), ["idempotencyKey", "sharedKeys"]);
  assert.deepEqual(redeem.body!.sharedKeys, ["organization", "offering"]);
  await page.getByTestId("invite-view-contact").getByRole("button").click();
  assert.deepEqual((await state(page, "addNav")).navigation.at(-1), { href: "/contacts/contact-sato", method: "replace" });
  // 今はしない leaves no trace.
  const later = await open(t, "/i/K7QX-2M9P");
  await later.page.getByTestId("invite-not-now").getByRole("button").click();
  assert.deepEqual((await state(later.page, "addNav")).navigation.at(-1), { href: "/home", method: "replace" });
  assert.deepEqual(later.server.writes(), []);
});

test("i/<code> exceptions: expired / full (resend draft, no send button), already connected, own code, unavailable, rate limited, malformed (no request)", async (t) => {
  const expired = await open(t, "/i/K7QX-2M9P", { setup: (s) => { s.preview = ok({ code: "K7QX-2M9P", expiresAt: "2026-10-04T09:00:00+09:00", shared: INVITER, status: "expired" }); } });
  await expired.page.getByTestId("invite-expired").waitFor();
  await expired.page.getByText("この招待コードは期限切れです").waitFor();
  await expired.page.getByText("佐藤 健一さんのコード（10/4 まで）· 有効期限は 7日間です").waitFor();
  await expired.page.getByText("佐藤 健一さんに新しいコードを頼む").waitFor();
  await expired.page.getByText("Orbit からは送信しません", { exact: true }).waitFor();
  const draft = await expired.page.getByTestId("invite-ask-text").innerText();
  assert.ok(draft.startsWith("佐藤 健一さん、Orbit の招待リンクの期限が切れていました。"), draft);
  await expired.page.getByTestId("invite-ask-copy").getByRole("button").click();
  assert.equal(await state(expired.page, "clipboard"), draft);
  await expired.page.getByTestId("invite-ask-line").getByRole("button").click();
  assert.ok((await state(expired.page, "opened"))![0]!.startsWith("https://line.me/R/share?text="));
  await noSendButton(expired.page);
  assert.deepEqual(expired.server.writes(), []);

  const full = await open(t, "/i/K7QX-2M9P", { setup: (s) => { s.preview = ok({ code: "K7QX-2M9P", expiresAt: "2026-10-14T09:00:00+09:00", shared: INVITER, status: "full" }); } });
  await full.page.getByText("この招待コードは人数の上限に達しました").waitFor();

  const already = await open(t, "/i/K7QX-2M9P", { setup: (s) => { s.preview = ok({ code: "K7QX-2M9P", expiresAt: "2026-10-14T09:00:00+09:00", inviterAlreadyConnected: true, shared: INVITER }); } });
  await already.page.getByText("すでにつながっています").waitFor();
  await already.page.getByRole("button", { name: "人脈で見る" }).click();
  assert.deepEqual((await state(already.page, "addNav")).navigation.at(-1), { href: "/contacts", method: "replace" });

  const own = await open(t, "/i/K7QX-2M9P", { setup: (s) => { s.preview = ok({ code: "K7QX-2M9P", expiresAt: "2026-10-14T09:00:00+09:00", isOwnCode: true, shared: INVITER }); } });
  await own.page.getByText("自分のコードです").waitFor();
  await own.page.getByRole("button", { name: "共有画面へ" }).click();
  assert.deepEqual((await state(own.page, "addNav")).navigation.at(-1), { href: "/contacts/new/invite", method: "replace" });

  const gone = await open(t, "/i/K7QX-2M9P", { setup: (s) => { s.preview = fail(404, "NOT_FOUND", "INVITE_UNAVAILABLE"); } });
  await gone.page.getByTestId("invite-unavailable").waitFor();
  await gone.page.getByText("このコードは使えません").waitFor();
  assert.equal(await gone.page.getByText("しばらくしてから、もう一度お試しください。").count(), 0);
  await gone.page.getByRole("button", { name: "別のコードを入力" }).click();
  assert.deepEqual((await state(gone.page, "addNav")).navigation.at(-1), { href: "/i", method: "replace" });

  const limited = await open(t, "/i/K7QX-2M9P", { setup: (s) => { s.preview = fail(429, "RATE_LIMITED", "INVITE_UNAVAILABLE"); } });
  await limited.page.getByTestId("invite-limited").waitFor();
  await limited.page.getByText("しばらくしてから、もう一度お試しください。").waitFor();

  const malformed = await open(t, "/i/K7QX-2M9O");
  await malformed.page.getByTestId("invite-unavailable").waitFor();
  assert.deepEqual(malformed.server.calls, [], "a malformed code is never sent");
});

test("i/<code> redeem answers: 409 INVITE_FULL → 上限, already_connected → すでにつながっています, merged → 完了, other failure → error line", async (t) => {
  const full = await open(t, "/i/K7QX-2M9P", { setup: (s) => { s.redeem = fail(409, "CONFLICT", "INVITE_FULL"); } });
  await full.page.getByTestId("invite-connect").getByRole("button").click();
  await full.page.getByTestId("invite-full").waitFor();
  const already = await open(t, "/i/K7QX-2M9P", { setup: (s) => { s.redeem = ok({ contactId: "contact-sato", outcome: "already_connected" }); } });
  await already.page.getByTestId("invite-connect").getByRole("button").click();
  await already.page.getByTestId("invite-already").waitFor();
  const merged = await open(t, "/i/K7QX-2M9P", { setup: (s) => { s.redeem = ok({ contactId: "contact-sato", outcome: "merged", peer: INVITER }); } });
  await merged.page.getByTestId("invite-connect").getByRole("button").click();
  await merged.page.getByTestId("invite-done-merged").waitFor();
  const broken = await open(t, "/i/K7QX-2M9P", { setup: (s) => { s.redeem = fail(500, "INTERNAL"); } });
  await broken.page.getByTestId("invite-connect").getByRole("button").click();
  await broken.page.getByTestId("invite-connect-failed").waitFor();
  await broken.page.getByText("つながれませんでした。もう一度お試しください。").waitFor();
  // A retry is the same request (one idempotency key per visit).
  await broken.page.getByTestId("invite-connect").getByRole("button").click();
  await broken.page.waitForFunction(() => true);
  await broken.page.getByTestId("invite-connect-failed").waitFor();
  const keys = broken.server.writes().filter((call) => call.path.endsWith("/redeem")).map((call) => call.body?.idempotencyKey);
  assert.equal(keys.length, 2);
  assert.equal(keys[0], keys[1]);
});

test("i (手入力): tidied as typed (upper case, hyphen), characters outside the alphabet are named, 開く opens i/<code>", async (t) => {
  const { page } = await open(t, "/i", { signedIn: false });
  const field = page.getByTestId("invite-entry-field");
  await field.waitFor();
  assert.equal(await page.getByRole("button", { name: "開く" }).isDisabled(), true);
  await field.fill("k7qx2m9");
  assert.equal(await field.inputValue(), "K7QX-2M9");
  await field.fill("k7qx2m9o");
  await page.getByText("使えない文字が含まれています").waitFor();
  assert.equal(await page.getByRole("button", { name: "開く" }).isDisabled(), true);
  await field.fill("k7qx 2m9p");
  assert.equal(await field.inputValue(), "K7QX-2M9P");
  assert.equal(await page.getByText("使えない文字が含まれています").count(), 0);
  await page.getByRole("button", { name: "開く" }).click();
  assert.deepEqual((await state(page, "addNav")).navigation.at(-1), { href: "/i/K7QX-2M9P", method: "push" });
});

// ── 共有する項目 / つながりを解除 (R11 mounts them) ──

test("InviteShareSheet: my current keys, my values, fields I rewrote are named as paused; 保存 sends the keys", async (t) => {
  const { page, server } = await open(t, "/share-sheet");
  const sheet = page.getByTestId("invite-share-sheet");
  await sheet.getByText("松井 遥さんに見せる情報").waitFor();
  await page.getByTestId("invite-switch-organization").waitFor();
  await page.getByTestId("invite-share-paused").getByText("求めていること はあなたが書き換えたので、同期を止めています。").waitFor();
  await page.getByTestId("invite-switch-seeking").getByRole("switch").click();
  await page.getByTestId("invite-share-save").getByRole("button").click();
  await page.getByText("共有する項目を変えました").waitFor();
  const put = server.writes().find((call) => call.method === "PUT")!;
  assert.equal(put.path, "/api/invite-codes/connections/contact-peer/share");
  assert.deepEqual(put.body?.sharedKeys, ["organization", "offering", "seeking"]);
  assert.deepEqual((await state(page, "addNav")).navigation.at(-1), { method: "closeSheet" });
  // Not an invite connection: said plainly, nothing to save.
  const other = await open(t, "/share-sheet", { setup: (s) => { s.connection = fail(404, "NOT_FOUND"); } });
  await other.page.getByTestId("invite-share-not-linked").waitFor();
  assert.equal(await other.page.getByTestId("invite-share-save").count(), 0);
});

test("InviteUnlinkSheet: consequences, 「名前と会社だけの連絡先として残す」 on by default, a backdrop tap does not close it, focus on キャンセル", async (t) => {
  const { page, server } = await open(t, "/unlink-sheet");
  const sheet = page.getByTestId("invite-unlink-sheet");
  await sheet.getByText("松井 遥さんとのつながりを解除しますか？").waitFor();
  for (const text of ["招待コードでつながった相手", "相手の人脈からも、あなたが外れます（通知はしません）。", "本人入力の情報は今後更新されません。", "あなたのメモとやりとりの記録は残せます。"]) await sheet.getByText(text, { exact: true }).waitFor();
  // react-native-web exposes no aria-checked: a checked box draws its check mark.
  assert.equal(await sheet.getByRole("checkbox", { name: "名前と会社だけの連絡先として残す" }).locator("svg").count(), 1);
  await page.waitForFunction(() => ((window as unknown as W).focused ?? []).includes("invite-unlink-cancel"));
  // The backdrop: tapping above the sheet changes nothing.
  await page.mouse.click(195, 40);
  await page.waitForTimeout(150);
  assert.equal(await sheet.count(), 1);
  assert.deepEqual((await state(page, "addNav")).navigation, []);
  await sheet.getByRole("button", { name: "キャンセル" }).click();
  assert.deepEqual((await state(page, "addNav")).navigation, [{ method: "closeSheet" }]);
  assert.deepEqual(server.writes(), []);
  // Unlink, keeping the contact (default) / deleting it (box cleared).
  const keep = await open(t, "/unlink-sheet");
  await keep.page.getByTestId("invite-unlink-confirm").getByRole("button").click();
  await keep.page.getByText("つながりを解除しました").waitFor();
  assert.deepEqual(keep.server.writes().map((call) => [call.path, call.body?.keepAsContact]), [["/api/invite-codes/connections/contact-peer/unlink", true]]);
  const drop = await open(t, "/unlink-sheet");
  await drop.page.getByRole("checkbox", { name: "名前と会社だけの連絡先として残す" }).click();
  await drop.page.getByTestId("invite-unlink-confirm").getByRole("button").click();
  await drop.page.getByText("つながりを解除しました").waitFor();
  assert.equal(drop.server.writes()[0]!.body?.keepAsContact, false);
  assert.equal((await state(drop.page, "addNav")).navigation.find((entry) => entry.method === "unlinked")?.result !== undefined, true);
});

// ── R15 复核修复 ──

const JOINED_AT = "2026-10-11T10:00:00+09:00";
function suggestedHistory() {
  return [{
    code: "K7QX-2M9P", createdAt: "2026-10-11T09:00:00+09:00", expiresAt: "2026-10-18T09:00:00+09:00", maxUses: 10, status: "active", usedCount: 3,
    joined: [
      { contactId: "contact-tanaka", displayName: "田中 太郎", joinedAt: JOINED_AT, mergeSuggestion: { contactId: "contact-tanaka-card", displayName: "田中 太郎（名刺）", matchedOn: ["name_organization"] } },
      { contactId: "contact-matsui", displayName: "松井 遥", joinedAt: JOINED_AT, mergeSuggestion: { contactId: "contact-haruka", displayName: "松井 はるか", matchedOn: ["email"] } },
      { contactId: "contact-ito", displayName: "伊藤 光", joinedAt: JOINED_AT },
    ],
  }];
}

test("S1 これまでのコード: 「同じ人かも」 under a joined person — 統合する merges (the name then opens the existing contact), 別の人 dismisses", async (t) => {
  const { page, server } = await open(t, "/contacts/new/invite", { deviceStore: SEEN, setup: (s) => { s.history = suggestedHistory(); } });
  const tanaka = page.getByTestId("invite-merge-contact-tanaka");
  await tanaka.getByText("同じ人かも：田中 太郎（名刺）").waitFor();
  await page.getByTestId("invite-merge-contact-matsui").getByText("同じ人かも：松井 はるか").waitFor();
  assert.equal(await page.getByTestId("invite-merge-contact-ito").count(), 0, "no suggestion → no line");
  await tanaka.getByRole("button", { name: "統合する" }).click();
  await page.getByText("統合しました").waitFor();
  await page.getByTestId("invite-merge-contact-tanaka").waitFor({ state: "detached" });
  assert.deepEqual(server.writes().map((call) => [call.method, call.path, Object.keys(call.body ?? {})]), [["POST", "/api/invite-codes/connections/contact-tanaka/merge", ["idempotencyKey"]]]);
  await page.getByTestId("invite-history").getByRole("link", { name: "田中 太郎" }).click();
  assert.deepEqual((await state(page, "addNav")).navigation.at(-1), { href: "/contacts/contact-tanaka-card", method: "push" }, "the link points at the merged contact");
  await page.evaluate(() => { const w = window as unknown as W & { addNav: { stack: string[]; render?: () => void } }; w.addNav.stack.pop(); w.addNav.render?.(); });
  await page.getByTestId("invite-merge-contact-matsui").getByRole("button", { name: "別の人" }).click();
  await page.getByTestId("invite-merge-contact-matsui").waitFor({ state: "detached" });
  assert.deepEqual(server.writes().at(-1)!.path, "/api/invite-codes/connections/contact-matsui/merge/dismiss");
  await page.getByTestId("invite-history").getByRole("link", { name: "松井 遥" }).click();
  assert.deepEqual((await state(page, "addNav")).navigation.at(-1), { href: "/contacts/contact-matsui", method: "push" }, "別の人 keeps the invite contact");
});

test("S1 これまでのコード: a failed 統合する says so, keeps the suggestion and lets you try again", async (t) => {
  const { page, server } = await open(t, "/contacts/new/invite", { deviceStore: SEEN, setup: (s) => { s.history = suggestedHistory(); s.mergeFails = true; } });
  const tanaka = page.getByTestId("invite-merge-contact-tanaka");
  await tanaka.getByRole("button", { name: "統合する" }).click();
  await page.getByText("保存できませんでした", { exact: true }).waitFor();
  assert.equal(await tanaka.getByRole("button", { name: "統合する" }).isDisabled(), false);
  server.mergeFails = false;
  await tanaka.getByRole("button", { name: "統合する" }).click();
  await page.getByTestId("invite-merge-contact-tanaka").waitFor({ state: "detached" });
  const keys = server.writes().map((call) => call.body?.idempotencyKey);
  assert.equal(keys.length, 2);
});

test("S1 InviteShareSheet: 「同じ人かも」 with 統合する / 別の人; after 統合する the sheet works on the merged contact", async (t) => {
  const base = { connectedAt: "2026-10-08T10:00:00+09:00", contactId: "contact-peer", pausedFields: [], sharedByMe: ["organization"], sharedByPeer: ["organization"], via: { code: "K7QX-2M9P" } };
  const withSuggestion = { ...base, mergeSuggestion: { contactId: "contact-peer-card", displayName: "松井 遥（名刺）", matchedOn: ["email"] } };
  const { page, server } = await open(t, "/share-sheet", { setup: (s) => { s.connection = ok(withSuggestion); } });
  const block = page.getByTestId("invite-merge-contact-peer");
  await block.getByText("同じ人かも：松井 遥（名刺）").waitFor();
  await block.getByRole("button", { name: "統合する" }).click();
  await page.getByTestId("invite-merge-contact-peer").waitFor({ state: "detached" });
  assert.deepEqual((await state(page, "addNav")).navigation.at(-1), { contactId: "contact-peer-card", method: "merged" });
  await page.getByTestId("invite-share-save").getByRole("button").click();
  await page.getByText("共有する項目を変えました").waitFor();
  assert.deepEqual(server.writes().map((call) => call.path), ["/api/invite-codes/connections/contact-peer/merge", "/api/invite-codes/connections/contact-peer-card/share"]);
  const other = await open(t, "/share-sheet", { setup: (s) => { s.connection = ok(withSuggestion); } });
  await other.page.getByTestId("invite-merge-contact-peer").getByRole("button", { name: "別の人" }).click();
  await other.page.getByTestId("invite-merge-contact-peer").waitFor({ state: "detached" });
  assert.deepEqual(other.server.writes().map((call) => call.path), ["/api/invite-codes/connections/contact-peer/merge/dismiss"]);
});

test("M3: leaving the sender page closes its sheets — the draft or the QR does not float over the next page", async (t) => {
  const { page } = await open(t, "/contacts/new/invite", { deviceStore: SEEN });
  await page.getByTestId("invite-message").getByRole("button").click();
  await page.getByTestId("invite-draft-sheet").waitFor();
  await page.evaluate(() => (window as unknown as { inviteRouter: { push: (href: string) => void } }).inviteRouter.push("/i/K7QX-2M9P"));
  await page.getByTestId("invite-confirm").waitFor();
  assert.equal(await page.getByTestId("invite-draft-sheet").count(), 0, "the draft sheet closed on blur");
  const qr = await open(t, "/contacts/new/invite", { deviceStore: SEEN });
  await qr.page.getByTestId("invite-show-qr").getByRole("button").click();
  await qr.page.getByTestId("invite-qr-sheet").waitFor();
  await qr.page.evaluate(() => (window as unknown as { inviteRouter: { push: (href: string) => void } }).inviteRouter.push("/contacts/contact-x"));
  await qr.page.getByTestId("elsewhere").waitFor();
  assert.equal(await qr.page.getByTestId("invite-qr-sheet").count(), 0, "the QR sheet closed on blur");
});

test("m4 InviteUnlinkSheet: Android back = キャンセル (closes, writes nothing); while 解除 runs back does nothing", async (t) => {
  const { page, server } = await open(t, "/unlink-sheet");
  await page.getByTestId("invite-unlink-sheet").waitFor();
  assert.equal(await page.evaluate(() => (window as unknown as { hardwareBack: () => boolean }).hardwareBack()), true, "back is handled");
  assert.deepEqual((await state(page, "addNav")).navigation, [{ method: "closeSheet" }]);
  await page.getByTestId("invite-unlink-sheet").waitFor({ state: "detached" });
  assert.deepEqual(server.writes(), []);
});

test("m3 i?from=legacy: an old invitation link lands on 招待コードを入力 with 「このリンクは使えなくなりました」", async (t) => {
  const { page } = await open(t, "/i?from=legacy", { signedIn: false });
  await page.getByTestId("invite-entry-legacy").getByText("このリンクは使えなくなりました。招待コードを入力してください。").waitFor();
  const plain = await open(t, "/i", { signedIn: false });
  await plain.page.getByTestId("invite-entry-field").waitFor();
  assert.equal(await plain.page.getByTestId("invite-entry-legacy").count(), 0);
});
