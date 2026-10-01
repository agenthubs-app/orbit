/**
 * W0006 SC-01 页面级：`/app/start` route adapter。
 *
 * 用 require.cache 替换页面依赖（与 `app-agent-guide-demo-page.test.tsx` 同一写法），开关读取用真实
 * `shared/config/guide-demo`：
 *   - 开关关（缺省 / off）：重定向 `/app/agent`，身份、资料、引导记录一个都不读；
 *   - 开关开：以 canonical actor 读资料目标与引导快照，交给客户端壳；W0035 起不再读社群、
 *     公开目录与报名（第 4 步已删除），这些读取一律 0 次；
 *   - 读取器报告开关关闭 → 重定向；进度读不到 → 显示「引导暂时打不开」，不猜进度。
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
  catalogue?: Array<Record<string, unknown>>;
  flag: string | undefined;
  guide?: { kind: string; snapshot?: unknown };
  /** 本人报名事实里有没有 rsvped（不限公开目录）。 */
  registeredAny?: boolean;
  registered?: string[];
}

function loadPage(t: TestContext, scenario: Scenario) {
  const calls: Array<{ operation: string; input?: unknown }> = [];
  const StartGuide = (props: Record<string, unknown>) => {
    calls.push({ input: props, operation: "render-guide" });
    return null;
  };
  const StartGuideUnavailable = () => null;
  const stub = (operation: string, result: unknown) => async (...args: unknown[]) => {
    calls.push({ input: args, operation });
    return result;
  };

  const previousFlag = process.env.ORBIT_GUIDE_DEMO;
  if (scenario.flag === undefined) delete process.env.ORBIT_GUIDE_DEMO;
  else process.env.ORBIT_GUIDE_DEMO = scenario.flag;

  const snapshot = {
    completedAt: null,
    confirmedContacts: 1,
    contactSamples: [],
    currentStep: 2,
    grandfathered: false,
    hasActivePlan: false,
    step1Skipped: true,
  };
  const modules: Record<string, unknown> = {
    "next/navigation": {
      redirect: (href: string) => {
        throw new Error(`redirect:${href}`);
      },
    },
    [join(root, "auth.ts")]: { auth: stub("auth", { user: { email: "owner@example.test", id: "subject:external", name: "Owner" } }) },
    [join(root, "app/api/_shared/authenticated-actor.ts")]: {
      resolveAuthenticatedApiActorFromSession: stub("identity", { id: "account:canonical" }),
    },
    [join(root, "features/acquisition/business-card-capture-availability.ts")]: {
      resolveBusinessCardCaptureAvailability: () => ({ available: true }),
    },
    [join(root, "features/community/service-factory.ts")]: { readCommunityJoinedForActor: stub("community", true) },
    [join(root, "features/events/core/public-catalogue-runtime.ts")]: {
      createConfiguredCanonicalPublicEventCatalogue: () => {
        calls.push({ operation: "catalogue" });
        return scenario.catalogue ? { read: async () => ({ events: scenario.catalogue }) } : null;
      },
    },
    [join(root, "app/(app)/app/orbit-landing-route-view-model.ts")]: {
      getOrbitLandingViewModelFromCatalogue: (snapshot: { events: unknown[] }) => ({ events: snapshot.events }),
    },
    [join(root, "app/(app)/app/orbit-event-presentation.ts")]: {
      applyOrbitEventPresentation: (viewModel: unknown) => viewModel,
    },
    [join(root, "features/events/registration/active-registration.ts")]: {
      hasAnyActiveRegistration: async (actorId: string) => {
        calls.push({ input: actorId, operation: "registered-any" });
        return scenario.registeredAny ?? false;
      },
    },
    [join(root, "features/events/registration/runtime.ts")]: {
      readRuntimeEventRegistrationStates: async (input: { eventIds: string[]; userId: string }) => {
        calls.push({ input, operation: "registrations" });
        return Object.fromEntries(
          input.eventIds.map((id) => [id, { availability: "open", registered: scenario.registered?.includes(id) ?? false }]),
        );
      },
    },
    [join(root, "features/guide/progress.ts")]: {
      readStartGuideForActor: stub("guide", scenario.guide ?? { kind: "ready", snapshot }),
    },
    [join(root, "features/profile/service-factory.ts")]: {
      createProfileService: () => ({
        getProfile: stub("profile", {
          data: { profile: { relationshipGoal: "找渠道（3 个月内）", updatedAt: "2026-10-01T00:00:00.000Z" } },
          success: true,
        }),
      }),
    },
    [join(root, "app/(app)/app/orbit-language-server.ts")]: { getOrbitServerLanguage: async () => "zh" },
    [join(root, "app/(app)/app/orbit-reference-styles.tsx")]: { OrbitReferenceStyles: () => null },
    [join(root, "app/(app)/app/orbit-visual-freeze-runtime.tsx")]: { OrbitVisualFreezeRuntime: () => null },
    [join(root, "app/(app)/app/start/start-guide.tsx")]: { StartGuide, StartGuideUnavailable },
  };
  const pagePath = join(root, "app/(app)/app/start/page.tsx");
  const ids = [...Object.keys(modules), pagePath].map((id) => require.resolve(id));
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
  return {
    calls,
    page: require(pagePath).default as (input?: { searchParams?: Promise<Record<string, string | string[]>> }) => Promise<ReactElement>,
    StartGuide,
    StartGuideUnavailable,
    snapshot,
  };
}

function rendered(tree: ReactElement, component: unknown): Record<string, unknown> | null {
  const nodes: unknown[] = [tree];
  while (nodes.length) {
    const node = nodes.pop() as { props?: Record<string, unknown>; type?: unknown } | null;
    if (!node || typeof node !== "object") continue;
    if (node.type === component) return node.props ?? {};
    const children = node.props?.children;
    nodes.push(...(Array.isArray(children) ? children : [children]));
  }
  return null;
}

for (const flag of [undefined, "off"]) {
  test(`flag ${flag ?? "unset"}: /app/start redirects to /app/agent without reading anything`, async (t) => {
    const { calls, page } = loadPage(t, { flag });
    await assert.rejects(page(), /redirect:\/app\/agent/);
    assert.deepEqual(calls, []);
  });
}

/** W0035：第 4 步删除后 `/app/start` 不再读的来源。 */
const STEP_FOUR_READS = ["community", "catalogue", "registrations", "registered-any"];
const stepFourReads = (calls: Array<{ operation: string }>) =>
  calls.filter((call) => STEP_FOUR_READS.includes(call.operation)).map((call) => call.operation);

test("flag on: the guide snapshot and goal reach the client shell, read as the canonical actor; no community, catalogue or registration reads", async (t) => {
  const { calls, page, StartGuide, snapshot } = loadPage(t, {
    catalogue: [{ address: "", code: "OPEN", id: "open", name: "活动 open", place: "", startsAt: "2030-02-01T00:00:00.000Z", venue: "" }],
    flag: "on",
    registeredAny: true,
  });
  const tree = await page();
  const props = rendered(tree, StartGuide);
  assert.ok(props, "StartGuide rendered");
  assert.deepEqual(props, {
    cardScanAvailable: true,
    profileUpdatedAt: "2026-10-01T00:00:00.000Z",
    relationshipGoal: "找渠道（3 个月内）",
    requestedStep: null,
    snapshot,
  });
  assert.deepEqual(calls.find((call) => call.operation === "profile")?.input, [{ actorId: "account:canonical" }]);
  assert.deepEqual(calls.find((call) => call.operation === "guide")?.input, [
    { actorId: "account:canonical", relationshipGoal: "找渠道（3 个月内）", userId: "subject:external" },
  ]);
  assert.deepEqual(stepFourReads(calls), [], "W0035: step 4 reads are gone");
  // 页面外层是引导页自己的作用域（样式与门禁都认这个路由标记）。
  const wrapper = (tree.props as { children: ReactElement[] }).children[2] as ReactElement<Record<string, unknown>>;
  assert.equal(wrapper.props["data-orbit-real-page"], "start-guide");
  assert.equal(wrapper.props["data-orbit-route"], "app-start-guide-route");
});

test("the reader saying disabled also redirects; an unreadable guide shows the unavailable state", async (t) => {
  const disabled = loadPage(t, { flag: "on", guide: { kind: "disabled" } });
  await assert.rejects(disabled.page(), /redirect:\/app\/agent/);

  const unavailable = loadPage(t, { flag: "on", guide: { kind: "unavailable" } });
  const tree = await unavailable.page();
  assert.ok(rendered(tree, unavailable.StartGuideUnavailable));
  assert.equal(rendered(tree, unavailable.StartGuide), null);
  assert.equal(unavailable.calls.filter((call) => call.operation === "community").length, 0);
});

/* ── W0022：?step= 只把合法的单个 1–3 交给客户端壳，能不能打开由壳按硬顺序判定 ── */

test("W0022/W0035: ?step=3 reaches the shell as requestedStep; ?step=4, invalid or repeated values are dropped", async (t) => {
  const cases: Array<[Record<string, string | string[]> | undefined, number | null]> = [
    [{ step: "3" }, 3],
    [{ step: "1" }, 1],
    [{ step: "4" }, null],
    [{ step: "abc" }, null],
    [{ step: "9" }, null],
    [{ step: ["3", "4"] }, null],
    [{}, null],
    [undefined, null],
  ];
  for (const [searchParams, expected] of cases) {
    const { calls, page, StartGuide } = loadPage(t, { flag: "on" });
    const tree = await page(searchParams ? { searchParams: Promise.resolve(searchParams) } : undefined);
    assert.equal(rendered(tree, StartGuide)?.requestedStep, expected, JSON.stringify(searchParams));
    assert.deepEqual(stepFourReads(calls), [], JSON.stringify(searchParams));
  }
});

test("W0022/W0035: flag off with ?step=3 or ?step=4 still redirects to /app/agent without reading anything", async (t) => {
  for (const step of ["3", "4"]) {
    const { calls, page } = loadPage(t, { flag: undefined });
    await assert.rejects(page({ searchParams: Promise.resolve({ step }) }), /redirect:\/app\/agent/);
    assert.deepEqual(calls, [], step);
  }
});
