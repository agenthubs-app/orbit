import assert from "node:assert/strict";
import test from "node:test";

import {
  contactIdsWithOpenFollowUps,
  followUpContactId,
  isOpenFollowUpTask,
  type FollowUpTaskInput,
} from "../../shared/compute/follow-up-task";

// R11a / R20a 代定（2026-10-18）：「要フォロー」= 有还开着的跟进（普通任务 + 关系跟进任务）。
const cases: readonly [string, FollowUpTaskInput, boolean][] = [
  ["open task on a contact", { status: "open", category: "work", relatedContactId: "c1" }, true],
  ["open relationship task without a contact", { status: "open", category: "relationship" }, true],
  ["open personal task without a contact", { status: "open", category: "personal" }, false],
  ["completed task on a contact", { status: "completed", relatedContactId: "c1" }, false],
  ["cancelled task on a contact", { status: "cancelled", relatedContactId: "c1" }, false],
  ["deleted (deletedAt) task", { status: "open", relatedContactId: "c1", deletedAt: "2026-10-01T00:00:00Z" }, false],
  ["deleted (lifecycleState) task", { status: "open", relatedContactId: "c1", lifecycleState: "deleted" }, false],
  ["deleted (flag) task", { status: "open", relatedContactId: "c1", deleted: true }, false],
  ["empty contact id is not a contact", { status: "open", category: "work", relatedContactId: "  " }, false],
  ["unknown task status", { status: "paused", relatedContactId: "c1" }, false],
  ["scheduled plain task is not open (plain tasks only know open)", { status: "scheduled", relatedContactId: "c1" }, false],
  ["lifecycle open", { kind: "lifecycle", status: "open", contactId: "c1", connectionId: "k1" }, true],
  ["lifecycle scheduled", { kind: "lifecycle", status: "scheduled", contactId: "c1" }, true],
  ["lifecycle with only a connection id", { kind: "lifecycle", status: "open", connectionId: "k1" }, true],
  ["lifecycle completed", { kind: "lifecycle", status: "completed", contactId: "c1" }, false],
  ["lifecycle dismissed", { kind: "lifecycle", status: "dismissed", contactId: "c1" }, false],
  ["lifecycle unknown status", { kind: "lifecycle", status: "snoozed", contactId: "c1" }, false],
  ["lifecycle with neither id", { kind: "lifecycle", status: "open" }, false],
  ["lifecycle deleted", { kind: "lifecycle", status: "open", contactId: "c1", deletedAt: "2026-10-01T00:00:00Z" }, false],
];

for (const [name, task, expected] of cases) {
  test(`isOpenFollowUpTask: ${name}`, () => {
    assert.equal(isOpenFollowUpTask(task), expected);
  });
}

test("followUpContactId names the contact of an open follow-up only", () => {
  assert.equal(followUpContactId({ status: "open", relatedContactId: "c1" }), "c1");
  assert.equal(followUpContactId({ kind: "lifecycle", status: "scheduled", contactId: "c2", connectionId: "k2" }), "c2");
  assert.equal(followUpContactId({ status: "open", category: "relationship" }), null);
  assert.equal(followUpContactId({ status: "completed", relatedContactId: "c1" }), null);
});

test("contactIdsWithOpenFollowUps counts people, not tasks", () => {
  const ids = contactIdsWithOpenFollowUps([
    { status: "open", relatedContactId: "c1" },
    { status: "open", relatedContactId: "c1" },
    { kind: "lifecycle", status: "open", contactId: "c1" },
    { kind: "lifecycle", status: "scheduled", contactId: "c2" },
    { status: "completed", relatedContactId: "c3" },
  ]);
  assert.deepEqual([...ids].sort(), ["c1", "c2"]);
});
