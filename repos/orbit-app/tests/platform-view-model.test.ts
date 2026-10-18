import assert from "node:assert/strict";
import test from "node:test";

import { platformToView } from "../src/view-models/platform";

function flattenedText(value: unknown): string {
  return JSON.stringify(value);
}

const eventsPayload = {
  events: [
    {
      endsAt: "2026-08-04T16:00:00.000+09:00",
      coverPath: "/orbit-covers/events/tokyo-ai-partner-meetup.jpg",
      id: "event_signup_02",
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

test("platformToView maps public events without platform-review claims", () => {
  const view = platformToView({
    events: eventsPayload,
    now: new Date("2026-07-24T00:00:00.000+09:00")
  });

  assert.equal(view.title, "公开活动来源核对");
  assert.equal(view.summary, "公开目录有2场活动记录。");
  assert.deepEqual(
    view.stats.map((stat) => [stat.label, stat.value]),
    [
      ["公开目录", "2"]
    ]
  );
  assert.equal(view.reviewQueue[0]?.title, "东京 AI 落地伙伴报名会");
  assert.equal(view.reviewQueue[0]?.stateLabel, "即将开始");
  assert.equal(view.reviewQueue[1]?.stateLabel, "已结束");
  assert.equal(view.reviewQueue.length, Number(view.stats[0]?.value));
  assert.equal(
    view.reviewQueue[0]?.coverPath,
    "/orbit-covers/events/tokyo-ai-partner-meetup.jpg"
  );
  assert.match(view.boundary, /不代表平台审核状态/);
  assert.doesNotMatch(
    flattenedText(view),
    /\b(mock|fixture|provider|source-backed|implementation|command-center|live-record|database|postgres)\b/iu
  );
});

test("platform public count covers every displayed record beyond an old queue preview", () => {
  const events = Array.from({ length: 9 }, (_, index) => ({
    id: `public-${index}`,
    startsAt: "2026-07-21T10:00:00.000+09:00",
    endsAt: "2026-07-21T12:00:00.000+09:00",
    title: `公开活动 ${index + 1}`,
  }));
  const view = platformToView({ events: { events }, now: new Date("2026-07-24T00:00:00.000+09:00") });
  assert.equal(view.reviewQueue.length, 9);
  assert.equal(view.stats[0]?.value, "9");
  assert.equal(view.summary, "公开目录有9场活动记录。");
});

test("platformToView falls back to a controlled empty platform state", () => {
  const view = platformToView({
    events: {
      events: []
    }
  });

  assert.equal(view.stats[0]?.value, "0");
  assert.equal(view.reviewQueue.length, 0);
  assert.equal(view.emptyReviewTitle, "暂无公开活动记录");
});

test("platformToView prefers Chinese event labels over mixed-language titles", () => {
  const view = platformToView({
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
    now: new Date("2026-07-24T00:00:00.000+09:00")
  });

  assert.equal(view.reviewQueue[0]?.title, "日中投资人与创业者报名沙龙");
  assert.doesNotMatch(view.reviewQueue[0]?.title ?? "", /[ぁ-ヿ]|Japan-China/u);
});

test("platformToView rejects storage implementation labels", () => {
  const view = platformToView({
    events: {
      events: [
        {
          endsAt: "2026-08-18T20:00:00.000+09:00",
          id: "storage-event",
          nextAction: "Prepare relationship context for the storage-backed event.",
          startsAt: "2026-08-18T18:00:00.000+09:00",
          title: "公开活动",
          venue: "Tokyo"
        }
      ]
    },
    now: new Date("2026-07-24T00:00:00.000+09:00")
  });

  assert.equal(view.reviewQueue[0]?.detail, "来源未提供简介。");
  assert.doesNotMatch(flattenedText(view), /storage-backed|已认证/iu);
});

test("platformToView does not expose the public API English next action", () => {
  const view = platformToView({
    events: {
      events: [
        {
          endsAt: "2026-09-01T16:00:00.000+09:00",
          id: "public-event",
          nextAction: "Sign in and register before viewing the attendee list.",
          startsAt: "2026-09-01T14:00:00.000+09:00",
          title: "东京 AI 落地伙伴对接会",
          venue: "东京"
        }
      ]
    },
    now: new Date("2026-07-24T00:00:00.000+09:00")
  });

  assert.equal(view.reviewQueue[0]?.detail, "来源未提供简介。");
  assert.doesNotMatch(flattenedText(view), /Sign in and register/iu);
});

test("platformToView preserves a public Japanese event description", () => {
  const view = platformToView({
    events: { events: [{ id: "ja-event", title: "交流会", description: "地域の主催者が集まります。" }] },
    language: "ja",
  });

  assert.equal(view.reviewQueue[0]?.detail, "地域の主催者が集まります。");
});
