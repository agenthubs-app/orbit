/**
 * Agent strategy route view-model 测试。
 *
 * strategy 屏是静态聚合（用户 2026-09-19 拍板）：先联系谁 = facts
 * followups.current；下一步去哪 = D17 公开活动推荐四态如实呈现；
 * 「缺什么人 / 准备什么」无接口 → 显式「等 W4」等待区块，绝不放 mock。
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { HomeDashboardSnapshot } from "../../app/(app)/app/agent/home-dashboard-route-service";
import { buildAgentStrategyViewModel } from "../../app/(app)/app/agent/strategy/strategy-route-view-model";

function followupItem(overrides: Record<string, unknown> = {}) {
  return {
    collection: "current",
    contactId: "contact:1",
    contactName: "Alex Chen",
    connectionId: null,
    group: "recent",
    href: "/app/contacts/contact:1",
    id: "followup:1",
    issue: "上次交流后他表示有合作意向",
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
  followups?: ReturnType<typeof followupItem>[];
  followupState?: string;
  recommendations?: Record<string, unknown>;
  recommendationState?: string;
}): HomeDashboardSnapshot {
  const followups = input.followups ?? [];
  const facts = {
    appointments: {
      ...sectionShell(),
      items: [],
      key: "appointments",
      state: "empty",
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
    recommendations: {
      items: input.recommendations ? [input.recommendations] : [],
      state: input.recommendationState ?? "no_match",
    } as unknown as HomeDashboardSnapshot["recommendations"],
    snapshotAt: "2026-09-19T00:00:00.000Z",
  };
}

test("who-first lists followups.current contacts with reason and links", () => {
  const model = buildAgentStrategyViewModel({
    language: "zh",
    snapshot: snapshotWith({
      followups: [
        followupItem(),
        followupItem({ contactId: "contact:2", href: null, id: "followup:2", key: "followups:followup:2" }),
        followupItem({ contactId: null, href: null, id: "followup:3", key: "followups:followup:3" }),
      ],
    }),
  });

  assert.equal(model.whoFirstState, "ready");
  assert.equal(model.whoFirst.length, 3);
  assert.equal(model.whoFirst[0]?.name, "Alex Chen");
  assert.equal(model.whoFirst[0]?.issue, "上次交流后他表示有合作意向");
  assert.equal(model.whoFirst[0]?.href, "/app/contacts/contact:1");
  // 无显式 href 时回退到联系人深链。
  assert.equal(model.whoFirst[1]?.href, "/app/contacts/contact%3A2");
  // 两者都缺时不伪造链接。
  assert.equal(model.whoFirst[2]?.href, null);
});

test("who-first empty and unavailable states stay honest", () => {
  const empty = buildAgentStrategyViewModel({
    language: "zh",
    snapshot: snapshotWith({}),
  });
  assert.equal(empty.whoFirstState, "empty");

  const unavailable = buildAgentStrategyViewModel({
    language: "zh",
    snapshot: snapshotWith({ followupState: "unavailable" }),
  });
  assert.equal(unavailable.whoFirstState, "unavailable");

  const pending = buildAgentStrategyViewModel({ language: "zh", snapshot: "pending" });
  assert.equal(pending.whoFirstState, "pending");
});

test("D17 recommendations map to event cards with detail links", () => {
  const model = buildAgentStrategyViewModel({
    language: "zh",
    snapshot: snapshotWith({
      recommendationState: "success",
      recommendations: {
        description: "制造业与 AI 行业峰会",
        eventId: "event:1",
        matchedTokens: ["制造业", "AI"],
        publicCode: "PUB-1",
        sourceEvidenceIds: ["ev:1"],
        startsAt: "2026-10-15T09:00:00.000Z",
        title: "日本智能制造峰会 2026",
        venue: "东京国际会议中心",
      },
    }),
  });

  assert.equal(model.nextEventsState, "ready");
  assert.equal(model.nextEvents.length, 1);
  assert.equal(model.nextEvents[0]?.title, "日本智能制造峰会 2026");
  assert.equal(model.nextEvents[0]?.href, "/app/events/event%3A1");
  assert.deepEqual(model.nextEvents[0]?.matchedTokens, ["制造业", "AI"]);
});

test("D17 non-success states surface as-is instead of mock cards", () => {
  const needsGoal = buildAgentStrategyViewModel({
    language: "zh",
    snapshot: snapshotWith({ recommendationState: "needs_goal" }),
  });
  assert.equal(needsGoal.nextEventsState, "needs_goal");
  assert.equal(needsGoal.nextEvents.length, 0);

  const noMatch = buildAgentStrategyViewModel({
    language: "zh",
    snapshot: snapshotWith({ recommendationState: "no_match" }),
  });
  assert.equal(noMatch.nextEventsState, "no_match");

  const unavailable = buildAgentStrategyViewModel({
    language: "zh",
    snapshot: snapshotWith({ recommendationState: "unavailable" }),
  });
  assert.equal(unavailable.nextEventsState, "unavailable");
});

test("missing-people and prep sections are explicit waiting states, never mock content", () => {
  const model = buildAgentStrategyViewModel({
    language: "zh",
    snapshot: snapshotWith({ followups: [followupItem()] }),
  });

  assert.deepEqual(
    model.waitingSections.map((section) => section.key),
    ["missing", "prep"],
  );
  for (const section of model.waitingSections) {
    assert.match(section.description, /W4/);
  }
});
