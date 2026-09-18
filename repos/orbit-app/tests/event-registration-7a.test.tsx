import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { Registration7aViews, type Registration7aViewsProps } from "../src/screens/events/Registration7aViews";
import { createPortraitSession } from "../src/view-models/event-registration-portrait";
import { Registration7aRecommendationsView } from "../src/screens/events/Registration7aRecommendations";
import { renderToHtml } from "./helpers/render";
import type { SavedPortrait } from "../src/api/contract/event-registration-portrait";

const noop = () => {};
const base: Registration7aViewsProps = { session: createPortraitSession("scope"), eventTitle: "Robotics evening", eventMeta: "Tokyo", registration: { canCancel: false, canSubmit: true, confirmLabel: "确认报名", questionSetHash: null, questionSetVersion: null, questions: [{ id: "target", field: "targetAttendees", prompt: "Who do you want to meet?", options: ["Builders", "Operators"], answer: "", required: true }], statusDetail: "报名开放中", statusLabel: "尚未报名" }, answers: { targetAttendees: "Builders" }, question: null, answer: "", done: false, persona: null, pending: false, portraitPending: false, readConfirmed: true, questionsChanged: false, error: null, feedback: null, onBack: noop, onView: noop, onSetAnswer: noop, onAnswer: noop, onNext: noop, onGenerate: noop, onSave: noop, onSubmit: noop, onCancel: noop, onLoadNew: noop, onEdit: noop };

test("saved portrait entry counts its durable answers, not the two formal answers or an invalidated saved head", () => {
  const sourceAnswers: SavedPortrait["sourceAnswers"] = (["targetAttendees", "valueOffered", "positioning"] as const).map(field => ({ field, responseId: field, label: { en: field, zh: field }, answer: field, question: null, questionSource: "legacy_unknown", generation: null, source: "registration", sourceVersion: "c".repeat(64) }));
  const saved: SavedPortrait = { id: "portrait:self", actorId: "self", eventId: "event", version: 1, updatedAt: "2026-09-17T10:00:00.000Z", generatedAt: "2026-09-17T09:59:00.000Z", sourceEventVersion: "event:v1", sourceQuestionSetHash: null, sourceQuestionSetVersion: null, sourceRegistrationVersion: null, answersVersion: "a".repeat(64), sourceAnswers, persona: { energyStyle: "Listening", industryTags: ["Robotics"], offering: "Reviews", openers: [], seeking: "Builders", tagline: "Robotics builder", tags: [], provenance: { generationMethod: "orbit-agent-model-adaptive", fallbackReason: null, model: "synthetic", provider: "synthetic" } } };
  const history = sourceAnswers.slice(0, 2).map(entry => ({ id: entry.responseId, field: entry.field, answer: entry.answer, prompt: null, options: [], proof: { kind: "stored_response" as const, source: "portrait" as const, responseId: entry.responseId, sourceVersion: "1", answer: entry.answer } }));
  const answers = { targetAttendees: "Builders", valueOffered: "Reviews" };
  for (const seeded of [[], history]) {
    const html = renderToHtml(<Registration7aViews {...base} answers={answers} session={createPortraitSession("scope", seeded, saved)} />);
    assert.match(html, /活动画像已完成/);
    assert.match(html, /已补充 3\/8 项/);
    assert.doesNotMatch(html, /已补充 2\/8 项/);
  }
  const invalidated = renderToHtml(<Registration7aViews {...base} answers={answers} session={{ ...createPortraitSession("scope", history, saved), saveState: "idle" }} />);
  assert.match(invalidated, /已补充 2\/8 项/);
  assert.doesNotMatch(invalidated, /活动画像已完成|已补充 3\/8 项/);
});

test("registration renders original question/options with no input for ordinary selection and a portrait entry, not inline interview", () => {
  const html = renderToHtml(<Registration7aViews {...base} />);
  assert.match(html, /Robotics evening/);
  assert.match(html, /Who do you want to meet\?/);
  assert.match(html, /Builders/);
  assert.match(html, /1 题必答/);
  assert.match(html, /补充画像/);
  assert.doesNotMatch(html, /<textarea|下一题|生成画像/);
  const other = renderToHtml(<Registration7aViews {...base} answers={{ targetAttendees: "Custom answer" }} />);
  assert.match(other, /Custom answer/);
  assert.match(other, /<textarea|<input/);
});

test("interview renders real field progress, current question and compact history without a registration submit button", () => {
  const session = createPortraitSession("scope", [{ id: "response", field: "targetAttendees", prompt: "Original saved question?", options: [], answer: "Builders", proof: { kind: "stored_response", source: "registration", responseId: "response", sourceVersion: "version", answer: "Builders" } }]);
  const html = renderToHtml(<Registration7aViews {...base} session={{ ...session, view: "interview" }} question={{ field: "valueOffered", prompt: "What can you offer?", options: ["Reviews", "Introductions"], acknowledgment: "Thanks." }} />);
  assert.match(html, /已补充 1\/8 项/);
  assert.match(html, /What can you offer\?/);
  assert.match(html, /全部/);
  assert.match(html, /下一题/);
  assert.doesNotMatch(html, /确认报名|Original saved question\?/);
  const review = renderToHtml(<Registration7aViews {...base} session={{ ...session, view: "review" }} />);
  assert.match(review, /Original saved question\?/);
});

test("portrait result displays only real persona fields, independent save/privacy and explicit empty recommendations", () => {
  const recommendations = <Registration7aRecommendationsView eventId="event" onContact={noop} state={{ kind: "success", data: { state: "empty", event: { id: "event" }, recommendations: [], nextAction: "" }, status: 200, meta: { featureMode: null, privacy: null, runtimeBoundary: null }, refreshing: false, refresh: noop }} />;
  const html = renderToHtml(<Registration7aViews {...base} recommendations={recommendations} session={{ ...base.session, view: "result" }} persona={{ energyStyle: "Listening", industryTags: ["Robotics"], nextAction: "", offering: "Reviews", openers: [], safetyText: "", seeking: "Builders", tagline: "Robotics builder", tags: ["Hardware"], title: "" }} />);
  assert.match(html, /Robotics builder/);
  assert.match(html, /Reviews/);
  assert.match(html, /保存画像不影响报名状态/);
  assert.match(html, /本人及有权限主办方可见/);
  assert.match(html, /暂时没有可展示的推荐/);
  assert.doesNotMatch(html, /确认报名|陈默|周宁|已完成/);
});

test("portrait result keeps one generated summary per field and leaves raw answers in full review", () => {
  const session = createPortraitSession("scope", [{ id: "industry", field: "industry", prompt: "Original industry question", options: [], answer: "Raw industry answer", proof: { kind: "stored_response", source: "registration", responseId: "industry", sourceVersion: "version", answer: "Raw industry answer" } }]);
  const persona = { energyStyle: "Listening", industryTags: ["Robotics"], nextAction: "", offering: "Reviews", openers: [], safetyText: "", seeking: "Builders", tagline: "Robotics builder", tags: [], title: "" };
  const result = renderToHtml(<Registration7aViews {...base} session={{ ...session, view: "result" }} persona={persona} />);
  assert.match(result, /Robotics/);
  assert.doesNotMatch(result, /Raw industry answer/);
  assert.match(renderToHtml(<Registration7aViews {...base} session={{ ...session, view: "review" }} persona={persona} />), /Raw industry answer/);
});
