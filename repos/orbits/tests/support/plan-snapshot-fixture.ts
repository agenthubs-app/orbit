/**
 * W0009「我的计划」测试共用的已保存计划快照（`PlanSnapshot`，即 `GET /api/agent/plans/current` 的形状）。
 *
 * 12 周三阶段，第 1 周从 2026-09-14 开始；`PLAN_NOW`（东京 2026-09-28 12:00）落在第 3 周。
 * 行动覆盖：本周的、逾期 1 / 2 周的、上周已完成的（不进本周）、本周刚完成的（留在本周、已勾）、
 * 下一阶段的（不进本周）。人脉需求一条有两位联系人（一位已建立联系）、一条空。
 */
import type { PlanItem, PlanLogEntry, PlanSnapshot } from "../../features/plans/contract";

export const PLAN_NOW = new Date("2026-09-28T03:00:00.000Z");
export const PLAN_ID = "plan:w0009";

let sort = 0;
function item(overrides: Partial<PlanItem> & Pick<PlanItem, "id" | "kind" | "title">): PlanItem {
  sort += 1;
  return {
    answer: null,
    carriedFromItemId: null,
    completedAt: null,
    contactLinks: [],
    createdAt: "2026-09-14T01:00:00.000Z",
    criteria: null,
    deferralCount: 0,
    detail: null,
    linkedContactIds: [],
    linkedEventId: null,
    meta: {},
    phaseKey: "p1",
    planId: PLAN_ID,
    sortKey: sort,
    status: overrides.kind === "action" ? "not_started" : overrides.kind === "event" ? "recommended" : "open",
    suggestedWeek: null,
    updatedAt: "2026-09-14T01:00:00.000Z",
    ...overrides,
  };
}

function log(overrides: Partial<PlanLogEntry> & Pick<PlanLogEntry, "id" | "body" | "createdAt">): PlanLogEntry {
  return {
    author: "user",
    event: "note",
    fromStatus: null,
    idempotencyKey: `key:${overrides.id}`,
    itemId: null,
    kind: "manual",
    linkedContactIds: [],
    linkedEventId: null,
    payload: {},
    planId: PLAN_ID,
    targetItemId: null,
    toStatus: null,
    ...overrides,
  };
}

export function planSnapshotFixture(): PlanSnapshot {
  sort = 0;
  const items: PlanItem[] = [
    item({ detail: "你已经认识 TA，是离目标最近的一步。", id: "a-this-week", kind: "action", suggestedWeek: 3, title: "约一位老客户聊 20 分钟" }),
    item({ id: "a-overdue-2", kind: "action", suggestedWeek: 1, title: "整理 10 家目标企业名单" }),
    item({
      completedAt: "2026-09-22T02:00:00.000Z",
      id: "a-done-last-week",
      kind: "action",
      status: "done",
      suggestedWeek: 2,
      title: "把 30 秒自我介绍发给 3 位老朋友",
    }),
    item({
      completedAt: "2026-09-28T01:00:00.000Z",
      id: "a-done-this-week",
      kind: "action",
      status: "done",
      suggestedWeek: 3,
      title: "报名本月的行业交流会",
    }),
    item({ id: "a-next-phase", kind: "action", phaseKey: "p2", suggestedWeek: 4, title: "拿到 10 位负责人的联系方式" }),
    item({ id: "a-overdue-1", kind: "action", status: "in_progress", suggestedWeek: 2, title: "把了解到的决策方式记下来" }),
    item({
      contactLinks: [
        { contactId: "contact:c1", establishedAt: null, linkedAt: "2026-09-20T01:00:00.000Z", state: "linked" },
        {
          contactId: "contact:c2",
          establishedAt: "2026-09-26T01:00:00.000Z",
          linkedAt: "2026-09-25T01:00:00.000Z",
          state: "established",
        },
      ],
      criteria: {
        description: "运营社群、协会的人",
        primaryIndustryId: "community_nonprofit",
        secondaryIndustryId: "community_nonprofit.industry_associations",
        titleKeywords: ["理事"],
      },
      id: "n-connector",
      kind: "network_need",
      linkedContactIds: ["contact:c1", "contact:c2"],
      status: "established",
      title: "能帮你引荐的行业前辈",
    }),
    item({ id: "n-target", kind: "network_need", phaseKey: "p2", title: "中小企业的 IT 负责人" }),
    item({ answer: "大多手写，会后 30 分钟整理", id: "i-answered", kind: "info", status: "answered", title: "现在用什么记会议？" }),
    item({ id: "i-open", kind: "info", title: "试用需要谁点头？" }),
    item({
      id: "e-p2",
      kind: "event",
      linkedEventId: "event:dx-seminar",
      meta: { startsAt: "2026-10-15T09:00:00.000Z", venue: "丸之内" },
      phaseKey: "p2",
      suggestedWeek: 5,
      title: "中小企业 DX 推进研讨会",
    }),
    item({
      id: "e-p1",
      kind: "event",
      linkedEventId: "event:founders-night",
      meta: { startsAt: "2026-09-30T09:30:00.000Z", venue: "赤坂" },
      status: "registered",
      suggestedWeek: 3,
      title: "东京创业者交流之夜",
    }),
  ];
  return {
    items,
    log: [
      log({ body: "今天和老客户通了电话", createdAt: "2026-09-28T02:00:00.000Z", id: "log-manual" }),
      log({
        author: "user",
        body: "完成行动：把 30 秒自我介绍发给 3 位老朋友",
        createdAt: "2026-09-22T02:00:00.000Z",
        event: "item_status_changed",
        fromStatus: "not_started",
        id: "log-done",
        itemId: "a-done-last-week",
        kind: "auto",
        toStatus: "done",
      }),
      log({
        author: "system",
        body: "生成计划 v1",
        createdAt: "2026-09-14T01:00:00.000Z",
        event: "plan_created",
        id: "log-created",
        kind: "auto",
      }),
    ],
    plan: {
      analysis: {
        allies: [{ contactId: "contact:c2", help: "可以介绍身边的负责人。", name: "高木一郎", subtitle: "北辰精工 · 部长" }],
        answer: [{ text: "12 周分 3 步：先摸清需求，再集中接触，最后" }, { emphasis: true, text: "拿下 5 家" }, { text: "。" }],
        figures: [
          { label: "12/6 前要达成", unit: "家", value: "5" },
          { label: "要新认识的负责人", unit: "位", value: "10" },
        ],
        gaps: ["中小企业的 IT 负责人"],
        generator: "mock-template-v1",
        kind: "plan_bootstrap",
        locale: "zh",
        phases: [
          { detailed: true, followups: ["当天：发一句感谢", "3 天内：约 20 分钟线上聊"], key: "p1", who: ["能帮你引荐的行业前辈"] },
          { detailed: true, followups: [], key: "p2", who: [] },
          { detailed: true, followups: [], key: "p3", who: [] },
        ],
        pitch: { setting: "在交流会上这样介绍自己 · 30 秒", text: "我正在推进一件事：三个月内找到 5 家试用客户。" },
        read: { contacts: 3, contactsTotal: 3, events: 2 },
        request: { idempotencyKey: "k1", question: "根据我的目标和人脉信息，我该如何实现目标？", supplement: "先从东京开始" },
        risk: "前 3 周如果认识不到 5 位负责人，后面的进度就会落空。",
        thisWeek: [],
        version: 1,
      },
      archivedAt: null,
      createdAt: "2026-09-14T01:00:00.000Z",
      goalSnapshot: "三个月内找到 5 家日本中小企业试用我们的产品",
      horizon: "quarter",
      id: PLAN_ID,
      phases: [
        { endWeek: 3, granularity: "week", key: "p1", startWeek: 1, summary: "从现有人脉切入。", title: "摸清需求" },
        { endWeek: 8, granularity: "week", key: "p2", startWeek: 4, summary: "通过活动和引荐认识人。", title: "集中接触" },
        { endWeek: 12, granularity: "week", key: "p3", startWeek: 9, summary: null, title: "推进试用" },
      ],
      previousPlanId: null,
      sourceSessionId: null,
      startsOn: "2026-09-14",
      status: "active",
      updatedAt: "2026-09-28T01:00:00.000Z",
      version: 1,
    },
  };
}
