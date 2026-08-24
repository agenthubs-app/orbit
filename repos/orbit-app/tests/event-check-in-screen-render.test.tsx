import assert from "node:assert/strict";
import test from "node:test";
import React from "react";

import {
  EventCheckInContent,
  type EventCheckInContentState
} from "../src/screens/events/EventCheckInContent";
import { eventCheckInRosterToView } from "../src/view-models/event-check-in";
import { renderedText } from "./helpers/render";

const roster = eventCheckInRosterToView({
  eventId: "event:onsite",
  participants: [
    {
      checkedIn: false,
      checkedInAt: null,
      displayName: "佐藤 葵",
      participantId: "participant:sato-aoi"
    },
    {
      checkedIn: true,
      checkedInAt: "2026-08-19T09:15:00.000Z",
      displayName: "李 明",
      participantId: "participant:li-ming"
    }
  ]
});

const callbacks = {
  onCheckIn: () => undefined,
  onQueryChange: () => undefined,
  onSegmentChange: () => undefined
};

test("check-in renders counts, filters and one-tap arrival controls", () => {
  const text = renderedText(
    <EventCheckInContent
      {...callbacks}
      pendingParticipantId={null}
      query=""
      roster={roster}
      segment="all"
      state={{ kind: "success" }}
    />
  );

  assert.match(text, /已签到 1 \/ 2/u);
  assert.match(text, /全部 2/u);
  assert.match(text, /未签到 1/u);
  assert.match(text, /已签到 1/u);
  assert.match(text, /佐藤 葵/u);
  assert.match(text, /标记已到场/u);
  assert.match(text, /李 明/u);
});

for (const [state, expected] of [
  [{ kind: "loading" }, "正在读取签到名单"],
  [{ kind: "empty" }, "签到名单还是空的"],
  [{ kind: "offline", message: "无法连接服务器" }, "无法连接服务器"],
  [{ kind: "failure", message: "读取失败" }, "读取失败"]
] as const) {
  test(`check-in renders ${state.kind} state`, () => {
    const text = renderedText(
      <EventCheckInContent
        {...callbacks}
        pendingParticipantId={null}
        query=""
        roster={eventCheckInRosterToView(null)}
        segment="all"
        state={state as EventCheckInContentState}
      />
    );
    assert.match(text, new RegExp(expected, "u"));
  });
}
