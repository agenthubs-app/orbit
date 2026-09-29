/**
 * W0024 SC-01 / SC-02：`/app/events` 按账号 id（canonical actor id）读本人报名。
 *
 * 报名接口以 `actor.id` 写报名（键为 eventId + actorId，见 W0018）。账号 id 与 Auth.js 会话 id
 * 不同时，活动页的「已报名」标记和「我的活动」（scope=registered）必须按账号 id 读。
 *
 * 写法同 `app-agent-registration-actor-id.test.tsx`：页面依赖用 require.cache 替换；
 * `features/events/registration/runtime.ts` 用真实实现，只替换它底下的两条存储：
 *   - legacy 投影（`legacy_unenrolled`）：`listRegistrationsForUser`；
 *   - canonical membership（`enrolled`）：`listCanonicalRegistrationsForUser`。
 * 活动目录视图模型、展示层和 EventsList 用真实实现，渲染成 HTML 断言可见结果。
 *
 * SC-02 的调用顺序与次数用同一份调用日志断言：
 *   目录 read → 账号解析（1 次）→ 本人报名读取（每条存储 1 次，参数是 actor.id）→ 社群读取（同一 actor.id）。
 */
import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test, { type TestContext } from "node:test";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext, SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";

const root = join(fileURLToPath(import.meta.url), "../../..");
const require = createRequire(import.meta.url);

const SESSION_ID = "subject:external";
const ACCOUNT_ID = "account:canonical";
const REGISTERED_EVENT = { id: "event:mixer", name: "Registered Mixer" };
const OTHER_EVENT = { id: "event:other", name: "Other Summit" };

type ReadPath = "legacy" | "canonical";
type Catalogue = "ok" | "unconfigured" | "read-fails";

interface Scenario {
  catalogue?: Catalogue;
  /** 账号解析结果；null 表示解析失败。 */
  actor?: { id: string } | null;
  path: ReadPath;
  /** 报名记在哪个 id 下。 */
  registeredUnder: string;
  signedIn?: boolean;
}

function registration(eventId: string, userId: string) {
  return { eventId, status: "rsvped", userId };
}

function catalogueEvent(event: { id: string; name: string }, startsAt: string) {
  return {
    endsAt: "2099-12-31T11:00:00.000Z",
    evidenceIds: [`evidence:${event.id}`],
    id: event.id,
    location: "Tokyo",
    name: event.name,
    organizerId: "actor:w0024-fixture",
    source: { id: `fixture:${event.id}`, label: "local fixture", type: "manual" },
    startsAt,
  };
}

function loadPage(t: TestContext, scenario: Scenario) {
  const calls: string[] = [];
  const registrationReads: Array<{ path: ReadPath; userId: string }> = [];
  const communityReads: Array<string | null | undefined> = [];
  const noop = async () => undefined;
  const signedIn = scenario.signedIn ?? true;
  const catalogue = scenario.catalogue ?? "ok";
  const actor = scenario.actor === undefined ? { id: ACCOUNT_ID } : scenario.actor;

  const modules: Record<string, unknown> = {
    [join(root, "auth.ts")]: {
      auth: async () =>
        signedIn ? { user: { email: "owner@example.test", id: SESSION_ID, name: "Owner" } } : null,
    },
    [join(root, "app/api/_shared/authenticated-actor.ts")]: {
      resolveAuthenticatedApiActorFromSession: async (session: { userId: string }) => {
        calls.push(`actor:${session.userId}`);
        return actor;
      },
    },
    [join(root, "features/community/service-factory.ts")]: {
      readCommunityJoinedForActor: async ({ actorId }: { actorId: string | null | undefined }) => {
        communityReads.push(actorId);
        calls.push(`community:${actorId ?? "-"}`);
        return false;
      },
    },
    [join(root, "features/events/core/public-catalogue-runtime.ts")]: {
      createConfiguredCanonicalPublicEventCatalogue: () =>
        catalogue === "unconfigured"
          ? null
          : {
              read: async () => {
                calls.push("catalogue:read");
                if (catalogue === "read-fails") throw new Error("catalogue store unavailable");
                return {
                  events: [
                    catalogueEvent(REGISTERED_EVENT, "2099-03-01T09:00:00.000Z"),
                    catalogueEvent(OTHER_EVENT, "2099-01-01T09:00:00.000Z"),
                  ],
                  evidenceSummaries: {},
                  generatedAt: "2026-09-29T00:00:00.000Z",
                  participantCounts: {},
                };
              },
            },
    },
    [join(root, "app/(app)/app/orbit-language-server.ts")]: {
      getOrbitServerLanguage: async () => "zh",
      localizeOrbitTree: (tree: unknown) => tree,
    },
    [join(root, "app/(app)/app/orbit-account-shell.tsx")]: { AccountTopNav: () => null },
    [join(root, "app/(app)/app/orbit-public-shell.tsx")]: { PublicTopNav: () => null },
    [join(root, "app/(app)/app/orbit-reference-styles.tsx")]: { OrbitReferenceStyles: () => null },
    [join(root, "app/(app)/app/orbit-visual-freeze-runtime.tsx")]: { OrbitVisualFreezeRuntime: () => null },
    // 真实 runtime.ts 底下的依赖：
    [join(root, "features/events/registration/deadline-gated-service.ts")]: {
      createDeadlineGatedEventRegistrationService: () => ({}),
      resolveEventRegistrationAvailability: () => "open",
      resolveEventRegistrationWindowState: () => ({ availability: "open" }),
    },
    [join(root, "features/events/registration/service.ts")]: { createEventRegistrationService: () => ({}) },
    [join(root, "features/events/core/runtime.ts")]: {
      createConfiguredEventCoreService: () => ({
        getPublishedEvent: async (eventId: string) => ({ eventId, phase: "upcoming" }),
      }),
    },
    [join(root, "features/events/registration/storage/event-operations-window-provider.ts")]: {
      createConfiguredEventOperationsRegistrationWindowProvider: () => ({
        getEnrollment: async () => ({ state: scenario.path === "legacy" ? "legacy_unenrolled" : "enrolled" }),
      }),
    },
    [join(root, "features/events/registration/storage/live-record-provider.ts")]: {
      createConfiguredEventRegistrationProvider: () => ({
        listRegistrationsForUser: async (userId: string) => {
          registrationReads.push({ path: "legacy", userId });
          calls.push(`registrations:legacy:${userId}`);
          return scenario.path === "legacy" && userId === scenario.registeredUnder
            ? [registration(REGISTERED_EVENT.id, userId)]
            : [];
        },
      }),
    },
    [join(root, "features/events/event-operations/repository.ts")]: {
      createConfiguredEventOperationsRepository: () => ({
        cancelCanonicalRegistration: noop,
        getCanonicalRegistration: noop,
        listCanonicalRegistrations: noop,
        listCanonicalRegistrationsForUser: async (userId: string) => {
          registrationReads.push({ path: "canonical", userId });
          calls.push(`registrations:canonical:${userId}`);
          return scenario.path === "canonical" && userId === scenario.registeredUnder
            ? [registration(REGISTERED_EVENT.id, userId)]
            : [];
        },
        registerCanonicalParticipant: noop,
      }),
    },
  };
  const pagePath = join(root, "app/(app)/app/events/page.tsx");
  const runtimePath = join(root, "features/events/registration/runtime.ts");
  const ids = [...Object.keys(modules), pagePath, runtimePath].map((id) => require.resolve(id));
  const before = new Map(ids.map((id) => [id, require.cache[id]]));
  t.after(() => {
    for (const [id, previous] of before) {
      if (previous) require.cache[id] = previous;
      else delete require.cache[id];
    }
  });
  for (const [id, exports] of Object.entries(modules)) {
    const resolved = require.resolve(id);
    const replacement = new Module(resolved);
    replacement.filename = resolved;
    replacement.loaded = true;
    replacement.exports = exports;
    require.cache[resolved] = replacement;
  }
  delete require.cache[require.resolve(pagePath)];
  delete require.cache[require.resolve(runtimePath)];
  return {
    calls,
    communityReads,
    page: require(pagePath).default as (props: {
      searchParams?: Promise<{ scope?: string }>;
    }) => Promise<ReactElement>,
    registrationReads,
  };
}

function render(element: ReactElement, search: string): string {
  const router = {
    back: () => undefined,
    forward: () => undefined,
    prefetch: async () => undefined,
    push: () => undefined,
    refresh: () => undefined,
    replace: () => undefined,
  };
  return renderToStaticMarkup(
    createElement(
      AppRouterContext.Provider,
      { value: router },
      createElement(
        PathnameContext.Provider,
        { value: "/app/events" },
        createElement(SearchParamsContext.Provider, { value: new URLSearchParams(search) }, element),
      ),
    ),
  );
}

/** 从页面元素树里取 EventsList 的 props（不渲染，直接看接线）。 */
function eventsListProps(element: ReactElement): {
  community: { joined: boolean; signedIn: boolean };
  viewModel: { events: Array<{ id: string; youRsvped: boolean; stats: { youRsvped: boolean } }> };
} {
  const nodes: unknown[] = [element];
  while (nodes.length) {
    const node = nodes.pop() as { props?: Record<string, unknown>; type?: unknown } | null;
    if (!node || typeof node !== "object") continue;
    if (typeof node.type === "function" && (node.type as { name?: string }).name === "EventsList") {
      return node.props as ReturnType<typeof eventsListProps>;
    }
    const children = node.props?.children;
    nodes.push(...(Array.isArray(children) ? children : [children]));
  }
  assert.fail("EventsList was not rendered");
}

function youRsvpedById(element: ReactElement): Record<string, boolean> {
  return Object.fromEntries(
    eventsListProps(element).viewModel.events.map((event) => {
      assert.equal(event.stats.youRsvped, event.youRsvped);
      return [event.id, event.youRsvped];
    }),
  );
}

for (const path of ["legacy", "canonical"] as const) {
  test(`${path} read path: a registration under the account id shows as registered and in scope=registered`, async (t) => {
    const loaded = loadPage(t, { path, registeredUnder: ACCOUNT_ID });
    const element = await loaded.page({ searchParams: Promise.resolve({ scope: "registered" }) });
    assert.deepEqual(youRsvpedById(element), { [OTHER_EVENT.id]: false, [REGISTERED_EVENT.id]: true });

    const html = render(element, "scope=registered");
    assert.match(html, new RegExp(REGISTERED_EVENT.name), "the registered event is listed under 我的活动");
    assert.doesNotMatch(html, new RegExp(OTHER_EVENT.name), "an unregistered event is not listed under 我的活动");
    assert.doesNotMatch(html, /还没有已报名活动/);

    assert.deepEqual(
      [...new Set(loaded.registrationReads.map((read) => read.userId))],
      [ACCOUNT_ID],
      "registrations are read by the account id only",
    );
  });

  test(`${path} read path: a registration kept only under the session user id is not shown`, async (t) => {
    const loaded = loadPage(t, { path, registeredUnder: SESSION_ID });
    const element = await loaded.page({ searchParams: Promise.resolve({ scope: "registered" }) });
    assert.deepEqual(youRsvpedById(element), { [OTHER_EVENT.id]: false, [REGISTERED_EVENT.id]: false });
    const html = render(element, "scope=registered");
    assert.match(html, /还没有已报名活动/);
    assert.doesNotMatch(html, new RegExp(REGISTERED_EVENT.name));
  });
}

test("signed in: catalogue read, then one actor resolution shared by the registration read and the community read", async (t) => {
  const loaded = loadPage(t, { path: "canonical", registeredUnder: ACCOUNT_ID });
  const element = await loaded.page({});
  assert.deepEqual(loaded.calls, [
    "catalogue:read",
    `actor:${SESSION_ID}`,
    `registrations:legacy:${ACCOUNT_ID}`,
    `registrations:canonical:${ACCOUNT_ID}`,
    `community:${ACCOUNT_ID}`,
  ]);
  assert.deepEqual(eventsListProps(element).community, { joined: false, signedIn: true });
});

test("signed out: no actor resolution and no personal registration read", async (t) => {
  const loaded = loadPage(t, { path: "canonical", registeredUnder: ACCOUNT_ID, signedIn: false });
  const element = await loaded.page({});
  assert.deepEqual(loaded.calls, ["catalogue:read", "community:-"]);
  assert.deepEqual(loaded.registrationReads, []);
  assert.deepEqual(youRsvpedById(element), { [OTHER_EVENT.id]: false, [REGISTERED_EVENT.id]: false });
  assert.deepEqual(eventsListProps(element).community, { joined: false, signedIn: false });
});

for (const catalogue of ["unconfigured", "read-fails"] as const) {
  test(`catalogue ${catalogue}: the page throws before resolving the account or reading registrations`, async (t) => {
    const loaded = loadPage(t, { catalogue, path: "canonical", registeredUnder: ACCOUNT_ID });
    await assert.rejects(loaded.page({}));
    assert.deepEqual(loaded.calls, catalogue === "read-fails" ? ["catalogue:read"] : []);
    assert.deepEqual(loaded.registrationReads, []);
  });
}

test("actor resolution returns null: no personal registration read (not even by session id), page still renders", async (t) => {
  const loaded = loadPage(t, { actor: null, path: "canonical", registeredUnder: SESSION_ID });
  const element = await loaded.page({});
  assert.deepEqual(loaded.calls, ["catalogue:read", `actor:${SESSION_ID}`, "community:-"]);
  assert.deepEqual(loaded.registrationReads, []);
  assert.deepEqual(youRsvpedById(element), { [OTHER_EVENT.id]: false, [REGISTERED_EVENT.id]: false });
  assert.deepEqual(eventsListProps(element).community, { joined: false, signedIn: false });
  assert.match(render(element, ""), new RegExp(REGISTERED_EVENT.name));
});
