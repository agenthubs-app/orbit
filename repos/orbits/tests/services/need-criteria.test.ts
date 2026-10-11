/**
 * R25：关键词版需求匹配（`features/contact-needs`，仅供 App 的人脉匹配屏）随该屏与接口删除；
 * 目标关键词表搬到通知发现（`features/notifications/discovery/need-criteria.ts`），这里保留原
 * `tests/services/contact-needs.test.ts` 里只测关键词表的两条断言（打分、排序、服务的断言随模块删除）。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { criteriaForNeed } from "../../features/notifications/discovery/need-criteria";

test("ordering aliases preserve the original goal and count one business concept", () => {
  for (const goal of [
    "我现在在做餐厅AI点单系统，想认识一些合作方。",
    "餐廳點單與點餐系統合作", "餐厅点单与点餐系统合作",
    "レストランの注文システムで協力相手を探す", "Restaurant ordering and order-taking collaboration",
  ]) {
    assert.equal(criteriaForNeed(goal).filter(item => item.id === "scenario:ordering").length, 1, goal);
  }
});

test("explicit counterpart capability is separate from the user's own project", () => {
  const criteria = criteriaForNeed("我做餐厅点餐软件，寻找投资人合作");
  assert.equal(criteria.some(item => item.id === "capability:investment"), true);
  assert.equal(criteria.some(item => item.id === "capability:delivery"), false);
  const contextOnly = criteriaForNeed("我在做采购软件，寻找餐饮门店合作伙伴");
  assert.equal(contextOnly.some(item => item.id === "capability:procurement"), false);
});

test("exclusion goals yield no criteria instead of reversing intent", () => {
  for (const goal of ["不要制造业联系人", "製造業を除く相手を探す", "Find technology contacts excluding investors"]) {
    assert.deepEqual(criteriaForNeed(goal), [], goal);
  }
});
