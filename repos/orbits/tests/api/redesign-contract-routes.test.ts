import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { redesignMock } from "../../features/redesign-contracts/mock-service";
import { redesignContractRoute } from "../../features/redesign-contracts/route";
import { isNotImplemented } from "../../shared/compute/not-implemented";
import { DEFAULT_HOME_LAYOUT, homeLayoutSchema } from "../../shared/api-schema/home-layout";

// R08 (SC-R08-01 / 02): every new redesign contract route answers from the demo
// world in mock mode and with a structured NOT_IMPLEMENTED in live mode — never
// with a fixture.
type Handler = (request: Request, context?: { params?: Promise<Record<string, string>> }) => Promise<Response>;
type Case = { file: string; method: string; params?: Record<string, string>; body?: unknown; status?: number; query?: string };

const key = { idempotencyKey: "k-1" };
const CASES: Case[] = [
  { file: "home/layout", method: "GET" },
  { file: "home/layout", method: "PUT", body: { expectedRevision: 3, mutationId: "m-1", app: DEFAULT_HOME_LAYOUT.app, web: DEFAULT_HOME_LAYOUT.web } },
  { file: "contacts/completion-question", method: "GET" },
  // R16 复核 M5：mock 校验答案（必须是选项之一）；答过的题不能再跳过，所以跳过用「会社は？」样例。
  { file: "contacts/completion-question/[id]/answer", method: "POST", params: { id: "demo-question-1" }, body: { answer: "覚えていない", ...key } },
  { file: "contacts/completion-question/[id]/skip", method: "POST", params: { id: "demo-question-2" }, body: key },
  { file: "invite-codes/current", method: "GET" },
  { file: "invite-codes/[code]/preview", method: "GET", params: { code: "K7QX-2M9P" } },
  // R15：兑换要请求体；自己的码不能兑换，所以用演示世界里松井さん的码。
  { file: "invite-codes/[code]/preview", method: "GET", params: { code: "H8MW-4QZT" } },
  { file: "invite-codes/[code]/redeem", method: "POST", params: { code: "H8MW-4QZT" }, body: { sharedKeys: ["organization"], ...key } },
  { file: "invite-codes", method: "GET" },
  { file: "invite-codes/connections/[contactId]", method: "GET", params: { contactId: "demo-person-takahashi" } },
  { file: "invite-codes/connections/[contactId]/share", method: "PUT", params: { contactId: "demo-person-takahashi" }, body: { sharedKeys: ["organization", "email"], ...key } },
  { file: "invite-codes/current/share", method: "PUT", body: { sharedKeys: ["organization", "offering"], ...key } },
  { file: "invite-codes/connections/[contactId]/unlink", method: "POST", params: { contactId: "demo-person-takahashi" }, body: { keepAsContact: true, ...key } },
  { file: "invite-codes/[code]/revoke", method: "POST", params: { code: "K7QX-2M9P" } },
  { file: "invite-codes", method: "POST", body: { shared: { displayName: "Orbit デモ" }, maxUses: 5, ...key }, status: 201 },
  { file: "events/assessments", method: "GET" },
  { file: "events/assessments", method: "POST", body: { sourceKind: "url", url: "https://example.com/e", ...key }, status: 202 },
  { file: "events/assessments/[id]", method: "GET", params: { id: "demo-assessment-saas-summit" } },
  { file: "events/assessments/[id]", method: "PATCH", params: { id: "demo-assessment-saas-summit" }, body: { facts: { price: "3,000円" } } },
  { file: "events/assessments/[id]/add-to-plan", method: "POST", params: { id: "demo-assessment-saas-summit" } },
  { file: "recommendations/events/[id]/dismiss", method: "POST", params: { id: "demo-event-robotics-meetup" }, body: { reason: "distance", ...key } },
  { file: "account/exports", method: "GET" },
  { file: "account/exports", method: "POST", body: { scope: ["contacts", "notes"], ...key }, status: 202 },
  { file: "account/exports/[id]", method: "GET", params: { id: "demo-export-1" } },
  { file: "account/deletion-request", method: "POST", status: 202 },
  { file: "account/deletion-request", method: "GET" },
  { file: "account/deletion-request", method: "DELETE" },
  { file: "app/version", method: "GET" },
  // R30：全局搜索（mock 答演示世界；live 已有实现，见 tests/search/global-search.test.ts）。
  { file: "search/global", method: "GET" },
  { file: "todo/page", method: "GET" },
  { file: "calendar/external-events", method: "GET", query: "?from=2026-10-07T00:00:00Z&to=2026-10-30T00:00:00Z" },
  // R22：agent/plans/v2/summary 已由计划 v2 实现（tests/api/plan-v2-routes.test.ts），不再是「尚未实现」。
];

async function call(item: Case): Promise<Response> {
  const routeModule = (await import(`../../app/api/${item.file}/route.ts`)) as Record<string, Handler>;
  const handler = routeModule[item.method];
  assert.ok(handler, `${item.method} /api/${item.file}`);
  const request = new Request(`http://localhost/api/${item.file}${item.query ?? ""}`, {
    method: item.method,
    ...(item.body ? { body: JSON.stringify(item.body), headers: { "content-type": "application/json" } } : {}),
  });
  return handler(request, { params: Promise.resolve(item.params ?? {}) });
}

async function withMode<T>(mode: string, run: () => Promise<T>): Promise<T> {
  const previous = process.env.ORBIT_MODULE_MODE;
  process.env.ORBIT_MODULE_MODE = mode;
  try { return await run(); } finally {
    if (previous === undefined) delete process.env.ORBIT_MODULE_MODE; else process.env.ORBIT_MODULE_MODE = previous;
  }
}

test("mock: every route answers success from the demo world (the handlers parse each answer with the contract schema)", async () => {
  redesignMock.reset();
  await withMode("mock", async () => {
    for (const item of CASES) {
      const response = await call(item);
      const body = await response.json();
      assert.equal(response.status, item.status ?? 200, `${item.method} ${item.file}: ${JSON.stringify(body)}`);
      assert.equal(body.success, true, `${item.method} ${item.file}`);
      assert.equal(response.headers.get("X-Orbit-Feature-Mode"), "mock");
    }
  });
  redesignMock.reset();
});

test("live (and so production): every route answers 503 NOT_IMPLEMENTED with no fixture in the body", async () => {
  await withMode("live", async () => {
    // R15：招待コード已有 live 实现（features/invite-codes，测试见 tests/api/invite-codes-routes.test.ts），不再是 NOT_IMPLEMENTED。
    // R16：每天一问已有 live 实现（features/contacts/completion，测试见 tests/api/completion-question-routes.test.ts）。
    // R26：活动评估已有 live 实现（features/events/assessment，测试见 tests/api/event-assessment-routes.test.ts）。
    // R27：興味なし（契约 9）已有 live 实现（features/events/journey，测试见 tests/events/r27-journey-routes.test.ts）。
    // R20a の todo/page・calendar/external-events と R18b の app/version は live。
    // R18c rights capability is live, but without a configured runtime these routes still fail closed at 503.
    for (const item of CASES.filter((entry) => !entry.file.startsWith("invite-codes") && !entry.file.startsWith("contacts/completion-question") && !entry.file.startsWith("events/assessments") && !entry.file.startsWith("recommendations/events") && !entry.file.startsWith("search/global") && entry.file !== "todo/page" && entry.file !== "calendar/external-events" && entry.file !== "app/version")) {
      const response = await call(item);
      const text = await response.text();
      const body = JSON.parse(text);
      assert.equal(response.status, 503, `${item.method} ${item.file}`);
      if (item.file.startsWith("account/")) {
        assert.equal(body.error.code, "SERVICE_UNAVAILABLE", `${item.method} ${item.file}: ${text}`);
      } else {
        assert.equal(isNotImplemented(body), true, `${item.method} ${item.file}: ${text}`);
        assert.match(body.error.context.capabilityId, /^[a-z0-9-]+$/u);
      }
      assert.doesNotMatch(text, /demo-|sample|渡辺|K7QX/u, `${item.file} leaked a fixture`);
    }
  });
});

test("PUT home layout: a stale revision is a 409; a fresh one bumps the revision; the same mutationId again returns the first answer", async () => {
  redesignMock.reset();
  await withMode("mock", async () => {
    const put = (expectedRevision: number, mutationId: string) => call({ file: "home/layout", method: "PUT", body: { expectedRevision, mutationId, app: DEFAULT_HOME_LAYOUT.app, web: DEFAULT_HOME_LAYOUT.web } });
    const first = await put(3, "m-1");
    assert.equal(homeLayoutSchema.parse((await first.json()).data).revision, 4);
    const replay = await put(3, "m-1");
    assert.equal(replay.status, 200, "a retry after a timeout is not a conflict");
    assert.equal(homeLayoutSchema.parse((await replay.json()).data).revision, 4);
    const stale = await put(3, "m-2");
    assert.equal(stale.status, 409);
    assert.equal((await stale.json()).error.context.currentRevision, "4");
  });
  redesignMock.reset();
});

test("the mock keeps what it was told: revoke stops the code, PATCH persists, idempotency keys replay, exports stay consistent", async () => {
  redesignMock.reset();
  await withMode("mock", async () => {
    const code = { code: "K7QX-2M9P" };
    await call({ file: "invite-codes/[code]/revoke", method: "POST", params: code });
    assert.equal((await call({ file: "invite-codes/[code]/preview", method: "GET", params: code })).status, 404);
    assert.equal((await call({ file: "invite-codes/[code]/redeem", method: "POST", params: code, body: { sharedKeys: [], ...key } })).status, 404);
    assert.equal((await (await call({ file: "invite-codes/current", method: "GET" })).json()).data, null);

    const id = { id: "demo-assessment-saas-summit" };
    await call({ file: "events/assessments/[id]", method: "PATCH", params: id, body: { facts: { price: "3,000円" } } });
    assert.equal((await (await call({ file: "events/assessments/[id]", method: "GET", params: id })).json()).data.facts.price, "3,000円");
    const create = () => call({ file: "events/assessments", method: "POST", body: { sourceKind: "poster", posterAssetId: "asset-1", idempotencyKey: "same" } });
    assert.equal((await (await create()).json()).data.id, (await (await create()).json()).data.id);

    const exported = (await (await call({ file: "account/exports", method: "POST", body: { scope: ["tasks"], idempotencyKey: "e-1" } })).json()).data;
    const fetched = (await (await call({ file: "account/exports/[id]", method: "GET", params: { id: exported.id } })).json()).data;
    assert.deepEqual([fetched.id, fetched.status, fetched.scope], [exported.id, "queued", ["tasks"]]);
    assert.notEqual(exported.id, "demo-export-1");

    assert.equal((await call({ file: "recommendations/events/[id]/dismiss", method: "POST", params: { id: "no-such-event" }, body: { reason: "known", ...key } })).status, 404);
  });
  redesignMock.reset();
});

test("an assessment needs the input its source kind names", async () => {
  await withMode("mock", async () => {
    const bad = await call({ file: "events/assessments", method: "POST", body: { sourceKind: "url", ...key } });
    assert.equal(bad.status, 400, "a url assessment without a url");
    const poster = await call({ file: "events/assessments", method: "POST", body: { sourceKind: "poster", url: "https://example.com", ...key } });
    assert.equal(poster.status, 400, "a poster needs posterAssetId, not url");
  });
});

test("ORBIT_REDESIGN_MOCK turns the demo world on per contract outside production only", async () => {
  const previous = { mock: process.env.ORBIT_REDESIGN_MOCK, env: process.env.NODE_ENV };
  try {
    process.env.ORBIT_REDESIGN_MOCK = "home-layout";
    await withMode("live", async () => {
      assert.equal((await call({ file: "home/layout", method: "GET" })).status, 200);
      assert.equal((await call({ file: "account/exports", method: "GET" })).status, 503, "contracts not listed stay live");
      (process.env as Record<string, string>).NODE_ENV = "production";
      assert.equal((await call({ file: "home/layout", method: "GET" })).status, 503, "production ignores the switch");
    });
  } finally {
    if (previous.mock === undefined) delete process.env.ORBIT_REDESIGN_MOCK; else process.env.ORBIT_REDESIGN_MOCK = previous.mock;
    (process.env as Record<string, string | undefined>).NODE_ENV = previous.env;
  }
});

test("a response that fails its own schema is a 500 in the envelope, never sent", async () => {
  const route = redesignContractRoute("home-layout", homeLayoutSchema, () => ({ data: { revision: -1, app: [], web: [] } }));
  await withMode("mock", async () => {
    const response = await route(new Request("http://localhost/api/home/layout"));
    assert.equal(response.status, 500);
    const body = await response.json();
    assert.deepEqual([body.success, body.error.code], [false, "INTERNAL_ERROR"]);
    assert.doesNotMatch(JSON.stringify(body), /revision/u);
  });
});

test("bad bodies are 400s and unknown ids are 404s, still in the envelope", async () => {
  await withMode("mock", async () => {
    const bad = await call({ file: "recommendations/events/[id]/dismiss", method: "POST", params: { id: "x" }, body: { reason: "boring", ...key } });
    assert.equal(bad.status, 400);
    const missing = await call({ file: "invite-codes/[code]/preview", method: "GET", params: { code: "NOPE-NOPE" } });
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).success, false);
  });
});

test("the invite preview and the App version are the only new routes open before sign-in", () => {
  const proxy = readFileSync("proxy.ts", "utf8");
  assert.match(proxy, /\\\/api\\\/invite-codes\\\/\[\^\/\]\+\\\/preview\$/u);
  assert.match(proxy, /pathname === "\/api\/app\/version"/u);
  assert.doesNotMatch(proxy, /\/api\/(home\/layout|account\/exports|account\/deletion-request|events\/assessments)/u);
});

// ── R15（DESIGN §4.2 mock）：兑换真实计数、过期 / 上限 / 作废、重复兑换不占用量、历史、连接与解除。
const redeem = (code: string, body: unknown = { sharedKeys: ["organization"], idempotencyKey: `r-${Math.random()}` }) =>
  call({ file: "invite-codes/[code]/redeem", method: "POST", params: { code }, body });
const preview = async (code: string) => {
  const response = await call({ file: "invite-codes/[code]/preview", method: "GET", params: { code } });
  return { status: response.status, body: await response.json() };
};

test("R15 mock redeem: needs the body, counts one use, the same person again is already_connected and costs nothing", async () => {
  redesignMock.reset();
  await withMode("mock", async () => {
    assert.equal((await call({ file: "invite-codes/[code]/redeem", method: "POST", params: { code: "H8MW-4QZT" } })).status, 400, "no body");
    assert.equal((await redeem("H8MW-4QZT", { sharedKeys: ["displayName"], idempotencyKey: "x" })).status, 400, "unknown key");
    assert.equal((await redeem("H8MW-4QZT", { sharedKeys: [], idempotencyKey: "x", shared: { email: "a@example.com" } })).status, 400, "values are never sent");
    const before = redesignMock.invitePeerUsage("H8MW-4QZT");
    const first = await (await redeem("H8MW-4QZT", { sharedKeys: ["organization"], idempotencyKey: "same" })).json();
    assert.deepEqual([first.data.outcome, first.data.contactId], ["connected", "demo-person-matsui"]);
    assert.equal(first.data.peer.email, "matsui@example.com", "contact details arrive once connected");
    assert.equal(redesignMock.invitePeerUsage("H8MW-4QZT"), before + 1);
    const replay = await (await redeem("H8MW-4QZT", { sharedKeys: ["organization"], idempotencyKey: "same" })).json();
    assert.equal(replay.data.outcome, "connected", "a retry gives the first answer");
    const again = await (await redeem("h8mw4qzt")).json();
    assert.equal(again.data.outcome, "already_connected", "lower case without the hyphen is the same code");
    assert.equal(redesignMock.invitePeerUsage("H8MW-4QZT"), before + 1, "already_connected costs no use");
    const view = await (await call({ file: "invite-codes/connections/[contactId]", method: "GET", params: { contactId: "demo-person-matsui" } })).json();
    assert.deepEqual(view.data.sharedByMe, ["organization"]);
    assert.equal((await preview("H8MW-4QZT")).body.data.inviterAlreadyConnected, true);
  });
  redesignMock.reset();
});

test("R15 mock: already connected from the start; unlink keeps or removes; after unlink the code connects again", async () => {
  redesignMock.reset();
  await withMode("mock", async () => {
    const usage = redesignMock.invitePeerUsage("R4VN-8HTC");
    assert.equal((await preview("R4VN-8HTC")).body.data.inviterAlreadyConnected, true);
    assert.equal((await (await redeem("R4VN-8HTC")).json()).data.outcome, "already_connected");
    assert.equal(redesignMock.invitePeerUsage("R4VN-8HTC"), usage);
    const unlink = (keepAsContact: boolean, idempotencyKey: string) =>
      call({ file: "invite-codes/connections/[contactId]/unlink", method: "POST", params: { contactId: "demo-person-takahashi" }, body: { keepAsContact, idempotencyKey } });
    const kept = await (await unlink(true, "u-1")).json();
    assert.deepEqual(kept.data, { outcome: "unlinked", keptContactId: "demo-person-takahashi" });
    assert.deepEqual((await (await unlink(true, "u-1")).json()).data, kept.data, "a retry gives the first answer");
    assert.equal((await unlink(true, "u-2")).status, 404, "nothing left to unlink");
    assert.equal((await call({ file: "invite-codes/connections/[contactId]", method: "GET", params: { contactId: "demo-person-takahashi" } })).status, 404);
    assert.equal((await (await redeem("R4VN-8HTC")).json()).data.outcome, "connected", "a new connection after unlinking");
    assert.equal(redesignMock.invitePeerUsage("R4VN-8HTC"), usage + 1);
  });
  redesignMock.reset();
});

test("R15 review S1 mock: a merge suggestion is only resolved by the owner — merge moves the link to the existing card, dismiss just drops it", async () => {
  redesignMock.reset();
  await withMode("mock", async () => {
    const view = async (contactId: string) => call({ file: "invite-codes/connections/[contactId]", method: "GET", params: { contactId } });
    const resolve = (action: "merge" | "merge/dismiss", contactId: string, idempotencyKey: string) =>
      call({ file: `invite-codes/connections/[contactId]/${action}`, method: "POST", params: { contactId }, body: { idempotencyKey } });
    const suggestion = { contactId: "demo-person-watanabe", displayName: "渡辺", matchedOn: ["name_organization" as const] };
    redesignMock.setInviteMergeSuggestion("demo-person-takahashi", suggestion);
    assert.deepEqual((await (await view("demo-person-takahashi")).json()).data.mergeSuggestion, suggestion);
    const merged = await (await resolve("merge", "demo-person-takahashi", "m-1")).json();
    assert.equal(merged.data.contactId, "demo-person-watanabe");
    assert.equal(merged.data.mergeSuggestion, undefined);
    assert.deepEqual((await (await resolve("merge", "demo-person-takahashi", "m-1")).json()).data, merged.data, "a retry gives the first answer");
    assert.equal((await view("demo-person-takahashi")).status, 404);
    assert.equal((await resolve("merge", "demo-person-watanabe", "m-2")).status, 404, "nothing left to merge");
    redesignMock.setInviteMergeSuggestion("demo-person-watanabe", suggestion);
    const dismissed = await (await resolve("merge/dismiss", "demo-person-watanabe", "d-1")).json();
    assert.deepEqual([dismissed.data.contactId, dismissed.data.mergeSuggestion], ["demo-person-watanabe", undefined]);
    assert.equal((await resolve("merge/dismiss", "demo-person-watanabe", "d-2")).status, 200, "dismissing again is harmless");
    assert.equal((await resolve("merge/dismiss", "demo-person-okada", "d-3")).status, 404, "not an invite connection");
    assert.equal((await call({ file: "invite-codes/connections/[contactId]/merge", method: "POST", params: { contactId: "demo-person-watanabe" }, body: {} })).status, 400, "the key is required");
  });
  redesignMock.reset();
});

test("R15 mock: own code is 409 OWN_CODE; unknown, bad format, revoked and superseded are one 404 INVITE_UNAVAILABLE", async () => {
  redesignMock.reset();
  await withMode("mock", async () => {
    const own = await preview("K7QX-2M9P");
    assert.deepEqual([own.body.data.isOwnCode, own.body.data.status], [true, "active"]);
    assert.equal("email" in own.body.data.shared || "phone" in own.body.data.shared, false, "a preview never carries contact details");
    const ownRedeem = await redeem("K7QX-2M9P");
    assert.equal(ownRedeem.status, 409);
    assert.equal((await ownRedeem.json()).error.context.reason, "OWN_CODE");
    const texts: string[] = [];
    for (const code of ["ZZZZ-ZZZZ", "K7QX-2M0P", "nope", "P9KD-3RXF"]) {
      const response = await call({ file: "invite-codes/[code]/preview", method: "GET", params: { code } });
      assert.equal(response.status, 404, code);
      texts.push(await response.text());
    }
    assert.equal(new Set(texts).size, 1, "the 404s cannot be told apart");
    assert.equal(JSON.parse(texts[0]).error.context.reason, "INVITE_UNAVAILABLE");
  });
  redesignMock.reset();
});

test("R15 mock: expired within 30 days previews as expired and refuses to connect; older is unavailable; full refuses", async () => {
  redesignMock.reset();
  await withMode("mock", async () => {
    redesignMock.setInviteClock("2026-10-15T09:00:00+09:00");
    assert.equal((await preview("H8MW-4QZT")).body.data.status, "expired");
    const expired = await redeem("H8MW-4QZT");
    assert.deepEqual([expired.status, (await expired.json()).error.context.reason], [409, "INVITE_EXPIRED"]);
    assert.equal((await (await call({ file: "invite-codes/current", method: "GET" })).json()).data, null, "an expired code is not current");
    redesignMock.setInviteClock("2026-11-14T18:00:01+09:00");
    assert.equal((await preview("H8MW-4QZT")).status, 404, "more than 30 days after it expired");
    redesignMock.setInviteClock(null);
    redesignMock.setInvitePeerUsage("H8MW-4QZT", 10);
    assert.equal((await preview("H8MW-4QZT")).body.data.status, "full");
    const full = await redeem("H8MW-4QZT");
    assert.deepEqual([full.status, (await full.json()).error.context.reason], [409, "INVITE_FULL"]);
  });
  redesignMock.reset();
});

test("R15 mock: a new code supersedes the old one; history lists every code with its status and who joined", async () => {
  redesignMock.reset();
  await withMode("mock", async () => {
    const history = async () => (await (await call({ file: "invite-codes", method: "GET" })).json()).data.items as { code: string; status: string; joined: { contactId: string }[] }[];
    const before = await history();
    assert.deepEqual(before.map((item) => [item.code, item.status]), [["K7QX-2M9P", "active"], ["P9KD-3RXF", "superseded"], ["M3TB-6WQA", "expired"]]);
    assert.deepEqual(before[2].joined.map((person) => person.contactId), ["demo-person-takahashi"]);
    const created = await (await call({ file: "invite-codes", method: "POST", body: { shared: { displayName: "x", email: "spoof@example.com" }, maxUses: 3, sharedKeys: ["organization"], idempotencyKey: "c-1" } })).json();
    assert.notEqual(created.data.code, "K7QX-2M9P");
    assert.equal(created.data.shared.displayName, "Orbit デモ", "values come from my profile, not the request");
    assert.equal(created.data.shared.email, undefined, "only the keys I chose");
    assert.equal(created.data.shared.offering, undefined);
    assert.equal(Date.parse(created.data.expiresAt) - Date.parse(created.data.createdAt), 7 * 86_400_000, "valid for 7 days");
    assert.equal(created.data.usedCount, 0);
    const after = await history();
    assert.deepEqual(after.slice(0, 2).map((item) => [item.code, item.status]), [[created.data.code, "active"], ["K7QX-2M9P", "superseded"]]);
    assert.equal((await preview("K7QX-2M9P")).status, 404, "a superseded code is unavailable");
    const defaults = await (await call({ file: "invite-codes", method: "POST", body: { shared: { displayName: "x" }, maxUses: 3, idempotencyKey: "c-2" } })).json();
    assert.deepEqual([Boolean(defaults.data.shared.organization), Boolean(defaults.data.shared.offering), defaults.data.shared.email], [true, true, undefined], "default keys: organization, offering, seeking");
  });
  redesignMock.reset();
});

test("R15 mock: share update changes what I share; unknown contact is 404; bad bodies are 400", async () => {
  redesignMock.reset();
  await withMode("mock", async () => {
    const put = (contactId: string, body: unknown) => call({ file: "invite-codes/connections/[contactId]/share", method: "PUT", params: { contactId }, body });
    const updated = await (await put("demo-person-takahashi", { sharedKeys: ["organization", "email"], idempotencyKey: "s-1" })).json();
    assert.deepEqual(updated.data.sharedByMe, ["organization", "email"]);
    assert.equal((await put("demo-person-watanabe", { sharedKeys: [], idempotencyKey: "s-2" })).status, 404, "not an invite connection");
    assert.equal((await put("demo-person-takahashi", { sharedKeys: ["email", "email"], idempotencyKey: "s-3" })).status, 400);
    assert.equal((await call({ file: "invite-codes/connections/[contactId]/unlink", method: "POST", params: { contactId: "demo-person-takahashi" }, body: { idempotencyKey: "u" } })).status, 400);
  });
  redesignMock.reset();
});

// R15 P1 复核 m3：发码后改了共享项目，用同一个键重放发码拿到的是这张码现在的样子（与 GET /current 一致），不是旧快照。
test("R15 P1 mock: replaying the create key after a share change returns the code as it is now", async () => {
  redesignMock.reset();
  await withMode("mock", async () => {
    const create = () => call({ file: "invite-codes", method: "POST", body: { shared: { displayName: "x" }, maxUses: 3, sharedKeys: ["organization"], idempotencyKey: "c-replay" } });
    const created = (await (await create()).json()).data;
    const changed = (await (await call({ file: "invite-codes/current/share", method: "PUT", body: { sharedKeys: ["seeking"], idempotencyKey: "cs-replay" } })).json()).data;
    assert.equal(changed.code, created.code);
    const replayed = (await (await create()).json()).data;
    assert.deepEqual(replayed, changed, "the replay shows the current shared values");
    assert.deepEqual((await (await call({ file: "invite-codes/current", method: "GET" })).json()).data, changed);
  });
  redesignMock.reset();
});

test("R15 P1 mock: PUT /current/share changes what the current code shares; the code stays; previews follow; no current code is 404", async () => {
  redesignMock.reset();
  await withMode("mock", async () => {
    const put = (body: unknown) => call({ file: "invite-codes/current/share", method: "PUT", body });
    const current = (await (await call({ file: "invite-codes/current", method: "GET" })).json()).data;
    const updated = await put({ sharedKeys: ["seeking", "email"], idempotencyKey: "cs-1" });
    assert.equal(updated.status, 200);
    const body = (await updated.json()).data;
    const { shared, ...rest } = body;
    const { shared: _before, ...sameCode } = current;
    assert.deepEqual(rest, sameCode, "code, link, expiry and uses do not change");
    assert.deepEqual(shared, { displayName: "Orbit デモ", seeking: ["シリーズA の投資家"], email: "demo@example.com" });
    assert.deepEqual((await (await call({ file: "invite-codes/current", method: "GET" })).json()).data, body);
    assert.deepEqual((await (await put({ sharedKeys: ["seeking", "email"], idempotencyKey: "cs-1" })).json()).data, body, "the same body again → the same result");
    // 复核 m2：与 live 同一个 PUT 语义——同一个键换了内容就按新内容改（不重放旧结果）。
    const reused = (await (await put({ sharedKeys: ["organization"], idempotencyKey: "cs-1" })).json()).data;
    assert.ok(reused.shared.organization && !reused.shared.seeking && !reused.shared.email, "the new content is applied");
    assert.deepEqual((await put({ sharedKeys: ["seeking", "email"], idempotencyKey: "cs-1" })).status, 200);
    assert.deepEqual((await preview("K7QX-2M9P")).body.data.shared, { displayName: "Orbit デモ", seeking: ["シリーズA の投資家"] }, "the preview follows, never with contacts");
    assert.equal((await put({ sharedKeys: ["email", "email"], idempotencyKey: "cs-2" })).status, 400);
    assert.equal((await put({ sharedKeys: [], idempotencyKey: "cs-2", shared: { displayName: "x" } })).status, 400, "strict body");
    await call({ file: "invite-codes/[code]/revoke", method: "POST", params: { code: "K7QX-2M9P" } });
    assert.equal((await put({ sharedKeys: [], idempotencyKey: "cs-3" })).status, 404, "no current code");
    assert.equal((await put({ sharedKeys: ["seeking", "email"], idempotencyKey: "cs-1" })).status, 404, "an old key does not replay once the code is gone (same as live)");
  });
  redesignMock.reset();
});
