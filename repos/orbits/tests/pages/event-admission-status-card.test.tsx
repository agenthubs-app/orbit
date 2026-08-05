import assert from "node:assert/strict";
import test from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import { EventAdmissionStatusCard } from "../../app/(app)/app/events/[id]/register/event-admission-status-card";
import type { EventAdmissionApplication } from "../../features/events/admission/contract";

function application(
  status: "pending_review" | "rejected" | "waitlisted" | "withdrawn",
): EventAdmissionApplication & { status: typeof status } {
  return {
    actorId: "actor:attendee",
    applicationVersion: 2,
    decidedAt: status === "rejected" ? "2026-08-05T10:30:00.000Z" : null,
    decisionActorId: status === "rejected" ? "actor:reviewer" : null,
    eventId: "event:admission-ui",
    policyVersion: 3,
    profilePayload: {
      answers: {
        desiredOutcome: "Leave with two qualified pilot conversations.",
        energyStyle: "Thoughtful small-group discussion.",
        positioning: "Circular packaging founder serving retail operators.",
        targetAttendees: "Procurement leaders and climate investors.",
        valueOffered: "Validated reuse economics from three live pilots.",
      },
      displayName: "Aiko Mori",
    },
    status,
    submittedAt: "2026-08-05T10:00:00.000Z",
    updatedAt: "2026-08-05T10:30:00.000Z",
  };
}

test("admission status card shows every submitted core and adaptive answer without visibility controls", () => {
  const html = renderToStaticMarkup(
    <EventAdmissionStatusCard
      application={application("pending_review")}
      eventHref="/app/events/event%3Aadmission-ui"
      language="en"
      onWithdraw={() => undefined}
      pendingWithdraw={false}
    />,
  );

  for (const field of [
    "positioning",
    "targetAttendees",
    "valueOffered",
    "desiredOutcome",
    "energyStyle",
  ]) {
    assert.match(html, new RegExp(`data-admission-profile-answer="${field}"`, "u"));
  }
  assert.match(html, /All submitted answers \(5\)/u);
  assert.match(html, /data-admission-withdraw/u);
  assert.doesNotMatch(html, /visibility|private|matching_only/u);
});

test("final admission states are explicit and cannot be withdrawn again", () => {
  for (const status of ["rejected", "withdrawn"] as const) {
    const html = renderToStaticMarkup(
      <EventAdmissionStatusCard
        application={application(status)}
        eventHref="/app/events/event%3Aadmission-ui"
        language="zh"
        onWithdraw={() => undefined}
        pendingWithdraw={false}
      />,
    );
    assert.match(html, new RegExp(`data-admission-application-status="${status}"`, "u"));
    assert.doesNotMatch(html, /data-admission-withdraw/u);
    assert.match(html, /最终状态/u);
  }
});
