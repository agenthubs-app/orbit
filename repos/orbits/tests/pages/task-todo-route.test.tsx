import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { transformSync } from "esbuild";

function loadPage(signedIn = true) {
  const path = require.resolve("../../app/(app)/app/tasks/page");
  const compiled = transformSync(readFileSync(path, "utf8"), { format: "cjs", loader: "tsx", jsx: "automatic", platform: "node" }).code;
  const baseRequire = createRequire(path);
  const module = { exports: {} as Record<string, any> };
  let lifecycleReads = 0, planReads = 0;
  const component = () => null;
  const todo = () => null;
  new Function("require", "module", "exports", compiled)((request: string) => {
    if (request === "next/navigation") return { redirect: (destination: string) => { throw Object.assign(Error("redirect"), { destination }); } };
    if (request.endsWith("/auth")) return { auth: async () => signedIn ? { user: { id: "subject" } } : null };
    if (request.includes("authenticated-actor")) return { resolveAuthenticatedApiActorFromSession: async () => ({ id: "actor" }) };
    if (request === "./plan-slot") return { loadPlanSlot: async () => { planReads++; return "plan"; }, planStartHref: () => "/app/agent" };
    if (request.includes("TaskContainer")) return { TaskContainer: component };
    if (request.includes("TodoTaskSlot")) return { TodoTaskSlot: todo };
    if (request.includes("orbit-reference-styles")) return { OrbitReferenceStyles: component };
    if (request === "./tasks-styles") return { TasksStyles: component };
    if (request === "./personal-schedule-workspace") return { PersonalScheduleWorkspace: component };
    if (request === "./tasks-page-content") return { TasksPageContent: component };
    if (request === "./lifecycle-pages-route-service") return { loadLifecycleTaskPages: async () => { lifecycleReads++; return {}; } };
    return baseRequire(request);
  }, module, module.exports);
  return { page: module.exports.default, todo, lifecycleReads: () => lifecycleReads, planReads: () => planReads };
}

test("Task Todo route mounts the new slot without legacy follow-up reads and preserves plan behavior", async () => {
  const runtime = loadPage();
  const element = await runtime.page({ searchParams: Promise.resolve({ tab: "todo", new: "1" }) });
  assert.equal(element.props.todo.type, runtime.todo);
  assert.equal(element.props.todo.props.initialAdd, true);
  assert.equal(runtime.lifecycleReads(), 0);
  assert.equal(runtime.planReads(), 0);
  const plan = await runtime.page({ searchParams: Promise.resolve({ tab: "plan", plan: "goal", new: "1" }) });
  assert.equal(plan.props.plan, "plan");
  assert.equal(runtime.planReads(), 1);
});

test("login continuation retains Task tab, plan, new and completed intent without arbitrary redirect targets", async () => {
  const runtime = loadPage(false);
  await assert.rejects(runtime.page({ searchParams: Promise.resolve({ tab: "plan", plan: "goal /+", new: "1", view: "completed", next: "https://evil.test" }) }), error => {
    const destination = new URL((error as Error & { destination: string }).destination, "https://orbit.test");
    assert.equal(destination.pathname, "/app/account/login");
    const next = new URL(destination.searchParams.get("next")!, "https://orbit.test");
    assert.equal(next.pathname, "/app/tasks");
    assert.deepEqual(Object.fromEntries(next.searchParams), { tab: "plan", plan: "goal /+", new: "1", view: "completed" });
    return true;
  });
});
