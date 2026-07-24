import assert from "node:assert/strict";
import test from "node:test";

import {
  adminLoginToView,
  adminToView
} from "../src/view-models/admin";

function flattenedText(value: unknown): string {
  return JSON.stringify(value);
}

const eventsPayload = {
  events: [
    {
      endsAt: "2026-08-04T16:00:00.000+09:00",
      id: "event_signup_03",
      relationshipValue: "为中国企业在日本落地找到可信合作方",
      sourceMetadata: {
        label: "东京 AI 落地伙伴报名会"
      },
      startsAt: "2026-08-04T14:00:00.000+09:00",
      status: "scheduled",
      title: "东京 AI 落地伙伴报名会",
      venue: "Tokyo"
    },
    {
      endsAt: "2026-07-21T12:00:00.000+09:00",
      id: "kansai-cross-border",
      sourceMetadata: {
        captureMethod: "live-record",
        label: "关西跨境商务交流会"
      },
      startsAt: "2026-07-21T10:00:00.000+09:00",
      status: "scheduled",
      title: "关西跨境商务交流会",
      venue: "Osaka"
    }
  ]
};

test("adminLoginToView mirrors the web admin magic-link entry", () => {
  const view = adminLoginToView();

  assert.equal(view.title, "登录后台");
  assert.equal(view.primaryLabel, "发送登录邮件");
  assert.equal(view.directHref, "/admin");
  assert.equal(view.field.placeholder, "admin@orbit.events");
  assert.match(view.boundary, /不会发送邮件/);
});

test("adminToView builds a Chinese organizer admin dashboard", () => {
  const view = adminToView({
    dashboard: {
      relationshipAssetTotals: {
        contacts: 66
      }
    },
    events: eventsPayload,
    now: new Date("2026-07-24T00:00:00.000+09:00"),
    profile: {
      company: "Orbit",
      fullName: "赵翔",
      title: "Orbit 创始人"
    },
    surface: "dashboard"
  });

  assert.equal(view.title, "主办方后台");
  assert.equal(view.activeTab, "dashboard");
  assert.equal(view.org.name, "Orbit");
  assert.equal(view.org.owner, "赵翔");
  assert.deepEqual(
    view.stats.map((stat) => [stat.label, stat.value]),
    [
      ["活动记录", "2"],
      ["进行中", "0"],
      ["即将开始", "1"],
      ["关系资产", "66"]
    ]
  );
  assert.equal(view.events[0]?.title, "东京 AI 落地伙伴报名会");
  assert.equal(view.events[0]?.stateLabel, "即将开始");
  assert.equal(view.members[0]?.role, "Orbit 创始人");
  assert.doesNotMatch(
    flattenedText(view),
    /\b(mock|fixture|provider|source-backed|implementation|command-center|live-record|database|postgres)\b/iu
  );
});

test("adminToView switches copy for events and access surfaces", () => {
  const eventsView = adminToView({
    events: eventsPayload,
    profile: {
      company: "Orbit"
    },
    surface: "events"
  });
  const accessView = adminToView({
    events: eventsPayload,
    profile: {
      company: "Orbit"
    },
    surface: "access"
  });

  assert.equal(eventsView.title, "活动管理");
  assert.equal(eventsView.activeTab, "events");
  assert.equal(accessView.title, "访问管理");
  assert.equal(accessView.activeTab, "access");
});

test("adminToView prefers Chinese event labels over mixed-language titles", () => {
  const view = adminToView({
    events: {
      events: [
        {
          endsAt: "2026-08-18T20:00:00.000+09:00",
          id: "investor-salon",
          sourceMetadata: {
            label: "日中投资人与创业者报名沙龙"
          },
          startsAt: "2026-08-18T18:00:00.000+09:00",
          status: "scheduled",
          title:
            "日中投資家・創業者申込サロン / Japan-China Investor Founder Signup Salon",
          venue: "Tokyo"
        }
      ]
    },
    now: new Date("2026-07-24T00:00:00.000+09:00"),
    profile: {
      company: "Orbit"
    },
    surface: "events"
  });

  assert.equal(view.events[0]?.title, "日中投资人与创业者报名沙龙");
  assert.doesNotMatch(view.events[0]?.title ?? "", /[ぁ-ヿ]|Japan-China/u);
});
