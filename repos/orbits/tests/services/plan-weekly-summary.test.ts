/**
 * W0012 SC-02：周一小结的纯函数（东京时区、周一开始）与服务读取。
 * 边界：周日 23:59 JST / 周一 00:00 JST 以 UTC 输入给出；上周窗口 [上周一 00:00, 本周一 00:00) JST。
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { PlanLogEntry } from "../../features/plans/contract";
import { createAllowListPlanReferenceValidator } from "../../features/plans/reference-validator";
import { createMemoryPlanRepository } from "../../features/plans/repository";
import { createPlanService } from "../../features/plans/service";
import {
  isTokyoMonday,
  previousTokyoWeek,
  summarizePlanWeek,
  tokyoWeekday,
  weeklySummaryText,
} from "../../features/plans/weekly-summary";
import { planInput } from "../support/plan-fixture";

// 2026-09-27 是周日，2026-09-28 是周一（东京）。
const SUNDAY_2359_JST = new Date("2026-09-27T14:59:59.999Z");
const MONDAY_0000_JST = new Date("2026-09-27T15:00:00.000Z");
const MONDAY_2359_JST = new Date("2026-09-28T14:59:59.999Z");
const TUESDAY_0000_JST = new Date("2026-09-28T15:00:00.000Z");

test("Tokyo Monday flips exactly at 00:00 JST, whatever the UTC date says", () => {
  assert.equal(tokyoWeekday(SUNDAY_2359_JST), 0);
  assert.equal(isTokyoMonday(SUNDAY_2359_JST), false);
  // UTC 仍是 9/27（周日），东京已是周一。
  assert.equal(MONDAY_0000_JST.getUTCDay(), 0);
  assert.equal(isTokyoMonday(MONDAY_0000_JST), true);
  assert.equal(isTokyoMonday(MONDAY_2359_JST), true);
  assert.equal(isTokyoMonday(TUESDAY_0000_JST), false);
});

test("last week is the previous Monday 00:00 to this Monday 00:00 in Tokyo", () => {
  const expected = {
    end: "2026-09-27",
    fromIso: "2026-09-20T15:00:00.000Z",
    start: "2026-09-21",
    toIso: "2026-09-27T15:00:00.000Z",
  };
  assert.deepEqual(previousTokyoWeek(MONDAY_0000_JST), expected);
  assert.deepEqual(previousTokyoWeek(MONDAY_2359_JST), expected);
  // 周日 23:59 JST 还在 9/21 那一周，「上周」是 9/14–9/20。
  assert.deepEqual(previousTokyoWeek(SUNDAY_2359_JST), {
    end: "2026-09-20",
    fromIso: "2026-09-13T15:00:00.000Z",
    start: "2026-09-14",
    toIso: "2026-09-20T15:00:00.000Z",
  });
});

let seq = 0;
function log(overrides: Partial<PlanLogEntry>): PlanLogEntry {
  seq += 1;
  return {
    author: "user",
    body: "x",
    createdAt: "2026-09-23T03:00:00.000Z",
    event: "item_status_changed",
    fromStatus: null,
    id: `log:${String(seq).padStart(4, "0")}`,
    idempotencyKey: `k:${seq}`,
    itemId: null,
    kind: "auto",
    linkedContactIds: [],
    linkedEventId: null,
    payload: {},
    planId: "plan:1",
    targetItemId: null,
    toStatus: null,
    ...overrides,
  };
}

test("the summary counts last week's structured log by rules, with the week edges in JST", () => {
  const window = previousTokyoWeek(MONDAY_0000_JST);
  const entries = [
    // 上周一 00:00 JST 整点（含）：完成行动 A。
    log({ createdAt: "2026-09-20T15:00:00.000Z", itemId: "a", toStatus: "done" }),
    // 上周一之前 1 ms：不算。
    log({ createdAt: "2026-09-20T14:59:59.999Z", itemId: "old", toStatus: "done" }),
    // 行动 B 打勾又撤销：不算完成。
    log({ createdAt: "2026-09-22T01:00:00.000Z", itemId: "b", toStatus: "done" }),
    log({ createdAt: "2026-09-22T02:00:00.000Z", itemId: "b", toStatus: "not_started" }),
    // 活动 E1 报名；E2 报名后取消；E3 参加。
    log({ createdAt: "2026-09-23T01:00:00.000Z", itemId: "e1", toStatus: "registered" }),
    log({ createdAt: "2026-09-23T01:00:00.000Z", itemId: "e2", toStatus: "registered" }),
    log({ createdAt: "2026-09-24T01:00:00.000Z", itemId: "e2", toStatus: "recommended" }),
    log({ createdAt: "2026-09-25T01:00:00.000Z", itemId: "e3", toStatus: "attended" }),
    // 联系人：关联两位（同一位两次只算一位），建立联系一位。
    log({ createdAt: "2026-09-25T02:00:00.000Z", event: "contact_linked", linkedContactIds: ["c1"] }),
    log({ createdAt: "2026-09-25T03:00:00.000Z", event: "contact_linked", linkedContactIds: ["c1"] }),
    log({ createdAt: "2026-09-25T04:00:00.000Z", event: "contact_linked", linkedContactIds: ["c2"] }),
    log({ createdAt: "2026-09-26T04:00:00.000Z", event: "contact_established", linkedContactIds: ["c1"] }),
    log({ createdAt: "2026-09-26T05:00:00.000Z", event: "phase_entered", payload: { phaseTitle: "集中接触" } }),
    log({ createdAt: "2026-09-26T06:00:00.000Z", event: "note", kind: "manual" }),
    // 周日 23:59:59.999 JST（含）；本周一 00:00 JST（不含）。
    log({ createdAt: "2026-09-27T14:59:59.999Z", event: "note", kind: "manual" }),
    log({ createdAt: "2026-09-27T15:00:00.000Z", event: "note", kind: "manual" }),
  ];
  const summary = summarizePlanWeek(entries, window);
  assert.deepEqual(summary.counts, {
    actionsCompleted: 1,
    contactsEstablished: 1,
    contactsLinked: 2,
    eventsAttended: 1,
    eventsRegistered: 1,
    notes: 2,
    phasesEntered: ["集中接触"],
  });
  assert.equal(
    weeklySummaryText(summary, "zh"),
    "上周（9/21–9/27）你完成 1 件行动、新建立联系 1 位、关联 2 位联系人到人脉需求、报名 1 场活动、参加 1 场活动、进入新阶段「集中接触」、记了 2 笔进展。",
  );
  assert.match(weeklySummaryText(summary, "en"), /^Last week \(9\/21–9\/27\) you completed 1 action\(s\), /);
});

test("a quiet week says so instead of inventing progress", () => {
  const summary = summarizePlanWeek([], previousTokyoWeek(MONDAY_0000_JST));
  assert.equal(weeklySummaryText(summary, "zh"), "上周（9/21–9/27）计划上没有记录到进展。");
  assert.equal(weeklySummaryText(summary, "en"), "No plan progress was recorded last week (9/21–9/27).");
});

test("the service returns last week's summary only on a Tokyo Monday, only for the actor's own log", async () => {
  const repository = createMemoryPlanRepository();
  let clock = "2026-09-22T01:00:00.000Z"; // 周二 10:00 JST
  const serviceFor = (actorId: string) =>
    createPlanService({
      now: () => clock,
      references: createAllowListPlanReferenceValidator({ actorId, allowList: { contactsByActor: "any", eventIds: "any" } }),
      repository,
      scope: { actorId, workspaceId: "w" },
    });
  const alice = serviceFor("actor:alice");
  const bob = serviceFor("actor:bob");
  const plan = await alice.createVersion(planInput({ startsOn: "2026-09-21" }));
  await bob.createVersion(planInput({ startsOn: "2026-09-21" }));
  const action = plan.items.find((item) => item.kind === "action")!;
  await alice.updateItem({ change: { op: "set_status", status: "done" }, itemId: action.id });
  clock = "2026-09-26T01:00:00.000Z";
  await alice.addManualLog({ body: "约好了下周二通电话" });

  clock = SUNDAY_2359_JST.toISOString();
  assert.equal(await alice.weeklySummary(), null);

  clock = MONDAY_0000_JST.toISOString();
  const summary = await alice.weeklySummary();
  assert.equal(summary?.window.start, "2026-09-21");
  assert.equal(summary?.counts.actionsCompleted, 1);
  assert.equal(summary?.counts.notes, 1);
  // bob 的小结看不到 alice 的记录。
  assert.deepEqual((await bob.weeklySummary())?.counts, {
    actionsCompleted: 0,
    contactsEstablished: 0,
    contactsLinked: 0,
    eventsAttended: 0,
    eventsRegistered: 0,
    notes: 0,
    phasesEntered: [],
  });
  // 没有计划：null。
  assert.equal(await serviceFor("actor:nobody").weeklySummary(), null);
});
