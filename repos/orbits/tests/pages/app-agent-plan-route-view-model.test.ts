/**
 * Agent plan route view-model 测试。
 *
 * plan 屏是静态聚合（用户 2026-09-19 拍板：先静态聚合，AI 能力版记入待办）：
 * 本周重点任务 = facts followups.current + 账本 approved/executing；
 * 本周日程 = facts appointments；概览计数全部为真实计数。
 * 「4 周推进节奏」无接口 → 本屏不做，也不产生任何 VM 数据。
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { AgentLedgerEntry } from "../../features/agent/ledger/contract";
import { agentLedgerEntryFixtures } from "../../features/agent/ledger/fixtures";
import type { HomeDashboardSnapshot } from "../../app/(app)/app/agent/home-dashboard-route-service";
import { buildAgentPlanViewModel } from "../../app/(app)/app/agent/plan/plan-route-view-model";

function followupItem(overrides: Record<string, unknown> = {}) {
  return {
    collection: "current",
    contactId: "contact:1",
    contactName: "Alex Chen",
    connectionId: null,
    group: "recent",
    href: "/app/contacts/contact:1",
    id: "followup:1",
    key: "followups:followup:1",
    operationHref: "/app/contacts/contact:1",
    organization: "Meridian AI",
    relationshipStage: "active",
    status: "open",
    title: "跟进 Alex Chen",
    updatedAt: "2026-09-18T09:00:00.000Z",
    ...overrides,
  } as never;
}

function appointmentItem(overrides: Record<string, unknown> = {}) {
  return {
    appointmentId: "appointment:1",
    contactId: "contact:1",
    durationMinutes: 45,
    endsAtUtc: "2026-09-20T06:15:00.000Z",
    href: "/app/today#arrangements",
    key: "appointments:appointment:1",
    medium: "video",
    needsReconfirmation: false,
    startsAtUtc: "2026-09-20T05:30:00.000Z",
    status: "confirmed",
    temporalState: "upcoming",
    ...overrides,
  } as never;
}

function sectionShell(): Record<string, unknown> {
  return {
    count: null,
    groups: [],
    items: [],
    sourceLabel: "test",
    state: "ready",
    stateLabel: "有事实",
    viewHref: "/app/agent",
  };
}

function snapshotWith(input: {
  appointments?: ReturnType<typeof appointmentItem>[];
  appointmentState?: string;
  followups?: ReturnType<typeof followupItem>[];
  followupState?: string;
}): HomeDashboardSnapshot {
  const followups = input.followups ?? [];
  const appointments = input.appointments ?? [];
  const facts = {
    appointments: {
      ...sectionShell(),
      items: appointments,
      key: "appointments",
      state: input.appointmentState ?? "ready",
      title: "七日内已确认约谈",
    },
    followups: {
      ...sectionShell(),
      current: { count: followups.length, items: followups },
      history: { count: 0, items: [] },
      items: followups,
      key: "followups",
      orphan: { count: 0, items: [] },
      state: input.followupState ?? "ready",
      title: "关系跟进",
    },
    personal: {
      ...sectionShell(),
      coverage: "starts-in-window",
      key: "personal",
      state: "empty",
      title: "七日内开始的个人日程",
    },
    sections: [],
    snapshotAt: "2026-09-19T00:00:00.000Z",
    tasks: { ...sectionShell(), key: "tasks", title: "待办事项" },
    window: { endsAt: "2026-09-26T00:00:00.000Z", startsAt: "2026-09-19T00:00:00.000Z" },
  } as never;
  return {
    facts,
    owner: { accountId: "actor:1", workspaceId: "ws:1" },
    recommendations: { items: [], state: "no_match" },
    snapshotAt: "2026-09-19T00:00:00.000Z",
  };
}

function ledgerEntry(overrides: Partial<AgentLedgerEntry>): AgentLedgerEntry {
  return { ...agentLedgerEntryFixtures[0], ...overrides };
}

test("pending snapshot and ledger yield a fully pending view model", () => {
  const model = buildAgentPlanViewModel({
    language: "zh",
    ledger: "pending",
    snapshot: "pending",
  });

  assert.equal(model.focusState, "pending");
  assert.equal(model.scheduleState, "pending");
  assert.equal(model.focusTasks.length, 0);
  assert.equal(model.schedule.length, 0);
});

test("focus tasks merge followups.current with approved and executing ledger entries", () => {
  const ledger = [
    ledgerEntry({ entryId: "ledger-exec", status: "executing", title: "生成会议简报" }),
    ledgerEntry({ entryId: "ledger-approved", status: "approved", title: "发送会前提醒", contactName: "徐薇" }),
    ledgerEntry({ entryId: "ledger-awaiting", status: "awaiting_confirmation" }),
    ledgerEntry({ entryId: "ledger-done", status: "completed" }),
  ];
  const model = buildAgentPlanViewModel({
    language: "zh",
    ledger,
    snapshot: snapshotWith({
      followups: [followupItem(), followupItem({ key: "followups:followup:2", id: "followup:2" })],
    }),
  });

  assert.equal(model.focusState, "ready");
  assert.equal(model.focusTasks.length, 4);
  assert.deepEqual(
    model.focusTasks.filter((task) => task.kind === "followup").map((task) => task.id),
    ["followups:followup:1", "followups:followup:2"],
  );
  const ledgerTask = model.focusTasks.find((task) => task.kind === "ledger" && task.id === "ledger-exec");
  assert.equal(ledgerTask?.href, "/app/agent/actions?entry=ledger-exec");
  assert.equal(
    model.focusTasks.some((task) => task.id === "ledger-awaiting" || task.id === "ledger-done"),
    false,
  );
});

test("the weekly schedule maps confirmed appointments to day and time labels", () => {
  const model = buildAgentPlanViewModel({
    language: "zh",
    ledger: [],
    snapshot: snapshotWith({
      appointments: [appointmentItem()],
    }),
  });

  assert.equal(model.scheduleState, "ready");
  assert.equal(model.schedule.length, 1);
  assert.equal(model.schedule[0]?.timeLabel, "14:30");
  assert.match(model.schedule[0]?.dayLabel ?? "", /9\/20/);
  assert.equal(model.schedule[0]?.href, "/app/today#arrangements");
});

test("overview counts are real counts and null when a source is unavailable", () => {
  const ledger = [
    ledgerEntry({ entryId: "ledger-exec", status: "executing" }),
    ledgerEntry({ entryId: "ledger-awaiting-1", status: "awaiting_confirmation" }),
    ledgerEntry({ entryId: "ledger-awaiting-2", status: "awaiting_confirmation" }),
  ];
  const model = buildAgentPlanViewModel({
    language: "zh",
    ledger,
    snapshot: snapshotWith({
      appointments: [appointmentItem()],
      followups: [followupItem()],
    }),
  });
  const byKey = new Map(model.overview.map((count) => [count.key, count.value]));

  assert.equal(byKey.get("focus"), 2);
  assert.equal(byKey.get("schedule"), 1);
  assert.equal(byKey.get("decide"), 2);
  assert.equal(byKey.get("doing"), 1);

  const unavailable = buildAgentPlanViewModel({
    language: "zh",
    ledger: "unavailable",
    snapshot: "unavailable",
  });
  const unavailableByKey = new Map(
    unavailable.overview.map((count) => [count.key, count.value]),
  );
  assert.equal(unavailableByKey.get("focus"), null);
  assert.equal(unavailableByKey.get("schedule"), null);
  assert.equal(unavailableByKey.get("decide"), null);
  assert.equal(unavailableByKey.get("doing"), null);
});

test("empty sources render empty states instead of mock content", () => {
  const model = buildAgentPlanViewModel({
    language: "zh",
    ledger: [],
    snapshot: snapshotWith({}),
  });

  assert.equal(model.focusState, "empty");
  assert.equal(model.scheduleState, "empty");
  assert.equal(model.focusTasks.length, 0);
  assert.equal(model.schedule.length, 0);
});

test("an unavailable appointments source keeps focus tasks from the same snapshot", () => {
  const model = buildAgentPlanViewModel({
    language: "zh",
    ledger: [],
    snapshot: snapshotWith({
      appointmentState: "unavailable",
      followups: [followupItem()],
    }),
  });

  assert.equal(model.focusState, "ready");
  assert.equal(model.scheduleState, "unavailable");
});
