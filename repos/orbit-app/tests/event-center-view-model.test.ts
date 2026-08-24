import assert from "node:assert/strict";
import test from "node:test";

import { eventCenterToView } from "../src/view-models/event-center";

const NOW = new Date("2026-08-19T12:00:00+09:00");

test("event center maps an upcoming owner event to admission as the next task", () => {
  const view = eventCenterToView(
    [
      {
        endsAt: "2026-08-21T21:00:00+09:00",
        eventId: "event_owner",
        lifecycleState: "published",
        migrationPending: false,
        owner: true,
        revision: 3,
        role: "owner",
        startsAt: "2026-08-21T18:00:00+09:00",
        title: "关西跨境商务交流会",
        venue: "大阪创新中心"
      }
    ],
    NOW
  );

  assert.equal(view.length, 1);
  assert.equal(view[0]?.title, "关西跨境商务交流会");
  assert.equal(view[0]?.roleLabel, "活动负责人");
  assert.equal(view[0]?.lifecycleLabel, "已发布");
  assert.equal(view[0]?.phase, "upcoming");
  assert.equal(view[0]?.nextTask.label, "报名审核");
  assert.deepEqual(
    view[0]?.availableActionKeys,
    ["admission", "operations", "check_in", "analytics", "view", "roles"]
  );
});

test("event center selects the task allowed by the member role and event phase", () => {
  const view = eventCenterToView(
    [
      {
        endsAt: "2026-08-19T14:00:00+09:00",
        eventId: "event_checkin",
        lifecycleState: "published",
        migrationPending: false,
        owner: false,
        revision: 1,
        role: "check_in",
        startsAt: "2026-08-19T10:00:00+09:00",
        title: "创业者早餐会",
        venue: null
      },
      {
        endsAt: "2026-08-18T17:00:00+09:00",
        eventId: "event_analyst",
        lifecycleState: "archived",
        migrationPending: false,
        owner: false,
        revision: 8,
        role: "read_only_analyst",
        startsAt: "2026-08-18T14:00:00+09:00",
        title: "AI 企业增长论坛",
        venue: "京都"
      }
    ],
    NOW
  );

  assert.equal(view[0]?.phase, "live");
  assert.equal(view[0]?.nextTask.label, "签到台");
  assert.deepEqual(view[0]?.availableActionKeys, ["check_in", "view"]);
  assert.equal(view[0]?.venueLabel, "地点待配置");

  assert.equal(view[1]?.phase, "ended");
  assert.equal(view[1]?.nextTask.label, "查看活动分析");
  assert.deepEqual(view[1]?.availableActionKeys, ["analytics", "view"]);
  assert.match(view[1]?.restriction ?? "", /活动已归档/u);
});

test("event center keeps draft and migration restrictions visible", () => {
  const view = eventCenterToView(
    [
      {
        endsAt: null,
        eventId: "event_draft",
        lifecycleState: "draft",
        migrationPending: false,
        owner: true,
        revision: 1,
        role: "owner",
        startsAt: null,
        title: "待发布活动",
        venue: null
      },
      {
        endsAt: null,
        eventId: "event_legacy",
        lifecycleState: "legacy_active",
        migrationPending: true,
        owner: true,
        revision: 1,
        role: "owner",
        startsAt: null,
        title: "旧活动标题",
        venue: null
      }
    ],
    NOW
  );

  assert.equal(view[0]?.nextTask.label, "查看活动");
  assert.deepEqual(view[0]?.availableActionKeys, ["view", "roles"]);
  assert.match(view[0]?.restriction ?? "", /活动发布前/u);

  assert.equal(view[1]?.title, "活动资料待迁移");
  assert.equal(view[1]?.roleLabel, "迁移待确认");
  assert.deepEqual(view[1]?.availableActionKeys, []);
  assert.match(view[1]?.restriction ?? "", /运营、签到、分析与角色管理暂不可用/u);
});

test("event center drops malformed records instead of inventing access", () => {
  const view = eventCenterToView([
    null,
    {},
    { eventId: "event_missing_role", role: "owner" },
    {
      endsAt: null,
      eventId: "event_unknown_role",
      lifecycleState: "published",
      migrationPending: false,
      owner: false,
      revision: 1,
      role: "administrator",
      startsAt: null,
      title: "不可信权限",
      venue: null
    }
  ]);

  assert.deepEqual(view, []);
});
