import assert from "node:assert/strict";
import test from "node:test";
import { eventRegistrationToView } from "../src/view-models/event-registration";

function view(state: string, blockingReason?: string, language: "zh" | "ja" | "en" = "zh", registered = false) {
  return eventRegistrationToView({ eligibility: { state, reason: state, allowedActions: registered ? ["cancel"] : [],
    evaluatedAt: "2026-09-16T12:00:00Z", policyVersion: null, blockingReason },
    registration: registered ? { status: "rsvped" } : null }, language);
}

test("only an explicit server configuration reason explains incomplete organizer information", () => {
  const configured = view("unavailable", "configuration_required");
  assert.match(configured.statusDetail, /主办方.*报名信息/);
  assert.doesNotMatch(configured.statusDetail, /刷新|重新读取/);
  for (const reason of [undefined, "unknown_reason", "temporarily_unavailable"]) {
    assert.doesNotMatch(view("unavailable", reason).statusDetail, /主办方|配置/);
    assert.match(view("unavailable", reason).statusDetail, /重新读取/);
  }
});

test("configuration restriction never hides an independently allowed cancellation", () => {
  const registered = view("registered", "configuration_required", "zh", true);
  assert.equal(registered.canCancel, true);
  assert.equal(registered.canSubmit, false);
  assert.match(registered.statusLabel, /已报名/);
  assert.match(registered.statusDetail, /主办方.*报名信息/);
});
test("a cancelled membership remains explicit when registration is no longer open", () => {
  const result = eventRegistrationToView({ registration: { status: "cancelled" }, eligibility: { state: "registration_closed", reason: "registration_closed", allowedActions: [], evaluatedAt: "2026-09-16T12:00:00Z" } });
  assert.match(result.statusLabel, /已取消/);
  assert.match(result.statusDetail, /已截止/);
  assert.equal(result.canSubmit, false);
});

test("known business restrictions and migration are distinct from a failed read in three languages", () => {
  const rows = [
    ["not_open", undefined, /尚未开放/, /開始前/, /not opened/i],
    ["registration_closed", undefined, /已截止/, /締め切/, /closed/i],
    ["event_ended", undefined, /已结束/, /終了/, /ended/i],
    ["event_cancelled", undefined, /已取消/, /中止/, /cancelled/i],
    ["full", undefined, /名额已满/, /定員/, /full/i],
    ["unavailable", "migration_in_progress", /正在更新报名记录/, /申込記録.*更新/, /updating registration records/i],
    ["unavailable", "invalid_window", /报名时间设置有误/, /申込期間.*設定/, /registration dates/i],
  ] as const;
  for (const [state, reason, zh, ja, en] of rows) {
    for (const [language, expected] of [["zh", zh], ["ja", ja], ["en", en]] as const) {
      const result = view(state, reason, language);
      assert.match(`${result.statusLabel} ${result.statusDetail}`, expected);
      assert.doesNotMatch(result.confirmLabel, /暂不可操作/);
      assert.equal(result.canSubmit, false);
    }
  }
});
