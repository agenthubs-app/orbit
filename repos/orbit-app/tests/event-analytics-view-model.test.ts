import assert from "node:assert/strict";
import test from "node:test";

import { eventAnalyticsToView } from "../src/view-models/event-analytics";

const appointments = { awaitingResponse: 1, cancelled: 0, completed: 2, confirmed: 1, draft: 1, negotiating: 0, reschedulePending: 0 };
const contacts = { accepted: 3, awaitingTargetConsent: 1, declined: 0, withdrawn: 0 };

test("organizer event analytics map aggregate-only evidence and explained rates", () => {
  const view = eventAnalyticsToView({
    appointments,
    checkIns: { checkedIn: 8 },
    contactRequests: contacts,
    encounters: { captured: 5, projected: 2 },
    eventId: "event:analytics",
    grouping: { published: true, roundOne: { assignedParticipants: 8, tables: 2 }, roundTwo: { assignedParticipants: 8, tables: 2 } },
    kind: "organizer_aggregate",
    registrations: { active: 10, cancelled: 1 }
  });
  assert.equal(view?.kind, "organizer_aggregate");
  assert.equal(view?.privacyLabel, "仅活动级汇总，不含参会者身份与单条互动内容");
  assert.deepEqual(view?.rates.map((rate) => rate.value), ["80%", "75%", "40%"]);
  assert.equal(view?.groupingLabel, "已发布 · 两轮各 2 桌 / 8 席");
});

test("organizer rates avoid fake precision when there is no sample", () => {
  const view = eventAnalyticsToView({
    appointments: Object.fromEntries(Object.keys(appointments).map((key) => [key, 0])),
    checkIns: { checkedIn: 0 }, contactRequests: { accepted: 0, awaitingTargetConsent: 0, declined: 0, withdrawn: 0 },
    encounters: { captured: 0, projected: 0 }, eventId: "event:empty",
    grouping: { published: false, roundOne: { assignedParticipants: 0, tables: 0 }, roundTwo: { assignedParticipants: 0, tables: 0 } },
    kind: "organizer_aggregate", registrations: { active: 0, cancelled: 0 }
  });
  assert.equal(view?.rates[0]?.value, "暂无样本");
});

test("attendee analytics remain self-scoped", () => {
  const view = eventAnalyticsToView({
    aiArtifact: { artifact: null, eventId: "event:analytics", failureCode: null, status: "unconfigured", updatedAt: null },
    appointments, checkIn: { checkedInAt: null, status: "not_checked_in" }, contactRequests: contacts,
    encounters: { captured: 2, projected: 1 }, eventId: "event:analytics",
    grouping: { roundOneTableNumber: null, roundTwoTableNumber: null, status: "not_published" },
    kind: "attendee_report", registration: { status: "active" }
  });
  assert.equal(view?.kind, "attendee_report");
  assert.equal(view?.statusRows[0]?.detail, "未签到");
  assert.match(view?.aiDetail ?? "", /尚未启用/u);
});

test("event analytics reject malformed reports", () => {
  assert.equal(eventAnalyticsToView({ kind: "organizer_aggregate" }), null);
});
