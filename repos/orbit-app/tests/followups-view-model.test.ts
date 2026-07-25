import assert from "node:assert/strict";
import test from "node:test";

import * as followups from "../src/view-models/followups";

const { followupInlineContextLabel, followupsToView } = followups;

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

test("generatedFollowupTasksToView maps generated task candidates into review cards", () => {
  const generatedFollowupTasksToView = (
    followups as typeof followups & {
      generatedFollowupTasksToView?: (payload: unknown) => {
        nextAction: string;
        safetyText: string;
        summary: string;
        tasks: Array<{
          dueLabel: string;
          recommendedAction: string;
          sourceLabel: string;
          title: string;
        }>;
        title: string;
      };
    }
  ).generatedFollowupTasksToView;

  assert.equal(typeof generatedFollowupTasksToView, "function");

  const view = generatedFollowupTasksToView?.({
    nextAction: "先复核候选任务，再决定是否写入任务列表。",
    state: "success",
    summary: "Generated 2 follow-up task candidates.",
    tasks: [
      {
        contactName: "林小雨",
        dueInDays: 1,
        evidenceIds: ["evidence_001"],
        organization: "Orbit",
        priority: "this_week",
        rationale: "对方希望下周看 AI 销售助理 demo。",
        recommendedAction: "发一条短消息约下周 demo 时间。",
        source: {
          label: "活动记录"
        },
        taskId: "generated_task_001",
        triggerKind: "promised_action"
      },
      {
        contactName: "佐藤 健",
        dueInDays: 4,
        organization: "Kansai DX Lab",
        priority: "nurture",
        recommendedAction: "整理一次东京客户案例给对方。",
        taskId: "generated_task_002",
        triggerKind: "event_encounter"
      }
    ]
  });

  assert.equal(view?.title, "新生成的跟进");
  assert.equal(view?.summary, "生成了 2 个候选跟进");
  assert.equal(view?.nextAction, "先复核候选任务，再决定是否写入任务列表。");
  assert.equal(view?.safetyText, "这些只是候选，不会自动发送消息或写入日程。");
  assert.equal(view?.tasks[0]?.title, "跟进 林小雨");
  assert.equal(view?.tasks[0]?.dueLabel, "明天");
  assert.equal(view?.tasks[0]?.sourceLabel, "活动记录");
  assert.equal(view?.tasks[0]?.recommendedAction, "发一条短消息约下周 demo 时间。");
});

test("generatedFollowupRemindersToView maps generated reminder candidates into review cards", () => {
  const generatedFollowupRemindersToView = (
    followups as typeof followups & {
      generatedFollowupRemindersToView?: (payload: unknown) => {
        nextAction: string;
        reminders: Array<{
          dueLabel: string;
          queueLabel: string;
          title: string;
          windowLabel: string;
        }>;
        safetyText: string;
        summary: string;
        title: string;
      };
    }
  ).generatedFollowupRemindersToView;

  assert.equal(typeof generatedFollowupRemindersToView, "function");

  const view = generatedFollowupRemindersToView?.({
    nextAction: "Review reminder evidence before enabling any live delivery channel.",
    notificationQueue: [
      {
        queueEntryId: "queue_001",
        reminderIds: ["reminder_001"],
        scheduledFor: "2026-07-25T09:00:00+09:00"
      }
    ],
    reminders: [
      {
        contactName: "王琳",
        dueAt: "2026-07-25T09:00:00+09:00",
        dueInDays: 1,
        organization: "红桥科技",
        priority: "normal",
        recommendedWindow: "复核后明天上午提醒。",
        reminderId: "reminder_001",
        title: "Review follow-up for contact_029"
      }
    ],
    state: "success",
    summary:
      "Local reminder rules produced due-date reminders and mock notification queue entries without providers or cron jobs."
  });

  assert.equal(view?.title, "新生成的提醒");
  assert.equal(view?.summary, "生成了 1 条提醒候选");
  assert.equal(view?.nextAction, "先复核时间和来源，再决定是否开启提醒。");
  assert.equal(
    view?.safetyText,
    "这些只是提醒候选，不会发送推送、邮件或短信。"
  );
  assert.equal(view?.reminders[0]?.title, "提醒跟进 王琳");
  assert.equal(view?.reminders[0]?.dueLabel, "7月25日 周六 09:00");
  assert.equal(view?.reminders[0]?.windowLabel, "复核后明天上午提醒。");
  assert.equal(view?.reminders[0]?.queueLabel, "1 条通知待复核");
});

test("buildReminderGenerationRequest prepares review-only reminder candidates", () => {
  const buildReminderGenerationRequest = (
    followups as typeof followups & {
      buildReminderGenerationRequest?: () => unknown;
    }
  ).buildReminderGenerationRequest;

  assert.equal(typeof buildReminderGenerationRequest, "function");

  assert.deepEqual(buildReminderGenerationRequest?.(), {
    dueWithinDays: 14,
    includeGroupedLowPriority: true,
    limit: 5
  });
});

test("buildMessageDraftRequestFromTask prepares the web message draft request", () => {
  const buildMessageDraftRequestFromTask = (
    followups as typeof followups & {
      buildMessageDraftRequestFromTask?: (task: unknown) => unknown;
    }
  ).buildMessageDraftRequestFromTask;

  assert.equal(typeof buildMessageDraftRequestFromTask, "function");

  const request = buildMessageDraftRequestFromTask?.({
    contactName: "王琳",
    organization: "红桥科技",
    recommendedAction: "先确认对方是否愿意继续聊日本落地服务。"
  });

  assert.deepEqual(request, {
    channel: "email",
    contextNote: "先确认对方是否愿意继续聊日本落地服务。",
    draftKind: "follow_up",
    organization: "红桥科技",
    recipientName: "王琳"
  });
});

test("chat follow-up draft helpers use the web writing assist route", () => {
  const buildChatFollowupDraftRequestFromTask = (
    followups as typeof followups & {
      buildChatFollowupDraftRequestFromTask?: (task: unknown) => unknown;
    }
  ).buildChatFollowupDraftRequestFromTask;
  const chatFollowupDraftsToView = (
    followups as typeof followups & {
      chatFollowupDraftsToView?: (payload: unknown) => {
        drafts: Array<{
          body: string;
          id: string;
          reason: string;
          recipientLine: string;
          safetyText: string;
          sourceLabel: string;
          title: string;
        }>;
        nextAction: string;
        summary: string;
        title: string;
      };
    }
  ).chatFollowupDraftsToView;

  assert.equal(typeof buildChatFollowupDraftRequestFromTask, "function");
  assert.equal(typeof chatFollowupDraftsToView, "function");

  assert.deepEqual(
    buildChatFollowupDraftRequestFromTask?.({
      contactName: "王琳",
      organization: "红桥科技",
      rationale: "对方提到可以介绍关西合作渠道。",
      recommendedAction: "先确认对方是否愿意继续聊日本落地服务。"
    }),
    {
      contextNote: "先确认对方是否愿意继续聊日本落地服务。",
      organization: "红桥科技",
      participantName: "王琳",
      sourceText: "对方提到可以介绍关西合作渠道。"
    }
  );

  const view = chatFollowupDraftsToView?.({
    assists: [
      {
        assistId: "assist_followup_001",
        kind: "follow_up_draft",
        label: "Follow-up draft",
        organization: "红桥科技",
        participantName: "王琳",
        rationale:
          "Use the sourced event context, then keep delivery behind confirmation.",
        sendActionRequiresConfirmation: true,
        source: {
          label: "活动记录"
        },
        suggestedText:
          "王琳您好，上次活动提到关西合作渠道。想确认一下，您这周是否方便聊 15 分钟？"
      }
    ],
    nextAction:
      "Review source evidence and confirmation requirements before any external send action.",
    state: "success",
    summary: "Generated one follow-up draft."
  });

  assert.deepEqual(view, {
    drafts: [
      {
        body:
          "王琳您好，上次活动提到关西合作渠道。想确认一下，您这周是否方便聊 15 分钟？",
        id: "assist_followup_001",
        reason: "先按自己的语气改一遍，再决定是否保存为正式草稿。",
        recipientLine: "王琳 · 红桥科技",
        safetyText: "这里只生成文案，不会保存草稿或发送消息。",
        sourceLabel: "活动记录",
        title: "跟进草稿"
      }
    ],
    nextAction: "先检查文案，再决定是否保存或发送。",
    summary: "1 条 AI 草稿待复核",
    title: "AI 跟进草稿"
  });
});

test("messageDraftsToView maps generated message drafts into Chinese review cards", () => {
  const messageDraftsToView = (
    followups as typeof followups & {
      messageDraftsToView?: (payload: unknown) => {
        drafts: Array<{
          body: string;
          channelLabel: string;
          recipientLine: string;
          reviewLabel: string;
          safetyText: string;
          sourceLabel: string;
          subject: string;
          windowLabel: string;
        }>;
        nextAction: string;
        summary: string;
        title: string;
      };
    }
  ).messageDraftsToView;

  assert.equal(typeof messageDraftsToView, "function");

  const view = messageDraftsToView?.({
    drafts: [
      {
        body: "王总，今天聊到日本落地的税务和设立顾问，我整理了一份候选名单。",
        channel: "email",
        draftId: "draft_001",
        evidenceIds: ["evidence_001", "evidence_002"],
        organization: "红桥科技",
        recipientName: "王琳",
        recommendedSendWindow: "24 小时内",
        relationshipContext: "活动后跟进",
        sendActionRequiresConfirmation: true,
        source: {
          label: "活动记录"
        },
        status: "held_for_review",
        subject: "日本落地顾问名单"
      }
    ],
    nextAction: "Review source evidence and confirmation requirements before any external send action.",
    state: "success",
    summary: "Local rules prepared a follow-up draft."
  });

  assert.equal(view?.title, "消息草稿");
  assert.equal(view?.summary, "1 封草稿待复核");
  assert.equal(view?.nextAction, "先检查草稿，再决定是否发送。");
  assert.equal(view?.drafts[0]?.subject, "日本落地顾问名单");
  assert.equal(view?.drafts[0]?.recipientLine, "王琳 · 红桥科技");
  assert.equal(view?.drafts[0]?.channelLabel, "邮件");
  assert.equal(view?.drafts[0]?.reviewLabel, "待复核");
  assert.equal(view?.drafts[0]?.sourceLabel, "活动记录");
  assert.equal(view?.drafts[0]?.windowLabel, "建议 24 小时内");
  assert.equal(
    view?.drafts[0]?.safetyText,
    "这里只保存草稿，不会自动发送。"
  );
});

test("buildMessageDraftReviewRequest marks a draft ready without sending", () => {
  const buildMessageDraftReviewRequest = (
    followups as typeof followups & {
      buildMessageDraftReviewRequest?: (draft: unknown) => unknown;
    }
  ).buildMessageDraftReviewRequest;

  assert.equal(typeof buildMessageDraftReviewRequest, "function");

  const request = buildMessageDraftReviewRequest?.({
    id: "draft_001",
    subject: "日本落地顾问名单"
  });

  assert.deepEqual(request, {
    reviewerLabel: "Orbit iOS",
    status: "ready_for_confirmation"
  });
});
