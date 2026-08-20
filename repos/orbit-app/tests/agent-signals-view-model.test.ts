import assert from "node:assert/strict";
import test from "node:test";

import {
  agentSignalsToNextActions,
  type AgentSignalPayload,
} from "../src/view-models/agent-signals";

function signal(
  overrides: Partial<AgentSignalPayload> = {}
): AgentSignalPayload {
  return {
    actions: [
      {
        actionId: "open",
        href: "/app/events/event-1",
        label: "查看活动"
      },
      {
        actionId: "ask_agent",
        href: "/app/agent?q=prepare",
        label: "生成会前准备",
        prompt: "帮我准备这场活动"
      }
    ],
    reason: "周五开始，建议提前准备。",
    signalId: "signal-1",
    status: "new",
    targetId: "event:demo/1",
    targetType: "event",
    title: "准备关西跨境商务交流会",
    type: "event_upcoming",
    ...overrides
  };
}

test("Agent signals become concise numbered native actions", () => {
  const rows = agentSignalsToNextActions({ signals: [signal()] });

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.index, 1);
  assert.equal(rows[0]?.title, "准备关西跨境商务交流会");
  assert.equal(rows[0]?.context, "周五开始，建议提前准备。");
  assert.deepEqual(rows[0]?.actions, [
    {
      kind: "navigate",
      label: "查看活动",
      route: "/events/event%3Ademo%2F1"
    },
    {
      kind: "ask",
      label: "交给 iOrbit",
      prompt: "帮我准备这场活动"
    }
  ]);
});

test("Agent signals map contact and task targets to native routes", () => {
  const rows = agentSignalsToNextActions({
    signals: [
      signal({
        signalId: "contact-signal",
        targetId: "contact:demo/1",
        targetType: "contact"
      }),
      signal({
        signalId: "task-signal",
        targetId: "task:demo/1",
        targetType: "task"
      })
    ]
  });

  assert.equal(rows[0]?.actions[0]?.route, "/contacts/contact%3Ademo%2F1");
  assert.equal(rows[1]?.actions[0]?.route, "/followups");
});

test("resolved Agent signals show completion without actions", () => {
  const rows = agentSignalsToNextActions({
    signals: [signal({ status: "resolved" })]
  });

  assert.equal(rows[0]?.completed, true);
  assert.equal(rows[0]?.context, "已完成");
  assert.deepEqual(rows[0]?.actions, []);
});

test("Agent signals ignore hidden statuses and malformed records", () => {
  const rows = agentSignalsToNextActions({
    signals: [
      signal({ signalId: "active" }),
      signal({ signalId: "snoozed", status: "snoozed" }),
      signal({ signalId: "dismissed", status: "dismissed" }),
      null,
      "invalid"
    ]
  });

  assert.deepEqual(rows.map((row) => row.id), ["active"]);
  assert.deepEqual(agentSignalsToNextActions(null), []);
});
