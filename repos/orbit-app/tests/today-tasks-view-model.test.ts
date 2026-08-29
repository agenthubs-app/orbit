import assert from "node:assert/strict";
import test from "node:test";

import {
  todayHomeSummary,
  taskActivitiesToView,
  taskDetailToView,
  tasksToListView,
  todayToView,
} from "../src/view-models/today-tasks";

const openTask = {
  id: "task:event-list",
  accountId: "account:xiaoyu",
  ownerUserId: "account:xiaoyu",
  title: "整理活动参会名单",
  status: "open",
  category: "event",
  plannedDate: "2026-08-29",
  dueAt: "2026-08-29T03:00:00.000Z",
  priority: "high",
  source: "manual",
  createdAt: "2026-08-28T02:00:00.000Z",
  updatedAt: "2026-08-28T02:00:00.000Z",
};

test("todayToView keeps tasks, suggestions, and schedule compact and distinct", () => {
  const view = todayToView(
    {
      date: "2026-08-29",
      timeZone: "Asia/Tokyo",
      tasks: [openTask],
      completedCount: 2,
      suggestions: [
        {
          id: "suggestion:contacts",
          title: "活动前确认重点联系人",
          reason: "今晚参会，提前确认更容易见到",
          category: "relationship",
          status: "pending",
        },
      ],
      schedule: [
        {
          id: "schedule:meeting",
          kind: "meeting",
          category: "meeting",
          state: "ended",
          title: "团队周会",
          startsAt: "2026-08-29T01:00:00.000Z",
          endsAt: "2026-08-29T02:00:00.000Z",
          sourceId: "appointment:weekly",
        },
        {
          id: "schedule:event",
          kind: "event",
          category: "event",
          state: "upcoming",
          title: "关西跨境商务交流会",
          startsAt: "2026-08-29T09:30:00.000Z",
          location: "难波",
          sourceId: "event:kansai",
        },
      ],
      summary: {
        openTaskCount: 1,
        completedCount: 2,
        suggestionCount: 1,
        scheduleCount: 2,
      },
    },
    new Date("2026-08-29T03:30:00.000Z"),
  );

  assert.equal(view.dateLabel, "8月29日 周六");
  assert.equal(view.summary, "1 项待办 · 2 项日程");
  assert.deepEqual(view.tasks[0], {
    id: "task:event-list",
    title: "整理活动参会名单",
    categoryLabel: "活动",
    dueLabel: "已逾期",
    dueTone: "danger",
    priority: "high",
  });
  assert.equal(view.completedLabel, "已完成 2");
  assert.equal(view.suggestions[0]?.actionLabel, "加入待办");
  assert.equal(view.schedule[0]?.stateLabel, "已结束");
  assert.equal(view.schedule[1]?.stateLabel, "18:30");
  assert.equal(view.schedule[1]?.detail, "难波");
});

test("tasksToListView separates open and completed tasks without inventing completion", () => {
  const completedTask = {
    ...openTask,
    id: "task:completed",
    title: "确认团队周会议程",
    status: "completed",
    category: "meeting",
    completedAt: "2026-08-29T02:00:00.000Z",
    completedBy: "account:xiaoyu",
    completionSource: "user",
  };
  const payload = { tasks: [openTask, completedTask] };

  assert.deepEqual(
    tasksToListView(payload, "open").items.map((item) => item.id),
    [openTask.id],
  );
  const completed = tasksToListView(payload, "completed");
  assert.deepEqual(completed.items.map((item) => item.id), [completedTask.id]);
  assert.equal(completed.items[0]?.categoryLabel, "会面");
  assert.equal(completed.items[0]?.dateLabel, "8月29日 11:00");
});

test("tasksToListView orders upcoming work chronologically and history newest first", () => {
  const laterOpen = {
    ...openTask,
    id: "task:later",
    plannedDate: "2026-10-13",
    dueAt: "2026-10-13T08:00:00.000Z",
  };
  const earlierOpen = {
    ...openTask,
    id: "task:earlier",
    plannedDate: "2026-09-23",
    dueAt: "2026-09-23T08:00:00.000Z",
  };
  const olderCompleted = {
    ...openTask,
    id: "task:completed-older",
    status: "completed",
    completedAt: "2026-08-01T08:00:00.000Z",
  };
  const newerCompleted = {
    ...openTask,
    id: "task:completed-newer",
    status: "completed",
    completedAt: "2026-08-20T08:00:00.000Z",
  };

  assert.deepEqual(
    tasksToListView({ tasks: [laterOpen, earlierOpen] }, "open").items.map((item) => item.id),
    ["task:earlier", "task:later"],
  );
  assert.deepEqual(
    tasksToListView({ tasks: [olderCompleted, newerCompleted] }, "completed").items.map((item) => item.id),
    ["task:completed-newer", "task:completed-older"],
  );
});

test("today decoders discard malformed records instead of crashing the screen", () => {
  const view = todayToView({
    tasks: [{ id: 3, title: null }],
    suggestions: [null],
    schedule: [{ id: "broken" }],
  });

  assert.deepEqual(view.tasks, []);
  assert.deepEqual(view.suggestions, []);
  assert.deepEqual(view.schedule, []);
});

test("task detail and activity history expose stable Chinese labels", () => {
  const detail = taskDetailToView({ task: openTask });
  assert.equal(detail?.title, "整理活动参会名单");
  assert.equal(detail?.categoryLabel, "活动");
  assert.equal(detail?.statusLabel, "待办");

  const activities = taskActivitiesToView({
    activities: [
      {
        id: "activity:created",
        type: "created",
        occurredAt: "2026-08-28T02:00:00.000Z",
        taskSnapshot: { title: openTask.title, category: "event" },
      },
      {
        id: "activity:completed",
        type: "completed",
        occurredAt: "2026-08-29T02:00:00.000Z",
        taskSnapshot: { title: openTask.title, category: "event" },
      },
    ],
  });
  assert.deepEqual(
    activities.map((item) => item.label),
    ["创建待办", "完成待办"],
  );
  assert.equal(activities[1]?.dateLabel, "8月29日 11:00");
});

test("todayHomeSummary limits home rows and keeps tasks, schedules, and suggestions distinct", () => {
  const view = todayHomeSummary({
    tasks: [
      openTask,
      { ...openTask, id: "task:second", title: "确认会面材料", category: "meeting" },
    ],
    suggestions: [
      {
        id: "suggestion:one",
        title: "联系活动主办方",
        reason: "活动临近",
        category: "relationship",
        status: "pending",
      },
    ],
    schedule: [
      {
        id: "schedule:meeting",
        kind: "meeting",
        category: "meeting",
        state: "upcoming",
        title: "与渡边会面",
        startsAt: "2026-08-29T05:00:00.000Z",
        sourceId: "appointment:watanabe",
      },
      {
        id: "schedule:event",
        kind: "event",
        category: "event",
        state: "upcoming",
        title: "关西跨境商务交流会",
        startsAt: "2026-08-29T09:00:00.000Z",
        sourceId: "event:kansai",
      },
    ],
    summary: {
      openTaskCount: 2,
      completedCount: 1,
      suggestionCount: 1,
      scheduleCount: 2,
    },
  }, new Date("2026-08-29T03:30:00.000Z"));

  assert.equal(view.items.length, 3);
  assert.deepEqual(view.items.map((item) => item.kind), ["task", "task", "schedule"]);
  assert.equal(view.items[0]?.href, "/tasks/task%3Aevent-list");
  assert.equal(view.items[2]?.href, "/schedule");
  assert.equal(view.openTaskCount, 2);
  assert.equal(view.suggestionCount, 1);
});
