import assert from "node:assert/strict";
import test from "node:test";
import React from "react";

import { EventOperationsContent, type EventOperationsContentState } from "../src/screens/events/EventOperationsContent";
import { eventOperationsToView } from "../src/view-models/event-operations";
import { renderedText } from "./helpers/render";

test("event operations render the mobile operations hierarchy", () => {
  const view = eventOperationsToView({
    configuration: {
      checkInOpensAt: "2026-08-19T08:00:00Z", eventEndsAt: "2026-08-19T13:00:00Z", eventId: "event:ops", eventStartsAt: "2026-08-19T09:00:00Z", maxAttemptsPerTask: 3, organizerActorId: "actor:owner", profileEditDeadlineAt: "2026-08-18T09:00:00Z", recommendationCount: 3, registrationCutoffAt: "2026-08-18T10:00:00Z", resultsAvailableAt: "2026-08-19T08:30:00Z", roundOneStartsAt: "2026-08-19T10:00:00Z", roundTwoStartsAt: "2026-08-19T11:00:00Z", shardSize: 20, tableSize: 6, updatedAt: "2026-08-18T12:00:00Z"
    },
    eventId: "event:ops",
    generations: [],
    metrics: { acceptedContactRequests: 1, checkedIn: 3, contactRequests: 2, participantCount: 8, publishedGenerationId: null },
    publishedResult: null
  });
  const text = renderedText(<EventOperationsContent busy={null} onGenerationAction={() => undefined} onOpenAnalytics={() => undefined} onOpenCheckIn={() => undefined} onOpenRoles={() => undefined} onStartGeneration={() => undefined} state={{ kind: "success" }} view={view} />);
  assert.match(text, /运营概览/u);
  assert.match(text, /AI 匹配与发布/u);
  assert.match(text, /时间门禁/u);
  assert.match(text, /签到台/u);
  assert.match(text, /活动分析/u);
});

for (const [state, expected] of [
  [{ kind: "loading" }, "正在读取运营状态"],
  [{ kind: "unconfigured" }, "尚未配置运营规则"],
  [{ kind: "offline", message: "无法连接服务器" }, "无法连接服务器"],
  [{ kind: "failure", message: "当前账号没有权限" }, "当前账号没有权限"]
] as const) {
  test(`event operations render ${state.kind} state`, () => {
    const text = renderedText(<EventOperationsContent busy={null} onGenerationAction={() => undefined} onOpenAnalytics={() => undefined} onOpenCheckIn={() => undefined} onOpenRoles={() => undefined} onStartGeneration={() => undefined} state={state as EventOperationsContentState} view={eventOperationsToView(null)} />);
    assert.match(text, new RegExp(expected, "u"));
  });
}
