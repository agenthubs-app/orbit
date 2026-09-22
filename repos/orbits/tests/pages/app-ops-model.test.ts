import assert from "node:assert/strict";
import test from "node:test";

import {
  CHECKIN_BUTTON_TONE,
  CHECKIN_FILTER_TONE,
  CHECKIN_FILTERS,
  CHECKIN_STATUS_CHIP,
  checkInClock,
  checkinCounts,
  consoleTitle,
  filterPeople,
  filterRoster,
  insufficientProfileCount,
  latestCheckIns,
  matchedParticipantIds,
  PEOPLE_FILTER_TONE,
  PEOPLE_FILTERS,
  peopleAvatarBg,
  peopleDocChip,
  peopleMatchChip,
  peopleOrg,
  peopleStats,
  matchEligibleCount,
  matchResultLabel,
  opsConsoleTab,
  pipelineSteps,
  pipelineStepStyle,
  roundTables,
  shortDate,
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
  addQuestionHint,
  attendeeAiStatus,
  attendeeCheckInLine,
  attendeeGroupingLine,
  attendeeStats,
  canAddQuestion,
  cleanOptions,
  FORM_INTRO_LIMIT,
  FORM_QUESTION_LIMIT,
  formQuestionRows,
  formStatusChip,
  hasBlankOptions,
  lastSavedChip,
  previewChoice,
  REPORT_VIEW_TONE,
  reportClock,
  reportFollowup,
  reportRate,
  reportStats,
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

// ═══ 任务 3：概览五阶段 / 匹配桌卡 / 计数 ═══

const PIPELINE_BASE = {
  eventEndsAt: new Date(NOW + 5 * HOUR).toISOString(),
  eventStartsAt: new Date(NOW + 3 * HOUR).toISOString(),
  newestGeneration: null,
  now: NOW,
  publishedAt: null,
  registrationCutoffAt: new Date(NOW + HOUR).toISOString(),
};

function gen(status: string, completedAt: string | null = "2026-09-21T02:00:00.000Z") {
  return { completedAt, createdAt: "2026-09-21T01:00:00.000Z", status: status as "completed" };
}

test("pipelineSteps: registration open and nothing generated → 报名中 is the current stage", () => {
  const steps = pipelineSteps(PIPELINE_BASE);
  assert.deepEqual(steps.map((step) => [step.label, step.state]), [
    ["报名中", "now"],
    ["已生成匹配", "todo"],
    ["等待检查分组", "todo"],
    ["未发布", "todo"],
    ["活动现场", "todo"],
  ]);
  assert.equal(steps[0].meta, "当前阶段");
  assert.equal(steps[4].meta, shortDate(PIPELINE_BASE.eventStartsAt));
  assert.equal(steps[3].meta, "", "no publish timestamp → empty meta");
});

test("pipelineSteps: completed but unpublished → 等待检查分组 is current with real dates", () => {
  const steps = pipelineSteps({ ...PIPELINE_BASE, newestGeneration: gen("completed") });
  assert.deepEqual(steps.map((step) => step.state), ["done", "done", "now", "todo", "todo"]);
  assert.equal(steps[0].meta, shortDate(PIPELINE_BASE.registrationCutoffAt));
  assert.equal(steps[1].meta, "9月21日");
  assert.equal(steps[2].meta, "当前阶段");
  assert.equal(matchResultLabel({ newestGeneration: gen("completed"), publishedAt: null }), "待发布");
});

test("pipelineSteps: published → 已发布 done, 活动现场 current before the event and done after it", () => {
  const published = pipelineSteps({ ...PIPELINE_BASE, newestGeneration: gen("published"), publishedAt: "2026-09-21T03:00:00.000Z" });
  assert.deepEqual(published.map((step) => [step.label, step.state]), [
    ["报名中", "done"],
    ["已生成匹配", "done"],
    ["等待检查分组", "done"],
    ["已发布", "done"],
    ["活动现场", "now"],
  ]);
  assert.equal(published[3].meta, "9月21日");
  const ended = pipelineSteps({ ...PIPELINE_BASE, newestGeneration: gen("published"), now: NOW + 6 * HOUR, publishedAt: "2026-09-21T03:00:00.000Z" });
  assert.deepEqual(ended.map((step) => step.state), ["done", "done", "done", "done", "done"]);
  assert.equal(matchResultLabel({ newestGeneration: gen("published"), publishedAt: "x" }), "已发布");
  assert.equal(matchResultLabel({ newestGeneration: gen("failed"), publishedAt: null }), "未发布");
});

test("pipelineSteps: a live event is the current stage even while grouping is unpublished; missing configuration → empty dates", () => {
  const live = pipelineSteps({ ...PIPELINE_BASE, newestGeneration: gen("completed"), now: NOW + 4 * HOUR });
  assert.equal(live[4].state, "now");
  assert.equal(live[2].state, "todo", "only one current stage");
  const bare = pipelineSteps({ ...PIPELINE_BASE, eventEndsAt: null, eventStartsAt: null, registrationCutoffAt: null });
  assert.equal(bare[0].state, "now");
  assert.equal(bare[4].meta, "");
  assert.equal(shortDate("not-a-date"), "");
  assert.equal(shortDate(null), "");
});

test("pipelineStepStyle reproduces the design step decoration", () => {
  const steps = pipelineSteps({ ...PIPELINE_BASE, newestGeneration: gen("completed") });
  const done = pipelineStepStyle(steps, 1);
  assert.deepEqual(done, { color: "#0E1225", dotBg: "#4B4FC7", leftLine: "#4B4FC7", mark: "✓", metaColor: "#9FA3C4", rightLine: "#4B4FC7", ringColor: "#4B4FC7", weight: 400 });
  const now = pipelineStepStyle(steps, 2);
  assert.deepEqual(now, { color: "#0E1225", dotBg: "#FFFFFF", leftLine: "#4B4FC7", mark: "●", metaColor: "#4B4FC7", rightLine: "#E8E9F6", ringColor: "#4B4FC7", weight: 700 });
  const todo = pipelineStepStyle(steps, 4);
  assert.deepEqual(todo, { color: "#9FA3C4", dotBg: "#FFFFFF", leftLine: "#E8E9F6", mark: "", metaColor: "#9FA3C4", rightLine: "transparent", ringColor: "#DDDEFA", weight: 400 });
  assert.equal(pipelineStepStyle(steps, 0).leftLine, "transparent");
});

test("roundTables reads only the published grouping; counts follow profileCompleteness; opsConsoleTab only accepts match", () => {
  const table = (tableNumber: number) => ({ icebreakers: ["a", "b", "c"] as [string, string, string], memberPrompts: {}, memberRationales: {}, members: [], rationale: "", tableNumber, theme: "t" });
  const published = { grouping: { roundOne: [table(1), table(2)], roundTwo: [table(3)] } } as unknown as Parameters<typeof roundTables>[0];
  assert.deepEqual(roundTables(published, 1).map((item) => item.tableNumber), [1, 2]);
  assert.deepEqual(roundTables(published, 2).map((item) => item.tableNumber), [3]);
  assert.deepEqual(roundTables(null, 1), []);
  const participants = [{ profileCompleteness: "complete" }, { profileCompleteness: "partial" }, { profileCompleteness: "minimal" }];
  assert.equal(matchEligibleCount(participants), 2);
  assert.equal(insufficientProfileCount(participants), 1);
  assert.equal(opsConsoleTab("match"), "match");
  assert.equal(opsConsoleTab(["match", "ops"]), "match");
  assert.equal(opsConsoleTab("people"), "ops");
  assert.equal(opsConsoleTab(undefined), "ops");
});

// ═══ 运营台 任务 4：参会者 / 签到 纯函数 ═══

const person = (participantId: string, overrides: Record<string, unknown> = {}) => ({
  actorId: `user:${participantId}`,
  company: "Orbit",
  displayName: participantId.toUpperCase(),
  participantId,
  profileCompleteness: "complete",
  role: "Founder",
  ...overrides,
});

test("matchedParticipantIds reads the published directory first, else the newest completed snapshot", () => {
  const published = { directory: [person("p:a"), person("p:b")] } as unknown as NonNullable<Parameters<typeof matchedParticipantIds>[0]["publishedResult"]>;
  const snapshotOf = (status: string, ids: string[]) => ({ generation: { snapshot: { participants: ids.map((participantId) => ({ participantId })) }, status } });
  const fromDirectory = matchedParticipantIds({ generations: [snapshotOf("completed", ["p:z"])] as never, publishedResult: published });
  assert.deepEqual([...fromDirectory].sort(), ["p:a", "p:b", "user:p:a", "user:p:b"], "directory contributes participantId + actorId");
  const fromSnapshot = matchedParticipantIds({ generations: [snapshotOf("failed", ["p:x"]), snapshotOf("completed", ["p:c"])] as never, publishedResult: null });
  assert.deepEqual([...fromSnapshot], ["p:c"], "newest completed generation wins over a newer failed one");
  assert.equal(matchedParticipantIds({ generations: [snapshotOf("running", ["p:c"])] as never, publishedResult: null }).size, 0);
  assert.equal(matchedParticipantIds(null).size, 0);
});

test("people rows: org / chips / avatar alternate exactly like the design renderVals", () => {
  assert.equal(peopleOrg({ company: "Google", role: "产品经理" }), "Google / 产品经理");
  assert.equal(peopleOrg({ company: "Google", role: null }), "Google");
  assert.equal(peopleOrg({ company: null, role: "产品经理" }), "产品经理");
  assert.equal(peopleOrg({ company: null, role: null }), "");
  assert.deepEqual(peopleDocChip({ profileCompleteness: "complete" }), { bg: "#E6F1EC", color: "#2F6B4F", label: "完整" });
  assert.deepEqual(peopleDocChip({ profileCompleteness: "partial" }), { bg: "#E6F1EC", color: "#2F6B4F", label: "完整" });
  assert.deepEqual(peopleDocChip({ profileCompleteness: "minimal" }), { bg: "#FBF1E4", color: "#9A6B22", label: "待补充" });
  assert.deepEqual(peopleMatchChip(true), { bg: "#ECEEFB", color: "#4B4FC7", label: "已参与匹配" });
  assert.deepEqual(peopleMatchChip(false), { bg: "#F1F1FA", color: "#6B6F99", label: "待补充" });
  assert.equal(peopleAvatarBg(0), "#DDDEFA");
  assert.equal(peopleAvatarBg(1), "#ECEEFB");
  assert.equal(peopleAvatarBg(2), "#DDDEFA");
  assert.deepEqual(PEOPLE_FILTERS.map((item) => item.label), ["全部", "资料完整", "资料待补充", "已参与匹配"]);
  assert.deepEqual(PEOPLE_FILTER_TONE.on, { bg: "#2E3270", border: "#2E3270", color: "#FFFFFF", weight: 500 });
  assert.deepEqual(PEOPLE_FILTER_TONE.off, { bg: "#FFFFFF", border: "#DDDEFA", color: "#3B3F7A", weight: 400 });
});

test("filterPeople applies the four filters and the name + company + role search; peopleStats counts three numbers", () => {
  const people = [
    person("p:a", { company: "Google", role: "产品经理" }),
    person("p:b", { company: "SoftBank", profileCompleteness: "partial", role: "投资经理" }),
    person("p:c", { company: null, profileCompleteness: "minimal", role: null }),
  ];
  const matched = new Set(["p:a", "user:p:c"]);
  const ids = (rows: readonly { participantId: string }[]) => rows.map((row) => row.participantId);
  assert.deepEqual(ids(filterPeople(people, "all", "", matched)), ["p:a", "p:b", "p:c"]);
  assert.deepEqual(ids(filterPeople(people, "complete", "", matched)), ["p:a", "p:b"]);
  assert.deepEqual(ids(filterPeople(people, "incomplete", "", matched)), ["p:c"]);
  assert.deepEqual(ids(filterPeople(people, "matched", "", matched)), ["p:a", "p:c"], "matched by participantId or actorId");
  assert.deepEqual(ids(filterPeople(people, "all", "  google ", matched)), ["p:a"], "company, lower-case, trimmed");
  assert.deepEqual(ids(filterPeople(people, "all", "经理", matched)), ["p:a", "p:b"], "role");
  assert.deepEqual(ids(filterPeople(people, "all", "P:B", matched)), ["p:b"], "display name");
  assert.deepEqual(ids(filterPeople(people, "matched", "经理", matched)), ["p:a"], "filter and search compose");
  assert.deepEqual(peopleStats(people), { complete: 2, incomplete: 1, total: 3 });
  assert.deepEqual(peopleStats([]), { complete: 0, incomplete: 0, total: 0 });
});

test("insufficientProfileCount excludes minimal profiles that already sit in the matched set", () => {
  const people = [person("p:a", { profileCompleteness: "minimal" }), person("p:b", { profileCompleteness: "minimal" }), person("p:c")];
  assert.equal(insufficientProfileCount(people), 2, "no matched set → every minimal counts");
  assert.equal(insufficientProfileCount(people, new Set(["p:a"])), 1, "by participantId");
  assert.equal(insufficientProfileCount(people, new Set(["user:p:b"])), 1, "by actorId");
  assert.equal(insufficientProfileCount(people, new Set(["p:a", "user:p:b"])), 0);
  assert.equal(matchEligibleCount(people), 1, "可参与匹配 keeps its rule");
});

test("check-in rows: filters / search by name or participantId suffix / counts / latest five / HH:mm in JST", () => {
  const row = (participantId: string, displayName: string, checkedInAt: string | null = null) => ({ checkedIn: checkedInAt !== null, checkedInAt, displayName, participantId });
  const items = [
    row("p:000001", "Alice", "2026-10-01T00:05:00.000Z"),
    row("p:000002", "Bob"),
    row("p:000003", "Cai", "2026-10-01T00:20:00.000Z"),
    row("p:000004", "Dan", "2026-10-01T00:10:00.000Z"),
    row("p:000005", "Eve", "2026-10-01T00:15:00.000Z"),
    row("p:000006", "Fay", "2026-10-01T00:01:00.000Z"),
    row("p:000007", "Gus", "2026-10-01T00:30:00.000Z"),
  ];
  const ids = (rows: readonly { participantId: string }[]) => rows.map((item) => item.participantId);
  assert.deepEqual(CHECKIN_FILTERS.map((item) => item.label), ["未签到", "已签到", "全部"], "design order");
  assert.deepEqual(ids(filterRoster(items, "pending", "")), ["p:000002"]);
  assert.deepEqual(ids(filterRoster(items, "done", "")).length, 6);
  assert.deepEqual(ids(filterRoster(items, "all", "")).length, 7);
  assert.deepEqual(ids(filterRoster(items, "all", " ALICE ")), ["p:000001"], "name, lower-case, trimmed");
  assert.deepEqual(ids(filterRoster(items, "all", "0003")), ["p:000003"], "participantId suffix");
  assert.deepEqual(ids(filterRoster(items, "pending", "cai")), [], "filter and search compose");
  assert.deepEqual(checkinCounts(items), { checked: 6, pending: 1 });
  assert.deepEqual(ids(latestCheckIns(items)), ["p:000007", "p:000003", "p:000005", "p:000004", "p:000001"], "checkedInAt desc, five at most");
  assert.deepEqual(latestCheckIns([row("p:1", "x")]), []);
  assert.equal(checkInClock("2026-10-01T00:05:00.000Z"), "09:05", "JST fixed offset, UTC getters");
  assert.equal(checkInClock("2026-10-01T15:07:00.000Z"), "00:07");
  assert.equal(checkInClock("nope"), "—");
  assert.equal(checkInClock(null), "—");
  assert.deepEqual(CHECKIN_FILTER_TONE.on, { bg: "#DDDEFA", color: "#2E3270", weight: 500 });
  assert.deepEqual(CHECKIN_FILTER_TONE.off, { bg: "transparent", color: "#6B6F99", weight: 400 });
  assert.deepEqual(CHECKIN_STATUS_CHIP.pending, { bg: "#F1F1FA", color: "#6B6F99", label: "未签到" });
  assert.deepEqual(CHECKIN_STATUS_CHIP.done, { bg: "#E6F1EC", color: "#2F6B4F", label: "已签到" });
  assert.deepEqual(CHECKIN_BUTTON_TONE.arrive, { bg: "#0E1225", border: "#0E1225", color: "#FFFFFF", cursor: "pointer" });
  assert.deepEqual(CHECKIN_BUTTON_TONE.done, { bg: "#F1F1FA", border: "#F1F1FA", color: "#9FA3C4", cursor: "default" });
});

// ═══ 报名设置屏（设计 300–367；renderVals 608–615 / 704–706；审阅修订 12）═══

test("form question rows: 1-based no / prompt / 必填 vs 选填 chip exactly like renderVals 608–615, type chip omitted", () => {
  const rows = formQuestionRows([
    { prompt: "Who would make this event useful for you?", required: true },
    { prompt: "What could you offer?", required: false },
  ]);
  assert.deepEqual(rows, [
    { no: "1", req: "必填", reqBg: "#FBECEA", reqColor: "#B5473A", title: "Who would make this event useful for you?" },
    { no: "2", req: "选填", reqBg: "#F1F1FA", reqColor: "#6B6F99", title: "What could you offer?" },
  ]);
  assert.equal("type" in rows[0], false, "no type field on the question contract → chip omitted (审阅修订 12)");
  assert.deepEqual(formQuestionRows([]), []);
});

test("form status chip: frozen → 已冻结; draft ahead of published or nothing published → 草稿中; otherwise 已发布 vN", () => {
  const head = (patch: Record<string, unknown>) => ({ draftVersion: null, eventId: "e", frozenAt: null, publishedAt: null, publishedVersion: null, revision: 0, ...patch });
  assert.deepEqual(formStatusChip(null, NOW), { bg: "#E6F1EC", color: "#2F6B4F", label: "草稿中" }, "NOT_FOUND snapshot → drafting");
  assert.deepEqual(formStatusChip(head({ draftVersion: 3 }), NOW), { bg: "#E6F1EC", color: "#2F6B4F", label: "草稿中" });
  assert.deepEqual(formStatusChip(head({ draftVersion: 3, publishedVersion: 2 }), NOW), { bg: "#E6F1EC", color: "#2F6B4F", label: "草稿中" });
  assert.deepEqual(formStatusChip(head({ draftVersion: 2, publishedVersion: 2 }), NOW), { bg: "#ECEEFB", color: "#4B4FC7", label: "已发布 v2" });
  assert.deepEqual(formStatusChip(head({ draftVersion: null, publishedVersion: 5 }), NOW), { bg: "#ECEEFB", color: "#4B4FC7", label: "已发布 v5" });
  assert.deepEqual(formStatusChip(head({ draftVersion: 3, frozenAt: new Date(NOW - HOUR).toISOString() }), NOW), { bg: "#FBF1E4", color: "#9A6B22", label: "已冻结" });
  assert.deepEqual(formStatusChip(head({ draftVersion: 3, frozenAt: new Date(NOW + HOUR).toISOString() }), NOW), { bg: "#E6F1EC", color: "#2F6B4F", label: "草稿中" }, "future frozenAt is not frozen yet (hook `frozen` semantics)");
});

test("last saved chip: relative time from draft.createdAt; no draft → 尚未保存", () => {
  assert.equal(lastSavedChip(null, NOW), "◷ 尚未保存");
  assert.equal(lastSavedChip(undefined, NOW), "◷ 尚未保存");
  assert.equal(lastSavedChip("nope", NOW), "◷ 尚未保存");
  assert.equal(lastSavedChip(new Date(NOW - 20 * 1000).toISOString(), NOW), "◷ 上次保存 刚刚");
  assert.equal(lastSavedChip(new Date(NOW - 5 * 60 * 1000).toISOString(), NOW), "◷ 上次保存 5 分钟前", "design 302");
  assert.equal(lastSavedChip(new Date(NOW - 3 * HOUR).toISOString(), NOW), "◷ 上次保存 3 小时前");
  assert.equal(lastSavedChip(new Date(NOW - 49 * HOUR).toISOString(), NOW), "◷ 上次保存 2 天前");
  assert.equal(lastSavedChip(new Date(NOW + HOUR).toISOString(), NOW), "◷ 上次保存 刚刚", "clock skew clamps to 刚刚");
});

test("preview choice: positioning is single-choice, every other intent multi; add-question gate follows the track", () => {
  assert.equal(previewChoice("positioning"), "single");
  assert.equal(previewChoice("target_attendees"), "multi");
  assert.equal(previewChoice("value_offered"), "multi");
  assert.equal(FORM_INTRO_LIMIT, 1000);
  assert.equal(FORM_QUESTION_LIMIT, 4);
  assert.equal(canAddQuestion("v1", 2), false);
  assert.equal(canAddQuestion("v2", 3), true);
  assert.equal(canAddQuestion("v2", 4), false);
  assert.equal(addQuestionHint("v1", 2), "V1 轨道固定两题必答；切到 V2 后可增删。");
  assert.equal(addQuestionHint("v2", 4), "最多 4 题。");
  assert.equal(addQuestionHint("v2", 1), null);
  assert.deepEqual(cleanOptions([" A ", "", "B", "   "]), ["A", "B"], "trim + drop blanks (old comma-split behaviour)");
  assert.equal(hasBlankOptions([{ options: ["A", "B"] }, { options: ["C", " "] }]), true);
  assert.equal(hasBlankOptions([{ options: ["A", "B"] }]), false);
  assert.equal(hasBlankOptions([]), false);
});

// ═══ 数据报告屏（设计 369–445；renderVals 617–627 / 700–711；审阅修订 14）═══

test("report stats map the organizer aggregate onto the four design cards (378–381 backgrounds verbatim)", () => {
  const aggregate = {
    checkIns: { checkedIn: 64 },
    contactRequests: { accepted: 42, awaitingTargetConsent: 1, declined: 0, withdrawn: 0 },
    registrations: { active: 86, cancelled: 2 },
    roi: { metrics: { strongActions: { appointments: 0, followupReminders: 18, humanEncounterNotes: 0, messageDrafts: 0 } }, snapshot: { windowEndsAt: "2026-09-16T14:59:00.000Z" } },
  } as unknown as EventAnalyticsOrganizerAggregate;
  assert.deepEqual(reportStats(aggregate), [
    { bg: "#F7F7FD", icon: "⚇", iconBg: "#ECEEFB", iconColor: "#4B4FC7", key: "registrations", label: "报名人数", value: 86 },
    { bg: "#F1F8F4", icon: "✓", iconBg: "#E0EFE6", iconColor: "#2F6B4F", key: "checkedIn", label: "到场人数", value: 64 },
    { bg: "#FDF8EF", icon: "⇄", iconBg: "#F5E3C2", iconColor: "#9A6B22", key: "contacts", label: "联系方式交换", value: 42 },
    { bg: "#F7F7FD", icon: "▤", iconBg: "#ECEEFB", iconColor: "#4B4FC7", key: "followups", label: "后续跟进", value: 18 },
  ]);
  assert.deepEqual(reportRate(64, 86), { detail: "64 / 86", value: "74%" });
  assert.deepEqual(reportRate(42, 86), { detail: "42 / 86", value: "49%" });
  assert.deepEqual(reportRate(0, 0), { detail: "0 / 0", value: "—" }, "zero denominator → —");
  assert.deepEqual(reportFollowup(aggregate), { generated: 18 }, "已完成跟进 has no field → omitted");
  assert.equal(reportClock("2026-09-16T14:59:00.000Z"), "2026年9月16日 23:59", "JST fixed offset");
  assert.equal(reportClock("2026-12-31T15:00:00.000Z"), "2027年1月1日 00:00");
  assert.equal(reportClock("nope"), "—");
  assert.deepEqual(REPORT_VIEW_TONE.on, { bg: "#2E3270", color: "#FFFFFF", weight: 500 });
  assert.deepEqual(REPORT_VIEW_TONE.off, { bg: "transparent", color: "#6B6F99", weight: 400 });
});

test("attendee stats / lines reuse report.tsx:253–289 copy on the same four card tones", () => {
  const report = {
    aiArtifact: { artifact: null, failureCode: null, status: "unconfigured" },
    appointments: { completed: 1 },
    checkIn: { checkedInAt: "2026-10-01T00:05:00.000Z", status: "checked_in" },
    contactRequests: { accepted: 2 },
    encounters: { captured: 3, projected: 4 },
    grouping: { roundOneTableNumber: 1, roundTwoTableNumber: 2, status: "available" },
  } as never;
  assert.deepEqual(attendeeStats(report).map((stat) => [stat.label, stat.value, stat.bg]), [
    ["已同意联系", 2, "#F7F7FD"],
    ["本人交流记录", 3, "#F1F8F4"],
    ["已投影交流", 4, "#FDF8EF"],
    ["已完成约谈", 1, "#F7F7FD"],
  ]);
  assert.deepEqual(attendeeCheckInLine(report), { label: "已签到", sub: "09:05" });
  assert.deepEqual(attendeeCheckInLine({ checkIn: { checkedInAt: null, status: "not_checked_in" } } as never), { label: "未签到", sub: "" });
  assert.equal(attendeeGroupingLine(report), "已可见 · 第一轮第 1 桌 · 第二轮第 2 桌");
  assert.equal(attendeeGroupingLine({ grouping: { roundOneTableNumber: null, roundTwoTableNumber: null, status: "locked" } } as never), "已发布，暂未到可见时间");
  assert.equal(attendeeGroupingLine({ grouping: { roundOneTableNumber: null, roundTwoTableNumber: null, status: "not_published" } } as never), "尚未发布");
  assert.deepEqual(attendeeAiStatus("unconfigured", false), { description: "尚无可读取的 AI 产物；不会触发生成或返回替代文案。", label: "未启用" });
  assert.deepEqual(attendeeAiStatus("queued", false), { description: "AI 产物正在排队，尚无可展示内容。", label: "排队中" });
  assert.deepEqual(attendeeAiStatus("running", false), { description: "AI 产物正在生成，存储并 ready 前不会展示草稿。", label: "生成中" });
  assert.deepEqual(attendeeAiStatus("failed", false), { description: "AI 产物生成失败；不会以模板或推测内容替代。", label: "生成失败" });
  assert.deepEqual(attendeeAiStatus("ready", true), { description: "已读取基于本人许可证据生成的现有 AI 产物。", label: "已生成" });
  assert.deepEqual(attendeeAiStatus("ready", false), { description: "AI 产物状态为 ready，但没有可显示的已验证内容。", label: "已生成" });
});
