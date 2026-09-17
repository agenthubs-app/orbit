import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { Registration7aRecommendationsView } from "../src/screens/events/Registration7aRecommendations";
import { renderToHtml } from "./helpers/render";

const meta = { featureMode: null, privacy: null, runtimeBoundary: null };
const data = { state: "success", event: { id: "event" }, nextAction: "Meet partners", recommendations: [{ recommendationId: "recommendation", eventId: "event", attendee: { attendeeId: "attendee", displayName: "Synthetic authorized partner", role: "Engineer", organization: "Lab", contactId: "contact:one" }, rank: 1, score: 95, reasons: ["Shared project"], openingLine: { lineId: "line", eventId: "event", attendeeId: "attendee", style: "warm_context", text: "How is the project?", notificationDelivered: false, emailProviderRequested: false }, recommendedAction: "Meet" }] };
const base = { eventId: "event", onContact: () => {} };

test("portrait recommendations display validated actor-scoped results rather than claiming empty", () => {
  const html = renderToHtml(<Registration7aRecommendationsView {...base} state={{ kind: "success", data, status: 200, meta, refresh: () => {}, refreshing: false }} />);
  assert.match(html, /Synthetic authorized partner/);
  assert.match(html, /Shared project/);
  assert.match(html, /查看联系人/);
  assert.doesNotMatch(html, /暂时没有可展示的推荐/);
});

test("portrait recommendations distinguish real empty, pending and failed or foreign-event data", () => {
  const render = (state: any) => renderToHtml(<Registration7aRecommendationsView {...base} state={{ meta, status: 200, refresh: () => {}, refreshing: false, ...state }} />);
  assert.match(render({ kind: "success", data: { ...data, state: "empty", recommendations: [] } }), /暂时没有可展示的推荐/);
  assert.doesNotMatch(render({ kind: "success", data: { ...data, state: "pending", recommendations: [] } }), /暂时没有可展示的推荐/);
  for (const status of [403, 503]) {
    const html = render({ kind: "failure", status, error: { code: "FORBIDDEN", message: "Unavailable" } });
    assert.match(html, /推荐暂时无法读取/);
    assert.match(html, /重试/);
    assert.doesNotMatch(html, /暂时没有可展示的推荐|Synthetic authorized partner/);
  }
  assert.match(render({ kind: "success", data: { ...data, event: { id: "other" } } }), /推荐暂时无法读取/);
  assert.match(render({ kind: "success", data: { ...data, recommendations: [{ ...data.recommendations[0], score: 101 }] } }), /推荐暂时无法读取/);
});
