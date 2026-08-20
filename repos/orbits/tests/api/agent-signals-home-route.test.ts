import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  agentSignalRefreshForView,
  listAgentSignalsForView,
} from "../../app/api/agent/signals/view";
import type {
  AgentSignal,
  AgentSignalRefreshResult,
  AgentSignalService,
} from "../../features/agent/signals/contract";

const routeSource = readFileSync(
  resolve(process.cwd(), "app/api/agent/signals/route.ts"),
  "utf8",
);

function signal(
  signalId: string,
  status: AgentSignal["status"],
  importance: number,
): AgentSignal {
  return {
    actions: [],
    changes: [],
    confidence: 0.9,
    fingerprint: `followup_due:${signalId}`,
    firstObservedAt: "2026-08-19T09:00:00.000Z",
    importance,
    lastMeaningfulChangeAt: "2026-08-19T09:00:00.000Z",
    lastObservedAt: "2026-08-20T09:00:00.000Z",
    materialHash: signalId,
    occurredAt: "2026-08-19T09:00:00.000Z",
    reason: "需要处理",
    resolvedAt:
      status === "resolved" ? "2026-08-20T09:00:00.000Z" : undefined,
    severity: "medium",
    signalId,
    sources: [],
    status,
    summary: "关系背景",
    targetId: signalId,
    targetType: "task",
    title: signalId,
    type: "followup_due",
  };
}

function serviceWith(signals: readonly AgentSignal[]) {
  const listInputs: unknown[] = [];
  const service = {
    async list(input: unknown) {
      listInputs.push(input);
      return signals;
    },
  } as unknown as AgentSignalService;
  return { listInputs, service };
}

test("GET home view returns the canonical compact signal list", async () => {
  const { listInputs, service } = serviceWith([
    signal("active-low", "new", 40),
    signal("active-high", "new", 90),
    signal("resolved", "resolved", 100),
    signal("dismissed", "dismissed", 99),
  ]);

  const result = await listAgentSignalsForView(
    service,
    new URL("http://localhost/api/agent/signals?view=home"),
  );

  assert.deepEqual(listInputs, [{ includeResolved: true, limit: 100 }]);
  assert.deepEqual(
    result.map((item) => item.signalId),
    ["active-high", "active-low", "resolved"],
  );
});

test("GET default view preserves includeResolved and limit parameters", async () => {
  const { listInputs, service } = serviceWith([]);

  await listAgentSignalsForView(
    service,
    new URL(
      "http://localhost/api/agent/signals?includeResolved=true&limit=12",
    ),
  );

  assert.deepEqual(listInputs, [{ includeResolved: true, limit: 12 }]);
});

test("POST home view replaces refresh signals with the compact list", async () => {
  const resolved = signal("resolved", "resolved", 70);
  const active = signal("active", "new", 80);
  const { service } = serviceWith([resolved, active]);
  const refreshResult: AgentSignalRefreshResult = {
    changed: 0,
    created: 0,
    observed: 1,
    refreshedAt: "2026-08-20T10:00:00.000Z",
    resolved: 1,
    signals: [active],
  };

  const result = await agentSignalRefreshForView(
    service,
    new URL("http://localhost/api/agent/signals?view=home"),
    refreshResult,
  );

  assert.deepEqual(
    result.signals.map((item) => item.signalId),
    ["active", "resolved"],
  );
});

test("POST default view returns the original refresh result", async () => {
  const active = signal("active", "new", 80);
  const { service } = serviceWith([]);
  const refreshResult: AgentSignalRefreshResult = {
    changed: 0,
    created: 1,
    observed: 1,
    refreshedAt: "2026-08-20T10:00:00.000Z",
    resolved: 0,
    signals: [active],
  };

  assert.equal(
    await agentSignalRefreshForView(
      service,
      new URL("http://localhost/api/agent/signals"),
      refreshResult,
    ),
    refreshResult,
  );
});

test("Agent signal responses use the shared mobile API envelope", () => {
  assert.equal(routeSource.match(/success:\s*true/g)?.length, 2);
});
