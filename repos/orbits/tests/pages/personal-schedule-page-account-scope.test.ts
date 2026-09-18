import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import type { ReactElement } from "react";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");
const testRequire = createRequire(import.meta.url);

function loadPersonalPage(t: TestContext, options: { signedIn?: boolean; actorId?: string | null } = {}) {
  const calls: Array<{ operation: string; input?: unknown }> = [];
  const redirected = new Error("Test redirect");
  function Workspace() { return null; }
  const modules: Record<string, unknown> = {
    "next/navigation": { redirect: (href: string) => { calls.push({ operation: "redirect", input: href }); throw redirected; } },
    [join(projectRoot, "auth.ts")]: { auth: async () => {
      calls.push({ operation: "auth" });
      return options.signedIn === false ? null : { user: { id: "auth:external", email: "account@example.test", name: "Account fixture" } };
    } },
    [join(projectRoot, "app/api/_shared/authenticated-actor.ts")]: { resolveAuthenticatedApiActorFromSession: async (input: unknown) => {
      calls.push({ operation: "resolveActor", input });
      return options.actorId === null ? null : { id: options.actorId ?? "account:canonical" };
    } },
    [join(projectRoot, "app/(app)/app/orbit-account-shell.tsx")]: { AccountTopNav: () => null },
    [join(projectRoot, "app/(app)/app/orbit-reference-styles.tsx")]: { OrbitReferenceStyles: () => null },
    [join(projectRoot, "app/(app)/app/tasks/tasks-styles.tsx")]: { TasksStyles: () => null },
    [join(projectRoot, "app/(app)/app/tasks/personal-schedule-workspace.tsx")]: { PersonalScheduleWorkspace: Workspace },
  };
  const pagePath = join(projectRoot, "app/(app)/app/tasks/personal/page.tsx");
  const ids = [...Object.keys(modules), pagePath].map(id => testRequire.resolve(id));
  const previous = new Map(ids.map(id => [id, testRequire.cache[id]]));
  t.after(() => {
    for (const [id, cached] of previous) {
      if (cached) testRequire.cache[id] = cached;
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
  const page = testRequire(pagePath).default as () => Promise<ReactElement>;
  function workspaceElement(value: unknown): ReactElement<{ actorId: string }> | undefined {
    if (Array.isArray(value)) return value.map(workspaceElement).find(Boolean);
    if (!value || typeof value !== "object") return undefined;
    const element = value as ReactElement<{ actorId: string; children?: unknown }>;
    return element.type === Workspace ? element : workspaceElement(element.props?.children);
  }
  return { calls, page, redirected, workspaceElement };
}

for (const actorId of ["account:one", "account:two"]) {
  test(`personal schedule page passes resolved ${actorId} rather than the external auth user to its strict client`, async t => {
    const { calls, page, workspaceElement } = loadPersonalPage(t, { actorId });
    const workspace = workspaceElement(await page());
    assert.deepEqual(calls, [
      { operation: "auth" },
      { operation: "resolveActor", input: { email: "account@example.test", name: "Account fixture", userId: "auth:external" } },
    ]);
    assert.equal(workspace?.props.actorId, actorId);
    assert.equal(workspace?.key, actorId);
  });
}

test("personal schedule page redirects anonymous users before resolving account membership", async t => {
  const { calls, page, redirected } = loadPersonalPage(t, { signedIn: false });
  await assert.rejects(page(), error => error === redirected);
  assert.deepEqual(calls, [
    { operation: "auth" },
    { operation: "redirect", input: "/app/account/login?next=%2Fapp%2Ftasks%2Fpersonal" },
  ]);
});

test("personal schedule page fails closed through its login redirect when account membership is unavailable", async t => {
  const { calls, page, redirected } = loadPersonalPage(t, { actorId: null });
  await assert.rejects(page(), error => error === redirected);
  assert.deepEqual(calls.map(call => call.operation), ["auth", "resolveActor", "redirect"]);
  assert.equal(calls[2]?.input, "/app/account/login?next=%2Fapp%2Ftasks%2Fpersonal");
});
