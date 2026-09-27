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
  assert.equal(view.summary, "1 条建议需要你复核。所有写入逐次确认，对外消息不会自动发送。");
  assert.equal(view.nextAction, "先看高优先级建议；确认联系人、语气和依据后再继续。");
  assert.equal(view.metrics[0], "1 条待确认");
  assert.equal(view.metrics[1], "高优先级 1");
  assert.equal(view.settings.policyLabel, "固定安全策略");
  assert.equal(view.settings.confirmationLabel, "系统内写入逐次确认；对外发送禁止");
  assert.deepEqual(view.settings.rules, [
    "读取关系上下文和准备草稿可以自动完成。",
    "创建任务、提醒、日程或修改资料前，每次都需要你确认。",
    "消息和邮件只保存草稿，Orbit 永不自动发送。"
  ]);
  assert.equal(view.actions[0]?.title, "复核 Maya Chen 的活动后联系");
  assert.equal(view.actions[0]?.actionTypeLabel, "活动后联系");
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

test("agentActionsToView exposes one fixed safety policy", () => {
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

  assert.equal(view.settings.policyLabel, "固定安全策略");
  assert.equal(view.settings.summary, "这条边界不随“自主等级”变化，所有入口遵循同一套规则。");
  assert.doesNotMatch(flattenedText(view.settings), /autonomy|drafts|sourced/iu);
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

// 0126 Simulator regression: GET /api/agent/actions (ledger compatibility queue)
// returns every ledger entry. The Agent center showed completed and approved
// entries as "待确认" with a confirm button ("4 条待确认") while All Actions said
// "1 条等待确认". Payload captured from the local production build (QA data).
const ledgerQueuePayload = {"actions":[{"actionId":"iorbit-qa-ledger:done-001","actionType":"dormant_activation","title":"整理会后名单 — 东京 AI 交流会","contactName":"田中美咲","organization":"东京 AI 交流会","priority":"low","recommendedAction":"创建「整理东京 AI 交流会的会后名单」任务。","reason":"活动结束后 48 小时内整理名单的回复率最高。","dueLabel":"completed","confirmationRequired":false},{"actionId":"iorbit-qa-ledger:later-001","actionType":"event_reminder","title":"设置回访提醒 — 伊藤香織","contactName":"伊藤香織","organization":"横滨餐饮","priority":"medium","recommendedAction":"在下个月初提醒你回访伊藤香織，避免关系进入沉默期。","reason":"这条关系已经四周没有新的互动记录。","dueLabel":"deferred","confirmationRequired":true},{"actionId":"iorbit-qa-ledger:today-001","actionType":"message_draft_suggestion","title":"准备回信草稿 — 高橋智子","contactName":"高橋智子","organization":"青叶餐饮","priority":"low","recommendedAction":"保存给高橋智子的回信草稿，落点是她提过的门店选址问题。","reason":"对方的上一封邮件已经等了两天回复。","dueLabel":"approved","confirmationRequired":false},{"actionId":"iorbit-qa-ledger:decide-001","actionType":"dormant_activation","title":"建立跟进任务 — 佐藤健一","contactName":"佐藤健一","organization":"北星餐饮","priority":"high","recommendedAction":"创建「与佐藤健一确认下一步」跟进任务，含上次会面的三条结论。","reason":"上次会面后的跟进窗口还剩三天。","dueLabel":"Awaiting confirmation","confirmationRequired":true}]};

test("the Agent center lists only actions that still need a decision", () => {
  const view = agentActionsToView({ actionsPayload: ledgerQueuePayload });
  assert.deepEqual(view.actions.map((action) => action.title), ["设置回访提醒 — 伊藤香織", "建立跟进任务 — 佐藤健一"]);
  assert.ok(view.actions.every((action) => action.confirmationLabel === "需要你确认"));
  assert.equal(view.metrics[0], "2 条待确认");
  assert.match(view.summary, /^2 条建议需要你复核/);
});

test("a queue with only finished actions shows the empty Agent center", () => {
  const finished = { actions: ledgerQueuePayload.actions.filter((action: { confirmationRequired: boolean }) => !action.confirmationRequired) };
  const view = agentActionsToView({ actionsPayload: finished });
  assert.equal(view.actions.length, 0);
  assert.equal(view.metrics[0], "0 条待确认");
});
