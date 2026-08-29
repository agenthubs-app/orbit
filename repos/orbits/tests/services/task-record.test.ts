import assert from "node:assert/strict";
import test from "node:test";

import type {
  TaskActivityDTO,
  TaskItemDTO,
  TaskRecordPayload,
} from "../../features/tasks/contract";
import { legacyTaskToTaskItem } from "../../features/tasks/legacy-task-adapter";
import {
  taskLiveRecordFromPayload,
  taskRecordFromLiveRecord,
} from "../../features/tasks/task-record";

const workspaceId = "workspace:tasks";
const actorId = "account:xiaoyu";
const createdAt = "2026-08-29T01:00:00.000Z";

function task(overrides: Partial<TaskItemDTO> = {}): TaskItemDTO {
  return {
    id: "task:prepare-event-materials",
    accountId: actorId,
    ownerUserId: actorId,
    title: "准备活动资料",
    notes: "整理参会者名单和介绍材料",
    status: "open",
    category: "event",
    plannedDate: "2026-08-29",
    dueAt: "2026-08-29T09:00:00.000Z",
    priority: "high",
    source: "manual",
    relatedEventId: "event:kansai-business",
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

function activity(
  overrides: Partial<TaskActivityDTO> = {},
): TaskActivityDTO {
  return {
    id: "task-activity:created",
    accountId: actorId,
    ownerUserId: actorId,
    taskId: "task:prepare-event-materials",
    type: "created",
    actorType: "user",
    actorId,
    occurredAt: createdAt,
    taskSnapshot: {
      title: "准备活动资料",
      category: "event",
      relatedEventId: "event:kansai-business",
    },
    ...overrides,
  };
}

function payload(overrides: Partial<TaskRecordPayload> = {}): TaskRecordPayload {
  return {
    version: 1,
    task: task(),
    activities: [activity()],
    ...overrides,
  };
}

test("round-trips one actor-owned task and its append-only activity history", () => {
  const source = payload();
  const record = taskLiveRecordFromPayload({ workspaceId, payload: source });

  assert.equal(record.collectionName, "tasks");
  assert.equal(record.recordId, source.task.id);
  assert.equal(record.userId, actorId);
  assert.equal(record.targetType, "event");
  assert.equal(record.targetId, "event:kansai-business");
  assert.deepEqual(taskRecordFromLiveRecord(record, actorId), source);
});

test("rejects records owned by another actor", () => {
  const record = taskLiveRecordFromPayload({ workspaceId, payload: payload() });

  assert.equal(taskRecordFromLiveRecord(record, "account:other"), null);
});

test("rejects unknown categories and malformed local dates while decoding", () => {
  const record = taskLiveRecordFromPayload({ workspaceId, payload: payload() });

  assert.equal(
    taskRecordFromLiveRecord(
      {
        ...record,
        payload: {
          ...record.payload,
          task: {
            ...(record.payload.task as Record<string, unknown>),
            category: "sales",
          },
        },
      },
      actorId,
    ),
    null,
  );
  assert.equal(
    taskRecordFromLiveRecord(
      {
        ...record,
        payload: {
          ...record.payload,
          task: {
            ...(record.payload.task as Record<string, unknown>),
            plannedDate: "2026-02-30",
          },
        },
      },
      actorId,
    ),
    null,
  );
});

test("requires completion metadata only while a task is completed", () => {
  assert.throws(
    () =>
      taskLiveRecordFromPayload({
        workspaceId,
        payload: payload({ task: task({ status: "completed" }) }),
      }),
    /completedAt/i,
  );

  const completed = task({
    status: "completed",
    completedAt: "2026-08-29T02:00:00.000Z",
    completedBy: actorId,
    completionSource: "user",
    updatedAt: "2026-08-29T02:00:00.000Z",
  });
  const record = taskLiveRecordFromPayload({
    workspaceId,
    payload: payload({
      task: completed,
      activities: [
        activity(),
        activity({
          id: "task-activity:completed",
          type: "completed",
          occurredAt: "2026-08-29T02:00:00.000Z",
        }),
      ],
    }),
  });

  assert.equal(taskRecordFromLiveRecord(record, actorId)?.task.status, "completed");
});

test("rejects activity history that is not in append order", () => {
  assert.throws(
    () =>
      taskLiveRecordFromPayload({
        workspaceId,
        payload: payload({
          activities: [
            activity({ id: "task-activity:later", occurredAt: "2026-08-30T00:00:00.000Z" }),
            activity({ id: "task-activity:earlier", occurredAt: createdAt }),
          ],
        }),
      }),
    /activity order/i,
  );
});

test("maps legacy follow-up task fields without mutating the shared legacy contract", () => {
  const mapped = legacyTaskToTaskItem(
    {
      id: "task:legacy-followup",
      title: "联系佐藤确认下次会面",
      status: "scheduled",
      contactId: "contact:sato",
      dueAt: "2026-08-30T03:00:00.000Z",
      source: { type: "agent_action", id: "action:1" },
      evidenceIds: ["evidence:1"],
      createdAt,
      updatedAt: createdAt,
    },
    actorId,
  );

  assert.deepEqual(mapped, {
    id: "task:legacy-followup",
    accountId: actorId,
    ownerUserId: actorId,
    title: "联系佐藤确认下次会面",
    status: "open",
    category: "relationship",
    dueAt: "2026-08-30T03:00:00.000Z",
    priority: "normal",
    source: "ai_confirmed",
    relatedContactId: "contact:sato",
    createdAt,
    updatedAt: createdAt,
  });
});
