import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

import { emailVerificationFromPayload, emailVerificationScope, emailVerificationSnapshot, patchEmailVerification, publishEmailVerification, sendVerificationMail } from "../src/api/email-verification";
import { showsEmailNotice } from "../src/email-verification/email-notice-route";

const me = (emailVerification: unknown, id = "account-1") => ({ account: { id }, session: { status: "signed-in" }, ...(emailVerification === undefined ? {} : { emailVerification }) });

test("the status comes with account/me; without it, or malformed, it is not known", () => {
  assert.deepEqual(emailVerificationFromPayload(me({ email: "a@b.test", verified: false, sent: true })), { email: "a@b.test", verified: false, sent: true });
  for (const value of [undefined, null, { email: "a@b.test" }, { email: "", verified: false }, { verified: true }]) assert.equal(emailVerificationFromPayload(me(value)), null);
});

test("it belongs to one server and account, and an answer without it takes it back to not known", () => {
  publishEmailVerification("https://orbit.test/", me({ email: "a@b.test", verified: false }));
  assert.equal(emailVerificationSnapshot()?.scope, emailVerificationScope("https://orbit.test", "account-1"));
  patchEmailVerification(emailVerificationScope("https://orbit.test", "account-2"), { verified: true });
  assert.equal(emailVerificationSnapshot()?.verified, false, "another account's answer changes nothing here");
  publishEmailVerification("https://orbit.test", {});
  assert.equal(emailVerificationSnapshot()?.verified, false, "an answer that names no account is not this account's");
  publishEmailVerification("https://orbit.test", me(undefined));
  assert.equal(emailVerificationSnapshot(), null);
});

test("each refusal has its own outcome", async () => {
  const outcome = (result: unknown) => sendVerificationMail({ post: async () => result } as never, "ja");
  const refused = (context?: Record<string, string>) => ({ success: false, status: 429, error: { code: "RATE_LIMITED", message: "x", ...(context ? { context } : {}) } });
  assert.deepEqual(await outcome({ success: true, data: { email: "a@b.test", verified: false, sentAt: "2026-11-25T00:00:00Z" } }), { kind: "sent" });
  assert.deepEqual(await outcome({ success: true, data: { email: "a@b.test", verified: true } }), { kind: "verified" });
  assert.deepEqual(await outcome(refused({ reason: "EMAIL_SEND_TOO_SOON", retryAfterSeconds: "45" })), { kind: "wait", seconds: 45 });
  assert.deepEqual(await outcome(refused({ reason: "EMAIL_SEND_TOO_SOON" })), { kind: "wait", seconds: 60 });
  assert.deepEqual(await outcome(refused({ reason: "EMAIL_SEND_DAILY_LIMIT" })), { kind: "limit" });
  for (const context of [{ reason: "EMAIL_SEND_FAILED" }, { reason: "EMAIL_SEND_UNAVAILABLE" }, undefined]) assert.deepEqual(await outcome(refused(context)), { kind: "fail" });
});

test("sign-in pages, the admin console and the reception device carry no reminder", () => {
  for (const path of ["/", "/account/login", "/account/signup", "/account/pending", "/admin", "/admin/users", "/login-admin", "/events/e1/operations/check-in"]) assert.equal(showsEmailNotice(path), false, path);
  for (const path of ["/home", "/profile/onboarding", "/account", "/account/change-password", "/events/e1", "/events/e1/operations", "/administrator"]) assert.equal(showsEmailNotice(path), true, path);
});

// Real provider, line, row and button; the session, router, HTTP client and app state are the boundary.
const require = createRequire(import.meta.url);
let browser: Browser, script: string;
const fixture = `
import React, { useSyncExternalStore } from "react";
let revision = 0; const listeners = new Set();
const state = window.fixture = { path: "/home", actorId: "account-1", signedIn: true, deletionPending: false, posts: [], gets: 0, answers: [], appState: new Set(), ...window.initialFixture,
  update(patch) { Object.assign(state, patch); revision++; listeners.forEach(fn => fn()); } };
const useFixture = () => { useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => revision); return state; };
export const useOrbitAuthSession = () => { const s = useFixture(); return { ready: true, signedIn: s.signedIn, deletionPending: s.deletionPending, actorId: s.signedIn ? s.actorId : null }; };
export const useOrbitApiBaseUrl = () => ({ baseUrl: "https://orbit.test", ready: true });
export const usePathname = () => useFixture().path;
const client = { post: async (path, options) => { state.posts.push([path, options.body]); if (state.hold) await new Promise(resolve => state.release = resolve); return state.answers.shift(); }, get: async () => { state.gets++; return state.me; } };
export const useOrbitApiClient = () => client;
export const AppState = { addEventListener: (_type, fn) => { state.appState.add(fn); return { remove: () => state.appState.delete(fn) }; } };
`;
test.before(async () => {
  const result = await build({
    stdin: { contents: `import React from "react"; import { createRoot } from "react-dom/client"; import { EmailVerificationProvider } from "./src/email-verification/EmailVerificationProvider"; import { EmailNotice } from "./src/email-verification/EmailNotice"; import { EmailVerificationRow } from "./src/email-verification/EmailVerificationRow"; import { publishEmailVerification } from "./src/api/email-verification";
window.publish = publishEmailVerification; createRoot(document.getElementById("root")).render(<EmailVerificationProvider><EmailNotice /><EmailVerificationRow /></EmailVerificationProvider>);`, loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, format: "iife", jsx: "automatic", resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"],
    define: { __ORBIT_LEGACY_TEST_LANGUAGE__: '"zh"', "process.env.NODE_ENV": '"test"', __DEV__: "false" },
    plugins: [{ name: "email-boundaries", setup(plugin) {
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "email" }));
      plugin.onResolve({ filter: /^expo-router$|\/(AuthSessionProvider|ApiBaseUrlProvider|useOrbitApiClient)$/ }, () => ({ path: "fixture", namespace: "email" }));
      plugin.onLoad({ filter: /.*/, namespace: "email" }, args => ({ contents: args.path === "native" ? 'export * from "react-native-web"; export { AppState } from "expo-router";' : fixture, loader: "jsx", resolveDir: process.cwd() }));
    } }],
  });
  script = result.outputFiles[0]!.text;
  browser = await chromium.launch({ headless: true });
});
test.after(async () => { await browser?.close(); });

async function open(t: { after(fn: () => Promise<void>): void }, emailVerification: unknown, patch: Record<string, unknown> = {}): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 390, height: 600 } });
  page.setDefaultTimeout(1500);
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  t.after(async () => { await page.close(); assert.deepEqual(errors, []); });
  await page.clock.install();
  await page.setContent('<div id="root"></div>');
  await page.evaluate(value => { (window as any).initialFixture = value; }, patch);
  await page.addScriptTag({ content: script });
  await page.evaluate(value => (window as any).publish("https://orbit.test", value), me(emailVerification));
  return page;
}
const notice = (page: Page) => page.getByTestId("email-notice");
const row = (page: Page) => page.getByTestId("email-verification-row");
const foreground = (page: Page, payload: unknown) => page.evaluate(value => { const s = (window as any).fixture; s.me = { success: true, data: value }; s.appState.forEach((fn: (state: string) => void) => fn("active")); }, payload);

test("unverified: the line and the account row both say so and can send; one send answers on both, and comes back after a minute", async t => {
  const page = await open(t, { email: "a@b.test", verified: false, sent: false }, { answers: [{ success: true, data: { email: "a@b.test", verified: false } }] });
  assert.equal(await notice(page).textContent(), "邮箱还没有验证发送验证邮件");
  assert.equal(await row(page).textContent(), "邮箱验证未验证发送验证邮件");
  await notice(page).getByRole("button").click();
  await page.getByText("已发送到a@b.test").first().waitFor();
  assert.equal(await notice(page).textContent(), "已发送到a@b.test");
  assert.equal(await row(page).textContent(), "邮箱验证已发送到a@b.test未验证");
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.posts), [["/api/account/email-verification/send", { language: "zh" }]]);
  await page.clock.fastForward(60_000);
  await page.getByText("邮箱还没有验证").waitFor();
  assert.equal(await notice(page).textContent(), "邮箱还没有验证重新发送");
});

test("a second tap while one is on its way sends nothing more; refusals say which limit it was", async t => {
  const refused = (context: Record<string, string>) => ({ success: false, status: 429, error: { code: "RATE_LIMITED", message: "x", context } });
  const page = await open(t, { email: "a@b.test", verified: false, sent: true }, { hold: true, answers: [refused({ reason: "EMAIL_SEND_TOO_SOON", retryAfterSeconds: "45" }), refused({ reason: "EMAIL_SEND_DAILY_LIMIT" }), refused({ reason: "EMAIL_SEND_FAILED" })] });
  const button = notice(page).getByRole("button");
  await button.click();
  assert.equal(await button.isDisabled(), true);
  assert.equal(await row(page).getByRole("button").isDisabled(), true);
  await page.evaluate(() => { const s = (window as any).fixture; s.hold = false; s.release(); });
  await page.getByText("45秒后可以重新发送").first().waitFor();
  await page.clock.fastForward(45_000);
  await page.getByText("邮箱还没有验证").waitFor();
  await button.click();
  await page.getByText("今天不能再发了，请明天再试").first().waitFor();
  await button.click();
  await page.getByText("没有发出去，请稍后再试").first().waitFor();
  assert.equal(await page.evaluate(() => (window as any).fixture.posts.length), 3);
});

test("back in the foreground it looks once; verified, the line goes and it never looks again", async t => {
  const page = await open(t, { email: "a@b.test", verified: false });
  await foreground(page, me({ email: "a@b.test", verified: false }));
  assert.equal(await notice(page).count(), 1);
  await foreground(page, me({ email: "a@b.test", verified: true }));
  await row(page).getByText("已验证", { exact: true }).waitFor();
  assert.equal(await notice(page).count(), 0);
  assert.equal(await row(page).getByRole("button").count(), 0);
  await foreground(page, me({ email: "a@b.test", verified: true }));
  await page.clock.fastForward(600_000);
  assert.equal(await page.evaluate(() => (window as any).fixture.gets), 2, "no polling, nothing after it is verified");
});

test("a send that finds the address already verified takes the line away", async t => {
  const page = await open(t, { email: "a@b.test", verified: false, sent: true }, { answers: [{ success: true, data: { email: "a@b.test", verified: true } }] });
  await notice(page).getByRole("button").click();
  await row(page).getByText("已验证", { exact: true }).waitFor();
  assert.equal(await notice(page).count(), 0);
});

test("nothing is drawn when it is not known, signed out, another account's, or on a page without it", async t => {
  const unknown = await open(t, undefined);
  assert.equal(await notice(unknown).count() + await row(unknown).count(), 0);
  const page = await open(t, { email: "a@b.test", verified: false });
  for (const patch of [{ path: "/account/login" }, { path: "/home", signedIn: false }, { signedIn: true, actorId: "account-2" }, { actorId: "account-1", deletionPending: true }]) {
    await page.evaluate(value => (window as any).fixture.update(value), patch);
    assert.equal(await notice(page).count(), 0, JSON.stringify(patch));
  }
  await page.evaluate(() => (window as any).fixture.update({ deletionPending: false }));
  await notice(page).waitFor();
});
