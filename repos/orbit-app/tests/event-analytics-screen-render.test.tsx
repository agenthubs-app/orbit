import assert from "node:assert/strict";
import test from "node:test";
import React from "react";

import { EventAnalyticsContent } from "../src/screens/events/EventAnalyticsContent";
import { eventAnalyticsToView } from "../src/view-models/event-analytics";
import { renderedText } from "./helpers/render";

const view = eventAnalyticsToView({
  appointments: { awaitingResponse: 0, cancelled: 0, completed: 0, confirmed: 0, draft: 0, negotiating: 0, reschedulePending: 0 },
  checkIns: { checkedIn: 2 }, contactRequests: { accepted: 1, awaitingTargetConsent: 0, declined: 0, withdrawn: 0 }, encounters: { captured: 1, projected: 0 }, eventId: "event:a",
  grouping: { published: false, roundOne: { assignedParticipants: 0, tables: 0 }, roundTwo: { assignedParticipants: 0, tables: 0 } }, kind: "organizer_aggregate", registrations: { active: 4, cancelled: 0 }
});

test("event analytics render a privacy-labelled report and view switch", () => {
  assert.ok(view);
  const text = renderedText(<EventAnalyticsContent activeKind="organizer_aggregate" attendeeAvailable onChangeKind={() => undefined} organizerAvailable state={{ kind: "success" }} view={view} />);
  assert.match(text, /组织者汇总/u);
  assert.match(text, /我的报告/u);
  assert.match(text, /可解释比率/u);
  assert.match(text, /仅活动级汇总/u);
});
