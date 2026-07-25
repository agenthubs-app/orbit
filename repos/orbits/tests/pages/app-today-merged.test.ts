/**
 * T1（today-schedule 合并计划）门测试：/app/today 骨架合并。
 *
 * 覆盖三块：
 *  - view-model：?date= / ?view= 解析，三源装配里单源失败只降级它自己的区块。
 *  - 整页渲染（renderToStaticMarkup）：月历、当日|本月、需要你决定、可复核安排、
 *    折叠区、页头两按钮、护栏文案关键句同时出现。
 *  - 对账断言：查看名片/起草邮件/展开详情/添加来源/安排约见 字符串齐全——后三
 *    个天然依赖当天是否恰好有安排，所以用一个手工构造的确定性 viewModel 直接
 *    渲染时间脊柱组件，不依赖系统当前日期是否命中 mock fixtures。
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { loadAppFollowupsRouteViewModel } from "../../app/(app)/app/followups/compose-app-followups-from-previously-approved-mock-first-capabilities/followups-route-view-model";
import type { OrbitScheduleViewModel } from "../../app/(app)/app/orbit-schedule-route-view-model";
import { loadAppScheduleRouteViewModel } from "../../app/(app)/app/schedule/schedule-route-view-model";
import {
  loadAppTodayMergedViewModel,
  type AppTodayMergedLoaders,
} from "../../app/(app)/app/today/compose-app-today-from-agent-ledger/today-merged-view-model";
import { loadAppTodayRouteViewModel } from "../../app/(app)/app/today/compose-app-today-from-agent-ledger/today-route-view-model";
import { OrbitTodayTimeSpine } from "../../app/(app)/app/today/orbit-today-time-spine";

const realLoaders: AppTodayMergedLoaders = {
  loadFollowups: loadAppFollowupsRouteViewModel,
  loadSchedule: loadAppScheduleRouteViewModel,
  loadToday: loadAppTodayRouteViewModel,
};

// ---- view-model: ?date= / ?view= ----

test("?date= parses into calendar.selected", async () => {
  const merged = await loadAppTodayMergedViewModel({ date: "2026-07-20" });

  assert.deepEqual(merged.calendar.selected, { d: 20, m: 6, y: 2026 });
});

test("an unparseable ?date= falls back to a computed default instead of crashing", async () => {
  const merged = await loadAppTodayMergedViewModel({ date: "not-a-date" });

  assert.equal(typeof merged.calendar.selected.y, "number");
  assert.equal(typeof merged.calendar.selected.m, "number");
});

test("?view= defaults to day and accepts month", async () => {
  const dayDefault = await loadAppTodayMergedViewModel();
  assert.equal(dayDefault.calendar.view, "day");

  const month = await loadAppTodayMergedViewModel({ view: "month" });
  assert.equal(month.calendar.view, "month");

  const invalid = await loadAppTodayMergedViewModel({ view: "week" });
  assert.equal(invalid.calendar.view, "day");
});

// ---- three-source assembly: one source failing only degrades its own section ----

test("a schedule-source failure degrades only the arrangements section", async () => {
  const merged = await loadAppTodayMergedViewModel(undefined, {
    ...realLoaders,
    loadSchedule: async () => {
      throw new Error("schedule source unavailable");
    },
  });

  assert.equal(merged.schedule.state, "route-state");
  if (merged.schedule.state === "route-state") {
    assert.equal(merged.schedule.routeState.errorCode, "SCHEDULE_SECTION_LOAD_FAILED");
  }
  assert.equal(merged.today.state, "success");
  assert.notEqual(merged.timeSpine, null);
  assert.deepEqual(merged.dimmedArrangementIds, new Set());
});

test("a today-ledger-source failure degrades only the decide/prepared/recent sections", async () => {
  const merged = await loadAppTodayMergedViewModel(undefined, {
    ...realLoaders,
    loadToday: async () => {
      throw new Error("ledger unavailable");
    },
  });

  assert.equal(merged.today.state, "failure");
  assert.equal(merged.today.errorCode, "TODAY_SECTION_LOAD_FAILED");
  assert.equal(merged.schedule.state, "success");
  assert.notEqual(merged.timeSpine, null);
});

test("a followups-source failure only takes down the time spine", async () => {
  const merged = await loadAppTodayMergedViewModel(undefined, {
    ...realLoaders,
    loadFollowups: async () => {
      throw new Error("followups unavailable");
    },
  });

  assert.equal(merged.timeSpine, null);
  assert.equal(merged.followups.state, "route-state");
  if (merged.followups.state === "route-state") {
    assert.equal(merged.followups.routeState.errorCode, "FOLLOWUPS_SECTION_LOAD_FAILED");
  }
  assert.equal(merged.schedule.state, "success");
  assert.equal(merged.today.state, "success");
});

test("with all three sources healthy, nothing degrades", async () => {
  const merged = await loadAppTodayMergedViewModel(undefined, realLoaders);

  assert.equal(merged.today.state, "success");
  assert.equal(merged.schedule.state, "success");
  assert.equal(merged.followups.state, "success");
  assert.notEqual(merged.timeSpine, null);
});

// ---- full-page render: structural markers that don't depend on which
// calendar day happens to be selected ----

test("/app/today renders the merged workspace shell", async () => {
  const Page = (await import("../../app/(app)/app/today/page")).default;
  const html = renderToStaticMarkup(await Page());

  // 月历标记 + 翻月/今天控件
  assert.match(html, /data-orbit-today-time-spine/);
  assert.match(html, /今天/);
  assert.match(html, /上个月|下个月/);

  // 当日 | 本月 切换
  assert.match(html, /当日/);
  assert.match(html, /本月全部/);

  // 需要你决定 / 可复核安排 / 折叠区
  assert.match(html, /data-orbit-today-section="decide"/);
  assert.match(html, /data-orbit-today-arrangements/);
  assert.match(html, /<details[^>]*data-orbit-today-section="prepared"/);
  assert.match(html, /<details[^>]*data-orbit-today-section="recent"/);

  // 页头两按钮
  assert.match(html, /安排约见/);
  assert.match(html, /添加来源/);

  // 可复核安排卡的护栏文案（不依赖决策卡是否展开——见 arrangement targetNote）
  assert.match(html, /不会写入日历/);

  // mobile single-column breakpoint stays intact (existing structural gate)
  assert.match(html, /data-orbit-real-page="today"/);
});

// T2 (today-schedule 合并 P2): "只保存为草稿" used to live in a right-column
// panel that rendered unconditionally (defaulting to the first decide
// entry). Now it's part of the decision card's expanded body — progressive
// disclosure means it only appears once a card is actually open, so this
// check needs an ?entry= render instead of the bare-page one above.
test("/app/today shows the draft-only guardrail once a decision card is expanded", async () => {
  const Page = (await import("../../app/(app)/app/today/page")).default as (props?: {
    searchParams?: Promise<Record<string, string>>;
  }) => Promise<React.ReactElement>;
  const html = renderToStaticMarkup(
    await Page({ searchParams: Promise.resolve({ entry: "ledger-followup-alex-chen" }) }),
  );

  assert.match(html, /只保存为草稿/);
});

test("/app/today keeps working when a ?date= without any meetings is requested", async () => {
  const Page = (await import("../../app/(app)/app/today/page")).default as (props?: {
    searchParams?: Promise<Record<string, string>>;
  }) => Promise<React.ReactElement>;
  const html = renderToStaticMarkup(
    await Page({ searchParams: Promise.resolve({ date: "1999-01-01", view: "month" }) }),
  );

  assert.match(html, /data-orbit-today-time-spine/);
  assert.match(html, /本月全部|month/);
});

// ---- parity strings: 查看名片/起草邮件/展开详情 depend on a card being open
// on the selected day. Use a deterministic fixture instead of hoping the
// real mock data happens to have a meeting on today's wall-clock date. ----

test("meeting cards in the time spine expose 查看名片/起草邮件/展开详情", () => {
  // Two entries on the selected day: the first is defaultOpen (shows
  // 查看名片/起草邮件 and an aria-label of "收起详情"), the second stays
  // closed so its toggle still reads "展开详情" — covering both labels the
  // way a real multi-meeting day would.
  const fixture: OrbitScheduleViewModel = {
    connections: [
      {
        company: "Aster Grid",
        displayName: "Kenji Watanabe",
        g: "g-violet",
        id: "contact:kenji-watanabe",
        initial: "K",
        title: "Founder",
      },
      {
        company: "Orbit",
        displayName: "徐薇",
        g: "g-amber",
        id: "contact:xu-wei",
        initial: "徐",
        title: "Relationship contact",
      },
    ],
    schedules: [
      {
        cid: "contact:kenji-watanabe",
        date: "2026-07-20",
        dur: "30 分钟",
        id: "schedule:kenji-1",
        place: "Orbit 关系室",
        status: "已确认",
        time: "09:30",
        topic: "跟进 Kenji Watanabe 的关系进展",
      },
      {
        cid: "contact:xu-wei",
        date: "2026-07-20",
        dur: "30 分钟",
        id: "schedule:xuwei-1",
        place: "线上",
        status: "待确认",
        time: "14:00",
        topic: "跟进徐薇的引荐请求",
      },
    ],
    today: { d: 20, m: 6, y: 2026 },
  };

  const html = renderToStaticMarkup(
    createElement(OrbitTodayTimeSpine, {
      initialSelected: { d: 20, m: 6, y: 2026 },
      initialView: "day",
      viewModel: fixture,
    }),
  );

  assert.match(html, /查看名片/);
  assert.match(html, /起草邮件/);
  assert.match(html, /展开详情/);
});

// ---- T2: decision cards become inline accordions (design doc §2, §5) ----

test("without ?entry= no decision card is expanded", async () => {
  const Page = (await import("../../app/(app)/app/today/page")).default;
  const html = renderToStaticMarkup(await Page());

  assert.doesNotMatch(html, /data-orbit-today-entry-expanded="true"/);
  // The panel's write affordances (confirm/defer) only ever render inside an
  // expanded card — with nothing expanded, neither should appear at all.
  assert.doesNotMatch(html, /确认执行/);
  assert.doesNotMatch(html, /稍后处理/);
});

test("?entry= expands exactly that card, with exactly one 确认执行 in it and none elsewhere", async () => {
  const Page = (await import("../../app/(app)/app/today/page")).default as (props?: {
    searchParams?: Promise<Record<string, string>>;
  }) => Promise<React.ReactElement>;
  const html = renderToStaticMarkup(
    await Page({ searchParams: Promise.resolve({ entry: "ledger-followup-alex-chen" }) }),
  );

  // Exactly one card is expanded, and it's the requested one.
  const expandedMatches = html.match(/data-orbit-today-entry-expanded="true"/g) ?? [];
  assert.equal(expandedMatches.length, 1);
  assert.match(
    html,
    /data-orbit-today-entry="ledger-followup-alex-chen"[^>]*data-orbit-today-entry-expanded="true"/,
  );

  // Full detail parity inside the expanded card: the three questions, the
  // evidence chip, the draft-only guardrail, and the confirm form — all
  // exactly once (the content the standalone panel used to own exclusively).
  // Note: "消息只保存为草稿，不会自动发送。" alone also appears a second time
  // as one operation's own effectSummary copy (ledger fixture data, not the
  // panel) — matching the full guardrail sentence (with the "所有写操作..."
  // continuation, unique to the panel paragraph) avoids that false positive.
  assert.equal((html.match(/为什么现在出现/g) ?? []).length, 1);
  assert.equal((html.match(/建议基于什么信息/g) ?? []).length, 1);
  assert.equal((html.match(/确认后将会/g) ?? []).length, 1);
  assert.equal(
    (html.match(/只保存为草稿，不会自动发送。所有写操作可随时在 All actions 中撤销。/g) ?? [])
      .length,
    1,
  );
  assert.equal((html.match(/确认执行/g) ?? []).length, 1);
  assert.equal((html.match(/稍后处理/g) ?? []).length, 1);
});

test("entry links preserve ?date=/?view= (T1 review: EntryRow used to strip them)", async () => {
  const Page = (await import("../../app/(app)/app/today/page")).default as (props?: {
    searchParams?: Promise<Record<string, string>>;
  }) => Promise<React.ReactElement>;
  const html = renderToStaticMarkup(
    await Page({
      searchParams: Promise.resolve({ date: "2026-07-20", view: "month" }),
    }),
  );

  // Every collapsed decision card's link carries the current date/view
  // alongside its own ?entry=, instead of resetting them.
  assert.match(
    html,
    /href="\/app\/today\?date=2026-07-20&amp;view=month&amp;entry=ledger-followup-alex-chen"/,
  );
});

test("the expanded card's header link collapses back to a plain ?date=/?view= URL", async () => {
  const Page = (await import("../../app/(app)/app/today/page")).default as (props?: {
    searchParams?: Promise<Record<string, string>>;
  }) => Promise<React.ReactElement>;
  const html = renderToStaticMarkup(
    await Page({
      searchParams: Promise.resolve({
        date: "2026-07-20",
        entry: "ledger-followup-alex-chen",
        view: "month",
      }),
    }),
  );

  assert.match(html, /href="\/app\/today\?date=2026-07-20&amp;view=month"/);
});
