/**
 * R15 SC-R15-04（DESIGN add-and-invite §6 第 10 条全部）：公开预览与兑换的限流与防枚举，走 live 路由处理函数
 * （内存服务 + 内存计数，时钟可控）。并发 20 个兑换同一个剩 1 人的码只成功 1 个：见 invite-codes-service.test.ts（内存 + PostgreSQL）。
 */
import assert from "node:assert/strict";
import { hkdfSync } from "node:crypto";
import test from "node:test";

import { inviteClientIp } from "../../features/invite-codes/client-ip";
import { createInviteCodeLiveHandlers } from "../../features/invite-codes/handlers";
import { createInviteRateLimiter, createMemoryInviteAttemptStore, INVITE_RATE_HKDF_INFO, INVITE_RATE_RULES, resolveInviteRateSecret } from "../../features/invite-codes/rate-limit";
import { createInviteCodeService } from "../../features/invite-codes/service";
import { ALICE, BOB, CAROL, memoryHarness, profile } from "../support/invite-codes-harness";

const DAY = 24 * 60 * 60 * 1000;
const START = Date.parse("2026-10-11T03:00:00.000Z");

async function world() {
  const harness = memoryHarness();
  for (const actor of [ALICE, BOB, CAROL, "actor:dave"]) await harness.setProfile(profile(actor));
  let clock = START;
  const now = () => new Date(clock);
  const service = createInviteCodeService({ log: () => undefined, now, storage: harness.storage });
  const store = createMemoryInviteAttemptStore();
  const limiter = createInviteRateLimiter({ now, secret: Buffer.from("test-secret"), store });
  const logs: string[] = [];
  let actor: string | null = null;
  const handlers = createInviteCodeLiveHandlers({ limiter, log: (line) => void logs.push(line), resolveActor: async () => (actor ? { id: actor } : null), service });
  const preview = (code: string, headers: Record<string, string> = {}) =>
    handlers.preview(new Request(`http://localhost/api/invite-codes/${code}/preview`, { headers }), { params: Promise.resolve({ code }) });
  const redeem = (code: string, idempotencyKey: string, headers: Record<string, string> = {}) =>
    handlers.redeem(new Request(`http://localhost/api/invite-codes/${code}/redeem`, { body: JSON.stringify({ idempotencyKey, sharedKeys: [] }), headers: { "content-type": "application/json", ...headers }, method: "POST" }), { params: Promise.resolve({ code }) });
  const code = (await service.create(ALICE, { idempotencyKey: "live", maxUses: 10, shared: { displayName: "a" }, sharedKeys: ["organization", "email", "phone"] })).code;
  return {
    advance: (ms: number) => void (clock += ms),
    as: (value: string | null) => void (actor = value),
    code,
    harness,
    logs,
    preview,
    redeem,
    service,
    store,
  };
}

const ip = (value: string) => ({ "x-real-ip": value });

test("unknown, revoked, superseded, malformed and 31-days-expired codes answer byte-for-byte the same 404", async () => {
  const w = await world();
  w.as(BOB);
  const revoked = (await w.service.create(BOB, { idempotencyKey: "b1", maxUses: 10, shared: { displayName: "b" } })).code;
  await w.service.revoke(BOB, revoked);
  const superseded = (await w.service.create(CAROL, { idempotencyKey: "c1", maxUses: 10, shared: { displayName: "c" } })).code;
  w.advance(1000);
  await w.service.create(CAROL, { idempotencyKey: "c2", maxUses: 10, shared: { displayName: "c" } });
  const expiring = (await w.service.create("actor:dave", { idempotencyKey: "d1", maxUses: 10, shared: { displayName: "d" } })).code;
  w.advance(38 * DAY);
  w.as(null);
  const responses = [];
  for (const [index, code] of ["ZZZZ-ZZZZ", revoked, superseded, "not-a-code", expiring].entries()) responses.push(await w.preview(code, ip(`10.0.0.${index}`)));
  const bodies = await Promise.all(responses.map((response) => response.text()));
  for (const response of responses) assert.equal(response.status, 404);
  assert.equal(new Set(bodies).size, 1, bodies.join("\n"));
  assert.deepEqual(JSON.parse(bodies[0]!), { error: { code: "NOT_FOUND", context: { reason: "INVITE_UNAVAILABLE" }, message: "This invite code cannot be used." }, success: false });
  const headerSets = responses.map((response) => JSON.stringify([...response.headers.entries()].sort()));
  assert.equal(new Set(headerSets).size, 1, "headers are identical too");
});

test("the preview never contains email or phone even when they are shared", async () => {
  const w = await world();
  const response = await w.preview(w.code, ip("10.1.1.1"));
  const text = await response.text();
  assert.equal(response.status, 200);
  assert.doesNotMatch(text, /@|090-1234/u);
  assert.deepEqual(Object.keys(JSON.parse(text).data.shared).sort(), ["displayName", "organization", "role"]);
});

test("after the 60th failure in an hour every preview from that IP is 429 — the real code too — and other IPs are unaffected", async () => {
  const w = await world();
  // 失败分两个 10 分钟窗口打，避免先撞上「每 10 分钟 60 次」的总量限制。
  for (let index = 0; index < 60; index += 1) {
    if (index === 40) w.advance(10 * 60 * 1000);
    assert.equal((await w.preview(`ZZZZ-ZZ${"23456789ABCDEFGHJKMNPQRSTVWXYZ"[index % 30]}${"23456789"[index % 8]}`, ip("203.0.113.9"))).status, 404, `failure ${index + 1}`);
  }
  const locked = await w.preview(w.code, ip("203.0.113.9"));
  assert.equal(locked.status, 429);
  assert.ok(Number(locked.headers.get("Retry-After")) > 0);
  const lockedUnknown = await w.preview("ZZZZ-ZZZZ", ip("203.0.113.9"));
  assert.equal(await locked.clone().text(), await lockedUnknown.text(), "a locked IP cannot tell real codes from fake ones");
  assert.equal((await w.preview(w.code, ip("203.0.113.10"))).status, 200, "a different IP is not affected");
  // 伪造 x-forwarded-for 不改变主体。
  assert.equal((await w.preview(w.code, { ...ip("203.0.113.9"), "x-forwarded-for": "198.51.100.1" })).status, 429);
  // 窗口过期恢复。
  w.advance(60 * 60 * 1000);
  assert.equal((await w.preview(w.code, ip("203.0.113.9"))).status, 200);
});

test("x-forwarded-for is never read: without x-real-ip everyone shares the local bucket", async () => {
  assert.equal(inviteClientIp(new Headers({ "x-forwarded-for": "198.51.100.1" })), "local");
  assert.equal(inviteClientIp(new Headers({ "x-real-ip": " 2001:db8::1 " })), "2001:db8::1");
  assert.equal(inviteClientIp(new Headers({ "x-real-ip": "1.1.1.1, 2.2.2.2" })), "local");
  const w = await world();
  for (let index = 0; index < 60; index += 1) {
    if (index === 40) w.advance(10 * 60 * 1000);
    await w.preview("ZZZZ-ZZZZ", { "x-forwarded-for": `198.51.100.${index}` });
  }
  assert.equal((await w.preview(w.code, { "x-forwarded-for": "198.51.100.250" })).status, 429, "rotating x-forwarded-for does not escape the lock");
});

test("the total preview limits: 60 per 10 minutes and 500 per day per IP", async () => {
  const w = await world();
  for (let index = 0; index < INVITE_RATE_RULES.previewsPerTenMinutes; index += 1) assert.equal((await w.preview(w.code, ip("10.9.9.9"))).status, 200);
  const limited = await w.preview(w.code, ip("10.9.9.9"));
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get("Retry-After")) <= 600);
  w.advance(10 * 60 * 1000);
  assert.equal((await w.preview(w.code, ip("10.9.9.9"))).status, 200, "the 10-minute window recovers");
  // 同一个 UTC 日里继续：每 10 分钟 60 次，直到当天第 500 次。
  for (let served = 61; served < INVITE_RATE_RULES.previewsPerDay; served += 1) {
    if (served % 60 === 1) w.advance(10 * 60 * 1000);
    assert.equal((await w.preview(w.code, ip("10.9.9.9"))).status, 200, `preview ${served + 1}`);
  }
  w.advance(10 * 60 * 1000);
  const daily = await w.preview(w.code, ip("10.9.9.9"));
  assert.equal(daily.status, 429, "the 501st preview of the day");
  assert.ok(Number(daily.headers.get("Retry-After")) > 600, "retry after the day ends");
});

test("signed-in previews count failures per account, not per IP", async () => {
  const w = await world();
  w.as(BOB);
  for (let index = 0; index < INVITE_RATE_RULES.accountPreviewFailuresPerHour; index += 1) assert.equal((await w.preview("ZZZZ-ZZZZ", ip("10.2.2.2"))).status, 404);
  assert.equal((await w.preview(w.code, ip("10.2.2.2"))).status, 429, "Bob is locked");
  w.as(CAROL);
  assert.equal((await w.preview(w.code, ip("10.2.2.2"))).status, 200, "another account on the same network is not");
  w.as(null);
  assert.equal((await w.preview(w.code, ip("10.2.2.2"))).status, 200, "signed-in failures did not use the IP's budget");
  w.as(CAROL);
  const flags = (await (await w.preview(w.code, ip("10.2.2.3"))).json()).data;
  assert.deepEqual([flags.isOwnCode, flags.inviterAlreadyConnected], [false, false], "signed-in previews carry the flags");
});

test("REVIEW m1: a locked IP is locked for signed-in previews too (429, same body), new accounts included", async () => {
  const w = await world();
  for (let index = 0; index < INVITE_RATE_RULES.ipFailuresPerHour; index += 1) {
    if (index === 40) w.advance(10 * 60 * 1000);
    await w.preview("ZZZZ-ZZZZ", ip("10.3.3.3"));
  }
  const anonymous = await w.preview(w.code, ip("10.3.3.3"));
  assert.equal(anonymous.status, 429);
  for (const actor of [BOB, CAROL, "actor:dave"]) {
    w.as(actor);
    const locked = await w.preview(w.code, ip("10.3.3.3"));
    assert.equal(locked.status, 429, `${actor} on the locked IP`);
    assert.equal(await locked.text(), await anonymous.clone().text(), "the same answer as anonymous");
    assert.equal((await w.preview(w.code, ip("10.3.3.4"))).status, 200, `${actor} elsewhere is fine`);
  }
  w.as(BOB);
  w.advance(60 * 60 * 1000);
  assert.equal((await w.preview(w.code, ip("10.3.3.3"))).status, 200, "the window recovers");
});

test("redeem needs a signed-in account; failures also count against the IP so switching accounts does not help", async () => {
  const w = await world();
  w.as(null);
  assert.equal((await w.redeem(w.code, "k")).status, 401);
  // 6 个账号轮流兑换不存在的码，每个账号 10 次失败就到上限；IP 失败桶共用。
  const accounts = Array.from({ length: 6 }, (_, index) => `actor:attacker${index}`);
  let attempts = 0;
  for (const account of accounts) {
    w.as(account);
    for (let index = 0; index < INVITE_RATE_RULES.redeemFailuresPerDay; index += 1) {
      const response = await w.redeem("ZZZZ-ZZZZ", `${account}-${index}`, ip("198.51.100.7"));
      attempts += 1;
      if (attempts <= INVITE_RATE_RULES.ipFailuresPerHour) assert.equal(response.status, 404, `attempt ${attempts}`);
    }
    const capped = await w.redeem("ZZZZ-ZZZZ", `${account}-x`, ip("198.51.100.8"));
    assert.equal(capped.status, 429, "an account is capped after 10 failures a day");
  }
  w.as(BOB);
  const blocked = await w.redeem(w.code, "bob-real", ip("198.51.100.7"));
  assert.equal(blocked.status, 429, "a fresh account on the locked IP cannot redeem either");
  w.as(null);
  assert.equal((await w.preview(w.code, ip("198.51.100.7"))).status, 429, "the shared failure bucket also locks previews");
  w.as(BOB);
  assert.equal((await w.redeem(w.code, "bob-other-ip", ip("198.51.100.9"))).status, 200);
});

test("redeem: at most 20 per account per day", async () => {
  const w = await world();
  w.as(BOB);
  for (let index = 0; index < INVITE_RATE_RULES.redeemsPerDay; index += 1) assert.notEqual((await w.redeem(w.code, `k-${index}`, ip("10.3.3.3"))).status, 429);
  assert.equal((await w.redeem(w.code, "k-21", ip("10.3.3.3"))).status, 429);
});

test("the HMAC secret: a dedicated secret, else derived from AUTH_SECRET with HKDF, else 503 (no silent unlimited mode)", async () => {
  assert.deepEqual(resolveInviteRateSecret({ AUTH_SECRET: "x".repeat(40), ORBIT_INVITE_RATE_SECRET: "dedicated" }), Buffer.from("dedicated"));
  const derived = resolveInviteRateSecret({ AUTH_SECRET: "x".repeat(40) });
  assert.deepEqual(derived, Buffer.from(hkdfSync("sha256", Buffer.from("x".repeat(40)), Buffer.alloc(0), Buffer.from(INVITE_RATE_HKDF_INFO), 32)));
  assert.notDeepEqual(derived, Buffer.from("x".repeat(40)), "AUTH_SECRET itself is not reused");
  assert.equal(resolveInviteRateSecret({}), null);

  const harness = memoryHarness();
  const service = createInviteCodeService({ storage: harness.storage });
  const handlers = createInviteCodeLiveHandlers({ limiter: null, resolveActor: async () => ({ id: BOB }), service });
  const preview = await handlers.preview(new Request("http://localhost/api/invite-codes/ZZZZ-ZZZZ/preview"), { params: Promise.resolve({ code: "ZZZZ-ZZZZ" }) });
  assert.equal(preview.status, 503);
  assert.equal((await preview.json()).error.context.reason, "INVITE_RATE_UNCONFIGURED");
  const redeem = await handlers.redeem(new Request("http://localhost/api/invite-codes/ZZZZ-ZZZZ/redeem", { body: JSON.stringify({ idempotencyKey: "k", sharedKeys: [] }), method: "POST" }), { params: Promise.resolve({ code: "ZZZZ-ZZZZ" }) });
  assert.equal(redeem.status, 503);
});

test("logs carry only the HMAC of the IP and the first two characters of the code", async () => {
  const w = await world();
  await w.preview("ZZZZ-ZZZZ", ip("192.0.2.77"));
  w.as(BOB);
  await w.redeem("K7QX-2M9P", "log-1", ip("192.0.2.77"));
  w.as(null);
  for (let index = 0; index < 61; index += 1) await w.preview(w.code, ip("192.0.2.78"));
  assert.ok(w.logs.length >= 3, JSON.stringify(w.logs));
  const all = w.logs.join("\n");
  for (const secret of ["192.0.2.77", "192.0.2.78", "ZZZZ-ZZZZ", "ZZZZZZZZ", "K7QX-2M9P", "K7QX2M9P", w.code, w.code.replace("-", "")]) assert.equal(all.includes(secret), false, secret);
  for (const line of w.logs) {
    const parsed = JSON.parse(line) as { code: string; ip: string };
    assert.equal(parsed.code.length, 2);
    assert.match(parsed.ip, /^[0-9a-f]{16}$/u);
  }
  assert.equal([...w.store.rows.keys()].some((key) => key.includes("192.0.2")), false, "counters store only HMACs");
});
