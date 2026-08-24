import assert from "node:assert/strict";
import test from "node:test";
import React from "react";

import {
  EventCenterContent,
  type EventCenterContentState
} from "../src/screens/events/EventCenterContent";
import { eventCenterToView } from "../src/view-models/event-center";
import { renderedText } from "./helpers/render";

const event = eventCenterToView(
  [
    {
      endsAt: "2026-08-21T21:00:00+09:00",
      eventId: "event_owner",
      lifecycleState: "published",
      migrationPending: false,
      owner: true,
      revision: 3,
      role: "owner",
      startsAt: "2026-08-21T18:00:00+09:00",
      title: "关西跨境商务交流会",
      venue: "大阪创新中心"
    }
  ],
  new Date("2026-08-19T12:00:00+09:00")
)[0];

test("event center content renders an operational event row", () => {
  assert.ok(event);
  const text = renderedText(
    <EventCenterContent
      events={[event]}
      onOpenEvent={() => undefined}
      state={{ kind: "success" }}
    />
  );

  assert.match(text, /关西跨境商务交流会/u);
  assert.match(text, /活动负责人/u);
  assert.match(text, /大阪创新中心/u);
  assert.match(text, /下一步/u);
  assert.match(text, /报名审核/u);
  assert.match(text, /查看活动/u);
});

test("event center exposes the native primary action for the current phase", () => {
  const liveEvent = eventCenterToView(
    [{
      endsAt: "2026-08-19T14:00:00+09:00",
      eventId: "event_live",
      lifecycleState: "published",
      migrationPending: false,
      owner: false,
      revision: 1,
      role: "check_in",
      startsAt: "2026-08-19T10:00:00+09:00",
      title: "现场商务对接会",
      venue: "东京"
    }],
    new Date("2026-08-19T12:00:00+09:00")
  )[0];

  assert.ok(liveEvent);
  const text = renderedText(
    <EventCenterContent
      events={[liveEvent]}
      onOpenCheckIn={() => undefined}
      onOpenEvent={() => undefined}
      state={{ kind: "success" }}
    />
  );

  assert.match(text, /签到台/u);
  assert.doesNotMatch(text, /报名审核/u);
});

for (const [state, expected] of [
  [{ kind: "loading" }, "正在读取你可运营的活动"],
  [{ kind: "empty" }, "还没有可运营的活动"],
  [{ kind: "offline", message: "无法连接服务器" }, "无法连接服务器"],
  [{ kind: "failure", message: "读取失败" }, "读取失败"]
] as const) {
  test(`event center content renders ${state.kind} state`, () => {
    const text = renderedText(
      <EventCenterContent
        events={[]}
        onOpenEvent={() => undefined}
        state={state as EventCenterContentState}
      />
    );

    assert.match(text, new RegExp(expected, "u"));
  });
}
