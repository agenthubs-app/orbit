import assert from "node:assert/strict";
import test from "node:test";

import { agentActionsToView } from "../src/view-models/agent-actions";

function flattenedText(value: unknown): string {
  return JSON.stringify(value);
}

test("agentActionsToView maps action queue and safety settings into Chinese cards", () => {
  const view = agentActionsToView({
    actionsPayload: {
      actions: [
        {
          actionId: "demo-action-2",
          actionType: "post_event_followup",
          confirmationRequired: true,
          contactName: "Maya Chen",
          dueLabel: "This week",
          externalSideEffectExecuted: false,
          organization: "Kumo Grid",
          priority: "high",
          recommendedAction:
            "Send Maya the promised reliability memo and ask for pilot-scope feedback.",
          reason:
            "Maya asked for concrete reliability proof after the Tokyo Climate Dinner.",
          title: "Follow up with Maya Chen"
        }
      ],
      nextAction:
        "Review each action's evidence and require explicit confirmation before any live external action could run.",
      state: "success",
      summary:
        "Mock agent action queue uses deterministic event, follow-up, dormancy, draft, and appointment rules without autonomous execution or provider calls."
    },
    settingsPayload: {
      currentLevel: "medium",
      levels: [
        {
          boundary:
            "May rank sourced next steps and prepare local drafts; every send, calendar change, notification, and database mutation remains blocked.",
          confirmationRequiredBeforeExternalAction: true,
          label: "Medium autonomy",
          level: "medium",
          operatorControl:
            "The operator reviews ranked recommendations and explicitly confirms any later external action.",
          rules: [
            "Rank recommendations from deterministic fixtures.",
            "Prepare local drafts only when source evidence is visible.",
            "Keep external writes behind confirmation."
          ]
        }
      ],
      nextAction:
        "Choose an autonomy level, inspect its confirmation rule, and keep all external actions behind explicit confirmation.",
      state: "success",
      summary:
        "Mock autonomy settings expose low, medium, and high boundaries without autonomous execution policies, scheduled live jobs, provider calls, devices, databases, or external networks."
    }
  });

  assert.equal(view.title, "Agent 动作中心");
  assert.equal(view.summary, "1 条建议需要你复核。当前为中等自主，所有对外动作都需要你确认。");
  assert.equal(view.nextAction, "先看高优先级建议；确认联系人、语气和依据后再继续。");
  assert.equal(view.metrics[0], "1 条待确认");
  assert.equal(view.metrics[1], "高优先级 1");
  assert.equal(view.settings.currentLevelLabel, "中等自主");
  assert.equal(view.settings.confirmationLabel, "对外动作前必须确认");
  assert.deepEqual(view.settings.rules, [
    "可以整理建议和草稿。",
    "发送消息、写日历、改资料前都要停下来等你确认。",
    "界面只展示可复核内容，不替你执行。"
  ]);
  assert.equal(view.actions[0]?.title, "复核 Maya Chen 的活动后跟进");
  assert.equal(view.actions[0]?.actionTypeLabel, "活动后跟进");
  assert.equal(view.actions[0]?.priorityLabel, "高优先级");
  assert.equal(view.actions[0]?.dueLabel, "本周");
  assert.equal(view.actions[0]?.confirmationLabel, "需要你确认");
  assert.equal(view.actions[0]?.recommendedAction, "先确认联系人、语气和依据，再决定是否继续。");
  assert.equal(view.actions[0]?.safetyLabel, "不会自动发送、排程或改资料");
  assert.equal(view.actions[0]?.acceptLabel, "确认建议");
  assert.equal(view.actions[0]?.dismissLabel, "暂不处理");

  assert.doesNotMatch(
    flattenedText(view),
    /\b(mock|fixture|provider|generated|source-backed|source:|evidence:|live store|live-store|database|postgres|external network|command-center|implementation)\b/iu
  );
});

test("agentActionsToView keeps the Agent center useful when the queue is empty", () => {
  const view = agentActionsToView({
    actionsPayload: {
      actions: [],
      nextAction: "Add relationship context before showing suggestions.",
      state: "empty",
      summary: "No local mock action queue records are available."
    },
    settingsPayload: null
  });

  assert.equal(view.summary, "暂时没有需要你复核的动作。");
  assert.equal(view.nextAction, "先处理关系仪表盘和收件箱里已经有依据的下一步。");
  assert.equal(view.metrics[0], "0 条待确认");
  assert.equal(view.actions.length, 0);
  assert.equal(view.emptyTitle, "没有待复核动作");
});

test("agentActionsToView exposes safe autonomy level choices", () => {
  const view = agentActionsToView({
    actionsPayload: { actions: [], state: "empty" },
    settingsPayload: {
      currentLevel: "medium",
      levels: [
        {
          level: "low",
          label: "Low autonomy",
          boundary:
            "Only display sourced reminders after the operator confirms the context is relevant."
        },
        {
          level: "medium",
          label: "Medium autonomy",
          boundary:
            "May rank sourced next steps and prepare local drafts; every send remains blocked."
        },
        {
          level: "high",
          label: "High autonomy",
          boundary:
            "Can prepare staged action plans only after explicit confirmation is recorded."
        }
      ]
    }
  });

  assert.deepEqual(view.settings.levelOptions, [
    {
      detail: "只整理提醒和依据；是否继续由你判断。",
      label: "低自主",
      level: "low",
      selected: false
    },
    {
      detail: "可以排序下一步、起草内容；对外动作仍要你确认。",
      label: "中等自主",
      level: "medium",
      selected: true
    },
    {
      detail: "可以准备行动预案；发送、排程和改资料仍会停下来。",
      label: "高自主",
      level: "high",
      selected: false
    }
  ]);
  assert.doesNotMatch(flattenedText(view.settings.levelOptions), /autonomy|drafts|sourced/iu);
});

test("agentActionsToView localizes confirmation-based due labels", () => {
  const view = agentActionsToView({
    actionsPayload: {
      actions: [
        {
          actionId: "agent_action_001",
          actionType: "event_reminder",
          confirmationRequired: true,
          contactName: "鈴木 真理",
          dueLabel: "Awaiting confirmation",
          organization: "Sakura Bridge Foods",
          priority: "high"
        }
      ],
      state: "success"
    }
  });

  assert.equal(view.actions[0]?.dueLabel, "等你确认");
});
