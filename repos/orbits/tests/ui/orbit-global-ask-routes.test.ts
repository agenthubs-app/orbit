/**
 * 全局 iOrbit 提问入口的路由门禁。
 *
 * 这个白名单是整个特性最容易悄悄出错的地方：漏一条排除规则，AI 球就会出现在
 * 活动签到大屏上；多一条，用户在某个页面就再也问不了问题。两种都不会报错，
 * 只会被用户发现，所以在这里钉死。
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  allowsOrbitAsk,
  isOrbitAskHome,
  ORBIT_ASK_HOME,
  orbitAskPageContext,
} from "../../app/(app)/app/orbit-global-ask/orbit-ask-routes";

test("iOrbit 工作台自身仍被识别为提问落点 home", () => {
  assert.equal(isOrbitAskHome(ORBIT_ASK_HOME), true);
  assert.equal(isOrbitAskHome("/app/agent/"), true);
  assert.equal(isOrbitAskHome("/app/agent?lang=en"), true);
  assert.equal(isOrbitAskHome("/app/events"), false);
  // 子路由不是工作台首页，不应被识别为跨页提问的 home 落点。
  assert.equal(isOrbitAskHome("/app/agent/settings"), false);
});

test("登录后的产品页都挂提问入口", () => {
  for (const path of [
    "/app/agent",
    "/app/home",
    "/app/events",
    "/app/events/event_signup_01",
    "/app/contacts",
    "/app/agent/actions",
    "/app/agent/plan",
    "/app/inbox",
    "/app/contacts/dashboard",
    "/app/settings",
  ]) {
    assert.equal(allowsOrbitAsk(path), true, `expected ask entry on ${path}`);
  }
});

test("登录页、公开页、kiosk 和后台不挂", () => {
  for (const path of [
    "/app/account/login",
    "/app/account",
    "/app/login-admin",
    "/app/admin",
    "/app/admin/platform",
    "/app/o/some-organizer",
    "/app/events/event_01/operations/check-in",
    "/app/events/event_01/operations/admission",
    "/",
    "/events",
  ]) {
    assert.equal(allowsOrbitAsk(path), false, `expected no ask entry on ${path}`);
  }
});

test("前缀匹配只在路径边界处生效", () => {
  // `/app/o` 排除组织者公开页，但不该顺手把 `/app/orbits` 这类路由也排掉。
  assert.equal(allowsOrbitAsk("/app/orbits"), true);
  assert.equal(allowsOrbitAsk("/app/o"), false);
  assert.equal(allowsOrbitAsk("/app/o/x"), false);
  // 活动现场屏（取代 /app/party*）照常挂；只有运营 kiosk 子路由被排除。
  assert.equal(allowsOrbitAsk("/app/events/event_01/live"), true);
  assert.equal(allowsOrbitAsk("/app/events/event_01/live?tab=graph"), true);
  assert.equal(allowsOrbitAsk("/app/events/event_01/operations/check-in"), false);
});

test("页面上下文标签按路由推导，且跟随语言", () => {
  assert.equal(orbitAskPageContext("/app/events/event_01", "zh"), "这场活动");
  assert.equal(orbitAskPageContext("/app/events/event_01", "en"), "this event");
  assert.equal(orbitAskPageContext("/app/events", "zh"), "活动列表");
  assert.equal(orbitAskPageContext("/app/contacts", "zh"), "我的人脉");
  assert.equal(orbitAskPageContext("/app/contacts/c_01", "zh"), "这位人脉");
  // iOrbit 任务 6a：`/app/today` / `/app/schedule` / `/app/followups` 已删除，
  // 上下文标签改挂取代它们的两条 iOrbit 兄弟屏。
  assert.equal(orbitAskPageContext("/app/agent/plan", "zh"), "我的日程");
  assert.equal(orbitAskPageContext("/app/agent/actions", "zh"), "我的待办");
  // 没有值得带走的上下文时返回 null，界面上就不显示那枚 chip。
  assert.equal(orbitAskPageContext("/app/agent", "zh"), null);
  assert.equal(orbitAskPageContext("/app/settings", "zh"), null);
});
