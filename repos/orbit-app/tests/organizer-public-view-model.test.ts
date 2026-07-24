import assert from "node:assert/strict";
import test from "node:test";

import {
  organizerPublicToView,
  type OrganizerPublicEventState
} from "../src/view-models/organizer-public";

function flattenedText(value: unknown): string {
  return JSON.stringify(value);
}

const eventsPayload = {
  events: [
    {
      endsAt: "2026-08-04T16:00:00.000+09:00",
      id: "event_signup_03",
      location: "Tokyo",
      sourceMetadata: {
        captureMethod: "live-record",
        label: "日中商务协会 / Japan China Business Association"
      },
      startsAt: "2026-08-04T14:00:00.000+09:00",
      status: "scheduled",
      title: "东京 AI 落地伙伴报名会",
      venue: "Tokyo"
    },
    {
      endsAt: "2026-07-21T12:00:00.000+09:00",
      id: "kansai-cross-border",
      location: "Osaka",
      sourceMetadata: {
        captureMethod: "live-record",
        label: "日中商务协会 / Japan China Business Association"
      },
      startsAt: "2026-07-21T10:00:00.000+09:00",
      status: "scheduled",
      title: "关西跨境商务交流会",
      venue: "Osaka"
    },
    {
      endsAt: "2026-08-18T20:00:00.000+09:00",
      id: "investor-salon",
      sourceMetadata: {
        captureMethod: "manual",
        label: "Orbit"
      },
      startsAt: "2026-08-18T18:00:00.000+09:00",
      status: "scheduled",
      title: "日中投资人与创业者报名沙龙",
      venue: "Tokyo"
    }
  ]
};

test("organizerPublicToView builds a Chinese organizer page from event records", () => {
  const view = organizerPublicToView({
    events: eventsPayload,
    now: new Date("2026-07-24T00:00:00.000+09:00"),
    slug: "event_signup_03"
  });

  assert.equal(view.name, "日中商务协会");
  assert.equal(view.initial, "日");
  assert.equal(view.handle, "已记录 2 场活动");
  assert.deepEqual(view.stats, {
    active: "0",
    ended: "1",
    events: "2",
    upcoming: "1"
  });
  assert.deepEqual(
    view.events.map((event) => [event.id, event.state]),
    [
      ["event_signup_03", "upcoming"],
      ["kansai-cross-border", "ended"]
    ] satisfies [string, OrganizerPublicEventState][]
  );
  assert.equal(view.primaryEvent?.id, "event_signup_03");
  assert.equal(view.actions[0]?.href, "/events/event_signup_03");
  assert.doesNotMatch(
    flattenedText(view),
    /\b(mock|fixture|provider|source-backed|implementation|command-center|live-record)\b/iu
  );
});

test("organizerPublicToView falls back to a useful empty page", () => {
  const view = organizerPublicToView({
    events: {
      events: []
    },
    slug: "missing"
  });

  assert.equal(view.name, "主办方");
  assert.equal(view.events.length, 0);
  assert.equal(view.emptyTitle, "暂时没有公开活动");
});

test("organizerPublicToView prefers Chinese event labels over mixed-language titles", () => {
  const view = organizerPublicToView({
    events: {
      events: [
        {
          endsAt: "2026-08-18T20:00:00.000+09:00",
          id: "event_signup_03",
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
    slug: "event_signup_03"
  });

  assert.equal(view.events[0]?.title, "日中投资人与创业者报名沙龙");
  assert.doesNotMatch(view.events[0]?.title ?? "", /[ぁ-ヿ]|Japan-China/u);
});
