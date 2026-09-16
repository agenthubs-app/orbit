import assert from "node:assert/strict";
import test from "node:test";
const modulePath = "../src/view-models/canonical-event-detail";
let model: Record<string, any> | null;
test.before(async () => { model = await import(modulePath).catch(() => null); });
function call(name: string, ...args: unknown[]) { assert.ok(model, "canonical fact/status adapter is not implemented"); return model[name](...args); }
const eligibility = { state: "unavailable", allowedActions: [], evaluatedAt: "2026-09-16T11:29:12.959Z" };
const data = { eligibility, questionSet: { questions: [] }, registration: null };
test("unavailable registration does not grant registration or private reads, but future qualification uses server time", () => {
  const view = call("canonicalRegistrationToView", data, "2026-10-27T11:00:00Z");
  assert.equal(view.activeRegistration, false);
  assert.equal(view.canNavigate, false);
  assert.equal(view.eventEnded, false);
  assert.match(view.status, /报名暂不可用/);
});
test("server time dominates device time for event end qualification", () => {
  const original = Date.now; Date.now = () => Date.parse("2099-01-01T00:00:00Z");
  try { assert.equal(call("canonicalRegistrationToView", data, "2026-10-27T11:00:00Z").eventEnded, false); } finally { Date.now = original; }
});
test("registered with no allowed actions can read own results but cannot enter mutation flow", () => {
  const view = call("canonicalRegistrationToView", { ...data, eligibility: { ...eligibility, state: "registered" }, registration: { status: "rsvped", participantProfile: { answers: { desiredOutcome: "寻找投资合作" } } } }, "2026-10-27T11:00:00Z");
  assert.equal(view.activeRegistration, true); assert.equal(view.canNavigate, false); assert.equal(view.goal, "寻找投资合作");
});
test("cancel-only registration remains discoverable and preserves the server restriction", () => {
  const view = call("canonicalRegistrationToView", { ...data, eligibility: { ...eligibility, state: "registered", allowedActions: ["cancel"], blockingReason: "configuration_required" }, registration: { status: "rsvped", participantProfile: { answers: {} } } }, "2026-10-27T11:00:00Z", "en");
  assert.equal(view.canNavigate, true);
  assert.equal(view.footer.canCancel, true);
  assert.match(view.detail, /organizer/i);
});
for (const [state, status] of [["locked", "尚未开放"], ["not_generated", "尚未生成"], ["processing", "生成中"], ["failed", "生成失败"]] as const) test(`recommendation ${state} is distinct and has no invented people`, () => {
  const view = call("canonicalRecommendationsToView", { resultsState: state, directory: [], recommendations: null });
  assert.match(view.status, new RegExp(status)); assert.deepEqual(view.people, []);
});
test("ready recommendation maps only referenced attendee and persisted reasons/icebreakers, no fake openingLine", () => {
  const view = call("canonicalRecommendationsToView", { resultsState: "ready", directory: [{ participantId: "p2", displayName: "投资人" }, { participantId: "p3", displayName: "不相关的人" }], recommendations: { noMatchReason: null, recommendations: [{ targetParticipantId: "p2", score: 82, reasons: ["机器人"], icebreakers: ["投资方向", "产业经验"], memberHint: "交流经验" }] } });
  assert.equal(view.people.length, 1); assert.equal(view.people[0].name, "投资人"); assert.deepEqual(view.people[0].reasons, ["机器人"]); assert.equal("openingLine" in view.people[0], false);
});
for (const [state, status] of [["queued", "会后总结排队中"], ["running", "会后总结生成中"], ["failed", "会后总结生成失败"], ["unconfigured", "会后总结服务尚未配置"]] as const) test(`artifact ${state} never masquerades as completed review`, () => {
  const view = call("canonicalArtifactToView", { status: state, artifact: null, failureCode: null });
  assert.match(view.status, new RegExp(status)); assert.equal(view.summary, null); assert.equal("reviewId" in view, false);
});
test("EVENT_NOT_ENDED is a temporal waiting state, not generation failure", () => {
  assert.match(call("canonicalArtifactToView", { status: "failed", artifact: null, failureCode: "EVENT_NOT_ENDED" }).status, /活动结束后可用/);
});
for (const [code, message] of [["SOURCE_HASH_CHANGED", "会后记录已更新"], ["UNRECOGNIZED_INTERNAL_CODE", "暂时无法读取可用的会后总结"]] as const) test(`artifact diagnostic ${code} stays internal and has readable failure explanation`, () => {
  const view = call("canonicalArtifactToView", { status: "failed", artifact: null, failureCode: code });
  assert.match(view.failureDetail, new RegExp(message));
  assert.doesNotMatch(view.failureDetail, /SOURCE_HASH_CHANGED|UNRECOGNIZED_INTERNAL_CODE/);
});
