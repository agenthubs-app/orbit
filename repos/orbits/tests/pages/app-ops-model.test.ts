import assert from "node:assert/strict";
import test from "node:test";

import {
  consoleTitle,
  hubActions,
  hubBucket,
  hubCounts,
  hubCta,
  hubDateTime,
  hubPhase,
  hubSecondaryActions,
  hubStatusChip,
  hubTabMatches,
  identityLabel,
  matchesHubQuery,
  OPS_TABS,
  opsHref,
  rolesDrawerHref,
  SOON_WINDOW_MS,
  TITLES,
} from "../../app/(app)/app/events/ops-0918/ops-model";
import type { EventCenterItem } from "../../app/(app)/app/events/ops-0918/use-event-center";
import type { EventAnalyticsOrganizerAggregate } from "../../features/events/event-analytics/contract";

const NOW = Date.parse("2026-09-22T03:00:00.000Z");
const HOUR = 60 * 60 * 1000;

function item(overrides: Partial<EventCenterItem> = {}): EventCenterItem {
  return {
    endsAt: new Date(NOW + 5 * HOUR).toISOString(),
    eventId: "event:one",
    lifecycleState: "published",
    migrationPending: false,
    owner: true,
    revision: 1,
    role: "owner",
    startsAt: new Date(NOW + 3 * HOUR).toISOString(),
    title: "测试活动",
    venue: "Tokyo",
    ...overrides,
  };
}

test("hubStatusChip maps real lifecycle + time onto the design chips", () => {
  // 报名中：已发布、开始 > 24h
  assert.deepEqual(
    hubStatusChip(item({ startsAt: new Date(NOW + 3 * 24 * HOUR).toISOString(), endsAt: new Date(NOW + 4 * 24 * HOUR).toISOString() }), NOW),
    { kind: "registering", label: "报名中", chipBg: "#E6F1EC", chipColor: "#2F6B4F" },
  );
  // 即将开始：已发布、24h 内开始
  const soon = hubStatusChip(item(), NOW);
  assert.equal(soon.label, "即将开始");
  assert.deepEqual([soon.chipBg, soon.chipColor], ["#ECEEFB", "#2E3270"]);
  assert.equal(hubStatusChip(item({ startsAt: new Date(NOW + SOON_WINDOW_MS + 1).toISOString() }), NOW).label, "报名中");
  // 进行中
  const live = hubStatusChip(item({ startsAt: new Date(NOW - HOUR).toISOString() }), NOW);
  assert.deepEqual([live.label, live.chipBg, live.chipColor], ["进行中", "#ECEEFB", "#4B4FC7"]);
  // 已结束：时间已过 / 已归档
  const ended = hubStatusChip(item({ startsAt: new Date(NOW - 5 * HOUR).toISOString(), endsAt: new Date(NOW - HOUR).toISOString() }), NOW);
  assert.deepEqual([ended.label, ended.chipBg, ended.chipColor], ["已结束", "#F1F1FA", "#6B6F99"]);
  assert.equal(hubStatusChip(item({ lifecycleState: "archived" }), NOW).label, "已结束");
  // 真实生命周期补充：草稿 / 已取消 / 待迁移
  assert.equal(hubStatusChip(item({ lifecycleState: "draft" }), NOW).label, "草稿");
  assert.equal(hubStatusChip(item({ lifecycleState: "cancelled" }), NOW).label, "已取消");
  assert.equal(hubStatusChip(item({ migrationPending: true, title: null }), NOW).label, "待迁移");
  // 草稿即使时间已过也先看时间（已结束），未过则草稿
  assert.equal(hubStatusChip(item({ lifecycleState: "draft", startsAt: null, endsAt: null }), NOW).label, "草稿");
});

test("hubPhase / hubBucket follow the old center phase rules and feed the hubTabs", () => {
  assert.equal(hubPhase(item(), NOW), "upcoming");
  assert.equal(hubPhase(item({ startsAt: new Date(NOW - HOUR).toISOString() }), NOW), "live");
  assert.equal(hubPhase(item({ startsAt: new Date(NOW - 3 * HOUR).toISOString(), endsAt: new Date(NOW - HOUR).toISOString() }), NOW), "ended");
  assert.equal(hubPhase(item({ startsAt: null, endsAt: null }), NOW), null);
  assert.equal(hubBucket(item({ lifecycleState: "cancelled" }), NOW), "ended");
  assert.equal(hubBucket(item({ lifecycleState: "draft", startsAt: null, endsAt: null }), NOW), "upcoming");
  assert.equal(hubTabMatches(item(), "all", NOW), true);
  assert.equal(hubTabMatches(item(), "upcoming", NOW), true);
  assert.equal(hubTabMatches(item(), "live", NOW), false);
  assert.equal(hubTabMatches(item({ migrationPending: true }), "upcoming", NOW), false);
  assert.equal(hubTabMatches(item({ migrationPending: true }), "all", NOW), true);
});

test("matchesHubQuery searches title and venue, case-insensitively", () => {
  assert.equal(matchesHubQuery(item(), ""), true);
  assert.equal(matchesHubQuery(item(), "测试"), true);
  assert.equal(matchesHubQuery(item(), "tokyo"), true);
  assert.equal(matchesHubQuery(item(), "大阪"), false);
  assert.equal(matchesHubQuery(item({ migrationPending: true, title: "x" }), "待迁移"), true);
});

test("hubCta picks 进入运营 → for onsite operators and 查看数据 once the event ended", () => {
  const ops = hubCta(item(), NOW);
  assert.equal(ops?.label, "进入运营 →");
  assert.equal(ops?.href, "/app/events/event%3Aone/operations");
  assert.equal(ops?.tone, "dark");

  const ended = hubCta(item({ startsAt: new Date(NOW - 5 * HOUR).toISOString(), endsAt: new Date(NOW - HOUR).toISOString() }), NOW);
  assert.equal(ended?.label, "查看数据");
  assert.equal(ended?.href, "/app/events/event%3Aone/analytics");
  assert.equal(ended?.tone, "ghost");
  assert.equal(ended?.marker, "data-event-center-analytics");

  // 审核角色：开始前主动作 = 报名审核
  const reviewer = hubCta(item({ owner: false, role: "reviewer" }), NOW);
  assert.equal(reviewer?.label, "报名审核");
  assert.equal(reviewer?.marker, "data-event-center-admission");
  // 签到角色：进行中主动作 = 签到台
  const checkIn = hubCta(item({ owner: false, role: "check_in", startsAt: new Date(NOW - HOUR).toISOString() }), NOW);
  assert.equal(checkIn?.label, "签到台");
  assert.equal(checkIn?.href, "/app/events/event%3Aone/operations/check-in");
  // 只读分析：进行中没有运营 / 签到 / 审核 → 查看数据
  assert.equal(hubCta(item({ owner: false, role: "read_only_analyst", startsAt: new Date(NOW - HOUR).toISOString() }), NOW)?.label, "查看数据");
  // 草稿负责人：运营台未开放 → 退到查看活动页面（ghost），管理角色进抽屉
  const draft = hubCta(item({ lifecycleState: "draft" }), NOW);
  assert.equal(draft?.label, "查看活动页面");
  assert.equal(draft?.href, "/app/events/event%3Aone");
  assert.equal(draft?.tone, "ghost");
  assert.deepEqual(hubSecondaryActions(item({ lifecycleState: "draft" }), NOW).map((action) => action.href), [rolesDrawerHref("event:one")]);
  assert.equal(rolesDrawerHref("event:one"), "/app/events/event%3Aone/operations?drawer=roles");
  // 迁移待确认：没有任何动作
  assert.equal(hubCta(item({ migrationPending: true }), NOW), null);
  assert.deepEqual(hubActions(item({ migrationPending: true })), []);
});

test("hubSecondaryActions keeps every gated entry point except the primary, in order", () => {
  const keys = hubSecondaryActions(item(), NOW).map((action) => action.key);
  assert.deepEqual(keys, ["admission", "checkin", "analytics", "view", "roles"]);
  const operator = hubSecondaryActions(item({ owner: false, role: "operations" }), NOW).map((action) => action.key);
  assert.deepEqual(operator, ["checkin", "analytics", "view"]);
  const analyst = hubActions(item({ owner: false, role: "read_only_analyst" })).map((action) => action.key);
  assert.deepEqual(analyst, ["analytics", "view"]);
});

test("hubCounts reads the aggregate fields and falls back to — without one", () => {
  assert.deepEqual(hubCounts(null), { signup: "—", match: "—", checkin: "—" });
  assert.deepEqual(hubCounts(undefined), { signup: "—", match: "—", checkin: "—" });
  const aggregate = {
    checkIns: { checkedIn: 1 },
    grouping: { published: true, roundOne: { assignedParticipants: 2, tables: 1 }, roundTwo: { assignedParticipants: 2, tables: 1 } },
    registrations: { active: 2, cancelled: 0 },
  } as unknown as EventAnalyticsOrganizerAggregate;
  assert.deepEqual(hubCounts(aggregate), { signup: "2", match: "2", checkin: "1" });
  const unpublished = { ...aggregate, grouping: { ...aggregate.grouping, published: false } } as EventAnalyticsOrganizerAggregate;
  assert.equal(hubCounts(unpublished).match, "—");
});

test("hubDateTime renders Tokyo date + clock range like the design", () => {
  assert.deepEqual(
    hubDateTime({ startsAt: "2026-09-20T10:00:00.000Z", endsAt: "2026-09-20T12:00:00.000Z" }),
    { date: "2026年9月20日（周日）", time: "19:00 – 21:00" },
  );
  assert.deepEqual(hubDateTime({ startsAt: "2026-09-20T10:00:00.000Z", endsAt: null }), { date: "2026年9月20日（周日）", time: "19:00" });
  assert.equal(hubDateTime({ startsAt: null, endsAt: null }), null);
});

test("identityLabel dedupes roles across the visible events", () => {
  assert.equal(identityLabel([]), null);
  assert.equal(identityLabel([item(), item({ eventId: "event:two" })]), "活动负责人");
  assert.equal(identityLabel([item(), item({ eventId: "event:two", owner: false, role: "check_in" })]), "活动负责人 · 签到");
  assert.equal(identityLabel([item({ migrationPending: true })]), null);
});

test("OPS_TABS / TITLES / consoleTitle follow the design and the route plan", () => {
  assert.deepEqual(OPS_TABS.map((tab) => tab.label), ["概览", "匹配与分组", "参会者", "签到", "报名设置", "数据报告"]);
  assert.equal(opsHref("e 1", "ops"), "/app/events/e%201/operations");
  assert.equal(opsHref("e", "match"), "/app/events/e/operations?tab=match");
  assert.equal(opsHref("e", "people"), "/app/events/e/operations/admission");
  assert.equal(opsHref("e", "checkin"), "/app/events/e/operations/check-in");
  assert.equal(opsHref("e", "form"), "/app/events/e/operations/experience");
  assert.equal(opsHref("e", "report"), "/app/events/e/analytics");
  assert.equal(consoleTitle("ops", "我的活动"), "我的活动 · 运营台");
  assert.equal(consoleTitle("report", "我的活动"), "数据报告");
  assert.equal(TITLES.checkin.sub, "面向现场工作人员的最小签到视图，仅显示签到所需信息。");
  assert.equal(TITLES.match.crumb, "匹配与分组");
});
