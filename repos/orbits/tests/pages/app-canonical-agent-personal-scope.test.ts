import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test, { type TestContext } from "node:test";
import type { ReactElement } from "react";

const root = join(fileURLToPath(import.meta.url), "../../..");
const require = createRequire(import.meta.url);

function loadPage(t: TestContext, route: "agent" | "tasks/personal" | "home/events", options: { anonymous?: boolean; missing?: boolean } = {}) {
  const calls: Array<{ operation: string; input?: any }> = [];
  const stub = (operation: string, result: unknown) => async (...args: unknown[]) => {
    calls.push({ operation, input: args });
    return result;
  };
  const modules: Record<string, unknown> = {
    "next/navigation": { redirect: (href: string) => { throw new Error(`redirect:${href}`); } },
    [join(root, "auth.ts")]: { auth: stub("auth", options.anonymous ? null : { user: { id: "subject:external", email: "owner@example.test", name: "Owner" } }) },
    [join(root, "app/api/_shared/authenticated-actor.ts")]: { resolveAuthenticatedApiActorFromSession: stub("identity", options.missing ? null : { id: "account:canonical" }) },
    [join(root, "app/(app)/app/orbit-language-server.ts")]: { getOrbitServerLanguage: async () => "zh", localizeOrbitTree: (tree: unknown) => tree },
    [join(root, "app/(app)/app/orbit-reference-styles.tsx")]: { OrbitReferenceStyles: () => null },
    [join(root, "app/(app)/app/orbit-visual-freeze-runtime.tsx")]: { OrbitVisualFreezeRuntime: () => null },
    [join(root, "app/(app)/app/orbit-account-shell.tsx")]: { AccountTopNav: () => null },
    [join(root, "app/(app)/app/tasks/personal-schedule-workspace.tsx")]: { PersonalScheduleWorkspace: () => null },
    [join(root, "app/(app)/app/agent/orbit-real-agent.tsx")]: { OrbitRealAgent: () => null },
    [join(root, "app/(app)/app/home/orbit-real-home.tsx")]: { OrbitRealHome: () => null },
    [join(root, "app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-route-view-model.ts")]: { loadAppChatRouteViewModel: stub("chat", {}) },
    [join(root, "app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-view-model-adapter.ts")]: { composeOrbitAgentEntryViewModel: () => ({ state: "ready", viewModel: {} }) },
    [join(root, "app/(app)/app/home/compose-app-home-from-previously-approved-mock-first-capabilities/home-route-view-model.tsx")]: { loadAppHomeRouteViewModel: stub("home", { state: "success", home: { events: [] } }) },
    [join(root, "app/(app)/app/canonical-event-detail-view.ts")]: { resolveConfiguredActorEventCanonicalIds: stub("events", {}) },
    [join(root, "features/events/registration/runtime.ts")]: { readRuntimeEventRegistrationStates: stub("registrations", {}) },
  };
  const pagePath = join(root, `app/(app)/app/${route}/page.tsx`);
  const ids = [...Object.keys(modules), pagePath].map(id => require.resolve(id));
  const before = new Map(ids.map(id => [id, require.cache[id]]));
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
  return { calls, page: require(pagePath).default as () => Promise<ReactElement> };
}

for (const route of ["agent", "tasks/personal", "home/events"] as const) {
  test(`${route} resolves canonical ownership before reading or rendering private data`, async t => {
    const { page, calls } = loadPage(t, route);
    const tree = await page();
    assert.deepEqual(calls.find(call => call.operation === "identity")?.input, [{ userId: "subject:external", email: "owner@example.test", name: "Owner" }]);
    if (route === "agent") {
      assert.equal(calls.find(call => call.operation === "chat")?.input[1].actorId, "account:canonical");
      assert.equal(calls.find(call => call.operation === "home")?.input[1].id, "account:canonical");
      assert.equal(calls.find(call => call.operation === "events")?.input[0].actorId, "account:canonical");
      assert.equal(calls.find(call => call.operation === "registrations")?.input[0].userId, "account:canonical");
    } else if (route === "home/events") {
      assert.equal(calls.find(call => call.operation === "home")?.input[1].id, "account:canonical");
    } else {
      const nodes: any[] = [tree];
      const owners: string[] = [];
      while (nodes.length) {
        const node = nodes.pop();
        if (!node?.props) continue;
        if (node.props.actorId) owners.push(node.props.actorId);
        nodes.push(...[node.props.children].flat());
      }
      assert.deepEqual(owners, ["account:canonical"]);
    }
  });
  test(`${route} fails closed without account membership`, async t => {
    const { page, calls } = loadPage(t, route, { missing: true });
    await assert.rejects(page(), /Authenticated Orbit account membership is unavailable/);
    assert.deepEqual(calls.map(call => call.operation), ["auth", "identity"]);
  });
  test(`${route} redirects anonymous users before resolving or reading data`, async t => {
    const { page, calls } = loadPage(t, route, { anonymous: true });
    await assert.rejects(page(), /redirect:\/app\/account\/login/);
    assert.deepEqual(calls.map(call => call.operation), ["auth"]);
  });
}
