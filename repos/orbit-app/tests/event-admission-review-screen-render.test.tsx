import assert from "node:assert/strict";
import test from "node:test";
import React from "react";

import {
  EventAdmissionReviewContent,
  type EventAdmissionReviewContentState
} from "../src/screens/events/EventAdmissionReviewContent";
import {
  eventAdmissionApplicationToView,
  eventAdmissionReviewListToView
} from "../src/view-models/event-admission-review";
import { renderedText } from "./helpers/render";

const list = eventAdmissionReviewListToView({
  items: [{
    actorId: "actor:aiko",
    applicationVersion: 1,
    decidedAt: null,
    decisionActorId: null,
    displayName: "森爱子",
    status: "pending_review",
    submittedAt: "2026-08-05T09:05:00.000Z",
    updatedAt: "2026-08-05T09:05:00.000Z"
  }],
  nextCursor: null,
  total: 1,
  view: "pending"
});

const detail = eventAdmissionApplicationToView({
  actorId: "actor:aiko",
  applicationVersion: 1,
  decidedAt: null,
  decisionActorId: null,
  eventId: "event:tokyo",
  policyVersion: 2,
  profilePayload: {
    answers: {
      desiredOutcome: "找到采购伙伴",
      energyStyle: "先倾听再深入讨论",
      experienceHighlight: "完成三个商业化项目",
      followUpPreference: "48 小时内邮件纪要",
      industry: "工业 AI",
      positioning: "跨境产品负责人",
      targetAttendees: "制造业采购负责人",
      valueOffered: "市场进入经验与产业引荐"
    },
    displayName: "森爱子",
    interviewResponses: []
  },
  status: "pending_review",
  submittedAt: "2026-08-05T09:05:00.000Z",
  updatedAt: "2026-08-05T09:05:00.000Z"
});

const callbacks = {
  onChangeView: () => undefined,
  onDecision: () => undefined,
  onLoadMore: () => undefined,
  onSelectApplicant: () => undefined
};

test("admission review renders a compact mobile queue", () => {
  const text = renderedText(
    <EventAdmissionReviewContent
      {...callbacks}
      busy={false}
      detail={null}
      detailLoading={false}
      list={list}
      state={{ kind: "success" }}
    />
  );

  assert.match(text, /待审核/u);
  assert.match(text, /已处理/u);
  assert.match(text, /森爱子/u);
  assert.match(text, /共 1 份/u);
  assert.match(text, /查看申请/u);
});

test("admission review renders full profile and explicit decisions", () => {
  assert.ok(detail);
  const text = renderedText(
    <EventAdmissionReviewContent
      {...callbacks}
      busy={false}
      detail={detail}
      detailLoading={false}
      list={list}
      state={{ kind: "success" }}
    />
  );

  assert.match(text, /完整报名画像/u);
  assert.match(text, /身份定位/u);
  assert.match(text, /跨境产品负责人/u);
  assert.match(text, /我能提供/u);
  assert.match(text, /市场进入经验与产业引荐/u);
  assert.match(text, /批准报名/u);
  assert.match(text, /拒绝报名/u);
});

for (const [state, expected] of [
  [{ kind: "loading" }, "正在读取报名队列"],
  [{ kind: "empty" }, "当前没有待审核报名"],
  [{ kind: "offline", message: "无法连接服务器" }, "无法连接服务器"],
  [{ kind: "failure", message: "读取失败" }, "读取失败"]
] as const) {
  test(`admission review renders ${state.kind} state`, () => {
    const text = renderedText(
      <EventAdmissionReviewContent
        {...callbacks}
        busy={false}
        detail={null}
        detailLoading={false}
        list={eventAdmissionReviewListToView(null)}
        state={state as EventAdmissionReviewContentState}
      />
    );
    assert.match(text, new RegExp(expected, "u"));
  });
}
