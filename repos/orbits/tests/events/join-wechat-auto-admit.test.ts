// 2026-11-27 用户新增「已加群的报名自动通过」：审核制活动开了开关，报名时自报「已加群」= 服务端直接通过（与主办方承認同一条迁移），
// 「还没有」/ 未回答（旧客户端）/ 开关关 = 照旧审核中；改资料不问、不改审核状态。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { eventsJourneyCopy } from "../../app/(app)/app/orbit-2026/copy/eventsJourney";
import { hostCopy } from "../../app/(app)/app/orbit-2026/copy/host";
import { draftInput, draftOf } from "../../app/(app)/app/orbit-2026/host/setup-model";
import { EventAdmissionError } from "../../features/events/admission/contract";
import { createJoinService, type JoinPorts } from "../../features/events/journey/join";
import { autoAdmitApplication, WECHAT_AUTO_ADMIT_ACTOR } from "../../features/events/journey/join-live";
import { eventJoinProfileSchema, eventJoinResultSchema, eventJoinSubmitInputObject } from "../../shared/api-schema/event-join";
import { hostPeopleRowObject, hostSetupDraftInputObject, hostSetupResponseObject } from "../../shared/api-schema/host-console";

const answer = { answer: "VC", field: "targetAttendees", prompt: "q", questionToken: "t" };
const CONTACT = { lineId: null, note: "备注姓名", wechatId: "Nakahara923" };

function world(options: { review?: boolean; enabled?: boolean; admit?: "registered" | "pending_review" | "throw"; status?: "none" | "pending_review" | "registered" } = {}) {
  const calls: string[] = [];
  let syncs = 0;
  const reports: Array<{ answer: string; autoAdmitted: boolean }> = [];
  const titles: string[] = [];
  const ports: JoinPorts = {
    autoAdmit: async (actorId, eventId) => {
      calls.push(`autoAdmit:${actorId}:${eventId}`);
      if (options.admit === "throw") throw new Error("db down");
      return options.admit ?? "registered";
    },
    cancel: async () => undefined,
    createSchedule: async (_actorId, input) => { titles.push(input.title); return `sch-${titles.length}`; },
    event: async () => ({ endsAt: "2026-11-28T08:00:00.000Z", hostContact: CONTACT, registrationClosesAt: "2026-11-28T04:59:00.000Z", review: options.review ?? true, startsAt: "2026-11-28T05:00:00.000Z", title: "中日创业交流会 第六期" }),
    next: async () => null,
    now: () => Date.parse("2026-11-27T10:00:00.000Z"),
    persona: async () => null,
    profileIntro: async () => null,
    readTentative: async () => { syncs += 1; return null; },
    registrationStatus: async () => options.status ?? "none",
    removeSchedule: async () => undefined,
    renameSchedule: async () => true,
    saveIntro: async () => undefined,
    saveTentative: async () => undefined,
    saveWechatReport: async (_actorId, _eventId, report) => { reports.push(report); },
    scheduleExists: async () => true,
    // 审核制活动的申请接口只回「审核中」；状态之后只由服务端的自动通过决定。
    submit: async () => ({ status: (options.review ?? true) ? "pending_review" : "registered", submittedAt: "2026-11-27T10:00:00.000Z" }),
    updateSchedule: async () => true,
    wechatAutoAdmit: async () => options.enabled ?? true,
  };
  return { calls, reports, service: createJoinService({ ports }), get syncs() { return syncs; }, titles };
}

test("switch on + 已加群 → confirmed through the approval transition; calendar written with the final title", async () => {
  const w = world();
  const result = await w.service.submit("actor:a", "evt", [answer], "zh", undefined, false, "joined");
  assert.equal(result?.status, "registered");
  assert.equal(result?.reviewUntil, null);
  assert.deepEqual(w.calls, ["autoAdmit:actor:a:evt"]);
  assert.deepEqual(w.reports, [{ answer: "joined", autoAdmitted: true }]);
  assert.equal(result?.calendar?.final, true);
  assert.equal(w.titles[0]?.startsWith("暂定"), false, "the calendar entry is the final one, not 暂定");
  assert.ok(eventJoinResultSchema.safeParse(result).success);
});

test("switch on + 还没有 → in review; the answer is still recorded", async () => {
  const w = world();
  const result = await w.service.submit("actor:a", "evt", [answer], "zh", undefined, false, "not_yet");
  assert.equal(result?.status, "pending_review");
  assert.deepEqual(w.calls, []);
  assert.deepEqual(w.reports, [{ answer: "not_yet", autoAdmitted: false }]);
});

test("no answer (older App) or switch off → exactly as before: in review, nothing approved or recorded", async () => {
  for (const w of [world(), world({ enabled: false })]) {
    const unanswered = await w.service.submit("actor:a", "evt", [answer], "zh");
    assert.equal(unanswered?.status, "pending_review");
  }
  const off = world({ enabled: false });
  const result = await off.service.submit("actor:a", "evt", [answer], "zh", undefined, false, "joined");
  assert.equal(result?.status, "pending_review");
  assert.deepEqual(off.calls, []);
  assert.deepEqual(off.reports, []);
});

test("full (no room) → stays in review; an auto-approval failure never fails the registration", async () => {
  const full = world({ admit: "pending_review" });
  assert.equal((await full.service.submit("actor:a", "evt", [answer], "zh", undefined, false, "joined"))?.status, "pending_review");
  assert.deepEqual(full.reports, [{ answer: "joined", autoAdmitted: false }]);
  const broken = world({ admit: "throw" });
  assert.equal((await broken.service.submit("actor:a", "evt", [answer], "zh", undefined, false, "joined"))?.status, "pending_review");
});

test("editing: people still in review are asked and can be auto-approved (calendar goes final); confirmed people are not asked", async () => {
  const pending = world({ status: "pending_review" });
  const asked = await pending.service.profile("actor:a", "evt", [answer], false, "zh", true);
  assert.equal(asked?.wechatCheck, true);
  const edited = await pending.service.submit("actor:a", "evt", [answer], "zh", undefined, true, "joined");
  assert.equal(edited?.status, "registered");
  assert.deepEqual(pending.calls, ["autoAdmit:actor:a:evt"]);
  assert.ok(pending.syncs >= 1, "the calendar entry follows the approval");
  const notYet = world({ status: "pending_review" });
  assert.equal((await notYet.service.submit("actor:a", "evt", [answer], "zh", undefined, true, "not_yet"))?.status, "pending_review");
  const confirmed = world({ status: "registered" });
  assert.equal((await confirmed.service.profile("actor:a", "evt", [answer], false, "zh", true))?.wechatCheck, undefined);
  await confirmed.service.submit("actor:a", "evt", [answer], "zh", undefined, true, "joined");
  assert.deepEqual(confirmed.calls, [], "a forged answer on another state's edit never approves anything");
});

test("first-come events never ask; the confirm page asks (with the host contact) only when the switch is on", async () => {
  const on = await world().service.profile("actor:a", "evt", [answer], false, "zh");
  assert.equal(on?.wechatCheck, true);
  assert.deepEqual(on?.hostContact, CONTACT);
  assert.ok(eventJoinProfileSchema.safeParse(on).success);
  assert.equal((await world({ enabled: false }).service.profile("actor:a", "evt", [answer], false, "zh"))?.wechatCheck, undefined);
  const firstCome = world({ review: false });
  assert.equal((await firstCome.service.profile("actor:a", "evt", [answer], false, "zh"))?.wechatCheck, undefined);
  const registered = await firstCome.service.submit("actor:a", "evt", [answer], "zh", undefined, false, "joined");
  assert.equal(registered?.status, "registered");
  assert.deepEqual(firstCome.calls, [], "first-come registration never goes through the auto-approval");
});

test("the client cannot forge a state: only 'joined' / 'not_yet' are accepted, status fields are refused", () => {
  const base = { answers: [answer], idempotencyKey: "k" };
  assert.ok(eventJoinSubmitInputObject.safeParse(base).success, "older clients without the answer still submit");
  assert.ok(eventJoinSubmitInputObject.safeParse({ ...base, wechatJoined: "joined" }).success);
  assert.ok(eventJoinSubmitInputObject.safeParse({ ...base, wechatJoined: "not_yet" }).success);
  assert.equal(eventJoinSubmitInputObject.safeParse({ ...base, wechatJoined: "admitted" }).success, false);
  assert.equal(eventJoinSubmitInputObject.safeParse({ ...base, status: "registered" }).success, false, "strict: no status from the client");
});

type Application = { applicationVersion: number; status: string };
function repo(current: Application | null, decide: () => Application | Error) {
  const decisions: unknown[] = [];
  return {
    decisions,
    repository: {
      getApplication: async () => current as never,
      decideApplication: async (input: unknown) => { decisions.push(input); const next = decide(); if (next instanceof Error) throw next; return next as never; },
    },
  };
}

test("autoAdmitApplication uses the host's approve decision on the pending application only", async () => {
  const ok = repo({ applicationVersion: 3, status: "pending_review" }, () => ({ applicationVersion: 4, status: "admitted" }));
  assert.equal(await autoAdmitApplication(ok.repository, "actor:a", "evt"), "registered");
  assert.deepEqual(ok.decisions, [{ actorId: "actor:a", decision: "approve", decisionActorId: WECHAT_AUTO_ADMIT_ACTOR, eventId: "evt", expectedApplicationVersion: 3 }]);
  const waitlisted = repo({ applicationVersion: 1, status: "pending_review" }, () => ({ applicationVersion: 2, status: "waitlisted" }));
  assert.equal(await autoAdmitApplication(waitlisted.repository, "actor:a", "evt"), "pending_review", "full with a waitlist → the existing waitlist rule");
  const full = repo({ applicationVersion: 1, status: "pending_review" }, () => new EventAdmissionError("CAPACITY_FULL", "full"));
  assert.equal(await autoAdmitApplication(full.repository, "actor:a", "evt"), "pending_review", "full without a waitlist → no overbooking, stays in review");
  for (const status of ["rejected", "waitlisted", "withdrawn"]) {
    const untouched = repo({ applicationVersion: 2, status }, () => { throw new Error("must not decide"); });
    assert.equal(await autoAdmitApplication(untouched.repository, "actor:a", "evt"), "pending_review");
    assert.deepEqual(untouched.decisions, []);
  }
  assert.equal(await autoAdmitApplication(repo({ applicationVersion: 5, status: "admitted" }, () => new Error("no")).repository, "actor:a", "evt"), "registered");
});

test("host setup: the switch round-trips; older clients that omit it keep the saved value", () => {
  const response = { admissionMode: "review", applyPath: null, capacity: 40, description: "", event: {}, formPublished: true, hostNote: null, notices: [], questions: [], registrationClosesAt: null, revision: 3, savedAt: null, suggestion: null, unpublishedChanges: 0, wechatAutoAdmit: true } as never;
  const draft = draftOf(response);
  assert.equal(draft.wechatAutoAdmit, true);
  const input = draftInput(draft, 3);
  assert.equal(input.wechatAutoAdmit, true);
  assert.ok(hostSetupDraftInputObject.safeParse(input).success);
  const { wechatAutoAdmit: _omitted, ...older } = input;
  assert.ok(hostSetupDraftInputObject.safeParse(older).success, "older App setup saves without the field");
  assert.equal(hostSetupResponseObject.shape.wechatAutoAdmit.safeParse(undefined).success, true);
  const live = readFileSync("features/events/host/live.ts", "utf8");
  assert.match(live, /const wechatAutoAdmit = input\.wechatAutoAdmit \?\? /, "omitted = keep the draft's current value");
  // 用户 2026-11-27 定：点了就生效——报名端读草稿（自动保存），不算「未公开的修改」。
  assert.doesNotMatch(live, /published\.wechatAutoAdmit/, "not counted as an unpublished change");
  const joinLive = readFileSync("features/events/journey/join-live.ts", "utf8");
  assert.match(joinLive, /coalesce\(\(draft ->> 'wechatAutoAdmit'\)::boolean, \(published ->> 'wechatAutoAdmit'\)::boolean, false\)/);
  assert.doesNotMatch(joinLive, /wechat-auto-admit \*\/[^`]*published is not null/, "no need for a published form");
});

test("host list: the self-report marker row flag is optional and shown on desktop and phone", () => {
  const row = { actorId: "a", answer: null, applicationVersion: 2, attendCount: 0, initial: "A", name: "A", org: null, profileIncomplete: false, profileScore: 100, role: null, status: "approved" };
  assert.ok(hostPeopleRowObject.safeParse(row).success);
  assert.equal(hostPeopleRowObject.parse({ ...row, wechatAutoAdmitted: true }).wechatAutoAdmitted, true);
  for (const file of ["HostPeople.tsx", "HostPeoplePhone.tsx"]) {
    assert.match(readFileSync(`app/(app)/app/orbit-2026/host/${file}`, "utf8"), /row\.wechatAutoAdmitted \? <[^>]+data-host-wechat-auto="">\{t\("pplWechatAuto"\)\}/);
  }
  assert.equal(hostCopy.pplWechatAuto.zh, "自报已加群 · 自动通过");
  for (const file of ["HostSetup.tsx", "HostSetupPhone.tsx"]) {
    const source = readFileSync(`app/(app)/app/orbit-2026/host/${file}`, "utf8");
    assert.match(source, /draft\.admissionMode === "review" \? \(\s*<div className=\{[^}]+\} data-host-setup-wechat-auto="">/, `${file}: only for reviewed events`);
  }
});

test("register page: required single choice above the button; the button stays disabled and says why until answered", () => {
  const flow = readFileSync("app/(app)/app/orbit-2026/events/RegisterFlow.tsx", "utf8");
  assert.match(flow, /const wechatNeeded = Boolean\(profile\?\.wechatCheck\) && !wechat;/, "the server decides who is asked (new, or in review when editing)");
  const applyButtons = flow.match(/<button[^>]*onClick=\{\(\) => void apply\(\)\}[^>]*>/g) ?? [];
  assert.equal(applyButtons.length, 2);
  for (const button of applyButtons) assert.match(button, /disabled=\{busy \|\| draft === "running" \|\| wechatNeeded\}/);
  assert.equal(flow.match(/t\("wechatPickFirst"\)/g)?.length, 2, "hint above the button on desktop and phone");
  assert.match(flow, /wechat === "not_yet" \? <div className=\{styles\.sub\} data-join-wechat-note="">\{t\("wechatNotYetLine"\)\}/);
  assert.match(flow, /\.\.\.\(wechatJoined \? \{ wechatJoined \} : \{\}\)/);
  assert.match(flow, /profile\?\.wechatCheck \? wechat : null/, "only sent when the server asked");
  assert.equal(eventsJourneyCopy.wechatQ.zh, "是否已联系主办方报名并加入微信群？");
  assert.equal(eventsJourneyCopy.wechatQ.ja, "主催者に連絡して WeChat グループに参加済みですか？");
  assert.equal(eventsJourneyCopy.wechatQ.en, "Have you contacted the host and joined the WeChat group?");
  assert.deepEqual([eventsJourneyCopy.wechatJoined.zh, eventsJourneyCopy.wechatNotYet.zh], ["已加群", "还没有"]);
  assert.equal(eventsJourneyCopy.wechatNotYetLine.zh, "报名后请添加主办方微信并备注姓名，确认后通过审核");
});
