import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEventCheckInBody,
  eventCheckInRosterToView,
  filterEventCheckInParticipants
} from "../src/view-models/event-check-in";

const payload = {
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
};

test("check-in roster preserves only the limited server projection", () => {
  const view = eventCheckInRosterToView(payload);

  assert.equal(view.eventId, "event:onsite");
  assert.equal(view.totalCount, 2);
  assert.equal(view.contractValid, true);
  assert.equal(view.checkedCount, 1);
  assert.equal(view.participants[0]?.statusLabel, "未签到");
  assert.equal(view.participants[1]?.statusLabel, "已签到");
  assert.match(view.participants[1]?.checkedInLabel ?? "", /8月19日/u);
});

test("check-in roster filters by status, name and participant id suffix", () => {
  const participants = eventCheckInRosterToView(payload).participants;

  assert.deepEqual(
    filterEventCheckInParticipants(participants, "pending", "佐藤").map(
      (item) => item.displayName
    ),
    ["佐藤 葵"]
  );
  assert.deepEqual(
    filterEventCheckInParticipants(participants, "done", "ming").map(
      (item) => item.displayName
    ),
    ["李 明"]
  );
  assert.deepEqual(filterEventCheckInParticipants(participants, "done", "佐藤"), []);
});

test("manual check-in sends only the participant id", () => {
  assert.deepEqual(buildEventCheckInBody(" participant:sato-aoi "), {
    participantId: "participant:sato-aoi"
  });
});

test("check-in roster drops malformed and privacy-expanded records", () => {
  const view = eventCheckInRosterToView({
    eventId: "event:onsite",
    participants: [
      null,
      { displayName: "缺少状态" },
      { ...payload.participants[0], email: "should-not-pass@example.com" }
    ]
  });

  assert.deepEqual(view.participants, []);
  assert.equal(view.contractValid, false);
});
