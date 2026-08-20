import assert from "node:assert/strict";
import test from "node:test";

import {
  agentSignalsToNextActionRows,
  type AgentTodaySignalView,
} from "../../app/(app)/app/agent/orbit-agent-next-actions";

function signal(
  overrides: Partial<AgentTodaySignalView> = {},
): AgentTodaySignalView {
  return {
    actions: [
      {
        actionId: "open",
        href: "/app/followups",
        label: "查看跟进",
      },
      {
        actionId: "ask_agent",
        href: "/app/agent?q=prepare",
        label: "让 Agent 准备",
        prompt: "帮我准备这次跟进",
      },
      {
        actionId: "mark_done",
        href: "/app/followups",
        label: "完成",
      },
    ],
    changes: [],
    confidence: 0.9,
    lastObservedAt: "2026-08-20T09:00:00.000Z",
    reason: "已逾期 2 天，建议现在处理。",
    severity: "high",
    signalId: "signal-1",
    sources: [],
    status: "new",
    summary: "很长的关系背景不应重复显示在行动行里。",
    title: "跟进佐藤健一",
    type: "followup_due",
    ...overrides,
  };
}

test("next-action rows keep one context line and no more than two actions", () => {
  const [row] = agentSignalsToNextActionRows([signal()], "zh");

  assert.equal(row?.index, 1);
  assert.equal(row?.title, "跟进佐藤健一");
  assert.equal(row?.context, "已逾期 2 天，建议现在处理。");
  assert.equal(row?.actions.length, 2);
  assert.deepEqual(
    row?.actions.map((action) => action.kind),
    ["navigate", "ask"],
  );
  assert.equal(row?.actions[1]?.label, "交给 iOrbit");
});

test("resolved rows are concise and do not expose actions", () => {
  const [row] = agentSignalsToNextActionRows(
    [
      signal({
        resolvedAt: "2026-08-20T09:12:00.000Z",
        status: "resolved",
        title: "回复关西活动主办方",
      }),
    ],
    "zh",
  );

  assert.equal(row?.completed, true);
  assert.equal(row?.context, "已完成");
  assert.deepEqual(row?.actions, []);
});

test("next-action rows use English product copy when requested", () => {
  const [active, completed] = agentSignalsToNextActionRows(
    [signal(), signal({ signalId: "signal-2", status: "resolved" })],
    "en",
  );

  assert.equal(active?.actions[1]?.label, "Ask iOrbit");
  assert.equal(completed?.context, "Completed");
});

test("next-action rows remove locally snoozed and dismissed signals", () => {
  const rows = agentSignalsToNextActionRows(
    [
      signal({ signalId: "active" }),
      signal({ signalId: "snoozed", status: "snoozed" }),
      signal({ signalId: "dismissed", status: "dismissed" }),
    ],
    "zh",
  );

  assert.deepEqual(rows.map((row) => row.signal.signalId), ["active"]);
});
