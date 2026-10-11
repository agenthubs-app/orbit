import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { chromium, type Page } from "playwright";

// R15 SC-02 full stack: two browser contexts against a running local dev server in live mode (real database,
// real auth). Opt-in — it creates two throwaway accounts on that server:
//   ORBIT_E2E_BASE_URL=http://localhost:3000 node --test --import tsx tests/e2e/invite-codes-two-browsers.e2e.test.ts
// A (new account, profile set through /api/profile) creates a code (POST /api/invite-codes — A's dialog itself is
// covered by tests/ui/invite-sender.test.tsx and tests/ui/invite-codes-flow.test.tsx); B opens /i/<code>
// signed out, signs up through the real sign-up page, lands back on /i/<code>, fills the short profile, chooses what
// to share and connects. Then: both networks +1, A has one 「招待から登録しました」 notification.
// Only loopback hosts are accepted; the generated passwords never leave this process.
const BASE = process.env.ORBIT_E2E_BASE_URL ?? "";
const loopback = (() => {
  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(BASE).hostname);
  } catch {
    return false;
  }
})();
const options = { skip: loopback ? false : "set ORBIT_E2E_BASE_URL to a local dev server (live mode)", timeout: 240_000 };

const secret = () => `E2e-${randomBytes(12).toString("base64url")}`;
const stamp = Date.now().toString(36);

async function api(page: Page, method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> {
  return page.evaluate(async ([m, p, b]) => {
    const response = await fetch(p as string, { method: m as string, headers: b === undefined ? { accept: "application/json" } : { "content-type": "application/json", accept: "application/json" }, ...(b === undefined ? {} : { body: JSON.stringify(b) }), cache: "no-store" });
    return { status: response.status, body: await response.json().catch(() => null) };
  }, [method, path, body] as const);
}

async function contactCount(page: Page): Promise<number> {
  const result = await api(page, "GET", "/api/contacts");
  assert.equal(result.status, 200, `GET /api/contacts → ${result.status}`);
  const data = result.body?.data;
  const list = Array.isArray(data) ? data : data?.contacts ?? data?.items ?? [];
  return list.length;
}

async function signUp(page: Page, email: string, password: string, next: string) {
  await page.goto(`${BASE}/app/account/signup?next=${encodeURIComponent(next)}`, { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[autocomplete="new-password"]').fill(password);
  await page.locator("form.au-view button[type=submit], form.au-view .au-btn-primary").first().click();
}

test("A shares a code; B signs up from /i/<code>, fills the short profile, connects — both networks +1, A notified", options, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    // A: a fresh account with a profile, and a code.
    const a = await (await browser.newContext({ locale: "ja-JP" })).newPage();
    const aEmail = `r15-e2e-${stamp}-a@orbit.test`;
    await signUp(a, aEmail, secret(), "/app/home");
    await a.waitForURL((url) => !url.pathname.startsWith("/app/account"), { timeout: 60_000 });
    const before = await api(a, "GET", "/api/profile");
    const saved = await api(a, "PUT", "/api/profile", { displayName: "E2E 佐藤", organization: "E2E ミナトリンク", role: "代表", offering: ["導入の相談"], seeking: ["投資家の紹介"], expectedUpdatedAt: before.body?.data?.profile?.updatedAt ?? null, mutationId: `e2e-${stamp}-a` });
    assert.equal(saved.status, 200, JSON.stringify(saved.body?.error ?? null));
    const aBefore = await contactCount(a);
    const created = await api(a, "POST", "/api/invite-codes", { idempotencyKey: `e2e-${stamp}`, maxUses: 10, shared: { displayName: "x" }, sharedKeys: ["organization", "offering", "seeking"] });
    assert.equal(created.status, 201, JSON.stringify(created.body?.error ?? null));
    const code: string = created.body.data.code;

    // B: opens the link signed out.
    const b = await (await browser.newContext({ locale: "ja-JP" })).newPage();
    const response = await b.goto(`${BASE}/i/${code}`, { waitUntil: "networkidle" });
    assert.equal(response?.headers()["referrer-policy"], "no-referrer");
    assert.equal(await b.title(), "Orbit への招待");
    assert.match((await b.locator('meta[name="robots"]').getAttribute("content"))!, /noindex/u);
    await b.locator("[data-invite-open]").waitFor();
    assert.equal(await b.locator("[data-invite-inviter]").getByText("E2E 佐藤 さん").count(), 1);
    await b.locator("[data-invite-signup]").click();
    await b.waitForURL((url) => url.pathname === "/app/account/signup");
    await b.waitForLoadState("networkidle");
    await b.locator('input[type="email"]').fill(`r15-e2e-${stamp}-b@orbit.test`);
    await b.locator('input[autocomplete="new-password"]').fill(secret());
    await b.locator("form.au-view .au-btn-primary").first().click();
    await b.waitForURL((url) => url.pathname === `/i/${code}`, { timeout: 60_000 });
    await b.locator("[data-invite-profile]").waitFor({ timeout: 30_000 });
    assert.equal(await contactCount(b), 0, "a new account starts with nobody");
    await b.locator('[data-invite-field="displayName"]').fill("E2E 高橋");
    await b.locator('[data-invite-field="organization"]').fill("E2E 青葉");
    await b.locator('[data-invite-tag="人の紹介"]').click();
    await b.locator("[data-invite-profile-next]").click();
    await b.locator("[data-invite-confirm]").waitFor({ timeout: 30_000 });
    await b.locator("[data-invite-connect]").click();
    await b.locator("[data-invite-done]").waitFor({ timeout: 30_000 });

    assert.equal(await contactCount(b), 1, "B's network +1");
    assert.equal(await contactCount(a), aBefore + 1, "A's network +1");
    const inbox = await api(a, "GET", "/api/inbox/notifications");
    assert.equal(inbox.status, 200);
    const items: unknown[] = inbox.body?.data?.items ?? [];
    assert.equal(items.filter((item) => JSON.stringify(item).includes("E2E 高橋")).length, 1, "one notification for A");
  } finally {
    await browser.close();
  }
});
