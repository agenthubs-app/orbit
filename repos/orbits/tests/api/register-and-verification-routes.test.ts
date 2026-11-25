import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { afterEach } from "node:test";

import { createEmailVerificationSendHandler } from "../../app/api/account/email-verification/send/handler";
import { POST as confirm } from "../../app/api/auth/email-verification/confirm/route";
import { POST as register } from "../../app/api/auth/register/route";
import { POST as funnel } from "../../app/api/auth/signup-funnel/route";
import { createProfileOnboardingProgressRouteHandlers } from "../../app/api/profile/onboarding-progress/route-handler";
import { setAuthRateLimiterForTests } from "../../features/auth/auth-rate-limit";
import { setEmailVerificationServiceForTests, type EmailVerificationSendOutcome } from "../../features/auth/email-verification";
import { readSignupCookie } from "../../features/signup-funnel/context";
import { setSignupFunnelStoreForTests } from "../../features/signup-funnel/record";
import { signupSourceOf } from "../../app/(app)/app/orbit-2026/auth-public/use-account-auth";
import { LEGAL_VERSIONS } from "../../shared/compute/legal-version";

const consent = { accepted: true, privacyVersion: LEGAL_VERSIONS.privacy, termsVersion: LEGAL_VERSIONS.terms };
const post = (body: unknown, headers: Record<string, string> = {}) => new Request("https://orbit.local/x", { body: JSON.stringify(body), headers: { "content-type": "application/json", ...headers }, method: "POST" });
const env = { mode: process.env.ORBIT_MODULE_MODE, feature: process.env.ORBIT_FEATURE_MODE };
const rows: unknown[] = [];
const recording = { accountCreated: async (row: unknown) => { rows.push(["created", row]); }, opened: async (row: unknown) => { rows.push(["opened", row]); }, step: async (row: unknown) => { rows.push(["step", row]); } };

afterEach(() => {
  process.env.ORBIT_MODULE_MODE = env.mode; if (env.mode === undefined) delete process.env.ORBIT_MODULE_MODE;
  process.env.ORBIT_FEATURE_MODE = env.feature; if (env.feature === undefined) delete process.env.ORBIT_FEATURE_MODE;
  setEmailVerificationServiceForTests(null);
  setSignupFunnelStoreForTests(null);
  setAuthRateLimiterForTests(null);
  rows.length = 0;
});

test("没带同意、没勾、或版本不是发布过的：400 AUTH_CONSENT_REQUIRED，账号没建", async () => {
  process.env.ORBIT_MODULE_MODE = "mock";
  const account = { email: `c${Date.now()}@example.test`, password: "password-one" };
  for (const bad of [undefined, null, { ...consent, accepted: false }, { ...consent, termsVersion: "1999-01-01" }, { accepted: true }]) {
    const response = await register(post({ ...account, client: "web", consent: bad }));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.context.authErrorCode, "AUTH_CONSENT_REQUIRED");
  }
  setSignupFunnelStoreForTests(recording);
  const created = await register(post({ ...account, client: "app", consent, source: "event", visitorId: "3F2504E0-4F89-41D3-9A0C-0305E82C3301" }));
  assert.equal(created.status, 201);
  const { data } = await created.json();
  assert.deepEqual(Object.keys(data.user).sort(), ["createdAt", "displayName", "email", "id", "provider", "updatedAt"]);
  assert.deepEqual(data.emailVerification, { email: account.email, sending: false }, "没有发信通道时不说已经发了");
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(rows, [["created", { client: "app", source: "event", userId: data.user.id, visitorId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301" }]]);
});

test("漏斗接口：只收打开注册、只记类别；Web 发 httpOnly cookie，App 用自己的标识", async () => {
  setSignupFunnelStoreForTests(recording);
  for (const bad of [{ client: "web", name: "account_created" }, { client: "tv", name: "register_opened" }, [], "x", null]) assert.equal((await funnel(post(bad))).status, 400);
  const web = await funnel(post({ client: "web", name: "register_opened", source: "/app/events/secret?email=a@b.c" }));
  assert.equal(web.status, 204);
  const cookie = web.headers.get("set-cookie") ?? "";
  assert.match(cookie, /HttpOnly/iu);
  const parsed = readSignupCookie(/orbit-signup=([^;]+)/u.exec(cookie)?.[1]);
  assert.equal(parsed?.source, "direct", "地址不会被存下来");
  const again = await funnel(post({ client: "web", name: "register_opened", source: "event" }, { cookie: `orbit-signup=${parsed?.visitorId}.direct.web` }));
  assert.match(again.headers.get("set-cookie") ?? "", new RegExp(`${parsed?.visitorId}\\.event\\.web`, "u"));
  assert.equal((await funnel(post({ client: "app", name: "register_opened", source: "event" }))).headers.get("set-cookie"), null);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(rows.length, 2, "App 没带标识就不记");
});

test("来源类别从 next 判断，不看别的", () => {
  for (const next of ["/app/events/ev1", "/e/abc", "/events/x", "/app/profile/continue?next=%2Fapp%2Fevents%2Fev1"]) assert.equal(signupSourceOf(next), "event", next);
  assert.equal(signupSourceOf("/i/ABCD2345"), "invite");
  for (const next of ["", "/app/home", "/app/inbox", "%E0%A4%A"]) assert.equal(signupSourceOf(next), "direct", next);
});

test("重新发送：成功、已验证、太快、当天用完、发不出去、没配置", async () => {
  let outcome: EmailVerificationSendOutcome = { state: "sent", sentAt: "2026-11-25T00:00:00.000Z" };
  let language = "";
  setEmailVerificationServiceForTests({ confirm: async () => ({ outcome: "expired" }), send: async (_account, value) => { language = value; return outcome; } });
  const send = createEmailVerificationSendHandler(async () => ({ email: "a@example.test", userId: "u" }));
  const call = async (body: unknown = {}, headers = {}) => { const response = await send(post(body, headers)); return [response.status, await response.json()] as const; };
  assert.deepEqual((await call({ language: "en" }))[1].data, { email: "a@example.test", sentAt: "2026-11-25T00:00:00.000Z", verified: false });
  assert.equal(language, "en");
  await call({}, { "x-orbit-lang": "zh" });
  assert.equal(language, "zh");
  outcome = { state: "verified" };
  assert.deepEqual((await call())[1].data, { email: "a@example.test", verified: true });
  outcome = { state: "too_soon", retryAfterSeconds: 45 };
  const [status, body] = await call();
  assert.deepEqual([status, body.error.context], [429, { reason: "EMAIL_SEND_TOO_SOON", retryAfterSeconds: "45" }]);
  outcome = { state: "daily_limit" };
  assert.deepEqual([(await call())[0], (await call())[1].error.context.reason], [429, "EMAIL_SEND_DAILY_LIMIT"]);
  outcome = { state: "failed" };
  assert.deepEqual([(await call())[0], (await call())[1].error.context.reason], [502, "EMAIL_SEND_FAILED"]);
  assert.equal((await createEmailVerificationSendHandler(async () => null)(post({}))).status, 401);
});

test("点链接：公开、只回结果；完成时记一步", async () => {
  setSignupFunnelStoreForTests(recording);
  setEmailVerificationServiceForTests({ confirm: async (token) => token === "ok" ? { outcome: "verified", userId: "u1" } : { outcome: "expired" }, send: async () => ({ state: "failed" }) });
  const done = await confirm(post({ token: "ok" }));
  assert.deepEqual((await done.json()).data, { outcome: "verified" });
  assert.equal(done.headers.get("set-cookie"), null);
  assert.deepEqual((await (await confirm(post({ token: "no" }))).json()).data, { outcome: "expired" });
  assert.deepEqual((await (await confirm(new Request("https://orbit.local/x", { method: "POST" }))).json()).data, { outcome: "expired" });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(rows, [["step", { client: null, name: "email_verified", userId: "u1" }]]);
});

test("引导步骤：①＝确认 1，②＝确认 3，③＝确认 5，走完＝finish；失败的请求不记", async () => {
  setSignupFunnelStoreForTests(recording);
  let fail = false;
  const handlers = createProfileOnboardingProgressRouteHandlers({
    resolveActor: async () => ({ id: "account:a", userId: "user_a" }),
    serviceForActor: () => ({ apply: async () => { if (fail) throw new Error("no"); return {}; }, get: async () => null }) as never,
  });
  const run = (body: object, headers = {}) => handlers.POST(post({ expectedRevision: null, mutationId: "m", ...body }, headers));
  for (const screen of [1, 2, 3, 4, 5]) await run({ action: "confirm", screen }, { "x-orbit-platform": "app" });
  await run({ action: "finish" });
  await run({ action: "initialize" });
  fail = true;
  await run({ action: "confirm", screen: 1 });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(rows.map((row) => { const [, value] = row as [string, { name: string; client: string | null; userId: string }]; return [value.name, value.client, value.userId]; }), [
    ["onboarding_step1", "app", "user_a"], ["onboarding_step2", "app", "user_a"], ["onboarding_step3", "app", "user_a"], ["onboarding_finished", null, "user_a"],
  ]);
});

test("代理：只在页面等着、且会话说已验证时写 done；链接页不读会话", () => {
  const proxy = readFileSync("proxy.ts", "utf8");
  assert.match(proxy, /EMAIL_NOTICE_COOKIE\)\?\.value === "pending" && request\.auth\?\.user\?\.emailVerification\?\.verified/u);
  assert.doesNotMatch(readFileSync("app/verify-email/page.tsx", "utf8"), /auth\(/u);
});
