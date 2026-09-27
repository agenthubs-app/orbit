/**
 * W0004 SC-01 页面级：`/app/agent` 在开关关 / 开两种状态下下传给壳的 `guide`。
 *
 * 用 require.cache 替换页面的依赖（与 `app-canonical-agent-personal-scope.test.ts` 同一写法），
 * `features/guide/progress.ts` 用真实实现，只替换它底下的存储：
 *   - 开关关：`guide` 为 null，引导记录 / 联系人计数 / 计划一个都不读；
 *   - 开关开 + 新用户：`guide` 带进度（0 / 3，下一步名片），读取都以 canonical actor 进行；
 *   - 开关开 + D2 老用户：`guide` 为 null（真实首页）。
 */
import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test, { type TestContext } from "node:test";
import type { ReactElement } from "react";

const root = join(fileURLToPath(import.meta.url), "../../..");
const require = createRequire(import.meta.url);

interface Scenario {
  contacts: number;
  createdAt?: string | null;
  flag: string | undefined;
  goal?: string;
  since?: string;
}

function loadPage(t: TestContext, scenario: Scenario) {
  const calls: Array<{ operation: string; input?: unknown }> = [];
  const guideRecords = new Map<string, Record<string, unknown>>();
  const shellProps: Array<Record<string, unknown>> = [];
  const IOrbitShell = (props: Record<string, unknown>) => {
    shellProps.push(props);
    return null;
  };
  const stub = (operation: string, result: unknown) => async (...args: unknown[]) => {
    calls.push({ input: args, operation });
    return result;
  };

  const previousFlag = process.env.ORBIT_GUIDE_DEMO;
  const previousSince = process.env.ORBIT_GUIDE_DEMO_SINCE;
  if (scenario.flag === undefined) delete process.env.ORBIT_GUIDE_DEMO;
  else process.env.ORBIT_GUIDE_DEMO = scenario.flag;
  if (scenario.since === undefined) delete process.env.ORBIT_GUIDE_DEMO_SINCE;
  else process.env.ORBIT_GUIDE_DEMO_SINCE = scenario.since;

  const modules: Record<string, unknown> = {
    "next/navigation": { redirect: (href: string) => { throw new Error(`redirect:${href}`); } },
    [join(root, "auth.ts")]: { auth: stub("auth", { user: { email: "owner@example.test", id: "subject:external", name: "Owner" } }) },
    [join(root, "app/api/_shared/authenticated-actor.ts")]: { resolveAuthenticatedApiActorFromSession: stub("identity", { id: "account:canonical" }) },
    [join(root, "app/(app)/app/orbit-language-server.ts")]: { getOrbitServerLanguage: async () => "zh", localizeOrbitTree: (tree: unknown) => tree },
    [join(root, "app/(app)/app/orbit-reference-styles.tsx")]: { OrbitReferenceStyles: () => null },
    [join(root, "app/(app)/app/orbit-visual-freeze-runtime.tsx")]: { OrbitVisualFreezeRuntime: () => null },
    [join(root, "app/(app)/app/agent/iorbit-0918/iorbit-shell.tsx")]: { IOrbitShell },
    [join(root, "app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-route-view-model.ts")]: { loadAppChatRouteViewModel: stub("chat", {}) },
    [join(root, "app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-view-model-adapter.ts")]: { composeOrbitAgentEntryViewModel: () => ({ state: "ready", viewModel: {} }) },
    [join(root, "app/(app)/app/home/compose-app-home-from-previously-approved-mock-first-capabilities/home-route-view-model.tsx")]: {
      loadAppHomeRouteViewModel: stub("home", {
        home: { account: { relationshipGoal: scenario.goal ?? "" }, events: [] },
        state: "success",
      }),
    },
    [join(root, "app/(app)/app/canonical-event-detail-view.ts")]: { resolveConfiguredActorEventCanonicalIds: stub("events", {}) },
    [join(root, "features/events/registration/runtime.ts")]: { readRuntimeEventRegistrationStates: stub("registrations", {}) },
    [join(root, "features/community/service-factory.ts")]: { readCommunityJoinedForActor: stub("community", false) },
    // 真实 progress.ts 底下的四个来源：
    [join(root, "features/guide/service-factory.ts")]: {
      resolveGuideStateService: ({ actorId }: { actorId: string }) => {
        calls.push({ input: actorId, operation: "guide-state" });
        const read = () => ({
          bannerCollapsed: guideRecords.get(actorId)?.bannerCollapsed === true,
          grandfathered: (guideRecords.get(actorId)?.grandfathered as boolean | undefined) ?? null,
          version: 1,
        });
        return {
          mode: "mock",
          service: {
            get: async () => read(),
            recordGrandfathered: async (value: boolean) => {
              calls.push({ input: [actorId, value], operation: "grandfathered" });
              guideRecords.set(actorId, { ...guideRecords.get(actorId), grandfathered: value });
              return read();
            },
            setBannerCollapsed: async () => read(),
          },
          success: true,
        };
      },
    },
    [join(root, "shared/storage/configured-live-record-store.ts")]: {
      createConfiguredPostgresLiveRecordStore: () => ({
        client: {
          query: async (_sql: string, values: readonly unknown[]) => {
            calls.push({ input: values, operation: "contacts" });
            return { rows: [{ total: scenario.contacts }] };
          },
        },
        store: {},
        workspaceId: "workspace:test",
      }),
    },
    [join(root, "features/plans/service-factory.ts")]: {
      resolvePlanService: ({ actorId }: { actorId: string }) => {
        calls.push({ input: actorId, operation: "plan" });
        return { mode: "mock", service: { getCurrent: async () => null }, success: true };
      },
    },
    [join(root, "features/account/storage/account-live-record-provider.ts")]: {
      createConfiguredStorageAccountSessionProvider: () => ({
        readAccountSessionGraph: async (identity: unknown) => {
          calls.push({ input: identity, operation: "account" });
          return {
            accounts: [{ createdAt: scenario.createdAt ?? null, id: "account:canonical", name: "Owner", updatedAt: "" }],
            evidenceIds: [],
            generatedAt: "",
            profiles: [],
          };
        },
      }),
    },
  };
  const pagePath = join(root, "app/(app)/app/agent/page.tsx");
  const progressPath = join(root, "features/guide/progress.ts");
  const ids = [...Object.keys(modules), pagePath, progressPath].map((id) => require.resolve(id));
  const before = new Map(ids.map((id) => [id, require.cache[id]]));
  t.after(() => {
    for (const [id, previous] of before) {
      if (previous) require.cache[id] = previous;
      else delete require.cache[id];
    }
    if (previousFlag === undefined) delete process.env.ORBIT_GUIDE_DEMO;
    else process.env.ORBIT_GUIDE_DEMO = previousFlag;
    if (previousSince === undefined) delete process.env.ORBIT_GUIDE_DEMO_SINCE;
    else process.env.ORBIT_GUIDE_DEMO_SINCE = previousSince;
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
  delete require.cache[require.resolve(progressPath)];
  return {
    calls,
    guideRecords,
    page: require(pagePath).default as () => Promise<ReactElement>,
    shellProps,
  };
}

/** 页面返回的是元素树（壳被替换成桩），找出传给壳的 props。 */
function shellPropsOf(tree: ReactElement): Record<string, unknown> {
  const nodes: unknown[] = [tree];
  while (nodes.length) {
    const node = nodes.pop() as { props?: Record<string, unknown>; type?: unknown } | null;
    if (!node || typeof node !== "object") continue;
    if (typeof node.type === "function" && (node.type as { name?: string }).name === "IOrbitShell") {
      return node.props ?? {};
    }
    const children = node.props?.children;
    nodes.push(...(Array.isArray(children) ? children : [children]));
  }
  assert.fail("IOrbitShell was not rendered");
}

const GUIDE_OPERATIONS = ["guide-state", "contacts", "plan", "account", "grandfathered"];

test("flag off: the shell gets no guide and not one guide source is read", async (t) => {
  const { calls, page } = loadPage(t, { contacts: 0, flag: undefined });
  const props = shellPropsOf(await page());
  assert.equal(props.guide, null);
  assert.deepEqual(
    calls.filter((call) => GUIDE_OPERATIONS.includes(call.operation)),
    [],
  );
});

test("flag set to anything but on / true / 1 still behaves as off", async (t) => {
  const { calls, page } = loadPage(t, { contacts: 0, flag: "off" });
  assert.equal(shellPropsOf(await page()).guide, null);
  assert.equal(calls.filter((call) => GUIDE_OPERATIONS.includes(call.operation)).length, 0);
});

test("flag on + new user: the shell gets the demo view, read as the canonical actor", async (t) => {
  const { calls, guideRecords, page } = loadPage(t, { contacts: 0, flag: "on" });
  const props = shellPropsOf(await page());
  assert.deepEqual(props.guide, {
    bannerCollapsed: false,
    completed: 0,
    confirmedContacts: 0,
    nextStep: "contacts",
    steps: { contacts: false, goal: false, plan: false },
  });
  assert.deepEqual(calls.find((call) => call.operation === "contacts")?.input, ["workspace:test", "account:canonical"]);
  assert.equal(calls.find((call) => call.operation === "plan")?.input, "account:canonical");
  assert.equal(calls.find((call) => call.operation === "guide-state")?.input, "account:canonical");
  // 联系人不足 3 位：不读账号记录，首次判定 false 落库。
  assert.equal(calls.filter((call) => call.operation === "account").length, 0);
  assert.equal(guideRecords.get("account:canonical")?.grandfathered, false);
});

test("flag on + D2 legacy user (created before SINCE, ≥3 contacts): the real home", async (t) => {
  const { calls, guideRecords, page } = loadPage(t, {
    contacts: 4,
    createdAt: "2026-06-01T00:00:00.000Z",
    flag: "on",
    goal: "推进日本合作",
    since: "2026-10-15",
  });
  assert.equal(shellPropsOf(await page()).guide, null);
  assert.deepEqual(calls.find((call) => call.operation === "account")?.input, { userId: "subject:external" });
  assert.equal(guideRecords.get("account:canonical")?.grandfathered, true);
});

test("flag on + registered after SINCE with ≥3 contacts and a goal: still in the demo until a plan exists", async (t) => {
  const { page } = loadPage(t, {
    contacts: 3,
    createdAt: "2026-10-20T00:00:00.000Z",
    flag: "on",
    goal: "三个月内找到 5 家试用客户",
    since: "2026-10-15",
  });
  const guide = shellPropsOf(await page()).guide as { completed: number; nextStep: string } | null;
  assert.equal(guide?.completed, 2);
  assert.equal(guide?.nextStep, "plan");
});
