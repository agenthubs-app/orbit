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
  const calendar = () => null;
  new Function("require", "module", "exports", compiled)((request: string) => {
    if (request === "next/navigation") return { redirect: (destination: string) => { throw Object.assign(Error("redirect"), { destination }); } };
    if (request.endsWith("/auth")) return { auth: async () => signedIn ? { user: { id: "subject" } } : null };
    if (request.includes("authenticated-actor")) return { resolveAuthenticatedApiActorFromSession: async () => ({ id: "actor" }) };
    if (request === "./plan-slot") return { loadPlanSlot: async () => { planReads++; return "plan"; }, planStartHref: () => "/app/agent" };
    if (request.includes("TaskContainer")) return { TaskContainer: component };
    if (request.includes("TodoTaskSlot")) return { TodoTaskSlot: todo };
    if (request.includes("CalendarTaskSlot")) return { CalendarTaskSlot: calendar };
    if (request.includes("orbit-reference-styles")) return { OrbitReferenceStyles: component };
    if (request === "./tasks-styles") return { TasksStyles: component };
    if (request === "./personal-schedule-workspace") return { PersonalScheduleWorkspace: component };
    if (request === "./tasks-page-content") return { TasksPageContent: component };
    if (request === "./lifecycle-pages-route-service") return { loadLifecycleTaskPages: async () => { lifecycleReads++; return {}; } };
    return baseRequire(request);
  }, module, module.exports);
  return { page: module.exports.default, todo, calendar, lifecycleReads: () => lifecycleReads, planReads: () => planReads };
}

test("Task Todo route mounts the new slot without legacy follow-up reads and preserves plan behavior", async () => {
  const runtime = loadPage();
  const element = await runtime.page({ searchParams: Promise.resolve({ tab: "todo", new: "1" }) });
  assert.equal(element.props.todo.type, runtime.todo);
  assert.equal(element.props.todo.props.initialAdd, true);
  assert.equal(element.props.todo.props.actorId, "actor");
  assert.equal(runtime.lifecycleReads(), 0);
  assert.equal(runtime.planReads(), 0);
  const plan = await runtime.page({ searchParams: Promise.resolve({ tab: "plan", plan: "goal", new: "1" }) });
  assert.equal(plan.props.plan, "plan");
  assert.equal(runtime.planReads(), 1);
});
test("legacy completed view opens the new task list with completed rows expanded", async () => {
  const runtime = loadPage();
  const completed = await runtime.page({ searchParams: Promise.resolve({ tab: "todo", view: "completed" }) });
  assert.equal(completed.props.todo.type, runtime.todo);
  assert.equal(completed.props.todo.props.initialList, true);
  assert.equal(completed.props.todo.props.initialCompleted, true);
  const all = await runtime.page({ searchParams: Promise.resolve({ tab: "todo", view: "all" }) });
  assert.equal(all.props.todo.props.initialList, true);
  assert.equal(all.props.todo.props.initialCompleted, false);
});

test("sign-in continuation returns to the all-tasks list without a selected task", async () => {
  const runtime = loadPage(false);
  await assert.rejects(runtime.page({ searchParams: Promise.resolve({ tab: "todo", view: "all" }) }), error => {
    const destination = new URL((error as Error & { destination: string }).destination, "https://orbit.test");
    const next = new URL(destination.searchParams.get("next")!, "https://orbit.test");
    assert.equal(next.pathname, "/app/tasks");
    assert.deepEqual(Object.fromEntries(next.searchParams), { tab: "todo", view: "all" });
    return true;
  });
});

test("legacy task identity opens the new list detail and survives login continuation", async () => {
  const task = "task:one/two";
  const runtime = loadPage();
  const element = await runtime.page({ searchParams: Promise.resolve({ tab: "todo", view: "all", task }) });
  assert.equal(element.props.todo.props.initialList, true);
  assert.equal(element.props.todo.props.initialSelectedId, task);
  const duplicate = await runtime.page({ searchParams: Promise.resolve({ tab: "todo", view: "all", task: [task, "task:other"] }) });
  assert.equal(duplicate.props.todo.props.initialSelectedId, undefined);

  const signedOut = loadPage(false);
  await assert.rejects(signedOut.page({ searchParams: Promise.resolve({ tab: "todo", view: "all", task }) }), error => {
    const destination = new URL((error as Error & { destination: string }).destination, "https://orbit.test");
    const next = new URL(destination.searchParams.get("next")!, "https://orbit.test");
    assert.equal(next.searchParams.get("task"), task);
    return true;
  });
});

test("Task calendar mounts the selected-window calendar with canonical actor and validated linked date", async () => {
  const runtime = loadPage();
  const element = await runtime.page({ searchParams: Promise.resolve({ tab: "calendar", date: "2030-04-01", new: "1" }) });
  assert.equal(element.props.calendar.type, runtime.calendar);
  assert.deepEqual(element.props.calendar.props, { actorId: "actor", initialDate: "2030-04-01", initialAdd: true });
  const invalid = await runtime.page({ searchParams: Promise.resolve({ tab: "calendar", date: "2030-02-30" }) });
  assert.equal(invalid.props.calendar.props.initialDate, undefined);
  assert.equal(runtime.planReads(), 0);
  assert.equal(runtime.lifecycleReads(), 0);
});

test("calendar login continuation keeps only a valid calendar date", async () => {
  const runtime = loadPage(false);
  for (const [date, expected] of [["2030-04-01", "2030-04-01"], ["2030-02-30", null]]) {
    await assert.rejects(runtime.page({ searchParams: Promise.resolve({ tab: "calendar", date }) }), error => {
      const destination = new URL((error as Error & { destination: string }).destination, "https://orbit.test");
      const next = new URL(destination.searchParams.get("next")!, "https://orbit.test");
      assert.equal(next.searchParams.get("date"), expected);
      return true;
    });
  }
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
