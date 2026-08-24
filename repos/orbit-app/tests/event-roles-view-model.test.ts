import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEventRoleGrantBody,
  buildEventRoleRevokeBody,
  eventRoleMutationMatches,
  eventRoleMembersToView,
  validateEventRoleDraft
} from "../src/view-models/event-roles";

test("event roles map the owner and active delegated members", () => {
  const view = eventRoleMembersToView({
    event: { eventId: "event:roles", title: "东京伙伴会" },
    members: [
      {
        assignedAt: null,
        assignedByActorId: null,
        eventId: "event:roles",
        reason: "Derived from Event Core organizer.",
        revision: 0,
        role: "owner",
        state: "active",
        subjectActorId: "actor:owner"
      },
      {
        assignedAt: "2026-08-19T09:00:00.000Z",
        assignedByActorId: "actor:owner",
        eventId: "event:roles",
        reason: "负责现场签到",
        revision: 2,
        role: "check_in",
        state: "active",
        subjectActorId: "actor:staff"
      }
    ]
  });

  assert.equal(view.title, "东京伙伴会");
  assert.equal(view.members[0]?.roleLabel, "活动负责人");
  assert.equal(view.members[0]?.reason, "由活动主办方身份自动生成");
  assert.equal(view.members[1]?.roleLabel, "签到");
  assert.equal(view.members[1]?.reason, "负责现场签到");
});

test("event role commands preserve the freshly-read revision", () => {
  assert.deepEqual(
    buildEventRoleGrantBody(3, " 负责报名审核 ", "reviewer"),
    { expectedRevision: 3, reason: "负责报名审核", role: "reviewer" }
  );
  assert.deepEqual(buildEventRoleRevokeBody(4, " 班次结束 "), {
    expectedRevision: 4,
    reason: "班次结束"
  });
});

test("event role mutation results must match the requested actor and state", () => {
  const granted = {
    eventId: "event:roles",
    owner: false,
    revision: 3,
    role: "reviewer",
    state: "active",
    subjectActorId: "actor:staff"
  };
  assert.equal(
    eventRoleMutationMatches(granted, {
      role: "reviewer",
      state: "active",
      subjectActorId: "actor:staff"
    }),
    true
  );
  assert.equal(
    eventRoleMutationMatches({ ...granted, subjectActorId: "actor:other" }, {
      role: "reviewer",
      state: "active",
      subjectActorId: "actor:staff"
    }),
    false
  );
  assert.equal(
    eventRoleMutationMatches({ ok: true }, {
      state: "revoked",
      subjectActorId: "actor:staff"
    }),
    false
  );
});

test("event role drafts reject invalid actor ids and missing audit reasons", () => {
  assert.equal(validateEventRoleDraft("actor:staff", "负责签到"), null);
  assert.match(validateEventRoleDraft("staff name", "负责签到") ?? "", /账号 ID/u);
  assert.match(validateEventRoleDraft("actor:staff", "   ") ?? "", /原因/u);
});

test("event roles drop malformed or inactive members", () => {
  const view = eventRoleMembersToView({
    event: { eventId: "event:roles", title: "东京伙伴会" },
    members: [null, {}, { role: "operations", state: "revoked" }]
  });
  assert.deepEqual(view.members, []);
});
