/**
 * W0027：活动详情页 `/app/events/[id]` 按账号 id（canonical actor id）判定已报名、名单、
 * 主办方入口、活动角色与私密访问。
 *
 * 写入口径（报名、建活动、活动角色分配）都是 `actor.id`；Auth.js 会话 id（这里是 `profile:a`）
 * 与账号 id（`account:a`）不同时，详情页必须先把会话解析成账号，再用账号 id 判定。
 *
 * 写法：
 *   - 页面依赖用 require.cache 替换（同 W0024 的 `app-events-registration-actor-id.test.tsx`）；
 *   - 账号解析用真实 `resolveAuthenticatedApiActorIdentity` + 账号会话图夹具
 *     （同 `app-event-registration-account-scope.test.tsx`，`profile:a` → `account:a`）；
 *   - `resolveConfiguredCanonicalEventDetailView` 换成「真实 `resolveCanonicalEventDetailView`
 *     + 依赖替身」，所有带 actor 参数的读取都记进同一份调用日志；
 *   - 页面元素用 renderToStaticMarkup 渲染成 HTML 断言可见结果（真实 EventDetail）。
 */
import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { LiveAccountSessionGraph } from "../../features/account/storage/account-live-record-provider";
import type { PublishedCanonicalEvent } from "../../features/events/core/contract";

const root = join(fileURLToPath(import.meta.url), "../../..");
const testRequire = createRequire(import.meta.url);

const SESSION_ID = "profile:a";
const ACCOUNT_ID = "account:a";
const EVENT_ID = "event:canonical:w0027";
const PUBLIC_CODE = "EVT-W0027";

const graph: LiveAccountSessionGraph = {
  accounts: [
    { createdAt: "2026-07-28T00:00:00.000Z", id: ACCOUNT_ID, name: "Account A", updatedAt: "2026-07-28T00:00:00.000Z" },
  ],
  evidenceIds: ["evidence:account-membership"],
  generatedAt: "2026-07-28T00:00:00.000Z",
  profiles: [
    {
      accountId: ACCOUNT_ID,
      createdAt: "2026-07-28T00:00:00.000Z",
      displayName: "Actor A",
      id: SESSION_ID,
      updatedAt: "2026-07-28T00:00:00.000Z",
    },
  ],
};

const actualActorModule = testRequire(
  join(root, "app/api/_shared/authenticated-actor.ts"),
) as typeof import("../../app/api/_shared/authenticated-actor");
const actualDetailViewModule = testRequire(
  join(root, "app/(app)/app/canonical-event-detail-view.ts"),
) as typeof import("../../app/(app)/app/canonical-event-detail-view");

type Grant = { owner: boolean; role: "operations" | "reviewer" | null; state: "active" | "revoked" | null };

interface Scenario {
  /** 会话是否存在；false 表示未登录。 */
  signedIn?: boolean;
  /** 账号解析结果：graph 走真实解析；null 返回 null；throw 抛错。 */
  actorResolution?: "graph" | "null" | "throw";
  /** 公开活动（有 publicCode）或私密活动。 */
  visibility?: "public" | "private";
  organizerActorId?: string;
  /** 报名记在哪个 id 下（不设表示没有报名）。 */
  registeredUnder?: string;
  /** 活动角色按 subjectActorId 授予。 */
  grants?: Record<string, Grant>;
  /** 公开目录按 routeId 查不到，只能走账号作用域回退查找。 */
  accountScopedRoute?: boolean;
}

function canonicalEvent(scenario: Scenario): PublishedCanonicalEvent {
  return {
    archivedAt: null,
    cancelledAt: null,
    description: "W0027 actor id fixture",
    endsAt: "2099-03-14T12:30:00.000Z",
    eventId: EVENT_ID,
    eventVersion: 1,
    lifecycleState: "published",
    organizerActorId: scenario.organizerActorId ?? "actor:someone-else",
    phase: "upcoming",
    publicCode: scenario.visibility === "private" ? null : PUBLIC_CODE,
    sourcePayload: { evidenceIds: ["evidence:w0027"] },
    startsAt: "2099-03-14T09:30:00.000Z",
    timezone: "Asia/Tokyo",
    title: "W0027 detail fixture",
    venue: "Tokyo",
    workspaceId: "workspace:w0027",
  };
}

class TestRedirect extends Error {
  constructor(readonly href: string) {
    super(`redirect:${href}`);
  }
}

function loadPage(t: TestContext, scenario: Scenario) {
  const calls: string[] = [];
  /** 所有以 actor 为参数的读取：[读取名, actorId]。 */
  const actorReads: Array<[string, string]> = [];
  const detailViewInputs: Array<{ actorId?: string | null; routeId: string }> = [];
  const signedIn = scenario.signedIn ?? true;
  const actorResolution = scenario.actorResolution ?? "graph";
  const event = canonicalEvent(scenario);

  const dependencies = (): import("../../app/(app)/app/canonical-event-detail-view").CanonicalEventDetailDependencies => ({
    accessService: {
      async get(query: unknown) {
        const { eventId, subjectActorId } = query as { eventId: string; subjectActorId: string };
        actorReads.push(["access", subjectActorId]);
        calls.push(`access:${subjectActorId}`);
        const grant = scenario.grants?.[subjectActorId];
        return {
          eventId,
          owner: grant?.owner ?? false,
          revision: 1,
          role: grant?.role ?? null,
          state: grant?.state ?? null,
          subjectActorId,
        };
      },
      async grant() { throw new Error("not used"); },
      async revoke() { throw new Error("not used"); },
    } as unknown as import("../../features/events/event-access/service").EventAccessService,
    coreService: {
      async getEvent() { return event; },
      async getPublishedEvent(routeId: string) {
        calls.push(`core:${routeId}`);
        if (scenario.accountScopedRoute) return routeId === EVENT_ID ? event : null;
        return routeId === EVENT_ID || routeId === PUBLIC_CODE ? event : null;
      },
      async listEvents() { return [event]; },
      async listPublishedEvents() { return [event]; },
    } as unknown as import("../../features/events/core/service").EventCoreService,
    now: new Date("2030-01-01T00:00:00.000Z"),
    async readOperationsSummary(eventId: string) {
      return { activeRegistrationCount: 2, attendeeResultsAvailable: true, eventId, hasPublishedResults: false };
    },
    async readRegistrationAvailability() { return "open"; },
    async readRegisteredContext({ actorId, eventId }: { actorId: string; eventId: string }) {
      actorReads.push(["registered", actorId]);
      calls.push(`registered:${actorId}`);
      return scenario.registeredUnder === actorId
        ? {
            attendees: [
              { displayName: "Aiko Mori", organization: "Kisetsu Capital", role: "Investor" },
              { displayName: "Luis Ortega", organization: "TraceGrid", role: "Founder" },
            ],
            eventId,
          }
        : null;
    },
    async resolveActorEventCanonicalId({ actorId, eventId }: { actorId: string; eventId: string }) {
      actorReads.push(["accountScopedLookup", actorId]);
      calls.push(`accountScopedLookup:${actorId}`);
      return eventId === `${actorId}:${EVENT_ID}` ? EVENT_ID : null;
    },
  });

  const modules: Record<string, unknown> = {
    "next/navigation": {
      redirect: (href: string) => {
        calls.push(`redirect:${href}`);
        throw new TestRedirect(href);
      },
    },
    [join(root, "auth.ts")]: {
      auth: async () =>
        signedIn ? { user: { email: "actor-a@example.test", id: SESSION_ID, name: "Actor A" } } : null,
    },
    [join(root, "app/api/_shared/authenticated-actor.ts")]: {
      ...actualActorModule,
      resolveAuthenticatedApiActorFromSession: async (session: {
        email?: string | null;
        name?: string | null;
        userId: string;
      }) => {
        calls.push(`actor:${session.userId}`);
        if (actorResolution === "throw") throw new Error("account session graph unavailable");
        if (actorResolution === "null") return null;
        return actualActorModule.resolveAuthenticatedApiActorIdentity({
          graph,
          mode: "live",
          session,
          workspaceId: "workspace:w0027",
        });
      },
    },
    [join(root, "app/(app)/app/canonical-event-detail-view.ts")]: {
      ...actualDetailViewModule,
      resolveConfiguredCanonicalEventDetailView: async (input: { actorId?: string | null; routeId: string }) => {
        detailViewInputs.push(input);
        calls.push(`detail:${input.actorId ?? "-"}`);
        return actualDetailViewModule.resolveCanonicalEventDetailView(input, dependencies());
      },
    },
    [join(root, "app/(app)/app/orbit-language-server.ts")]: {
      getOrbitServerLanguage: async () => "zh",
      localizeOrbitTree: (tree: unknown) => tree,
    },
    [join(root, "app/(app)/app/orbit-public-shell.tsx")]: { PublicTopNav: () => null },
    [join(root, "app/(app)/app/orbit-reference-styles.tsx")]: { OrbitReferenceStyles: () => null },
    [join(root, "app/(app)/app/orbit-visual-freeze-runtime.tsx")]: { OrbitVisualFreezeRuntime: () => null },
  };
  const pagePath = join(root, "app/(app)/app/events/[id]/page.tsx");
  const ids = [...Object.keys(modules), pagePath].map((id) => testRequire.resolve(id));
  const before = new Map(ids.map((id) => [id, testRequire.cache[id]]));
  t.after(() => {
    for (const [id, previous] of before) {
      if (previous) testRequire.cache[id] = previous;
      else delete testRequire.cache[id];
    }
  });
  for (const [id, exports] of Object.entries(modules)) {
    const resolved = testRequire.resolve(id);
    const replacement = new Module(resolved);
    replacement.filename = resolved;
    replacement.loaded = true;
    replacement.exports = exports;
    testRequire.cache[resolved] = replacement;
  }
  delete testRequire.cache[testRequire.resolve(pagePath)];
  const page = testRequire(pagePath).default as (props: {
    params: Promise<{ id: string }>;
    searchParams?: Promise<Record<string, string>>;
  }) => Promise<ReactElement>;

  return {
    actorReads,
    calls,
    detailViewInputs,
    open: (routeId: string = scenario.visibility === "private" ? EVENT_ID : PUBLIC_CODE) =>
      page({ params: Promise.resolve({ id: routeId }), searchParams: Promise.resolve({}) }),
  };
}

/** 从页面元素树里取 EventDetail 的 props（页面接线）。 */
function eventDetailProps(element: ReactElement): {
  canOpenOperations: boolean;
  event: { youRsvped: boolean; stats: { attendees: Array<{ name: string }>; authed: boolean; youRsvped: boolean } };
} {
  const nodes: unknown[] = [element];
  while (nodes.length) {
    const node = nodes.pop() as { props?: Record<string, unknown>; type?: unknown } | null;
    if (!node || typeof node !== "object") continue;
    if (typeof node.type === "function" && (node.type as { name?: string }).name === "EventDetail") {
      return node.props as ReturnType<typeof eventDetailProps>;
    }
    const children = node.props?.children;
    nodes.push(...(Array.isArray(children) ? children : [children]));
  }
  assert.fail("EventDetail was not rendered");
}

const ORGANIZER_CONSOLE = /主办方后台 →|Organizer console →/;

function assertNoSessionIdReads(loaded: ReturnType<typeof loadPage>) {
  assert.deepEqual(
    loaded.actorReads.filter(([, actorId]) => actorId !== ACCOUNT_ID),
    [],
    "every actor-scoped read uses the account id",
  );
  assert.ok(
    loaded.detailViewInputs.every((input) => input.actorId !== SESSION_ID),
    "the session id is never passed to the detail resolver",
  );
}

// ── SC-W0027-01：已报名、名单、账号作用域回退 ──────────────────────────────

test("SC-01 a registration under the account id shows registered and discloses the roster", async (t) => {
  const loaded = loadPage(t, { registeredUnder: ACCOUNT_ID });
  const element = await loaded.open();

  assert.deepEqual(loaded.detailViewInputs, [{ actorId: ACCOUNT_ID, routeId: PUBLIC_CODE }]);
  const props = eventDetailProps(element);
  assert.equal(props.event.youRsvped, true);
  assert.equal(props.event.stats.youRsvped, true);
  assert.equal(props.event.stats.authed, true);
  assert.deepEqual(props.event.stats.attendees.map((attendee) => attendee.name), ["Aiko Mori", "Luis Ortega"]);
  assertNoSessionIdReads(loaded);
  // 名单随 EventDetail 的 props 下发到客户端组件；上面的 props 断言就是下发内容本身。
  assert.match(renderToStaticMarkup(element), /data-event-journey-state="joined"/);
});

test("SC-01 a registration kept only under the session id is treated as not registered", async (t) => {
  const loaded = loadPage(t, { registeredUnder: SESSION_ID });
  const element = await loaded.open();

  const props = eventDetailProps(element);
  assert.equal(props.event.youRsvped, false);
  assert.equal(props.event.stats.youRsvped, false);
  assert.deepEqual(props.event.stats.attendees, []);
  assertNoSessionIdReads(loaded);
  assert.doesNotMatch(renderToStaticMarkup(element), /data-event-journey-state="joined"|Aiko Mori/);
});

test("SC-01 the account-scoped fallback lookup uses the account id", async (t) => {
  const accountRoute = `${ACCOUNT_ID}:${EVENT_ID}`;
  const loaded = loadPage(t, { accountScopedRoute: true, registeredUnder: ACCOUNT_ID });
  const element = await loaded.open(accountRoute);

  assert.deepEqual(loaded.calls.filter((call) => call.startsWith("accountScopedLookup:")), [
    `accountScopedLookup:${ACCOUNT_ID}`,
  ]);
  assert.equal(eventDetailProps(element).event.youRsvped, true);
  assertNoSessionIdReads(loaded);

  // 会话 id 形式的账号作用域路由不会被当成本人的活动。
  const sessionRoute = loadPage(t, { accountScopedRoute: true, registeredUnder: ACCOUNT_ID });
  const notFound = renderToStaticMarkup(await sessionRoute.open(`${SESSION_ID}:${EVENT_ID}`));
  assert.match(notFound, /event-core-event-not-found/);
  assertNoSessionIdReads(sessionRoute);
});

// ── SC-W0027-02：主办方、活动角色、私密访问 ──────────────────────────────

test("SC-02 the organizer account sees the organizer console and can open the private event", async (t) => {
  const publicPage = loadPage(t, { organizerActorId: ACCOUNT_ID });
  const publicElement = await publicPage.open();
  assert.equal(eventDetailProps(publicElement).canOpenOperations, true);
  assert.match(renderToStaticMarkup(publicElement), ORGANIZER_CONSOLE);
  assertNoSessionIdReads(publicPage);

  const privatePage = loadPage(t, { organizerActorId: ACCOUNT_ID, visibility: "private" });
  const privateElement = await privatePage.open();
  assert.equal(eventDetailProps(privateElement).canOpenOperations, true);
  assert.deepEqual(eventDetailProps(privateElement).event.stats.attendees, []);
  assertNoSessionIdReads(privatePage);
});

test("SC-02 an active event role granted to the account opens the private event", async (t) => {
  const loaded = loadPage(t, {
    grants: { [ACCOUNT_ID]: { owner: false, role: "reviewer", state: "active" } },
    visibility: "private",
  });
  const element = await loaded.open();

  assert.equal(eventDetailProps(element).canOpenOperations, true);
  assert.match(renderToStaticMarkup(element), ORGANIZER_CONSOLE);
  assert.deepEqual(loaded.calls.filter((call) => call.startsWith("access:")), [`access:${ACCOUNT_ID}`]);
  assertNoSessionIdReads(loaded);
});

test("SC-02 organizer or event role held only by the session id gives no private access", async (t) => {
  for (const scenario of [
    { organizerActorId: SESSION_ID },
    { grants: { [SESSION_ID]: { owner: true, role: "operations", state: "active" } as Grant } },
  ]) {
    const privatePage = loadPage(t, { ...scenario, visibility: "private" });
    const html = renderToStaticMarkup(await privatePage.open());
    assert.match(html, /event-core-access-denied/);
    assert.doesNotMatch(html, ORGANIZER_CONSOLE);
    assert.ok(!privatePage.calls.some((call) => call.startsWith("redirect:")));
    assertNoSessionIdReads(privatePage);

    const publicPage = loadPage(t, scenario);
    const publicElement = await publicPage.open();
    assert.equal(eventDetailProps(publicElement).canOpenOperations, false);
    assert.doesNotMatch(renderToStaticMarkup(publicElement), ORGANIZER_CONSOLE);
    assertNoSessionIdReads(publicPage);
  }
});

test("SC-02 a registration kept only under the session id does not open a private event", async (t) => {
  const loaded = loadPage(t, { registeredUnder: SESSION_ID, visibility: "private" });
  assert.match(renderToStaticMarkup(await loaded.open()), /event-core-access-denied/);
  assertNoSessionIdReads(loaded);

  const account = loadPage(t, { registeredUnder: ACCOUNT_ID, visibility: "private" });
  const element = await account.open();
  assert.equal(eventDetailProps(element).event.youRsvped, true);
  assert.equal(eventDetailProps(element).canOpenOperations, false);
});

// ── SC-W0027-03：未登录与账号解析失败 ─────────────────────────────────────

test("SC-03 signed-out private event redirects to login without resolving an account", async (t) => {
  const loaded = loadPage(t, { signedIn: false, visibility: "private" });
  await assert.rejects(loaded.open(), (error: unknown) => {
    assert.ok(error instanceof TestRedirect);
    assert.equal(error.href, `/app/account/login?next=${encodeURIComponent(`/app/events/${EVENT_ID}`)}`);
    return true;
  });
  assert.equal(loaded.calls.filter((call) => call.startsWith("actor:")).length, 0);
  assert.deepEqual(loaded.actorReads, []);
});

test("SC-03 signed-out public event renders anonymously as before", async (t) => {
  const loaded = loadPage(t, { organizerActorId: ACCOUNT_ID, registeredUnder: ACCOUNT_ID, signedIn: false });
  const element = await loaded.open();

  assert.deepEqual(loaded.calls, [`detail:-`, `core:${PUBLIC_CODE}`]);
  assert.deepEqual(loaded.detailViewInputs.map((input) => input.actorId ?? null), [null]);
  const props = eventDetailProps(element);
  assert.equal(props.canOpenOperations, false);
  assert.equal(props.event.youRsvped, false);
  assert.equal(props.event.stats.authed, false);
  assert.deepEqual(props.event.stats.attendees, []);
});

for (const failure of ["null", "throw"] as const) {
  test(`SC-03 account resolution ${failure === "null" ? "returning null" : "throwing"} shows unavailable without redirect or session-id reads`, async (t) => {
    for (const visibility of ["public", "private"] as const) {
      const loaded = loadPage(t, {
        actorResolution: failure,
        organizerActorId: SESSION_ID,
        registeredUnder: SESSION_ID,
        visibility,
      });
      const html = renderToStaticMarkup(await loaded.open());

      assert.match(html, /Event detail temporarily unavailable/);
      assert.deepEqual(loaded.calls, [`actor:${SESSION_ID}`], "only the account resolution runs");
      assert.deepEqual(loaded.detailViewInputs, [], "the detail resolver is not called");
      assert.deepEqual(loaded.actorReads, []);
    }
  });
}

// ── SC-W0027-04：账号解析次数 ────────────────────────────────────────────

test("SC-04 a signed-in request resolves the account exactly once, before any detail read", async (t) => {
  const loaded = loadPage(t, {
    grants: { [ACCOUNT_ID]: { owner: false, role: "operations", state: "active" } },
    registeredUnder: ACCOUNT_ID,
    visibility: "private",
  });
  await loaded.open();

  assert.deepEqual(loaded.calls.filter((call) => call.startsWith("actor:")), [`actor:${SESSION_ID}`]);
  assert.equal(loaded.calls[0], `actor:${SESSION_ID}`);
  assert.equal(loaded.calls[1], `detail:${ACCOUNT_ID}`);

  const anonymous = loadPage(t, { signedIn: false });
  await anonymous.open();
  assert.equal(anonymous.calls.filter((call) => call.startsWith("actor:")).length, 0);
});
