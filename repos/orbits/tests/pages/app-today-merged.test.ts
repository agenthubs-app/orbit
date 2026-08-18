/**
 * T1（today-schedule 合并计划）门测试：/app/today 骨架合并。
 *
 * 覆盖三块：
 *  - view-model：?date= / ?view= 解析，两源装配里单源失败只降级它自己的区块。
 *  - 整页渲染（renderToStaticMarkup）：月历、当日|本月、需要你决定、
 *    折叠区、页头两按钮、护栏文案关键句同时出现。
 *  - 对账断言：查看名片/起草邮件/展开详情/添加来源/安排约见 字符串齐全——后三
 *    个天然依赖当天是否恰好有安排，所以用一个手工构造的确定性 viewModel 直接
 *    渲染时间脊柱组件，不依赖系统当前日期是否命中 mock fixtures。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { OrbitScheduleViewModel } from "../../app/(app)/app/orbit-schedule-route-view-model";
import {
  loadAppTodayMergedViewModel,
  type AppTodayMergedLoaders,
} from "../../app/(app)/app/today/compose-app-today-from-agent-ledger/today-merged-view-model";
import {
  appointmentScheduleFromRecords,
  confirmedEventScheduleFromRecords,
  emptyTodayAppointmentSchedule,
} from "../../app/(app)/app/today/compose-app-today-from-agent-ledger/today-appointment-schedule";
import { loadAppTodayRouteViewModel } from "../../app/(app)/app/today/compose-app-today-from-agent-ledger/today-route-view-model";
import { OrbitRealToday } from "../../app/(app)/app/today/orbit-real-today";
import { OrbitTodayTimeSpine } from "../../app/(app)/app/today/orbit-today-time-spine";
import { presentTodaySectionTitles } from "../../app/(app)/app/today/today-section-presentation";
import type { AppointmentAggregate } from "../../features/appointments/contract";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

const realLoaders: AppTodayMergedLoaders = {
  loadTimeSpine: async () => emptyTodayAppointmentSchedule(new Date("2026-07-20T00:00:00.000Z")),
  loadToday: loadAppTodayRouteViewModel,
};

test("Today server route authenticates once and passes that actor through every merged loader", () => {
  const routeSource = readFileSync(
    join(projectRoot, "app/(app)/app/today/page.tsx"),
    "utf8",
  );
  const contentSource = readFileSync(
    join(projectRoot, "app/(app)/app/today/today-page-content.tsx"),
    "utf8",
  );
  const mergedSource = readFileSync(
    join(
      projectRoot,
      "app/(app)/app/today/compose-app-today-from-agent-ledger/today-merged-view-model.ts",
    ),
    "utf8",
  );

  assert.match(routeSource, /const session = await auth\(\)/);
  assert.match(routeSource, /redirect\("\/app\/account\/login\?next=%2Fapp%2Ftoday"\)/);
  assert.match(routeSource, /actorId,/);
  assert.match(
    contentSource,
    /createAppTodayMergedLoaders\(\s*resolvedLedgerService,\s*actorId,\s*routeControls,\s*\)/,
  );
  assert.match(
    mergedSource,
    /loadConfiguredTodaySchedule\(actorId\)/,
  );
  assert.doesNotMatch(contentSource, /OrbitTodayArrangements/);
  assert.doesNotMatch(mergedSource, /loadAppScheduleRouteViewModel/);
});

test("Today only projects confirmed appointments with an actor-owned canonical contact", () => {
  const actorId = "actor:today";
  const confirmedAppointment = {
    appointmentId: "appointment:confirmed",
    authorityRequestId: "request:accepted",
    confirmed: {
      candidateId: "candidate:1",
      confirmedAt: "2026-07-01T00:00:00.000Z",
      confirmedByActorId: actorId,
      durationMinutes: 45,
      medium: { kind: "video", provider: "other", joinUrl: null },
      proposalRevision: 1,
      startsAtUtc: "2026-07-20T05:30:00.000Z",
      timezone: "Asia/Tokyo",
    },
    contactIdsByActor: { [actorId]: "contact:real" },
    status: "confirmed",
  } as unknown as AppointmentAggregate;
  const unconfirmedAppointment = {
    ...confirmedAppointment,
    appointmentId: "appointment:draft",
    confirmed: null,
    status: "draft",
  } as AppointmentAggregate;
  const missingContactAppointment = {
    ...confirmedAppointment,
    appointmentId: "appointment:missing-contact",
    contactIdsByActor: { [actorId]: "contact:not-in-store" },
  } as AppointmentAggregate;
  const contact = {
    id: "contact:real",
    displayName: "伊藤香織",
    organization: "横滨餐饮",
    role: "市场负责人",
  } as Parameters<typeof appointmentScheduleFromRecords>[0]["contacts"][number];

  const schedule = appointmentScheduleFromRecords({
    actorId,
    appointments: [unconfirmedAppointment, missingContactAppointment, confirmedAppointment],
    contacts: [contact],
    now: new Date("2026-07-20T00:00:00.000Z"),
  });

  assert.equal(schedule.schedules.length, 1);
  assert.equal(schedule.schedules[0]?.id, "appointment:confirmed");
  assert.equal(schedule.schedules[0]?.contactId, "contact:real");
  assert.equal(schedule.schedules[0]?.date, "2026-07-20");
  assert.equal(schedule.schedules[0]?.time, "14:30");
  assert.equal(schedule.schedules[0]?.status, "已确认");
  assert.equal(schedule.connections[0]?.displayName, "伊藤香織");
});

test("Today only projects events from the actor-approved Orbit Schedule store", () => {
  const schedule = confirmedEventScheduleFromRecords({
    items: [
      {
        evidenceIds: ["evidence:event-approved"],
        eventId: "event:approved",
        id: "schedule:event-approved",
        startsAt: "2026-07-20T01:00:00.000Z",
        endsAt: "2026-07-20T03:00:00.000Z",
        location: "东京",
        title: "用户明确加入的活动",
      },
    ],
    now: new Date("2026-07-20T00:00:00.000Z"),
  });

  assert.equal(schedule.schedules.length, 1);
  assert.equal(schedule.schedules[0]?.id, "schedule:event-approved");
  assert.equal(schedule.schedules[0]?.contactId, null);
  assert.equal(schedule.schedules[0]?.status, "已确认");
  assert.equal(schedule.schedules[0]?.topic, "用户明确加入的活动");
});

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

test("public Today query input cannot activate internal child route controls", async () => {
  const merged = await loadAppTodayMergedViewModel(
    {
      action: "complete-top-followup",
      scenario: "failure",
    } as unknown as Parameters<typeof loadAppTodayMergedViewModel>[0],
    realLoaders,
  );

  assert.equal(merged.today.state, "success");
  assert.notEqual(merged.timeSpine, null);
});

// ---- two-source assembly: one source failing only degrades its own section ----

test("a today-ledger-source failure degrades only the decide/prepared/recent sections", async () => {
  const merged = await loadAppTodayMergedViewModel(undefined, {
    ...realLoaders,
    loadToday: async () => {
      throw new Error("ledger unavailable");
    },
  });

  assert.equal(merged.today.state, "failure");
  assert.equal(merged.today.errorCode, "TODAY_SECTION_LOAD_FAILED");
  assert.notEqual(merged.timeSpine, null);
});

test("an appointments-source failure only takes down the time spine", async () => {
  const merged = await loadAppTodayMergedViewModel(undefined, {
    ...realLoaders,
    loadTimeSpine: async () => {
      throw new Error("appointments unavailable");
    },
  });

  assert.equal(merged.timeSpine, null);
  assert.equal(merged.timeSpineError?.title, "真实约谈暂时无法加载");
  assert.equal(merged.today.state, "success");
});

test("with both sources healthy, nothing degrades", async () => {
  const merged = await loadAppTodayMergedViewModel(undefined, realLoaders);

  assert.equal(merged.today.state, "success");
  assert.equal(merged.timeSpineError, null);
  assert.notEqual(merged.timeSpine, null);
  const pendingScheduleCount =
    merged.timeSpine?.schedules.filter((schedule) => {
      const selected = merged.calendar.selected;
      const selectedDate = selected.d == null
        ? null
        : `${selected.y}-${String(selected.m + 1).padStart(2, "0")}-${String(selected.d).padStart(2, "0")}`;
      return schedule.date === selectedDate && schedule.status === "待确认";
    }).length ?? 0;
  const decisionCount = merged.today.decideCount;
  assert.deepEqual(merged.attention, {
    decisionCount,
    pendingScheduleCount,
    total: decisionCount + pendingScheduleCount,
  });
});

test("a degraded time-spine card shows the guardrail and a recovery link", async () => {
  const Page = (await import("../../app/(app)/app/today/today-page-content")).default as (props?: {
    searchParams?: Promise<Record<string, string>>;
    routeControls?: {
      appointments?: { scenario: "failure" };
    };
  }) => Promise<React.ReactElement>;
  const html = renderToStaticMarkup(
    await Page({
      routeControls: { appointments: { scenario: "failure" } },
    }),
  );

  const cardMatch = html.match(/data-orbit-today-time-spine-error="true"[\s\S]*?<\/div><\/div>/);
  assert.ok(cardMatch, "expected the time-spine error card to render");
  const card = cardMatch![0];

  assert.match(card, /不会把跟进任务、提醒或 AI 建议冒充为日程/);
  assert.match(card, /href="\/app\/today"/);
});

// ---- full-page render: structural markers that don't depend on which
// calendar day happens to be selected ----

test("/app/today renders the merged workspace shell", async () => {
  const Page = (await import("../../app/(app)/app/today/today-page-content")).default as (props?: {
    loaders?: AppTodayMergedLoaders;
  }) => Promise<React.ReactElement>;
  const html = renderToStaticMarkup(await Page({ loaders: realLoaders }));

  // 月历标记 + 翻月/今天控件
  assert.match(html, /data-orbit-today-time-spine/);
  assert.match(html, /今天/);
  assert.match(html, /上个月|下个月/);

  // 当日 | 本月 切换
  assert.match(html, /当日/);
  assert.match(html, /本月全部/);

  // 需要你决定 / 折叠区；原始联系人建议和活动库存不再作为“安排”出现
  assert.match(html, /data-orbit-today-section="decide"/);
  assert.doesNotMatch(html, /data-orbit-today-arrangements/);
  assert.doesNotMatch(html, /可复核安排/);
  assert.match(html, /<details[^>]*data-orbit-today-section="prepared"/);
  assert.match(html, /<details[^>]*data-orbit-today-section="recent"/);

  // 页头两按钮
  assert.match(html, /安排约见/);
  assert.match(html, /添加来源/);

  // mobile single-column breakpoint stays intact (existing structural gate)
  assert.match(html, /data-orbit-real-page="today"/);
});

test("Today renders ignored natural-language actions with coherent English copy", async () => {
  const loaded = await loadAppTodayRouteViewModel();
  const sourceEntry = loaded.sections
    .flatMap((section) => section.entries)
    .find((entry) => entry.status === "completed");

  assert.ok(sourceEntry);
  const viewModel = presentTodaySectionTitles(
    {
      ...loaded,
      sections: [
        {
          entries: [
            {
              ...sourceEntry,
              status: "rejected",
              title: "创建跟进任务",
            },
          ],
          key: "recent",
          title: "最近动态",
        },
      ],
      state: "success",
    },
    "en",
  );
  const html = renderToStaticMarkup(
    createElement(OrbitRealToday, {
      language: "en",
      viewModel,
    }),
  );

  assert.match(html, /Recent activity/);
  assert.match(html, /Create follow-up task/);
  assert.match(html, /Ignored/);
  assert.doesNotMatch(html, /最近完成|已忽略|Create跟进任务/);
});

// T2 (today-schedule 合并 P2): "只保存为草稿" used to live in a right-column
// panel that rendered unconditionally (defaulting to the first decide
// entry). Now it's part of the decision card's expanded body — progressive
// disclosure means it only appears once a card is actually open, so this
// check needs an ?entry= render instead of the bare-page one above.
test("/app/today shows the draft-only guardrail once a decision card is expanded", async () => {
  const Page = (await import("../../app/(app)/app/today/today-page-content")).default as (props?: {
    searchParams?: Promise<Record<string, string>>;
  }) => Promise<React.ReactElement>;
  const html = renderToStaticMarkup(
    await Page({ searchParams: Promise.resolve({ entry: "ledger-followup-alex-chen" }) }),
  );

  assert.match(html, /只保存为草稿/);
});

test("/app/today keeps working when a ?date= without any meetings is requested", async () => {
  const Page = (await import("../../app/(app)/app/today/today-page-content")).default as (props?: {
    loaders?: AppTodayMergedLoaders;
    searchParams?: Promise<Record<string, string>>;
  }) => Promise<React.ReactElement>;
  const html = renderToStaticMarkup(
    await Page({ loaders: realLoaders, searchParams: Promise.resolve({ date: "1999-01-01", view: "month" }) }),
  );

  assert.match(html, /data-orbit-today-time-spine/);
  assert.match(html, /本月全部|month/);
});

// ---- parity strings: 查看名片/起草邮件/展开详情 depend on a card being open
// on the selected day. Use a deterministic fixture instead of hoping the
// real mock data happens to have a meeting on today's wall-clock date. ----

test("meeting cards expose a real compose action without repeating their topic", () => {
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
  assert.match(html, /data-inbox-compose="true"/);
  assert.match(html, /09:30 Kenji Watanabe，收起详情/);
  assert.equal(
    html.match(/跟进 Kenji Watanabe 的关系进展/g)?.length,
    1,
    "the meeting topic should appear once, not repeat in the expanded detail",
  );
});

test("timeline items without a canonical contact render no contact or compose action", () => {
  const fixture: OrbitScheduleViewModel = {
    connections: [
      {
        company: "",
        displayName: "未关联联系人",
        g: "g-violet",
        id: "task:unlinked",
        initial: "未",
        title: "Relationship task",
      },
    ],
    schedules: [
      {
        cid: "task:unlinked",
        contactId: null,
        date: "2026-07-20",
        dur: "30 分钟",
        id: "schedule:unlinked",
        place: "",
        status: "待确认",
        time: "09:30",
        topic: "复核未关联任务",
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

  assert.match(html, /这条安排还没关联联系人/);
  assert.doesNotMatch(html, /href="\/app\/contacts\//);
  assert.doesNotMatch(html, /data-inbox-compose/);
});

// ---- T2: decision cards become inline accordions (design doc §2, §5) ----

test("without ?entry= no decision card is expanded", async () => {
  const Page = (await import("../../app/(app)/app/today/today-page-content")).default;
  const html = renderToStaticMarkup(await Page());

  assert.doesNotMatch(html, /data-orbit-today-entry-expanded="true"/);
  // The panel's write affordances (confirm/defer) only ever render inside an
  // expanded card — with nothing expanded, neither should appear at all.
  assert.doesNotMatch(html, /确认执行/);
  assert.doesNotMatch(html, /稍后处理/);
});

test("?entry= expands exactly that card, with exactly one 确认执行 in it and none elsewhere", async () => {
  const Page = (await import("../../app/(app)/app/today/today-page-content")).default as (props?: {
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
  // panel) — matching the full guardrail sentence (with the compensation
  // continuation, unique to the panel paragraph) avoids that false positive.
  assert.equal((html.match(/为什么现在出现/g) ?? []).length, 1);
  assert.equal((html.match(/建议基于什么信息/g) ?? []).length, 1);
  assert.equal((html.match(/确认后将会/g) ?? []).length, 1);
  assert.equal(
    (html.match(/只保存为草稿，不会自动发送；已执行的操作可在「操作记录」里撤销。/g) ?? [])
      .length,
    1,
  );
  assert.equal((html.match(/确认执行/g) ?? []).length, 1);
  assert.equal((html.match(/稍后处理/g) ?? []).length, 1);
});

test("entry links preserve ?date=/?view= (T1 review: EntryRow used to strip them)", async () => {
  const Page = (await import("../../app/(app)/app/today/today-page-content")).default as (props?: {
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
  const Page = (await import("../../app/(app)/app/today/today-page-content")).default as (props?: {
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

// ---- Escape key ownership (review fix: an open modal must own Escape
// exclusively — with a decision card expanded via ?entry= AND the 安排约见
// modal open, one Escape press used to both close the modal (document-level
// listener in useOrbitModalA11y) *and* collapse the accordion (window-level
// listener in OrbitTodayEscapeToCollapse), because document-phase bubble
// handlers run before window-phase ones and nothing stopped propagation.
// renderToStaticMarkup never attaches DOM listeners, so this can't be
// exercised behaviorally here (no jsdom in this suite) — assert the source
// directly. Live-browser reproduction of the reviewer's scenario covered
// this fix during development. ----

const projectRootForEscapeGate = join(fileURLToPath(import.meta.url), "../../..");

function sourceForEscapeGate(path: string): string {
  return readFileSync(join(projectRootForEscapeGate, path), "utf8");
}

// ---- T3 (today-schedule 合并 P3): nav consolidation, redirects, mobile ----

test("the arrangements section container carries id=\"arrangements\" (schedule/page.tsx now redirects to /app/today#arrangements)", async () => {
  const Page = (await import("../../app/(app)/app/today/today-page-content")).default;
  const html = renderToStaticMarkup(await Page());

  assert.match(html, /id="arrangements"/);
});

test("the time spine source carries the mobile week-strip markers", () => {
  const timeSpineSource = sourceForEscapeGate("app/(app)/app/today/orbit-today-time-spine.tsx");

  assert.match(timeSpineSource, /data-orbit-week-strip/);
  assert.match(timeSpineSource, /orbit-week-strip-cell/);
  assert.match(timeSpineSource, /orbit-week-full-month-btn/);
  assert.match(timeSpineSource, /@media \(max-width: 760px\)/);
});

test("the header actions source carries the mobile FAB marker", () => {
  const headerActionsSource = sourceForEscapeGate("app/(app)/app/today/orbit-today-header-actions.tsx");

  assert.match(headerActionsSource, /orbit-today-fab/);
  assert.match(headerActionsSource, /ORBIT_Z\.sticky/);
  assert.match(headerActionsSource, /@media \(max-width: 760px\)/);
});

test("the shared scheduling modal fails closed without contact or calendar mutation services", () => {
  const timeSpineSource = sourceForEscapeGate("app/(app)/app/today/orbit-today-time-spine.tsx");

  assert.match(timeSpineSource, /约见服务暂未配置/);
  assert.match(timeSpineSource, /不会创建约见、更新交往记录、写入日历或发送邀请/);
  assert.doesNotMatch(timeSpineSource, /defaultValue="2026-06-28"/);
  assert.doesNotMatch(timeSpineSource, /Select a contact/);
  assert.doesNotMatch(timeSpineSource, /Send invite/);
});

test("an open modal stops Escape from also reaching page-level hotkey listeners", () => {
  const modalA11y = sourceForEscapeGate("app/(app)/app/orbit-modal-a11y.ts");
  const escapeMatch = modalA11y.match(
    /if\s*\(event\.key === "Escape"\)\s*\{([\s\S]*?)\n {6}\}/,
  );
  assert.ok(escapeMatch, "expected an `if (event.key === \"Escape\")` branch in orbit-modal-a11y.ts");
  assert.match(
    escapeMatch![1],
    /event\.stopPropagation\(\)/,
    "the modal's Escape branch must call event.stopPropagation() so a window-level " +
      "listener (e.g. today's escape-to-collapse) never sees the same keypress",
  );
});

test("escape-to-collapse bails when a dialog is open, as defense in depth", () => {
  const escapeToCollapse = sourceForEscapeGate(
    "app/(app)/app/today/orbit-today-escape-to-collapse.tsx",
  );
  const handlerMatch = escapeToCollapse.match(
    /function handleKeyDown\(event: KeyboardEvent\) \{([\s\S]*?)\n {4}\}/,
  );
  assert.ok(handlerMatch, "expected a handleKeyDown function in orbit-today-escape-to-collapse.tsx");
  assert.match(
    handlerMatch![1],
    /document\.querySelector\(\s*['"]\[role="dialog"\]['"]\s*\)/,
    'handleKeyDown must bail when document.querySelector(\'[role="dialog"]\') finds an open ' +
      "modal, covering modals that don't go through useOrbitModalA11y",
  );
});
