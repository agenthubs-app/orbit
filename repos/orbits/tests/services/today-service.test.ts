import assert from "node:assert/strict";
import test from "node:test";

import { createTaskRepository } from "../../features/tasks/repository";
import { createTaskService } from "../../features/tasks/service";
import { createTaskSuggestionRepository } from "../../features/tasks/suggestion-repository";
import { createTaskSuggestionService } from "../../features/tasks/suggestion-service";
import { createTodayService } from "../../features/tasks/today-service";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

const actorId = "account:xiaoyu";
const workspaceId = "workspace:today";
const now = "2026-08-29T03:30:00.000Z"; // 12:30 in Tokyo

function services() {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const taskService = createTaskService({
    repository: createTaskRepository({ store, workspaceId }),
  });
  const suggestionService = createTaskSuggestionService({
    repository: createTaskSuggestionRepository({ store, workspaceId }),
    taskService,
  });
  return { suggestionService, taskService };
}

test("aggregates today's open work, completion facts, suggestions, and schedule", async () => {
  const { suggestionService, taskService } = services();
  const todayTask = await taskService.create({
    actorId,
    title: "整理活动参会名单",
    category: "event",
    plannedDate: "2026-08-29",
    idempotencyKey: "today:event-list",
    now: "2026-08-28T10:00:00.000Z",
  });
  await taskService.create({
    actorId,
    title: "下周提交公司资料",
    category: "work",
    plannedDate: "2026-09-02",
    idempotencyKey: "future:company-docs",
    now: "2026-08-28T10:00:00.000Z",
  });
  const completed = await taskService.create({
    actorId,
    title: "确认团队周会议程",
    category: "meeting",
    plannedDate: "2026-08-29",
    idempotencyKey: "today:meeting-agenda",
    now: "2026-08-28T10:00:00.000Z",
  });
  await taskService.complete({
    actorId,
    taskId: completed.task.id,
    completedBy: actorId,
    completionSource: "user",
    idempotencyKey: "complete:meeting-agenda",
    now: "2026-08-29T02:00:00.000Z",
  });
  await suggestionService.suggest({
    actorId,
    title: "活动前确认重点联系人",
    reason: "今晚参会，提前确认更容易见到",
    category: "relationship",
    evidenceIds: ["evidence:event"],
    confidence: 0.9,
    deduplicationKey: "today:event-contacts",
    now: "2026-08-29T01:00:00.000Z",
  });

  const observedActors: string[] = [];
  const service = createTodayService({
    taskService,
    suggestionService,
    scheduleProvider: {
      async list(input) {
        observedActors.push(input.actorId);
        return [
          {
            id: "schedule:morning-meeting",
            kind: "meeting",
            category: "meeting",
            state: "upcoming",
            title: "团队周会",
            startsAt: "2026-08-29T01:00:00.000Z",
            endsAt: "2026-08-29T02:00:00.000Z",
            sourceId: "appointment:weekly",
          },
          {
            id: "schedule:evening-event",
            kind: "event",
            category: "event",
            state: "upcoming",
            title: "关西跨境商务交流会",
            startsAt: "2026-08-29T09:30:00.000Z",
            sourceId: "event:kansai",
          },
          {
            id: "schedule:future",
            kind: "personal",
            category: "personal",
            state: "upcoming",
            title: "下周体检",
            startsAt: "2026-09-02T01:00:00.000Z",
            sourceId: "calendar:health-check",
          },
        ];
      },
    },
  });

  const result = await service.getToday({
    actorId,
    now,
    timeZone: "Asia/Tokyo",
  });

  assert.deepEqual(observedActors, [actorId]);
  assert.deepEqual(result.tasks.map((item) => item.id), [todayTask.task.id]);
  assert.equal(result.completedCount, 1);
  assert.equal(result.suggestions.length, 1);
  assert.deepEqual(
    result.schedule.map((item) => [item.id, item.state]),
    [
      ["schedule:morning-meeting", "ended"],
      ["schedule:evening-event", "upcoming"],
    ],
  );
  assert.equal(result.summary.openTaskCount, 1);
  assert.equal(result.summary.scheduleCount, 2);
});

test("includes overdue open tasks but never completed tasks in today's open list", async () => {
  const { suggestionService, taskService } = services();
  const overdue = await taskService.create({
    actorId,
    title: "补交历史资料",
    category: "work",
    dueAt: "2026-08-28T02:00:00.000Z",
    idempotencyKey: "overdue:documents",
    now: "2026-08-27T02:00:00.000Z",
  });
  const service = createTodayService({
    taskService,
    suggestionService,
    scheduleProvider: { async list() { return []; } },
  });

  const result = await service.getToday({ actorId, now, timeZone: "Asia/Tokyo" });
  assert.deepEqual(result.tasks.map((item) => item.id), [overdue.task.id]);
});
