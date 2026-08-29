import assert from "node:assert/strict";
import test from "node:test";

import * as schedule from "../src/view-models/schedule";

type ScheduleTimelineModule = typeof schedule & {
  japanCalendarDateInfo?: (dateKey: string) => {
    holidayName?: string;
    isHoliday: boolean;
    isSaturday: boolean;
    isSunday: boolean;
  };
  shiftScheduleMonthDateKey?: (dateKey: string, months: number) => string;
  scheduleToCalendarView?: (input: {
    events: unknown;
    now?: Date;
    scheduleItems?: unknown;
    selectedDateKey?: string;
    tasks: unknown;
  }) => {
    allDayItems: Array<{ id: string }>;
    days: Array<{
      dateKey: string;
      dayNumber: string;
      holidayName?: string;
      isHoliday: boolean;
      isSelected: boolean;
      isSaturday: boolean;
      isSunday: boolean;
      isToday: boolean;
      items: Array<{ id: string }>;
      weekdayLabel: string;
    }>;
    monthLabel: string;
    selectedDateKey: string;
    selectedDayLabel: string;
    timedItems: Array<{
      dateKey: string;
      durationMinutes: number;
      id: string;
      kind: "event" | "followup";
      timeLabel: string;
      title: string;
    }>;
    weekLabel: string;
  };
  scheduleToTimelineView?: (input: {
    events: unknown;
    now?: Date;
    tasks: unknown;
  }) => {
    emptyMessage: string;
    emptyTitle: string;
    sections: Array<{
      detail: string;
      id: string;
      items: Array<{
        actionLabel: string;
        detail: string;
        href: string;
        id: string;
        kind: "event" | "followup";
        coverPath?: string;
        reason: string;
        participantCountLabel?: string;
        location?: string;
        statusLabel: string;
        subtitle: string;
        timeLabel: string;
        title: string;
      }>;
      title: string;
    }>;
    eventHighlights: Array<{
      coverPath?: string;
      href: string;
      id: string;
      kind: "event" | "followup";
      location?: string;
      participantCountLabel?: string;
      statusLabel: string;
      timeLabel: string;
      title: string;
    }>;
    stats: Array<{ label: string; value: string }>;
    summary: string;
  };
};

function scheduleCalendar() {
  const scheduleModule = schedule as ScheduleTimelineModule;

  assert.equal(
    typeof scheduleModule.scheduleToCalendarView,
    "function",
    "scheduleToCalendarView should exist"
  );

  return scheduleModule.scheduleToCalendarView;
}

function scheduleTimeline() {
  const scheduleModule = schedule as ScheduleTimelineModule;

  assert.equal(
    typeof scheduleModule.scheduleToTimelineView,
    "function",
    "scheduleToTimelineView should exist"
  );

  return scheduleModule.scheduleToTimelineView;
}

test("scheduleToTimelineView combines followups and upcoming events into a Chinese timeline", () => {
  const toTimeline = scheduleTimeline();
  const view = toTimeline({
    events: {
      events: [
        {
          id: "event_signup_03",
          sourceMetadata: {
            label:
              "日中投資家・創業者申込サロン / 日中投资人与创业者报名沙龙 / Japan-China Investor Founder Signup Salon"
          },
          startsAt: "2026-07-24T15:00:00+09:00",
          status: "confirmed",
          title: "Tokyo founder salon",
          venue: "Shibuya"
        },
        {
          id: "event_old",
          sourceMetadata: {
            label: "已结束活动"
          },
          startsAt: "2026-07-10T15:00:00+09:00",
          status: "ended",
          venue: "Tokyo"
        }
      ]
    },
    now: new Date("2026-07-24T08:00:00+09:00"),
    tasks: {
      tasks: [
        {
          contactName: "Maya Chen",
          organization: "Kumo Grid",
          priority: "today",
          recommendedAction: "Review follow-up for contact_024",
          taskId: "task-1",
          dueAt: "2026-07-24T10:00:00+09:00",
          dueInDays: 0
        }
      ]
    }
  });

  assert.equal(view.summary, "今天有 1 项待办和 1 场活动需要判断。");
  assert.deepEqual(view.stats, [
    { label: "待办", value: "1" },
    { label: "活动", value: "1" },
    { label: "日期", value: "1" }
  ]);
  assert.equal(view.sections.length, 1);
  assert.equal(view.sections[0]?.title, "7月24日 周五");
  assert.equal(view.sections[0]?.detail, "2 项安排");
  assert.deepEqual(
    view.sections[0]?.items.map((item) => ({
      actionLabel: item.actionLabel,
      href: item.href,
      kind: item.kind,
      statusLabel: item.statusLabel,
      timeLabel: item.timeLabel,
      title: item.title
    })),
    [
      {
        actionLabel: "处理待办",
        href: "/followups",
        kind: "followup",
        statusLabel: "待确认",
        timeLabel: "10:00",
        title: "联系 Maya Chen"
      },
      {
        actionLabel: "查看活动安排",
        href: "/schedule/events/event_signup_03",
        kind: "event",
        statusLabel: "已确认",
        timeLabel: "15:00",
        title: "日中投资人与创业者报名沙龙"
      }
    ]
  );
  assert.equal(
    view.sections[0]?.items[1]?.reason,
    "先看活动时间、地点和参会目标，再决定要准备的介绍。"
  );
  assert.equal(
    view.sections[0]?.items[1]?.coverPath,
    "/orbit-covers/events/investor-founder-salon.jpg"
  );
  assert.equal(view.sections[0]?.items[1]?.location, "Shibuya");
  assert.equal(view.sections[0]?.items[1]?.participantCountLabel, "报名人数待确认");
  assert.doesNotMatch(
    JSON.stringify(view),
    /\b(mock|fixture|provider|source-backed|implementation|command-center)\b/iu
  );
});

test("scheduleToTimelineView keeps a manual event title separate from source notes", () => {
  const toTimeline = scheduleTimeline();
  const view = toTimeline({
    events: {
      events: [
        {
          id: "event:live-record:20260729",
          sourceMetadata: {
            label:
              "本地全产品功能审计创建，仅用于动态路由与账号隔离验证。"
          },
          startsAt: "2026-09-29T10:00:00+09:00",
          status: "confirmed",
          title: "功能审计私有活动 20260729",
          venue: "Orbit 本地开发环境"
        }
      ]
    },
    now: new Date("2026-07-29T03:00:00+09:00"),
    tasks: { tasks: [] }
  });

  assert.equal(
    view.sections[0]?.items[0]?.title,
    "功能审计私有活动 20260729"
  );
  assert.equal(
    view.eventHighlights[0]?.title,
    "功能审计私有活动 20260729"
  );
  assert.doesNotMatch(
    view.sections[0]?.items[0]?.title ?? "",
    /本地全产品功能审计创建/u
  );
});

test("scheduleToTimelineView keeps an empty schedule useful", () => {
  const toTimeline = scheduleTimeline();
  const view = toTimeline({
    events: { events: [] },
    now: new Date("2026-07-24T08:00:00+09:00"),
    tasks: { tasks: [] }
  });

  assert.equal(view.emptyTitle, "暂无安排");
  assert.equal(
    view.emptyMessage,
    "待办、活动和需要提前准备的人脉事项会出现在这里。"
  );
  assert.deepEqual(view.sections, []);
});

test("scheduleToTimelineView keeps stale today followups from hiding upcoming events", () => {
  const toTimeline = scheduleTimeline();
  const tasks = Array.from({ length: 6 }, (_, index) => ({
    contactName: `联系人 ${index + 1}`,
    organization: "Orbit Network",
    priority: "today",
    recommendedAction: `跟进联系人 ${index + 1} 的关系进展。`,
    taskId: `task-${index + 1}`,
    dueAt: `2026-07-${String(10 + index).padStart(2, "0")}T09:00:00+09:00`,
    dueInDays: 0
  }));
  const view = toTimeline({
    events: {
      events: [
        {
          id: "event_signup_02",
          sourceMetadata: {
            label:
              "東京AI実装パートナー申込会 / 东京 AI 落地伙伴报名会 / Tokyo AI Implementation Partner Registration Meetup"
          },
          startsAt: "2026-08-04T14:00:00+09:00",
          status: "confirmed",
          venue: "Tokyo"
        }
      ]
    },
    now: new Date("2026-07-24T08:00:00+09:00"),
    tasks: { tasks }
  });

  assert.equal(view.summary, "今天有 4 项待办和 1 场活动需要判断。");
  assert.deepEqual(view.stats, [
    { label: "待办", value: "4" },
    { label: "活动", value: "1" },
    { label: "日期", value: "2" }
  ]);
  assert.equal(view.sections[0]?.title, "7月24日 周五");
  assert.equal(view.sections[0]?.detail, "4 项安排");
  assert.deepEqual(
    view.sections[0]?.items.map((item) => item.title),
    ["联系 联系人 1", "联系 联系人 2", "联系 联系人 3", "联系 联系人 4"]
  );
  assert.equal(view.sections[1]?.title, "8月4日 周二");
  assert.equal(view.sections[1]?.items[0]?.kind, "event");
  assert.deepEqual(
    view.eventHighlights.map((item) => ({
      coverPath: item.coverPath,
      href: item.href,
      kind: item.kind,
      statusLabel: item.statusLabel,
      timeLabel: item.timeLabel,
      title: item.title
    })),
    [
      {
        coverPath: "/orbit-covers/events/tokyo-ai-partner-meetup.jpg",
        href: "/schedule/events/event_signup_02",
        kind: "event",
        statusLabel: "已确认",
        timeLabel: "14:00",
        title: "东京 AI 落地伙伴报名会"
      }
    ]
  );
});

test("scheduleToCalendarView builds a Sunday-first week and selected-day time blocks", () => {
  const toCalendar = scheduleCalendar();
  const view = toCalendar({
    events: {
      events: [
        {
          endsAt: "2026-08-25T20:00:00+09:00",
          id: "event_dinner",
          startsAt: "2026-08-25T18:30:00+09:00",
          status: "confirmed",
          title: "关西创业者晚餐会",
          venue: "大阪"
        },
        {
          endsAt: "2026-08-26T12:00:00+09:00",
          id: "event_lunch",
          startsAt: "2026-08-26T11:00:00+09:00",
          status: "confirmed",
          title: "与林美月午餐",
          venue: "梅田"
        }
      ]
    },
    now: new Date("2026-08-25T08:00:00+09:00"),
    tasks: {
      tasks: [
        {
          contactName: "佐藤健一",
          dueAt: "2026-08-25T09:30:00+09:00",
          dueInDays: 0,
          organization: "北星餐饮",
          priority: "today",
          taskId: "task-contact"
        }
      ]
    }
  });

  assert.equal(view.monthLabel, "2026年8月");
  assert.equal(view.weekLabel, "8月23日 - 8月29日");
  assert.equal(view.selectedDateKey, "2026-08-25");
  assert.equal(view.selectedDayLabel, "8月25日 周二");
  assert.deepEqual(
    view.days.map((day) => ({
      dateKey: day.dateKey,
      isSelected: day.isSelected,
      isToday: day.isToday,
      weekdayLabel: day.weekdayLabel
    })),
    [
      { dateKey: "2026-08-23", isSelected: false, isToday: false, weekdayLabel: "周日" },
      { dateKey: "2026-08-24", isSelected: false, isToday: false, weekdayLabel: "周一" },
      { dateKey: "2026-08-25", isSelected: true, isToday: true, weekdayLabel: "周二" },
      { dateKey: "2026-08-26", isSelected: false, isToday: false, weekdayLabel: "周三" },
      { dateKey: "2026-08-27", isSelected: false, isToday: false, weekdayLabel: "周四" },
      { dateKey: "2026-08-28", isSelected: false, isToday: false, weekdayLabel: "周五" },
      { dateKey: "2026-08-29", isSelected: false, isToday: false, weekdayLabel: "周六" }
    ]
  );
  assert.deepEqual(
    view.timedItems.map((item) => ({
      durationMinutes: item.durationMinutes,
      id: item.id,
      kind: item.kind,
      timeLabel: item.timeLabel
    })),
    [
      {
        durationMinutes: 30,
        id: "task-contact",
        kind: "followup",
        timeLabel: "09:30"
      },
      {
        durationMinutes: 90,
        id: "event_dinner",
        kind: "event",
        timeLabel: "18:30"
      }
    ]
  );
  assert.equal(view.days[3]?.items[0]?.id, "event_lunch");
  assert.deepEqual(view.allDayItems, []);
});

test("scheduleToCalendarView includes canonical meetings and personal schedule items", () => {
  const toCalendar = scheduleCalendar();
  const view = toCalendar({
    events: { events: [] },
    now: new Date("2026-08-29T08:00:00+09:00"),
    scheduleItems: {
      scheduleItems: [
        {
          category: "personal",
          endsAt: "2026-08-29T18:30:00+09:00",
          id: "schedule:review",
          kind: "personal",
          location: "Orbit 办公室",
          sourceId: "schedule:review",
          startsAt: "2026-08-29T17:30:00+09:00",
          state: "upcoming",
          title: "本周经营复盘与下周优先级",
        },
      ],
    },
    tasks: { tasks: [] },
  });

  assert.deepEqual(view.timedItems.map((item) => ({ kind: item.kind, title: item.title })), [
    { kind: "personal", title: "本周经营复盘与下周优先级" },
  ]);
});

test("calendar view does not hide future canonical tasks after the first four", () => {
  const toCalendar = scheduleCalendar();
  const tasks = Array.from({ length: 8 }, (_, index) => ({
    dueAt: `2026-08-${String(30 + index).padStart(2, "0")}T10:00:00+09:00`,
    id: `task:${index}`,
    notes: `第 ${index + 1} 项工作的具体准备内容`,
    plannedDate: `2026-08-${String(30 + index).padStart(2, "0")}`,
    priority: "normal",
    title: `第 ${index + 1} 项工作`,
  }));
  const view = toCalendar({
    events: { events: [] },
    now: new Date("2026-08-29T08:00:00+09:00"),
    selectedDateKey: "2026-09-06",
    tasks: { tasks },
  });
  assert.equal(view.items.filter((item) => item.kind === "followup").length, 8);
  assert.equal(view.items.some((item) => item.title === "第 8 项工作"), true);
});

test("scheduleToCalendarView moves the selected week without changing today's marker", () => {
  const toCalendar = scheduleCalendar();
  const view = toCalendar({
    events: { events: [] },
    now: new Date("2026-08-25T08:00:00+09:00"),
    selectedDateKey: "2026-09-01",
    tasks: { tasks: [] }
  });

  assert.equal(view.monthLabel, "2026年9月");
  assert.equal(view.weekLabel, "8月30日 - 9月5日");
  assert.equal(view.selectedDayLabel, "9月1日 周二");
  assert.deepEqual(
    view.days.map((day) => day.dateKey),
    [
      "2026-08-30",
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05"
    ]
  );
  assert.equal(view.days.some((day) => day.isToday), false);
});

test("Japanese calendar metadata distinguishes public holidays and weekends", () => {
  const scheduleModule = schedule as ScheduleTimelineModule;

  assert.equal(typeof scheduleModule.japanCalendarDateInfo, "function");
  assert.deepEqual(scheduleModule.japanCalendarDateInfo?.("2026-08-11"), {
    holidayName: "山之日",
    isHoliday: true,
    isSaturday: false,
    isSunday: false
  });
  assert.deepEqual(scheduleModule.japanCalendarDateInfo?.("2026-08-29"), {
    isHoliday: false,
    isSaturday: true,
    isSunday: false
  });
  assert.deepEqual(scheduleModule.japanCalendarDateInfo?.("2026-08-30"), {
    isHoliday: false,
    isSaturday: false,
    isSunday: true
  });
});

test("scheduleToCalendarView exposes localized Japanese holiday metadata", () => {
  const toCalendar = scheduleCalendar();
  const view = toCalendar({
    events: { events: [] },
    now: new Date("2026-08-11T08:00:00+09:00"),
    tasks: { tasks: [] }
  });

  assert.equal(view.selectedDayLabel, "8月11日 周二");
  assert.deepEqual(
    view.days.find((day) => day.dateKey === "2026-08-11"),
    {
      dateKey: "2026-08-11",
      dayNumber: "11",
      holidayName: "山之日",
      isHoliday: true,
      isSaturday: false,
      isSelected: true,
      isSunday: false,
      isToday: true,
      items: [],
      weekdayLabel: "周二"
    }
  );
});

test("scheduleToCalendarView keeps past events visible on their calendar date", () => {
  const toCalendar = scheduleCalendar();
  const view = toCalendar({
    events: {
      events: [
        {
          endsAt: "2026-08-15T12:00:00+09:00",
          id: "event_past",
          startsAt: "2026-08-15T10:00:00+09:00",
          status: "imported",
          title: "名片资料生成工作坊",
          venue: "东京"
        }
      ]
    },
    now: new Date("2026-08-26T08:00:00+09:00"),
    selectedDateKey: "2026-08-15",
    tasks: { tasks: [] }
  });

  assert.equal(view.timedItems[0]?.id, "event_past");
  assert.equal(view.timedItems[0]?.timeLabel, "10:00");
});

test("month navigation preserves the day when possible and clamps month ends", () => {
  const scheduleModule = schedule as ScheduleTimelineModule;

  assert.equal(typeof scheduleModule.shiftScheduleMonthDateKey, "function");
  assert.equal(
    scheduleModule.shiftScheduleMonthDateKey?.("2026-08-26", 1),
    "2026-09-26"
  );
  assert.equal(
    scheduleModule.shiftScheduleMonthDateKey?.("2026-08-31", 1),
    "2026-09-30"
  );
  assert.equal(
    scheduleModule.shiftScheduleMonthDateKey?.("2026-01-31", -1),
    "2025-12-31"
  );
});
