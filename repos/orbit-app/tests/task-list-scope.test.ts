import assert from "node:assert/strict";
import test from "node:test";
import type { TaskItemContract } from "../src/api/contract/tasks";
import { isRelationshipTask, parseTaskListSelection, readTaskListItems, selectTaskListItems, taskListReceiptMatches } from "../src/view-models/task-list-scope";
import { resolveSupportedInitialRouteHref } from "../src/view-models/initial-route";
import { isPrivateMobileRoute, mobileAuthReturnHref, mobileLoginHref } from "../src/view-models/mobile-route-access";

const task = (index: number): TaskItemContract => ({
  id: `task:${index}`, accountId: "owner", ownerUserId: "owner", title: `Task ${index}`,
  category: index < 21 ? "relationship" : index < 42 ? "work" : "personal",
  ...(index >= 21 && index < 42 ? { relatedContactId: `contact:${index}` } : {}),
  status: index % 2 === 0 ? "open" : "completed", priority: "normal", source: "manual",
  createdAt: "2026-09-14T00:00:00Z", updatedAt: "2026-09-14T00:00:00Z",
});

test("tasks login returns retain only validated list selection and preserve canonical detail IDs", () => {
  assert.equal(isPrivateMobileRoute("/tasks"), true);
  assert.equal(isPrivateMobileRoute("/app/tasks/task%3Aone%2Ftwo"), true);
  assert.equal(isPrivateMobileRoute("/tasks-public"), false);
  const params = { scope: ["relationship", "all"], view: ["completed", "open"], next: "https://outside.example", "#": "ignored" };
  const href = "/tasks?scope=relationship&view=completed";
  assert.equal(mobileAuthReturnHref("/tasks", params), href);
  assert.equal(mobileLoginHref("/tasks", params), `/account/login?next=${encodeURIComponent(href)}`);
  assert.equal(resolveSupportedInitialRouteHref(href + "&next=https://outside.example"), href);
  assert.equal(resolveSupportedInitialRouteHref("/app/tasks?scope=bad&view=cancelled#ignored"), "/tasks");
  assert.equal(resolveSupportedInitialRouteHref("/tasks/task%3Aone%2Ftwo"), "/tasks/task%3Aone%2Ftwo");
  assert.equal(mobileAuthReturnHref("/tasks/task%3Aone%2Ftwo", { id: "task:one/two" }), "/tasks/task%3Aone%2Ftwo");
  assert.equal(resolveSupportedInitialRouteHref("/tasks/personal"), "/tasks/personal");
  assert.equal(resolveSupportedInitialRouteHref("/schedule/personal/personal%3Aone"), "/schedule/personal/personal%3Aone");
  for (const unsafe of ["/tasks/..", "/tasks/%2e%2e", "/tasks/%", "/tasks/%20", "https://outside.example/tasks"]) assert.equal(resolveSupportedInitialRouteHref(unsafe), null);
});

test("list decoding keeps canonical tasks and rejects malformed or foreign-owner records visibly", () => {
  assert.deepEqual(readTaskListItems({ tasks: [task(0), task(0), { taskId: "candidate", title: "Review first" }] }, "owner"), [task(0)]);
  assert.deepEqual(readTaskListItems({ tasks: [] }, "owner"), []);
  for (const payload of [{}, { tasks: null }, { tasks: [null] }, { tasks: [{ ...task(0), updatedAt: "bad" }] }, { tasks: [{ ...task(0), ownerUserId: "other" }] }, { tasks: [{ ...task(0), accountId: "other" }] }]) {
    assert.equal(readTaskListItems(payload, "owner"), null);
  }
  assert.equal(readTaskListItems({ tasks: [task(0)] }, ""), null);
});

test("completion and reopen receipts require the same owner, ID, intended state and a newer version", () => {
  const baseline = task(0), updated = { ...baseline, status: "completed" as const, updatedAt: "2026-09-15T00:00:00Z" };
  assert.equal(taskListReceiptMatches({ task: updated }, "owner", baseline, "complete"), true);
  for (const item of [baseline, { ...updated, id: "task:other" }, { ...updated, ownerUserId: "other" }, { ...updated, accountId: "other" }, { ...updated, updatedAt: baseline.updatedAt }]) {
    assert.equal(taskListReceiptMatches({ task: item }, "owner", baseline, "complete"), false);
  }
  assert.equal(taskListReceiptMatches({ task: { ...updated, status: "open", updatedAt: "2026-09-16T00:00:00Z" } }, "owner", updated, "reopen"), true);
});

test("relationship includes either the category or a real contact reference, independent of status", () => {
  assert.equal(isRelationshipTask(task(1)), true);
  assert.equal(isRelationshipTask(task(21)), true);
  assert.equal(isRelationshipTask(task(42)), false);
  assert.equal(isRelationshipTask({ ...task(42), relatedContactId: "" }), false);
  assert.equal(isRelationshipTask({ ...task(42), relatedContactId: "  " }), false);
});

test("selection accepts only scope/view enums and takes the first repeated parameter", () => {
  for (const input of [undefined, null, {}, { scope: "unknown", view: "cancelled" }, { scope: [], view: [] }]) {
    assert.deepEqual(parseTaskListSelection(input), { scope: "all", view: "open" });
  }
  assert.deepEqual(parseTaskListSelection({ scope: ["relationship", "all"], view: ["completed", "open"] }), { scope: "relationship", view: "completed" });
  assert.deepEqual(parseTaskListSelection({ scope: ["bad", "relationship"], view: ["bad", "completed"] }), { scope: "all", view: "open" });
  assert.deepEqual(parseTaskListSelection({ scope: "all", view: "completed" }), { scope: "all", view: "completed" });
});

test("61 canonical tasks retain four orthogonal views, unique IDs and no candidate counts", () => {
  const tasks = Array.from({ length: 61 }, (_, index) => task(index));
  const payload = [...tasks, task(0), { taskId: "candidate:1", title: "Not saved", category: "relationship" }, { ...task(99), status: "cancelled" }] as TaskItemContract[];
  const allOpen = selectTaskListItems(payload, { scope: "all", view: "open" });
  const allCompleted = selectTaskListItems(payload, { scope: "all", view: "completed" });
  const peopleOpen = selectTaskListItems(payload, { scope: "relationship", view: "open" });
  const peopleCompleted = selectTaskListItems(payload, { scope: "relationship", view: "completed" });
  assert.deepEqual([allOpen.length, allCompleted.length, peopleOpen.length, peopleCompleted.length], [31, 30, 21, 21]);
  assert.equal(new Set([...allOpen, ...allCompleted].map(item => item.id)).size, 61);
  assert.ok(peopleCompleted.some(item => item.id === "task:21"));
  assert.ok(allOpen.some(item => item.id === "task:60"));
  assert.ok(!peopleOpen.some(item => item.id === "task:60"));
  assert.equal(allOpen[0], tasks[0], "selection retains the canonical object rather than making another task");
  assert.deepEqual(selectTaskListItems([], { scope: "relationship", view: "completed" }), []);
});

test("legacy followups links return to the relationship list with only supported status parameters", () => {
  assert.equal(resolveSupportedInitialRouteHref("/followups?scope=all&view=completed&next=https://outside.example"), "/tasks?scope=relationship&view=completed");
  assert.equal(resolveSupportedInitialRouteHref("/app/home/schedule?view=unknown"), "/tasks?scope=relationship");
  assert.equal(mobileAuthReturnHref("/followups", { scope: "all", view: ["completed", "open"], next: "https://outside.example" }), "/tasks?scope=relationship&view=completed");
});
