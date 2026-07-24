import assert from "node:assert/strict";
import test from "node:test";

import {
  followupInlineContextLabel,
  followupsToView
} from "../src/view-models/followups";

test("followupsToView maps tasks and reminders into a Chinese review queue", () => {
  const view = followupsToView({
    notificationsPayload: {
      notificationQueue: [
        {
          queueEntryId: "queue_001",
          reminderIds: ["reminder_001"],
          channel: "push",
          status: "live_queued",
          scheduledFor: "2026-07-24T09:00:00+09:00",
          reason: "Live provider queued push notification for review"
        }
      ],
      reminders: [
        {
          reminderId: "reminder_001",
          contactName: "Maya Chen",
          dueAt: "2026-07-24T09:00:00+09:00",
          dueInDays: 0,
          organization: "Kumo Grid",
          priority: "high",
          recommendedWindow: "Review before the scheduled in-app reminder",
          title: "Review follow-up for contact_024"
        }
      ],
      summary: "Live storage generated reminder queue entries."
    },
    tasksPayload: {
      nextAction: "Review the top live follow-up task before any external action.",
      summary: "3 followup tasks were loaded from the live task store.",
      tasks: [
        {
          contactName: "Maya Chen",
          dueAt: "2026-07-24T10:00:00+09:00",
          dueInDays: 0,
          evidenceIds: ["evidence_001", "evidence_002"],
          organization: "Kumo Grid",
          priority: "today",
          rationale:
            "Maya asked for the AI workflow buyer intro after the Osaka event.",
          recommendedAction: "Review follow-up for contact_024",
          source: {
            label: "Live task store provider record"
          },
          taskId: "task_001",
          title: "Review follow-up for contact_024",
          triggerKind: "event_encounter"
        },
        {
          contactName: "王琳",
          dueInDays: 3,
          evidenceIds: ["evidence_003"],
          organization: "红桥科技",
          priority: "this_week",
          rationale: "活动现场提到可以介绍关西渠道。",
          recommendedAction: "先确认对方是否愿意继续聊日本落地服务。",
          source: {
            label: "活动记录"
          },
          taskId: "task_002",
          title: "Follow up with 王琳",
          triggerKind: "promised_action"
        }
      ]
    }
  });

  assert.equal(view.title, "跟进队列");
  assert.equal(view.summary, "2 个跟进 · 1 条提醒");
  assert.equal(view.safetyText, "这里只做复核，不会发送消息、创建提醒或写入日程。");
  assert.deepEqual(view.metrics, [
    { label: "待跟进", value: "2" },
    { label: "今天", value: "1" },
    { label: "提醒", value: "1" }
  ]);
  assert.equal(view.priorityTask?.title, "跟进 Maya Chen");
  assert.equal(view.priorityTask?.dueLabel, "7月24日 周五 10:00");
  assert.equal(view.priorityTask?.priorityLabel, "今天");
  assert.equal(view.priorityTask?.triggerLabel, "活动后");
  assert.equal(view.priorityTask?.sourceLabel, "来源已记录");
  assert.equal(view.priorityTask?.evidenceLabel, "2 条来源");
  assert.equal(view.priorityTask?.recommendedAction, "跟进 Maya Chen 的关系进展。");
  assert.equal(
    view.priorityTask?.rationale,
    "这条跟进来自已记录的关系上下文，先复核再行动。"
  );
  assert.equal(view.tasks[1]?.title, "跟进 王琳");
  assert.equal(view.tasks[1]?.sourceLabel, "活动记录");
  assert.equal(view.reminders[0]?.title, "提醒跟进 Maya Chen");
  assert.equal(view.reminders[0]?.queueLabel, "1 条通知待复核");
});

test("followupsToView keeps an empty queue useful", () => {
  const view = followupsToView({
    notificationsPayload: {},
    tasksPayload: {}
  });

  assert.equal(view.summary, "暂无跟进");
  assert.equal(view.priorityTask, null);
  assert.deepEqual(view.tasks, []);
  assert.deepEqual(view.reminders, []);
  assert.equal(view.nextAction, "先从联系人或活动里记录一个明确的下一步。");
});

test("followupsToView hides imported relationship implementation wording", () => {
  const view = followupsToView({
    notificationsPayload: {},
    tasksPayload: {
      tasks: [
        {
          contactName: "山崎 美穂",
          dueInDays: 0,
          organization: "Aoba Technologies",
          priority: "today",
          rationale:
            "山崎 美穂 has a concrete current-user relationship record from Direct QR scan for 山崎 美穂.",
          recommendedAction: "Review follow-up for contact_021",
          source: {
            label: "Direct QR scan provider record"
          },
          taskId: "task_021",
          triggerKind: "promised_action"
        }
      ]
    }
  });

  assert.equal(
    view.priorityTask?.rationale,
    "这条跟进来自已记录的关系上下文，先复核再行动。"
  );
  assert.equal(view.priorityTask?.sourceLabel, "来源已记录");
});

test("followupInlineContextLabel keeps AI cards in Chinese", () => {
  const view = followupsToView({
    notificationsPayload: {},
    tasksPayload: {
      tasks: [
        {
          contactName: "山崎 美穗",
          organization: "Aoba Technologies",
          priority: "today",
          source: {
            label: "现场扫码记录"
          },
          triggerKind: "promised_action"
        }
      ]
    }
  });
  const task = view.tasks[0];

  assert.ok(task);

  assert.equal(
    followupInlineContextLabel(task),
    "现场扫码记录 · 承诺事项"
  );
  assert.doesNotMatch(followupInlineContextLabel(task), /Technologies/u);
});
