// 议程（2026-11-15，docs/designs/redesign-2026-10/event-detail-agenda-proposal.html ③ ④ ⑤）：
// 输入校验（服务端）· 存 / 读的规范形 · 超出活动时间的提示 · 「前往公开」被挡 /「暂存」不挡 · 新建表单 · 申込設定的议程卡。
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { AgendaEditor, agendaMissing, firstAgendaMissing, moveRow } from "../../app/(app)/app/orbit-2026/host/AgendaEditor";
import { HostEventFormView, changedFields, draftFromEvent, draftHasInput, draftToInput, readTempDraft, writeTempDraft } from "../../app/(app)/app/orbit-2026/host/HostEventForm";
import { HostSetupView } from "../../app/(app)/app/orbit-2026/host/HostSetup";
import { hostTranslator } from "../../app/(app)/app/orbit-2026/host/host-model";
import { draftOf } from "../../app/(app)/app/orbit-2026/host/setup-model";
import { hostAgendaInput, hostEventInputObject, hostEventUpdateInputObject, hostEventViewObject } from "../../shared/api-schema/host-events";
import { agendaRowChecks, normalizeHostAgenda } from "../../shared/compute/host-agenda";
import { payloadFacts } from "../../features/events/assessment/orbit-event-facts";
import { journeyEventFromCanonical } from "../../features/events/journey/live-mapping";
import { createHostMockService } from "../../features/events/host/mock";
import { HOST_EVENT_IDS, hostSetup } from "../../shared/mock/demo-world/host-events";

const zh = hostTranslator("zh");
const blank = draftFromEvent(null, [{ profileId: "prof-1" } as never]);
const filled = { ...blank, date: "2026-11-28", start: "14:00", end: "17:30", title: "第六期 中日创业交流会", venueName: "新桥" };
const row = (at: string, title: string, detail = "") => ({ at, detail, title });

test("server: each row needs HH:MM and a 1–60 char title; detail ≤120; at most 40 rows; unknown keys refused", () => {
  assert.ok(hostAgendaInput.safeParse([{ at: "14:00", title: "签到 · 名片交换" }, { at: "23:59", title: "x", detail: "a".repeat(120) }]).success);
  for (const bad of [[{ at: "24:00", title: "x" }], [{ at: "9:00", title: "x" }], [{ at: "14:00", title: "  " }], [{ at: "14:00", title: "あ".repeat(61) }], [{ at: "14:00", title: "x", detail: "a".repeat(121) }], [{ at: "14:00", title: "x", extra: 1 }]]) {
    assert.equal(hostAgendaInput.safeParse(bad).success, false, JSON.stringify(bad).slice(0, 60));
  }
  assert.equal(hostAgendaInput.safeParse(Array.from({ length: 41 }, () => ({ at: "14:00", title: "x" }))).success, false);
  const base = { endsAt: "2026-11-28T08:30:00.000Z", feeKind: "free", organizerProfileId: "prof-1", startsAt: "2026-11-28T05:00:00.000Z", title: "交流会" };
  assert.ok(hostEventInputObject.safeParse({ ...base, agenda: [] }).success, "a draft may have no agenda yet");
  assert.ok(hostEventInputObject.safeParse(base).success, "older clients send no agenda");
  assert.ok(hostEventUpdateInputObject.safeParse({ expectedVersion: 3, agenda: [{ at: "14:00", title: "开场" }] }).success);
  assert.equal(hostEventUpdateInputObject.safeParse({ expectedVersion: 3, agenda: [{ at: "", title: "开场" }] }).success, false);
});

test("view schema reads agenda tolerantly (bad rows skipped, missing = undefined)", () => {
  const view = hostSetup(HOST_EVENT_IDS.cfo18)!.event;
  const parsed = hostEventViewObject.parse({ ...view, agenda: [{ at: "14:00", title: "开场" }, { nope: true }] });
  assert.deepEqual(parsed.agenda, [{ at: "14:00", title: "开场" }]);
  const { agenda: _drop, ...older } = view;
  assert.equal(hostEventViewObject.parse(older).agenda, undefined);
});

test("storage form: trimmed, cut to length, incomplete rows dropped, host order kept; not an array = null", () => {
  assert.deepEqual(normalizeHostAgenda([{ at: "15:00", title: " 圆桌 ", detail: "  " }, { at: "14:00", title: "签到", detail: "名片" }, { at: "", title: "x" }, { at: "16:00", title: "" }, "junk"]), [
    { at: "15:00", title: "圆桌" }, { at: "14:00", detail: "名片", title: "签到" },
  ]);
  assert.equal(normalizeHostAgenda(undefined), null);
  assert.equal(normalizeHostAgenda([{ at: "14:00", title: "あ".repeat(80) }])![0]!.title.length, 60);
});

test("detail survives payloadFacts → the journey event (detail page, venue, prep read it)", () => {
  const facts = payloadFacts({ agenda: [{ at: "14:30", title: "开场致辞", detail: "日中创新创业协会 会长" }, { at: "15:00", title: "嘉宾分享" }] });
  assert.deepEqual(facts.agenda, [{ at: "14:30", detail: "日中创新创业协会 会长", title: "开场致辞" }, { at: "15:00", title: "嘉宾分享" }]);
  const event = journeyEventFromCanonical({ description: null, endsAt: "2026-11-28T08:30:00.000Z", eventId: "e1", organizerActorId: "a1", publicCode: "X", sourcePayload: { agenda: [{ at: "14:30", title: "开场致辞", detail: "会长" }] }, startsAt: "2026-11-28T05:00:00.000Z", title: "t", venue: null }, { policy: null, registrationCount: 0 });
  assert.deepEqual(event.agenda, [{ at: "14:30", detail: "会长", title: "开场致辞" }]);
});

test("out-of-range hint: before the start / after the end (overnight events count past midnight); missing never blocks the hint", () => {
  const checks = agendaRowChecks([row("13:30", "早到"), row("14:00", "签到"), row("17:30", "结束"), row("18:00", "二次会"), row("", "自由交流"), row("16:00", "")], "14:00", "17:30");
  assert.deepEqual(checks.map((check) => check.range), ["beforeStart", null, null, "afterEnd", null, null]);
  assert.deepEqual(checks.map((check) => check.problem), [null, null, null, null, "time", "title"]);
  assert.deepEqual(agendaRowChecks([row("00:30", "二次会"), row("02:00", "解散")], "23:00", "01:00").map((check) => check.range), [null, "afterEnd"]);
});

test("publish is blocked with no complete row or a row missing time / title; 暂存 (server draft) is not blocked by an empty agenda", () => {
  assert.equal(draftToInput(filled, { forPublish: true }).problem, "evInvalidAgenda", "the new form's one empty row");
  assert.equal(draftToInput(filled).problem, null, "a draft saves without an agenda");
  assert.equal(draftToInput(filled).input?.agenda, undefined);
  const missingTime = { ...filled, agenda: [row("14:00", "签到"), row("", "自由交流")] };
  assert.equal(draftToInput(missingTime, { forPublish: true }).problem, "evInvalidAgenda");
  assert.equal(draftToInput(missingTime).problem, "evInvalidAgenda", "the server cannot store a row without a time");
  assert.deepEqual(firstAgendaMissing(missingTime.agenda), [1, "time"]);
  assert.deepEqual(agendaMissing([row("", ""), row("", "")]), ["time", null], "nothing filled: the first row asks for a time");
  const ok = { ...filled, agenda: [row("15:30", "圆桌"), row("14:00", "签到", "名片交换"), row("", "")] };
  const result = draftToInput(ok, { forPublish: true });
  assert.equal(result.problem, null);
  assert.deepEqual(result.input?.agenda, [{ at: "15:30", title: "圆桌" }, { at: "14:00", detail: "名片交换", title: "签到" }], "host order kept, blank row dropped");
});

test("暂存 on this device keeps an unfinished agenda as is", () => {
  const map = new Map<string, string>();
  const storage = { getItem: (key: string) => map.get(key) ?? null, removeItem: (key: string) => { map.delete(key); }, setItem: (key: string, value: string) => { map.set(key, value); } };
  const now = new Date("2026-11-15T10:00:00.000Z");
  const partial = { ...blank, agenda: [row("14:00", ""), row("", "自由交流")] };
  assert.equal(draftHasInput(partial), true, "typing only an agenda row still counts as input");
  assert.ok(writeTempDraft(storage, "user_a", partial, now));
  assert.deepEqual(readTempDraft(storage, "user_a", now)?.draft.agenda, partial.agenda);
});

test("edit: the agenda is sent only when it changed, and never counts as a time / venue change", () => {
  const event = hostSetup(HOST_EVENT_IDS.cfo18)!.event;
  const draft = draftFromEvent(event, []);
  assert.equal(draft.agenda.length, 8);
  const same = draftToInput({ ...draft, organizerProfileId: event.organizerProfileId ?? "p" }).input!;
  assert.equal(changedFields(event, same).agenda, undefined);
  const edited = draftToInput({ ...draft, organizerProfileId: event.organizerProfileId ?? "p", agenda: moveRow(draft.agenda, 0, 1) }).input!;
  const fields = changedFields(event, edited);
  assert.equal(fields.agenda?.[0]?.title, "オープニング");
  assert.equal(fields.startsAt, undefined); assert.equal(fields.venueName, undefined);
});

test("mock service: agenda saved on create and replaced on update of a published event without a notice", async () => {
  const service = createHostMockService();
  const created = await service.createEvent("actor", { endsAt: "2026-11-28T08:30:00.000Z", feeKind: "free", organizerProfileId: "x", startsAt: "2026-11-28T05:00:00.000Z", title: "交流会", agenda: [{ at: "14:00", title: " 签到 " }] });
  assert.deepEqual(created.event.agenda, [{ at: "14:00", title: "签到" }]);
  const live = await service.event("actor", HOST_EVENT_IDS.roundtable);
  await service.saveHostNote("actor", HOST_EVENT_IDS.roundtable, { hostNote: "受付で名刺をご用意ください" });
  const updated = await service.updateEvent("actor", HOST_EVENT_IDS.roundtable, { agenda: [{ at: "18:30", title: "开场" }], expectedVersion: live!.version });
  assert.deepEqual(updated.event.agenda, [{ at: "18:30", title: "开场" }]);
  assert.equal(updated.notified, 0); assert.equal(updated.changePreview ?? null, null);
  const setup = await service.setup("actor", HOST_EVENT_IDS.roundtable);
  assert.deepEqual(setup?.event.agenda, updated.event.agenda);
  assert.equal(setup?.event.version, updated.event.version);
  assert.equal(setup?.hostNote, "受付で名刺をご用意ください");
});

test("create form: 议程 * card after 介绍 with one empty row, count and drag hint, preview shows 3 rows + 还有 N 项", () => {
  const html = renderToStaticMarkup(<HostEventFormView mode="create" draft={blank} profiles={[]} language="zh" />);
  assert.match(html, /<h3>议程 \*<\/h3>/); assert.match(html, /1\/40行 · 拖动排序/);
  assert.equal((html.match(/data-agenda-row=/g) ?? []).length, 1);
  assert.ok(html.indexOf("data-host-agenda") > html.indexOf("介绍") && html.indexOf("data-host-agenda") < html.indexOf("data-host-evcontact"), "between 介绍 and the contact card");
  assert.doesNotMatch(html, /data-agenda-missing/, "no red text before 前往公开");
  const rows = [row("14:00", "签到 · 名片交换"), row("14:30", "开场致辞", "日中创新创业协会 会长"), row("14:45", "嘉宾分享"), row("15:30", "圆桌"), row("16:30", "自由交流"), row("18:00", "结束")];
  const full = renderToStaticMarkup(<HostEventFormView mode="create" draft={{ ...filled, agenda: rows }} profiles={[]} language="zh" agendaShowMissing />);
  assert.match(full, /value="日中创新创业协会 会长"/);
  assert.equal((full.match(/data-agenda-add-detail/g) ?? []).length, 5, "rows without a detail offer ＋ 添加说明");
  assert.match(full, /data-agenda-range="afterEnd"[^>]*>时间超出活动结束（17:30）/);
  assert.match(full, /data-host-agenda-preview="6"/); assert.match(full, /还有3项/);
  const blocked = renderToStaticMarkup(<HostEventFormView mode="create" draft={{ ...filled, agenda: [row("14:00", "签到"), row("", "自由交流")] }} profiles={[]} language="zh" agendaShowMissing />);
  assert.match(blocked, /data-agenda-missing="time"[^>]*>请填时间/);
});

test("editor: × disabled on the last row, add-row disabled at 40", () => {
  const one = renderToStaticMarkup(<AgendaEditor rows={[row("14:00", "签到")]} t={zh} start="14:00" end="17:30" />);
  assert.match(one, /aria-label="删除这一行" disabled=""/);
  const forty = renderToStaticMarkup(<AgendaEditor rows={Array.from({ length: 40 }, (_, i) => row("14:00", `第${i}`))} t={zh} start={null} end={null} />);
  assert.match(forty, /disabled=""[^>]*data-agenda-add-row/);
});

test("申込設定: the agenda card sits under 介绍 with its own 保存议程; no agenda yet → red line; ended → read-only", () => {
  const data = hostSetup(HOST_EVENT_IDS.cfo18)!;
  const zhHtml = renderToStaticMarkup(<HostSetupView data={data} draft={draftOf(data)} t={zh} language="zh" />);
  assert.match(zhHtml, /data-host-setup-agenda=""/); assert.match(zhHtml, /data-host-setup-agenda-save=""/); assert.match(zhHtml, />保存议程</);
  assert.equal((zhHtml.match(/data-agenda-row=/g) ?? []).length, 8);
  assert.doesNotMatch(zhHtml, /data-host-agenda-none/);
  assert.ok(zhHtml.indexOf("data-host-setup-agenda") < zhHtml.indexOf("data-host-questions"), "under 介绍, above the questions");
  const none = { ...data, event: { ...data.event, agenda: [] } };
  assert.match(renderToStaticMarkup(<HostSetupView data={none} draft={draftOf(none)} t={zh} language="zh" />), /data-host-agenda-none=""[^>]*>还没有议程，参加者看到的是“主办方还没有公布议程”/);
  const ended = { ...data, event: { ...data.event, status: "ended" as const } };
  const endedHtml = renderToStaticMarkup(<HostSetupView data={ended} draft={draftOf(ended)} t={zh} language="zh" />);
  assert.match(endedHtml, /data-host-agenda="readonly"/); assert.match(endedHtml, /活动已结束，议程不能再修改/); assert.match(endedHtml, /全?8行/);
  assert.doesNotMatch(endedHtml, /data-host-setup-agenda-save|data-agenda-add-row|删除这一行/);
});

import { HOST_AGENDA_DETAIL_MAX, HOST_AGENDA_MAX_ROWS, HOST_AGENDA_TITLE_MAX } from "../../shared/api-schema/host-events";
import { AGENDA_DETAIL_MAX, AGENDA_MAX_ROWS, AGENDA_TITLE_MAX } from "../../shared/compute/host-agenda";
test("schema limits and the editor / storage limits are the same numbers", () => {
  assert.deepEqual([HOST_AGENDA_MAX_ROWS, HOST_AGENDA_TITLE_MAX, HOST_AGENDA_DETAIL_MAX], [AGENDA_MAX_ROWS, AGENDA_TITLE_MAX, AGENDA_DETAIL_MAX]);
});
