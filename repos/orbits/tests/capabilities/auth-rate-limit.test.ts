/**
 * 注册 / 登录 / 找回密码限流（features/auth/auth-rate-limit.ts）+ 匿名活动详情微缓存（features/events/journey/anonymous-microcache.ts）。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { AUTH_RATE_RULES, authRateLimitedResponse, createAuthRateLimiter, getAuthRateLimiter, setAuthRateLimiterForTests } from "../../features/auth/auth-rate-limit";
import { createMemoryInviteAttemptStore, type InviteAttemptStore } from "../../features/invite-codes/rate-limit";
import { anonymousMicrocache, isAnonymousRequest } from "../../features/events/journey/anonymous-microcache";

const START = Date.parse("2026-11-18T03:00:00.000Z");
const secret = Buffer.alloc(32, 7);

function limiter(store: InviteAttemptStore = createMemoryInviteAttemptStore()) {
  let at = START;
  return { clock: (ms: number) => { at += ms; }, limiter: createAuthRateLimiter({ now: () => new Date(at), secret, store }), store };
}

test("login: 10 failures for one email lock that email until the window ends; other emails unaffected", async () => {
  const { clock, limiter: rl } = limiter();
  for (let i = 0; i < AUTH_RATE_RULES.loginFailuresPerEmail.limit; i += 1) {
    assert.equal((await rl.checkLogin({ email: "A@x.com", ip: "1.1.1.1" })).allowed, true);
    await rl.recordLoginFailure({ email: "a@x.com ", ip: "1.1.1.1" });
  }
  const blocked = await rl.checkLogin({ email: "a@x.com", ip: "2.2.2.2" });
  assert.equal(blocked.allowed, false);
  assert.ok(!blocked.allowed && blocked.retryAfterSeconds > 0 && blocked.retryAfterSeconds <= 15 * 60);
  assert.equal((await rl.checkLogin({ email: "b@x.com", ip: "1.1.1.1" })).allowed, true);
  clock(15 * 60 * 1000);
  assert.equal((await rl.checkLogin({ email: "a@x.com", ip: "1.1.1.1" })).allowed, true);
});

test("login: one IP gets 600 attempts per 10 minutes", async () => {
  const { limiter: rl } = limiter();
  for (let i = 0; i < AUTH_RATE_RULES.loginPerIp.limit; i += 1) assert.equal((await rl.checkLogin({ email: `u${i}@x.com`, ip: "9.9.9.9" })).allowed, true);
  assert.equal((await rl.checkLogin({ email: "z@x.com", ip: "9.9.9.9" })).allowed, false);
  assert.equal((await rl.checkLogin({ email: "z@x.com", ip: "8.8.8.8" })).allowed, true);
});

test("login: 100 failures from one IP block it for the window, whatever the email; other IPs are unaffected", async () => {
  const { clock, limiter: rl } = limiter();
  for (let i = 0; i < AUTH_RATE_RULES.loginFailuresPerIp.limit; i += 1) {
    assert.equal((await rl.checkLogin({ email: `u${i}@x.com`, ip: "7.7.7.7" })).allowed, true);
    await rl.recordLoginFailure({ email: `u${i}@x.com`, ip: "7.7.7.7" });
  }
  assert.equal((await rl.checkLogin({ email: "z@x.com", ip: "7.7.7.7" })).allowed, false);
  assert.equal((await rl.checkLogin({ email: "z@x.com", ip: "8.8.8.8" })).allowed, true);
  clock(10 * 60 * 1000);
  assert.equal((await rl.checkLogin({ email: "z@x.com", ip: "7.7.7.7" })).allowed, true);
});

test("a venue on one IP: 250 people register and are signed in within one window", async () => {
  const { limiter: rl } = limiter();
  for (let i = 0; i < 250; i += 1) {
    assert.equal((await rl.checkRegister({ email: `guest${i}@x.com`, ip: "5.5.5.5" })).allowed, true, `register ${i}`);
    assert.equal((await rl.checkLogin({ email: `guest${i}@x.com`, ip: "5.5.5.5" })).allowed, true, `sign-in ${i}`);
  }
});

test("register: one email gets 10 tries per 10 minutes across IPs; an empty email only counts against the IP", async () => {
  const { limiter: rl } = limiter();
  for (let i = 0; i < AUTH_RATE_RULES.registerPerEmail.limit; i += 1) assert.equal((await rl.checkRegister({ email: "Same@x.com", ip: `10.0.0.${i}` })).allowed, true);
  assert.equal((await rl.checkRegister({ email: "same@x.com ", ip: "10.0.1.1" })).allowed, false);
  assert.equal((await rl.checkRegister({ email: "other@x.com", ip: "10.0.1.1" })).allowed, true);
  for (let i = 0; i < 20; i += 1) assert.equal((await rl.checkRegister({ email: "", ip: "10.0.2.1" })).allowed, true);
});

test("register: 300 per IP per 10 minutes, 1000 per day; reset request: 10 per IP per 10 minutes", async () => {
  const { clock, limiter: rl } = limiter();
  let sent = 0;
  const register = () => rl.checkRegister({ email: `r${sent += 1}@x.com`, ip: "3.3.3.3" });
  for (let i = 0; i < AUTH_RATE_RULES.registerPerIpShort.limit; i += 1) assert.equal((await register()).allowed, true);
  assert.equal((await register()).allowed, false);
  let passed = AUTH_RATE_RULES.registerPerIpShort.limit;
  for (let window = 0; window < 4; window += 1) {
    clock(10 * 60 * 1000);
    for (let i = 0; i < AUTH_RATE_RULES.registerPerIpShort.limit; i += 1) if ((await register()).allowed) passed += 1;
  }
  assert.equal(passed, AUTH_RATE_RULES.registerPerIpDay.limit);
  for (let i = 0; i < AUTH_RATE_RULES.resetRequestPerIp.limit; i += 1) assert.equal((await rl.checkResetRequest({ ip: "3.3.3.3" })).allowed, true);
  assert.equal((await rl.checkResetRequest({ ip: "3.3.3.3" })).allowed, false);
});

test("buckets hold only HMACs, never the raw IP or email", async () => {
  const store = createMemoryInviteAttemptStore();
  const { limiter: rl } = limiter(store);
  await rl.checkLogin({ email: "secret@x.com", ip: "203.0.113.5" });
  await rl.recordLoginFailure({ email: "secret@x.com", ip: "203.0.113.5" });
  const keys = [...store.rows.keys()].join(" ");
  assert.ok(keys.startsWith("auth-"));
  assert.ok(!keys.includes("secret") && !keys.includes("203.0.113.5"));
});

test("unconfigured (no AUTH_SECRET) allows everything; 429 response carries Retry-After", async () => {
  setAuthRateLimiterForTests(null);
  const open = await getAuthRateLimiter({});
  assert.equal((await open.checkRegister({ email: "x@x.com", ip: "x" })).allowed, true);
  const response = authRateLimitedResponse(42);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "42");
  assert.equal(((await response.json()) as { error: { code: string } }).error.code, "RATE_LIMITED");
});

test("microcache: anonymous requests reuse one load for the TTL; signed-in requests always pass through", async () => {
  let now = START;
  let loads = 0;
  const cached = anonymousMicrocache({ now: () => now, sampleHeader: "x-orbit-sample", ttlMs: 60_000 });
  const load = async () => { loads += 1; return Response.json({ n: loads }); };
  const url = "https://orbit.test/api/events/e1/overview?lang=zh";

  const [a, b] = await Promise.all([cached(new Request(url), load), cached(new Request(url), load)]);
  assert.equal(loads, 1, "concurrent anonymous requests coalesce");
  assert.deepEqual(await a.json(), { n: 1 });
  assert.deepEqual(await b.json(), { n: 1 });

  await cached(new Request(url), load);
  assert.equal(loads, 1);
  await cached(new Request(url, { headers: { "x-orbit-lang": "en" } }), load);
  assert.equal(loads, 2, "language header is part of the key");

  await cached(new Request(url, { headers: { cookie: "theme=dark; __Secure-authjs.session-token=abc" } }), load);
  await cached(new Request(url, { headers: { authorization: "Bearer t" } }), load);
  assert.equal(loads, 4, "signed-in requests bypass the cache");

  now += 60_001;
  await cached(new Request(url), load);
  assert.equal(loads, 5, "expired entry reloads");
});

test("microcache: non-200 is returned as-is and never cached", async () => {
  let loads = 0;
  const cached = anonymousMicrocache({ ttlMs: 60_000 });
  const load = async () => { loads += 1; return Response.json({ missing: true }, { status: 404 }); };
  const url = "https://orbit.test/api/events/nope/overview";
  assert.equal((await cached(new Request(url), load)).status, 404);
  assert.equal((await cached(new Request(url), load)).status, 404);
  assert.equal(loads, 2);
  assert.equal(isAnonymousRequest(new Request(url, { headers: { cookie: "authjs.session-token.0=x" } })), false);
});
