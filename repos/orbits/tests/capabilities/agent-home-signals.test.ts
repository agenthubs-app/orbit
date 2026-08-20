import assert from "node:assert/strict";
import test from "node:test";

import type {
  AgentSignal,
  AgentSignalStatus,
} from "../../features/agent/signals/contract";
import { selectAgentHomeSignals } from "../../features/agent/signals/home-selection";

function signal(
  signalId: string,
  status: AgentSignalStatus,
  overrides: Partial<AgentSignal> = {},
): AgentSignal {
  return {
    actions: [
      {
        actionId: "open",
        href: "/app/followups",
        label: "查看跟进",
      },
    ],
    changes: [],
    confidence: 0.9,
    fingerprint: `followup_due:${signalId}`,
    firstObservedAt: "2026-08-19T09:00:00.000Z",
    importance: 80,
    lastMeaningfulChangeAt: "2026-08-19T09:00:00.000Z",
    lastObservedAt: "2026-08-19T09:00:00.000Z",
    materialHash: `hash:${signalId}`,
    occurredAt: "2026-08-19T09:00:00.000Z",
    reason: "需要处理",
    severity: "medium",
    signalId,
    sources: [],
    status,
    summary: "关系背景",
    targetId: signalId,
    targetType: "task",
    title: `行动 ${signalId}`,
    type: "followup_due",
    ...overrides,
  };
}

test("home signals contain the three highest-priority active items", () => {
  const result = selectAgentHomeSignals([
    signal("low", "new", { importance: 40 }),
    signal("highest", "acknowledged", { importance: 98 }),
    signal("middle", "new", { importance: 70 }),
    signal("high", "new", { importance: 90 }),
  ]);

  assert.deepEqual(
    result.map((item) => item.signalId),
    ["highest", "high", "middle"],
  );
});

test("home signals exclude snoozed and dismissed items", () => {
  const result = selectAgentHomeSignals([
    signal("active", "new"),
    signal("snoozed", "snoozed", {
      snoozedUntil: "2026-08-21T09:00:00.000Z",
    }),
    signal("dismissed", "dismissed"),
  ]);

  assert.deepEqual(result.map((item) => item.signalId), ["active"]);
});

test("home signals append only the most recently resolved item", () => {
  const result = selectAgentHomeSignals([
    signal("active", "new"),
    signal("older", "resolved", {
      resolvedAt: "2026-08-19T11:00:00.000Z",
    }),
    signal("newer", "resolved", {
      resolvedAt: "2026-08-20T08:00:00.000Z",
    }),
  ]);

  assert.deepEqual(
    result.map((item) => item.signalId),
    ["active", "newer"],
  );
});
