import assert from "node:assert/strict";
import test from "node:test";

import * as schedule from "../src/view-models/schedule";

type ScheduleTimelineModule = typeof schedule & {
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

  assert.equal(view.summary, "今天有 1 个跟进和 1 场活动需要判断。");
  assert.deepEqual(view.stats, [
    { label: "跟进", value: "1" },
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
        actionLabel: "处理跟进",
        href: "/followups",
        kind: "followup",
        statusLabel: "待确认",
        timeLabel: "10:00",
        title: "跟进 Maya Chen"
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
    "跟进、活动和需要提前准备的关系事项会出现在这里。"
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

  assert.equal(view.summary, "今天有 4 个跟进和 1 场活动需要判断。");
  assert.deepEqual(view.stats, [
    { label: "跟进", value: "4" },
    { label: "活动", value: "1" },
    { label: "日期", value: "2" }
  ]);
  assert.equal(view.sections[0]?.title, "7月24日 周五");
  assert.equal(view.sections[0]?.detail, "4 项安排");
  assert.deepEqual(
    view.sections[0]?.items.map((item) => item.title),
    ["跟进 联系人 1", "跟进 联系人 2", "跟进 联系人 3", "跟进 联系人 4"]
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
