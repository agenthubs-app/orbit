import assert from "node:assert/strict";
import test from "node:test";
import type {
  RelationshipConnectionAggregate,
  RelationshipLifecycleTask,
  RelationshipStageCommand,
  RelationshipTaskCompletionCommand,
} from "../../features/connections/lifecycle/contract";
import {
  applyRelationshipStageCommand,
  applyRelationshipTaskCompletion,
} from "../../features/connections/lifecycle/transition";

const now = "2026-08-21T01:00:00.000Z";
const current: RelationshipConnectionAggregate = {
  actorId: "account:xiaoyu", connectionId: "connection:mina", contactId: "contact:mina",
  stage: "active", activeGoal: "讨论渠道合作", version: 3, createdAt: now, updatedAt: now,
};
const base = {
  actorId: current.actorId, connectionId: current.connectionId,
  expectedVersion: 3, idempotencyKey: "stage:mina:1",
};
const nextTask = {
  taskId: "task:next", title: "  发送渠道介绍  ", dueAt: "2026-08-25T10:00:00+09:00",
};
function task(overrides: Partial<RelationshipLifecycleTask> = {}): RelationshipLifecycleTask {
  return {
    actorId: current.actorId, connectionId: current.connectionId, contactId: current.contactId,
    taskId: "task:existing", title: "联系 Mina", dueAt: "2026-08-20T01:00:00.000Z",
    purpose: "follow_up", status: "open", version: 2, createdAt: now, updatedAt: now,
    ...overrides,
  };
}
function stage(command: RelationshipStageCommand, tasks: RelationshipLifecycleTask[] = []) {
  return applyRelationshipStageCommand({ command, current, tasks, now });
}
function complete(
  outcome: RelationshipTaskCompletionCommand["outcome"],
  overrides: Partial<RelationshipTaskCompletionCommand> = {},
) {
  return applyRelationshipTaskCompletion({
    command: {
      actorId: current.actorId, connectionId: current.connectionId, taskId: "task:existing",
      expectedConnectionVersion: 3, expectedTaskVersion: 2, idempotencyKey: "complete:1",
      outcome, ...overrides,
    },
    current: { ...current, stage: "needs_follow_up", activeGoal: null }, tasks: [task()], now,
  });
}

for (const target of ["needs_follow_up", "nurture"] as const) {
  test(`${target} creates a normalized dated task and one audit without mutating inputs`, () => {
    const command = { ...base, stage: target, nextTask };
    const before = structuredClone({ command, current });
    const result = stage(command);
    assert.equal(result.connection.stage, target);
    assert.equal(result.connection.version, 4);
    assert.equal(result.connection.activeGoal, null);
    assert.deepEqual(result.upsertTasks, [task({
      taskId: "task:next", title: "发送渠道介绍", dueAt: "2026-08-25T01:00:00.000Z",
      purpose: target === "nurture" ? "maintenance" : "follow_up", version: 1,
    })]);
    assert.equal(result.audit.actorId, current.actorId);
    assert.equal(result.audit.fromStage, "active");
    assert.equal(result.audit.toStage, target);
    assert.deepEqual(result.audit.taskIds, ["task:next"]);
    assert.deepEqual({ command, current }, before);
    assert.equal(JSON.stringify(result.audit).includes("发送渠道介绍"), false);
  });
  for (const dueAt of [undefined, "", "tomorrow", "2026-08-25", "2026-02-30T01:00:00Z", "2026-08-25T25:00:00Z"]) {
    test(`${target} rejects invalid dueAt ${String(dueAt)}`, () => {
      assert.throws(() => stage({ ...base, stage: target, nextTask: { ...nextTask, dueAt } } as RelationshipStageCommand), { code: "INVALID_TASK" });
    });
  }
}

test("active requires a normalized nonempty goal and explicitly preserves existing tasks", () => {
  const existing = task();
  const before = structuredClone(existing);
  const result = stage({ ...base, stage: "active", activeGoal: "  确认合作范围  " }, [existing]);
  assert.equal(result.connection.activeGoal, "确认合作范围");
  assert.equal(result.connection.version, 4);
  assert.deepEqual(result.upsertTasks, []);
  assert.deepEqual(result.dismissTasks, []);
  assert.deepEqual(existing, before);
  for (const activeGoal of [undefined, "", "  "]) {
    assert.throws(() => stage({ ...base, stage: "active", activeGoal } as RelationshipStageCommand), { code: "INVALID_TRANSITION" });
  }
});

test("archive requires exact confirmation of open and scheduled tasks, never closed ones", () => {
  const tasks = [task(), task({ taskId: "task:scheduled", status: "scheduled" }), task({ taskId: "task:closed", status: "completed" })];
  for (const dismissTaskIds of [[], ["task:existing"], ["task:existing", "task:scheduled", "task:closed"], ["task:existing", "task:existing", "task:scheduled"]]) {
    assert.throws(() => stage({ ...base, stage: "archived", dismissTaskIds }, tasks), { code: "INVALID_TASK" });
  }
  const result = stage({ ...base, stage: "archived", dismissTaskIds: ["task:scheduled", "task:existing"], reason: "不再跟进" }, tasks);
  assert.equal(result.connection.stage, "archived");
  assert.equal(result.connection.version, 4);
  assert.equal(result.connection.activeGoal, null);
  assert.deepEqual(result.dismissTasks.map(({ taskId, status, version }) => ({ taskId, status, version })), [
    { taskId: "task:existing", status: "dismissed", version: 3 },
    { taskId: "task:scheduled", status: "dismissed", version: 3 },
  ]);
  assert.deepEqual(tasks.map(({ status }) => status), ["open", "scheduled", "completed"]);
  assert.equal(JSON.stringify(result.audit).includes("不再跟进"), false);
});

test("ownership and optimistic versions fail before returning a plan", () => {
  assert.throws(() => stage({ ...base, actorId: "account:other", stage: "active", activeGoal: "goal" }), { code: "FORBIDDEN" });
  assert.throws(() => stage({ ...base, connectionId: "connection:other", stage: "active", activeGoal: "goal" }), { code: "NOT_FOUND" });
  for (const expectedVersion of [0, 2, 3.5, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => stage({ ...base, expectedVersion, stage: "active", activeGoal: "goal" }), { code: "CONFLICT" });
  }
  for (const overrides of [{ actorId: "account:other" }, { contactId: "contact:other" }, { connectionId: "connection:other" }]) {
    assert.throws(() => stage({ ...base, stage: "active", activeGoal: "goal" }, [task(overrides)]), { code: "FORBIDDEN" });
  }
});

test("new task ids cannot overwrite existing tasks and blank titles are rejected", () => {
  assert.throws(() => stage({ ...base, stage: "nurture", nextTask: { ...nextTask, taskId: "task:existing" } }, [task()]), { code: "INVALID_TASK" });
  for (const title of ["", "  "]) {
    assert.throws(() => stage({ ...base, stage: "nurture", nextTask: { ...nextTask, title } }), { code: "INVALID_TASK" });
  }
});

test("a passed due date never advances the stage", () => {
  const connection = { ...current, stage: "needs_follow_up" as const, activeGoal: null };
  const result = applyRelationshipStageCommand({
    command: { ...base, stage: "needs_follow_up", nextTask: { ...nextTask, dueAt: "2026-08-01T00:00:00Z" } },
    current: connection, tasks: [task()], now: "2026-09-01T00:00:00.000Z",
  });
  assert.equal(result.connection.stage, "needs_follow_up");
  assert.deepEqual(result.dismissTasks, []);
});

for (const from of ["needs_follow_up", "active", "nurture", "archived"] as const) {
  for (const to of ["needs_follow_up", "active", "nurture", "archived"] as const) {
    test(`explicit transition ${from} to ${to} increments version once`, () => {
      const command: RelationshipStageCommand = to === "active"
        ? { ...base, stage: to, activeGoal: "目标" }
        : to === "archived" ? { ...base, stage: to, dismissTaskIds: [] }
          : { ...base, stage: to, nextTask };
      const result = applyRelationshipStageCommand({ command, current: { ...current, stage: from }, tasks: [], now });
      assert.equal(result.connection.stage, to);
      assert.equal(result.connection.version, 4);
    });
  }
}

test("task completion cannot omit its closing outcome", () => {
  assert.throws(() => complete(undefined as never), { code: "INVALID_TRANSITION" });
});

for (const outcome of [
  { kind: "next_task", nextTask },
  { kind: "active", activeGoal: "明确合作目标" },
  { kind: "nurture", nextTask },
  { kind: "archived", dismissTaskIds: [] },
] satisfies RelationshipTaskCompletionCommand["outcome"][]) {
  test(`task completion closes the task and applies ${outcome.kind} in a single plan`, () => {
    const result = complete(outcome);
    const completed = result.upsertTasks.find(({ taskId }) => taskId === "task:existing");
    assert.equal(completed?.status, "completed");
    assert.equal(completed?.version, 3);
    assert.equal(result.connection.version, 4);
    assert.equal(result.connection.stage, outcome.kind === "next_task" ? "needs_follow_up" : outcome.kind);
    assert.equal(result.audit.command, "complete_task");
    assert.ok(result.audit.taskIds.includes("task:existing"));
    if (outcome.kind === "next_task" || outcome.kind === "nurture") {
      assert.equal(result.upsertTasks.find(({ taskId }) => taskId === "task:next")?.version, 1);
    }
  });
}

test("task completion rejects stale task/connection versions and missing tasks", () => {
  const outcome = { kind: "active", activeGoal: "目标" } as const;
  assert.throws(() => complete(outcome, { expectedTaskVersion: 1 }), { code: "CONFLICT" });
  assert.throws(() => complete(outcome, { expectedConnectionVersion: 2 }), { code: "CONFLICT" });
  assert.throws(() => complete(outcome, { taskId: "task:missing" }), { code: "NOT_FOUND" });
});

test("maintenance completion creates the next maintenance task without changing stage", () => {
  const result = applyRelationshipTaskCompletion({
    command: { actorId: current.actorId, connectionId: current.connectionId, taskId: "task:existing", expectedConnectionVersion: 3, expectedTaskVersion: 2, idempotencyKey: "complete:2", outcome: { kind: "next_task", nextTask } },
    current: { ...current, stage: "nurture", activeGoal: null }, tasks: [task({ purpose: "maintenance" })], now,
  });
  assert.equal(result.connection.stage, "nurture");
  assert.equal(result.upsertTasks.find(({ taskId }) => taskId === "task:next")?.purpose, "maintenance");
});

test("audit identities are deterministic and scoped to actor and connection", () => {
  const command = { ...base, stage: "active", activeGoal: "目标" } as const;
  const first = stage(command);
  const other = applyRelationshipStageCommand({ command: { ...command, actorId: "account:other", connectionId: "connection:other" }, current: { ...current, actorId: "account:other", connectionId: "connection:other" }, tasks: [], now });
  assert.notEqual(first.audit.auditId, other.audit.auditId);
  assert.equal(stage(command).audit.auditId, first.audit.auditId);
});
