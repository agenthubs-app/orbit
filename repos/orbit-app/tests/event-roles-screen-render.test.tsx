import assert from "node:assert/strict";
import test from "node:test";
import React from "react";

import { EventRolesContent, type EventRolesContentState } from "../src/screens/events/EventRolesContent";
import { eventRoleMembersToView } from "../src/view-models/event-roles";
import { renderedText } from "./helpers/render";

const roles = eventRoleMembersToView({
  event: { eventId: "event:roles", title: "东京伙伴会" },
  members: [
    { assignedAt: null, assignedByActorId: null, eventId: "event:roles", reason: null, revision: 0, role: "owner", state: "active", subjectActorId: "actor:owner" },
    { assignedAt: "2026-08-19T09:00:00.000Z", assignedByActorId: "actor:owner", eventId: "event:roles", reason: "负责现场签到", revision: 2, role: "check_in", state: "active", subjectActorId: "actor:staff" }
  ]
});

test("event roles render current members and owner-safe controls", () => {
  const text = renderedText(
    <EventRolesContent
      onEdit={() => undefined}
      onOpenGrant={() => undefined}
      roles={roles}
      state={{ kind: "success" }}
    />
  );
  assert.match(text, /东京伙伴会/u);
  assert.match(text, /活动负责人/u);
  assert.match(text, /actor:staff/u);
  assert.match(text, /负责现场签到/u);
  assert.match(text, /管理/u);
  assert.match(text, /授予角色/u);
});

for (const [state, expected] of [
  [{ kind: "loading" }, "正在读取当前角色"],
  [{ kind: "empty" }, "尚无活动角色"],
  [{ kind: "offline", message: "无法连接服务器" }, "无法连接服务器"],
  [{ kind: "failure", message: "没有负责人权限" }, "没有负责人权限"]
] as const) {
  test(`event roles render ${state.kind} state`, () => {
    const text = renderedText(
      <EventRolesContent
        onEdit={() => undefined}
        onOpenGrant={() => undefined}
        roles={eventRoleMembersToView(null)}
        state={state as EventRolesContentState}
      />
    );
    assert.match(text, new RegExp(expected, "u"));
  });
}
