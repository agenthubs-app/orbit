/**
 * W0018 SC-03：`/app/agent` 按账号 id（canonical actor id）读报名。
 *
 * 报名接口以 `actor.id` 写报名（`app/api/events/[id]/registration/route-handlers.ts`），键为
 * eventId + actorId。账号 id 与 Auth.js 会话 id 不同时，首页「已报名活动」必须按账号 id 读，
 * 否则本人报过的活动显示成未报名。
 *
 * 页面依赖用 require.cache 替换（同 `app-agent-guide-demo-page.test.tsx`）；
 * `features/events/registration/runtime.ts` 用真实实现，只替换它底下的两条存储：
 *   - legacy 投影（活动未接入报名窗口，`legacy_unenrolled`）：读 `listRegistrationsForUser`；
 *   - canonical membership（活动已接入，`enrolled`）：读 `listCanonicalRegistrationsForUser`。
 * 两条路径都只在报名记在账号 id 下时显示已报名；记在会话 id 下的一律不算。
 */
import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test, { type TestContext } from "node:test";
import type { ReactElement } from "react";

const root = join(fileURLToPath(import.meta.url), "../../..");
const require = createRequire(import.meta.url);

const SESSION_ID = "subject:external";
const ACCOUNT_ID = "account:canonical";
const EVENT_ID = "event:mixer";

type ReadPath = "legacy" | "canonical";

interface Scenario {
  path: ReadPath;
  /** 报名记在哪个 id 下。 */
  registeredUnder: string;
}

function registration(userId: string) {
  return { eventId: EVENT_ID, status: "rsvped", userId };
}

function loadPage(t: TestContext, scenario: Scenario) {
  const reads: Array<{ path: ReadPath; userId: string }> = [];
  /** W0028：整行读取（旧方法）被页面调用的记录，应始终为空。 */
  const fullRowCalls: string[] = [];
  const IOrbitShell = (props: Record<string, unknown>) => {
    void props;
    return null;
  };
  const noop = async () => undefined;

  const previousFlag = process.env.ORBIT_GUIDE_DEMO;
  delete process.env.ORBIT_GUIDE_DEMO;

  const modules: Record<string, unknown> = {
    "next/navigation": { redirect: (href: string) => { throw new Error(`redirect:${href}`); } },
    [join(root, "auth.ts")]: { auth: async () => ({ user: { email: "owner@example.test", id: SESSION_ID, name: "Owner" } }) },
    [join(root, "app/api/_shared/authenticated-actor.ts")]: { resolveAuthenticatedApiActorFromSession: async () => ({ id: ACCOUNT_ID }) },
    [join(root, "app/(app)/app/orbit-language-server.ts")]: { getOrbitServerLanguage: async () => "zh", localizeOrbitTree: (tree: unknown) => tree },
    [join(root, "app/(app)/app/orbit-reference-styles.tsx")]: { OrbitReferenceStyles: () => null },
    [join(root, "app/(app)/app/orbit-visual-freeze-runtime.tsx")]: { OrbitVisualFreezeRuntime: () => null },
    [join(root, "app/(app)/app/orbit-event-presentation.ts")]: { presentOrbitEvents: (events: unknown) => events },
    [join(root, "app/(app)/app/agent/iorbit-0918/iorbit-shell.tsx")]: { IOrbitShell },
    [join(root, "app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-route-view-model.ts")]: { loadAppChatRouteViewModel: async () => ({}) },
    [join(root, "app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-view-model-adapter.ts")]: {
      composeOrbitAgentEntryViewModel: () => ({ state: "ready", viewModel: {} }),
    },
    [join(root, "app/(app)/app/home/compose-app-home-from-previously-approved-mock-first-capabilities/home-route-view-model.tsx")]: {
      loadAppHomeRouteViewModel: async () => ({
        home: { account: { relationshipGoal: "" }, events: [{ id: EVENT_ID, stats: {} }] },
        state: "success",
      }),
    },
    [join(root, "app/(app)/app/canonical-event-detail-view.ts")]: { resolveConfiguredActorEventCanonicalIds: async () => ({}) },
    [join(root, "app/(app)/app/_demo/demo-guide-view.ts")]: { readDemoModeViewForActor: async () => null },
    [join(root, "features/guide/progress.ts")]: { readGuideStatusForActor: async () => null },
    [join(root, "features/community/service-factory.ts")]: { readCommunityJoinedForActor: async () => false },
    [join(root, "features/plans/service-factory.ts")]: { resolvePlanService: () => ({ success: false }) },
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
        // W0028：首页走轻量读取（eventId／status）；整行方法只记次数。
        listRegistrationStatusesForUser: async (userId: string) => {
          reads.push({ path: "legacy", userId });
          return scenario.path === "legacy" && userId === scenario.registeredUnder ? [registration(userId)] : [];
        },
        listRegistrationsForUser: async () => {
          fullRowCalls.push("legacy:listRegistrationsForUser");
          return [];
        },
      }),
    },
    [join(root, "features/events/event-operations/repository.ts")]: {
      createConfiguredEventOperationsRepository: () => ({
        cancelCanonicalRegistration: noop,
        getCanonicalRegistration: noop,
        listCanonicalRegistrations: noop,
        listCanonicalRegistrationStatusesForUser: async (userId: string) => {
          reads.push({ path: "canonical", userId });
          return scenario.path === "canonical" && userId === scenario.registeredUnder ? [registration(userId)] : [];
        },
        listCanonicalRegistrationsForUser: async () => {
          fullRowCalls.push("canonical:listCanonicalRegistrationsForUser");
          return [];
        },
        registerCanonicalParticipant: noop,
      }),
    },
  };
  const pagePath = join(root, "app/(app)/app/agent/page.tsx");
  const runtimePath = join(root, "features/events/registration/runtime.ts");
  const ids = [...Object.keys(modules), pagePath, runtimePath].map((id) => require.resolve(id));
  const before = new Map(ids.map((id) => [id, require.cache[id]]));
  t.after(() => {
    for (const [id, previous] of before) {
      if (previous) require.cache[id] = previous;
      else delete require.cache[id];
    }
    if (previousFlag === undefined) delete process.env.ORBIT_GUIDE_DEMO;
    else process.env.ORBIT_GUIDE_DEMO = previousFlag;
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
    fullRowCalls,
    page: require(pagePath).default as () => Promise<ReactElement>,
    reads,
  };
}

/** 页面返回元素树（壳是桩），取传给壳的 home 里这场活动的报名状态。 */
async function registeredOnHome(page: () => Promise<ReactElement>): Promise<boolean> {
  const nodes: unknown[] = [await page()];
  while (nodes.length) {
    const node = nodes.pop() as { props?: Record<string, unknown>; type?: unknown } | null;
    if (!node || typeof node !== "object") continue;
    if (typeof node.type === "function" && (node.type as { name?: string }).name === "IOrbitShell") {
      const home = node.props?.home as { events: Array<{ id: string; youRsvped: boolean; stats: { youRsvped: boolean } }> };
      const event = home.events.find((candidate) => candidate.id === EVENT_ID);
      assert.ok(event, "the event reaches the shell");
      assert.equal(event.stats.youRsvped, event.youRsvped);
      return event.youRsvped;
    }
    const children = node.props?.children;
    nodes.push(...(Array.isArray(children) ? children : [children]));
  }
  assert.fail("IOrbitShell was not rendered");
}

for (const path of ["legacy", "canonical"] as const) {
  test(`${path} read path: a registration written under the account id shows as registered`, async (t) => {
    const { fullRowCalls, page, reads } = loadPage(t, { path, registeredUnder: ACCOUNT_ID });
    assert.equal(await registeredOnHome(page), true);
    assert.deepEqual(
      [...new Set(reads.map((read) => read.userId))],
      [ACCOUNT_ID],
      "registrations are read by the account id only",
    );
    assert.deepEqual(fullRowCalls, [], "W0028: the page never uses the full-row registration reads");
  });

  test(`${path} read path: a registration kept only under the session user id is not shown`, async (t) => {
    const { page } = loadPage(t, { path, registeredUnder: SESSION_ID });
    assert.equal(await registeredOnHome(page), false);
  });
}
