/**
 * R15 招待コード路由：mock（R08 演示世界）与 live（内存 + 真实 PostgreSQL）全部接口；公开预览未登录可读、兑换未登录 401；
 * 示例模式写 403；库未配置 503；响应过契约 schema。
 */
import assert from "node:assert/strict";
import test from "node:test";

type TestOptions = { skip?: string | boolean };

import { createInviteCodeLiveHandlers, inviteCodeRoute, type InviteRouteHandler } from "../../features/invite-codes/handlers";
import { createInviteRateLimiter, createMemoryInviteAttemptStore } from "../../features/invite-codes/rate-limit";
import { createInviteCodeService } from "../../features/invite-codes/service";
import { redesignMock } from "../../features/redesign-contracts/mock-service";
import {
  inviteCodeHistoryResponseSchema, inviteCodePreviewSchema, inviteCodeRedeemResultSchema, inviteCodeSchema, inviteConnectionViewSchema, inviteUnlinkResultSchema,
} from "../../shared/api-schema/invite-codes";
import { DEMO_ACTOR_ID } from "../../shared/mock/demo-world/fixtures";
import { migrateConfiguredTestDatabase } from "../support/migrated-configured-database";
import { ALICE, BOB, databaseTest, memoryHarness, profile, withInviteDatabase, type InviteHarness } from "../support/invite-codes-harness";

test.before(async () => {
  if (!databaseTest.skip) await migrateConfiguredTestDatabase();
});

type Live = ReturnType<typeof createInviteCodeLiveHandlers>;

function request(path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://localhost/api/invite-codes${path}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: { "content-type": "application/json", "x-real-ip": "10.0.0.1", ...headers },
  });
}

const call = (handler: InviteRouteHandler, req: Request, params: Record<string, string> = {}) => handler(req, { params: Promise.resolve(params) });

async function liveWorld(harness: InviteHarness) {
  await harness.setProfile(profile(ALICE));
  await harness.setProfile(profile(BOB));
  let actor: string | null = ALICE;
  const service = createInviteCodeService({ log: () => undefined, storage: harness.storage });
  const limiter = createInviteRateLimiter({ secret: Buffer.from("route-test"), store: createMemoryInviteAttemptStore() });
  const live: Live = createInviteCodeLiveHandlers({ limiter, log: () => undefined, resolveActor: async () => (actor ? { id: actor } : null), service });
  return { as: (value: string | null) => void (actor = value), live, service };
}

function liveSuite(name: string, options: TestOptions, withHarness: (run: (harness: InviteHarness) => Promise<void>) => Promise<void>) {
  test(`${name}: every live route works end to end and answers with the contract shapes`, options, async () => {
    await withHarness(async (harness) => {
      const { as, live } = await liveWorld(harness);
      const created = await call(live.create, request("", "POST", { idempotencyKey: "c", maxUses: 5, shared: { displayName: "spoof", email: "x@y.z" }, sharedKeys: ["organization"] }));
      assert.equal(created.status, 201);
      assert.equal(created.headers.get("X-Orbit-Feature-Mode"), "live");
      const code = inviteCodeSchema.parse((await created.json()).data);
      assert.deepEqual(code.shared, { displayName: "Alice Example", organization: "alice Inc", role: "CEO" });
      assert.equal(inviteCodeSchema.nullable().parse((await (await call(live.current, request("/current"))).json()).data)?.code, code.code);

      as(null);
      const preview = await call(live.preview, request(`/${code.code}/preview`), { code: code.code });
      assert.equal(preview.status, 200, "the preview is public");
      const previewBody = inviteCodePreviewSchema.parse((await preview.json()).data);
      assert.equal(previewBody.isOwnCode, undefined, "signed-out previews carry no account flags");
      assert.equal((await call(live.redeem, request(`/${code.code}/redeem`, "POST", { idempotencyKey: "r", sharedKeys: [] }), { code: code.code })).status, 401, "redeem needs sign-in");
      for (const [handler, req, params] of [
        [live.create, request("", "POST", { idempotencyKey: "x", maxUses: 1, shared: { displayName: "x" } }), {}],
        [live.history, request(""), {}],
        [live.current, request("/current"), {}],
        [live.revoke, request(`/${code.code}/revoke`, "POST"), { code: code.code }],
        [live.connection, request("/connections/c"), { contactId: "c" }],
        [live.share, request("/connections/c/share", "PUT", { idempotencyKey: "s", sharedKeys: [] }), { contactId: "c" }],
        [live.unlink, request("/connections/c/unlink", "POST", { idempotencyKey: "u", keepAsContact: true }), { contactId: "c" }],
      ] as const) assert.equal((await call(handler, req, params)).status, 401, req.url);

      as(BOB);
      assert.equal((await call(live.redeem, request(`/${code.code}/redeem`))).status, 400, "redeem requires a body");
      const redeemed = await call(live.redeem, request(`/${code.code}/redeem`, "POST", { idempotencyKey: "r", sharedKeys: ["email"] }), { code: code.code });
      assert.equal(redeemed.status, 200);
      const result = inviteCodeRedeemResultSchema.parse((await redeemed.json()).data);
      assert.equal(result.outcome, "connected");
      const view = inviteConnectionViewSchema.parse((await (await call(live.connection, request(`/connections/${result.contactId}`), { contactId: result.contactId })).json()).data);
      assert.deepEqual([view.sharedByMe, view.sharedByPeer], [["email"], ["organization"]]);
      const shared = await call(live.share, request(`/connections/${result.contactId}/share`, "PUT", { idempotencyKey: "s", sharedKeys: ["phone", "email"] }), { contactId: result.contactId });
      assert.deepEqual(inviteConnectionViewSchema.parse((await shared.json()).data).sharedByMe, ["email", "phone"]);
      assert.equal((await call(live.share, request(`/connections/${result.contactId}/share`, "PUT", { idempotencyKey: "s", sharedKeys: ["password"] }), { contactId: result.contactId })).status, 400);

      as(ALICE);
      const history = inviteCodeHistoryResponseSchema.parse((await (await call(live.history, request(""))).json()).data);
      assert.deepEqual(history.items.map((item) => [item.code, item.usedCount, item.joined.length]), [[code.code, 1, 1]]);
      const own = await call(live.redeem, request(`/${code.code}/redeem`, "POST", { idempotencyKey: "own", sharedKeys: [] }), { code: code.code });
      assert.deepEqual([own.status, (await own.json()).error.context.reason], [409, "OWN_CODE"]);
      as(BOB);
      assert.equal((await call(live.revoke, request(`/${code.code}/revoke`, "POST"), { code: code.code })).status, 404, "nobody revokes someone else's code");
      const unlinked = await call(live.unlink, request(`/connections/${result.contactId}/unlink`, "POST", { idempotencyKey: "u", keepAsContact: false }), { contactId: result.contactId });
      assert.deepEqual(inviteUnlinkResultSchema.parse((await unlinked.json()).data), { outcome: "unlinked" });
      assert.equal((await call(live.connection, request(`/connections/${result.contactId}`), { contactId: result.contactId })).status, 404);
      as(ALICE);
      const revoked = await call(live.revoke, request(`/${code.code}/revoke`, "POST"), { code: code.code });
      assert.ok(inviteCodeSchema.parse((await revoked.json()).data).revokedAt);
      as(null);
      const gone = await call(live.preview, request(`/${code.code}/preview`), { code: code.code });
      assert.deepEqual([gone.status, (await gone.json()).error.context.reason], [404, "INVITE_UNAVAILABLE"]);
    });
  });
}

liveSuite("memory", {}, (run) => run(memoryHarness()));
liveSuite("postgres", databaseTest, (run) => withInviteDatabase(run));

test("live: sample accounts and the sample header cannot write; a missing database is a 503", async () => {
  const harness = memoryHarness();
  await harness.setProfile(profile(DEMO_ACTOR_ID));
  const service = createInviteCodeService({ storage: harness.storage });
  const limiter = createInviteRateLimiter({ secret: Buffer.from("s"), store: createMemoryInviteAttemptStore() });
  const demo = createInviteCodeLiveHandlers({ limiter, resolveActor: async () => ({ id: DEMO_ACTOR_ID }), service });
  const blocked = await call(demo.create, request("", "POST", { idempotencyKey: "c", maxUses: 3, shared: { displayName: "x" } }));
  assert.deepEqual([blocked.status, (await blocked.json()).error.context.reason], [403, "SAMPLE_READ_ONLY"]);
  assert.equal(await service.current(DEMO_ACTOR_ID), null, "nothing was written");
  const real = createInviteCodeLiveHandlers({ limiter, resolveActor: async () => ({ id: ALICE }), service });
  assert.equal((await call(real.create, request("", "POST", { idempotencyKey: "c", maxUses: 3, shared: { displayName: "x" } }, { "x-orbit-sample": "1" }))).status, 403);
  assert.equal((await call(real.history, request("", "GET", undefined, { "x-orbit-sample": "1" }))).status, 200, "reads are fine");
  const missing = createInviteCodeLiveHandlers({ limiter, resolveActor: async () => ({ id: ALICE }), service: null });
  const unavailable = await call(missing.current, request("/current"));
  assert.deepEqual([unavailable.status, (await unavailable.json()).error.context.reason], [503, "INVITE_CODES_UNCONFIGURED"]);
  assert.equal((await call(missing.preview, request("/ZZZZ-ZZZZ/preview"), { code: "ZZZZ-ZZZZ" })).status, 503);
  const noProfile = createInviteCodeLiveHandlers({ limiter, resolveActor: async () => ({ id: "actor:nobody" }), service });
  const needProfile = await call(noProfile.create, request("", "POST", { idempotencyKey: "c", maxUses: 3, shared: { displayName: "x" } }));
  assert.deepEqual([needProfile.status, (await needProfile.json()).error.context.reason], [409, "PROFILE_REQUIRED"]);
});

test("the route files dispatch by mode: mock answers from the demo world, live goes to the real service", async () => {
  const previous = process.env.ORBIT_MODULE_MODE;
  try {
    const seen: string[] = [];
    const route = inviteCodeRoute(async () => (seen.push("mock"), new Response("mock")), () => async () => (seen.push("live"), new Response("live")));
    process.env.ORBIT_MODULE_MODE = "mock";
    await route(request("/current"));
    process.env.ORBIT_MODULE_MODE = "live";
    await route(request("/current"));
    assert.deepEqual(seen, ["mock", "live"]);

    process.env.ORBIT_MODULE_MODE = "mock";
    redesignMock.reset();
    const mod = await import("../../app/api/invite-codes/[code]/preview/route");
    const response = await mod.GET(request("/K7QX-2M9P/preview"), { params: Promise.resolve({ code: "K7QX-2M9P" }) });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.sample, true);
  } finally {
    if (previous === undefined) delete process.env.ORBIT_MODULE_MODE; else process.env.ORBIT_MODULE_MODE = previous;
  }
});
