import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";

import { EventScheduleModal } from "../../app/(app)/app/events/events-0918/event-schedule-modal";
import {
  SCHEDULE_SLOTS,
  candidateTimesFrom,
  canSendSchedule,
  scheduleDays,
  slotStartsAtUtc,
} from "../../app/(app)/app/events/events-0918/events-model";
import { DESIGN_MODAL_MOCKS, MODAL_EVENT_ID, MODAL_ME, MODAL_NOW, jsonHeaders, modalPerson, stripStyles, t } from "./event-modal-fixtures";

/**
 * 约谈时间选择弹窗（Orbit_0918 Events 设计 744–760）：只有 accepted 可发起；≥3（≤5）个候选时段；
 * 两步 API（draft → propose）请求体 / Idempotency-Key 头；medium 映射 现场→in_person{location} / 线上→video{google_meet}。
 */
const noop = () => undefined;
const NOW_MS = Date.parse(MODAL_NOW);
const ACCEPTED = { contactId: "contact:aiko", contactRequestDirection: "outgoing" as const, contactRequestId: "event-contact-request:aiko", contactRequestRevision: 2, contactRequestStatus: "accepted" as const };

function element(overrides: Parameters<typeof modalPerson>[0] = {}, extra: Partial<Parameters<typeof EventScheduleModal>[0]> = {}) {
  return (
    <EventScheduleModal
      eventId={MODAL_EVENT_ID}
      eventVenue="Marunouchi Hall"
      language="zh"
      me={MODAL_ME}
      now={NOW_MS}
      onClose={noop}
      onSent={noop}
      person={modalPerson(overrides)}
      t={t}
      {...extra}
    />
  );
}

function slotButton(renderer: ReactTestRenderer, key: string): ReactTestInstance {
  return renderer.root.find((node) => node.type === "button" && node.props["data-events-schedule-slot"] === key);
}

function sendButton(renderer: ReactTestRenderer): ReactTestInstance {
  return renderer.root.find((node) => node.type === "button" && node.props["data-events-modal-action"] === "send-schedule");
}

test("schedule model: five real JST days from now, JST slot → UTC candidate, 3–5 rule", () => {
  const days = scheduleDays(NOW_MS, "zh");
  assert.deepEqual(days.map((day) => day.iso), ["2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26"]);
  assert.deepEqual(days[0], { iso: "2026-09-22", month: "9月", day: "22", weekday: "周二" });
  // 23:30Z on the 21st is already the 22nd in JST
  assert.equal(scheduleDays(Date.parse("2026-09-21T23:30:00.000Z"), "zh")[0].iso, "2026-09-22");
  assert.equal(slotStartsAtUtc("2026-09-22", "10:00 - 10:30"), "2026-09-22T01:00:00.000Z");
  assert.equal(slotStartsAtUtc("2026-09-22", "14:30 - 15:00"), "2026-09-22T05:30:00.000Z");
  assert.deepEqual(candidateTimesFrom(["2026-09-23 10:00 - 10:30", "2026-09-22 15:00 - 15:30"]), [
    { startsAtUtc: "2026-09-22T06:00:00.000Z" },
    { startsAtUtc: "2026-09-23T01:00:00.000Z" },
  ]);
  assert.equal(canSendSchedule(2), false);
  assert.equal(canSendSchedule(3), true);
  assert.equal(canSendSchedule(5), true);
  assert.equal(canSendSchedule(6), false);
  assert.equal(SCHEDULE_SLOTS.length, 6);
});

test("schedule modal SSR: shell, both people, timezone, real days, six slots, two formats, venue, note, footer; gated when not accepted", () => {
  const html = stripStyles(renderToStaticMarkup(element(ACCEPTED)));
  assert.match(html, /<div class="ev-mo-overlay ev-mo-z120" data-events-modal="schedule">/);
  assert.match(html, /class="ev-mo-panel ev-mo-panel-680 ev-mo-panel-gap-20"/);
  assert.match(html, /<strong class="ev-mo-title ev-mo-title-26" id="ev-mo-sch-title">约谈时间选择<\/strong>/);
  assert.match(html, /发起人（你）<\/span><strong class="ev-mo-sch-person-name">Li Wei<\/strong><span class="ev-mo-sch-person-label">Investor · Orbit Capital<\/span>/);
  assert.match(html, /对方<\/span><strong class="ev-mo-sch-person-name">Aiko Mori<\/strong><span class="ev-mo-sch-person-label">Founder · LoopMatter<\/span>/);
  // 时段按 JST 计算 → 时区固定 Asia/Tokyo（不是浏览器 Intl 时区）
  assert.match(html, /<span class="ev-mo-sch-field" data-events-schedule-timezone="Asia\/Tokyo">时区 Asia\/Tokyo \(JST\)<\/span>/);
  assert.match(html, /<button aria-pressed="true" class="btn ev-mo-sch-day ev-mo-sch-day-on" data-events-schedule-day="2026-09-22" type="button"><span class="ev-mo-sch-day-sub">9月<\/span><strong class="ev-mo-sch-day-n">22<\/strong><span class="ev-mo-sch-day-sub">周二<\/span><\/button>/);
  assert.equal((html.match(/data-events-schedule-day="/g) ?? []).length, 5);
  assert.equal((html.match(/data-events-schedule-slot="/g) ?? []).length, 6);
  // 10:00 JST on the 22nd is 01:00Z — already past at NOW (10:00Z) → disabled; 15:00 JST (06:00Z) also past
  assert.match(html, /data-events-schedule-slot="2026-09-22 10:00 - 10:30" disabled=""/);
  assert.match(html, /<button aria-pressed="true" class="btn ev-mo-sch-mode ev-mo-sch-mode-on" data-events-schedule-medium="in_person" type="button">/);
  assert.match(html, /<button aria-pressed="false" class="btn ev-mo-sch-mode" data-events-schedule-medium="video" type="button">/);
  assert.match(html, /会议地点<\/span><span class="ev-mo-sch-field">Marunouchi Hall<\/span>/);
  assert.match(html, /<textarea class="ev-mo-textarea" id="ev-mo-sch-note" maxLength="300" rows="3"><\/textarea><span class="ev-mo-counter">0\/300<\/span>/);
  assert.match(html, /data-events-schedule-count="0"/);
  assert.match(html, /<button class="btn ev-mo-btn-cancel ev-mo-btn-sm" type="button">取消<\/button><button class="btn ev-mo-btn-primary ev-mo-btn-sm" data-events-modal-action="send-schedule" disabled="" type="button">发送邀约<\/button>/);
  assert.doesNotMatch(html, /东京，日本|⌄|8月/);
  assert.doesNotMatch(html, DESIGN_MODAL_MOCKS);
  assert.doesNotMatch(html, /font-size:|font-weight:/u);

  const gated = stripStyles(renderToStaticMarkup(element()));
  assert.match(gated, /只有已接受的名片交换才能发起约谈/);
  assert.match(gated, /data-events-modal-action="send-schedule" disabled=""/);
  assert.equal((gated.match(/data-events-schedule-slot="[^"]+" disabled=""/g) ?? []).length, 6, "every slot disabled without an accepted exchange");
});

test("schedule modal: fewer than three candidates keeps 发送邀约 disabled; three enables it; five is the cap", async () => {
  let renderer!: ReactTestRenderer;
  try {
    await act(async () => { renderer = create(element(ACCEPTED)); });
    const day23 = renderer.root.find((node) => node.type === "button" && node.props["data-events-schedule-day"] === "2026-09-23");
    await act(async () => { day23.props.onClick(); });
    await act(async () => { slotButton(renderer, "2026-09-23 10:00 - 10:30").props.onClick(); });
    await act(async () => { slotButton(renderer, "2026-09-23 10:30 - 11:00").props.onClick(); });
    assert.equal(sendButton(renderer).props.disabled, true);
    assert.match(JSON.stringify(renderer.toJSON()), /"data-events-schedule-count":2/);
    assert.match(JSON.stringify(renderer.toJSON()), /ev-mo-hint ev-mo-hint-warn/);
    await act(async () => { slotButton(renderer, "2026-09-23 10:00 - 10:30").props.onClick(); });
    await act(async () => { slotButton(renderer, "2026-09-23 10:30 - 11:00").props.onClick(); });
    assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /ev-mo-hint-warn/, "neutral hint colour until a slot is picked");
    await act(async () => { slotButton(renderer, "2026-09-23 10:00 - 10:30").props.onClick(); });
    await act(async () => { slotButton(renderer, "2026-09-23 10:30 - 11:00").props.onClick(); });
    await act(async () => { slotButton(renderer, "2026-09-23 11:00 - 11:30").props.onClick(); });
    assert.equal(sendButton(renderer).props.disabled, false);
    await act(async () => { slotButton(renderer, "2026-09-23 14:00 - 14:30").props.onClick(); });
    await act(async () => { slotButton(renderer, "2026-09-23 14:30 - 15:00").props.onClick(); });
    assert.equal(slotButton(renderer, "2026-09-23 15:00 - 15:30").props.disabled, true, "sixth slot disabled at the cap of five");
    assert.match(JSON.stringify(renderer.toJSON()), /"data-events-schedule-count":5/);
  } finally {
    if (renderer) await act(async () => { renderer.unmount(); });
  }
});

test("schedule modal: send creates the draft then proposes with 3 UTC candidates, 30 min, Intl timezone, in_person venue, note, expectedVersion and idempotency keys", async () => {
  const originalFetch = globalThis.fetch;
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  globalThis.fetch = (async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url) === "/api/appointments") return Response.json({ data: { appointmentId: "appointment:1", version: 1 }, success: true }, { status: 201 });
    return Response.json({ data: { appointmentId: "appointment:1", version: 2 }, success: true });
  }) as typeof fetch;
  const sent: string[] = [];
  let renderer!: ReactTestRenderer;
  try {
    await act(async () => { renderer = create(element(ACCEPTED, { onSent: (person) => sent.push(person.id) })); });
    const day23 = renderer.root.find((node) => node.type === "button" && node.props["data-events-schedule-day"] === "2026-09-23");
    await act(async () => { day23.props.onClick(); });
    for (const slot of ["10:00 - 10:30", "11:00 - 11:30", "14:00 - 14:30"]) {
      await act(async () => { slotButton(renderer, `2026-09-23 ${slot}`).props.onClick(); });
    }
    const note = renderer.root.find((node) => node.type === "textarea" && node.props.id === "ev-mo-sch-note");
    await act(async () => { note.props.onChange({ target: { value: "期待交流" } }); });
    await act(async () => { await (sendButton(renderer).props.onClick() as Promise<void>); });

    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, "/api/appointments");
    assert.equal(calls[0].init?.method, "POST");
    assert.equal(calls[0].init?.body, JSON.stringify({ eventContactRequestId: "event-contact-request:aiko", eventId: MODAL_EVENT_ID }));
    const createHeaders = jsonHeaders(calls[0].init);
    assert.equal(createHeaders["content-type"], "application/json");
    assert.match(createHeaders["idempotency-key"], /^appointment:[0-9a-f-]{36}$/);

    assert.equal(calls[1].url, "/api/appointments/appointment%3A1/commands");
    const commandHeaders = jsonHeaders(calls[1].init);
    assert.match(commandHeaders["idempotency-key"], /^appointment:[0-9a-f-]{36}$/);
    assert.notEqual(commandHeaders["idempotency-key"], createHeaders["idempotency-key"]);
    const body = JSON.parse(String(calls[1].init?.body)) as Record<string, unknown>;
    assert.equal(body.command, "propose");
    assert.equal(body.expectedVersion, 1);
    assert.deepEqual(body.proposal, {
      candidateTimes: [
        { startsAtUtc: "2026-09-23T01:00:00.000Z" },
        { startsAtUtc: "2026-09-23T02:00:00.000Z" },
        { startsAtUtc: "2026-09-23T05:00:00.000Z" },
      ],
      durationMinutes: 30,
      medium: { kind: "in_person", location: "Marunouchi Hall" },
      note: "期待交流",
      timezone: "Asia/Tokyo",
    });
    assert.equal((body.proposal as { timezone: string }).timezone, "Asia/Tokyo");
    // 9/23 10:00 JST → 01:00Z
    assert.equal((body.proposal as { candidateTimes: { startsAtUtc: string }[] }).candidateTimes[0].startsAtUtc, "2026-09-23T01:00:00.000Z");
    assert.deepEqual(sent, ["participant:aiko"]);
  } finally {
    globalThis.fetch = originalFetch;
    if (renderer) await act(async () => { renderer.unmount(); });
  }
});

test("schedule modal: 线上 maps to video / google_meet with a null join url; a failed draft shows the error inline", async () => {
  const originalFetch = globalThis.fetch;
  const bodies: string[] = [];
  let failDraft = false;
  globalThis.fetch = (async (url, init) => {
    bodies.push(String(init?.body));
    if (String(url) === "/api/appointments") {
      return failDraft
        ? Response.json({ error: { code: "FORBIDDEN", message: "Only an accepted exchange can start an appointment." }, success: false }, { status: 403 })
        : Response.json({ data: { appointmentId: "appointment:2", version: 1 }, success: true }, { status: 201 });
    }
    return Response.json({ data: { appointmentId: "appointment:2", version: 2 }, success: true });
  }) as typeof fetch;
  let renderer!: ReactTestRenderer;
  try {
    await act(async () => { renderer = create(element(ACCEPTED)); });
    const day24 = renderer.root.find((node) => node.type === "button" && node.props["data-events-schedule-day"] === "2026-09-24");
    await act(async () => { day24.props.onClick(); });
    for (const slot of ["10:00 - 10:30", "10:30 - 11:00", "11:00 - 11:30"]) {
      await act(async () => { slotButton(renderer, `2026-09-24 ${slot}`).props.onClick(); });
    }
    const video = renderer.root.find((node) => node.type === "button" && node.props["data-events-schedule-medium"] === "video");
    await act(async () => { video.props.onClick(); });
    assert.match(JSON.stringify(renderer.toJSON()), /Google Meet（双方确认后生成链接）/);
    await act(async () => { await (sendButton(renderer).props.onClick() as Promise<void>); });
    const proposal = (JSON.parse(bodies[1]) as { proposal: { medium: unknown } }).proposal;
    assert.deepEqual(proposal.medium, { kind: "video", provider: "google_meet", joinUrl: null });
  } finally {
    globalThis.fetch = originalFetch;
    if (renderer) await act(async () => { renderer.unmount(); });
  }

  failDraft = true;
  bodies.length = 0;
  globalThis.fetch = (async (url, init) => {
    bodies.push(String(init?.body));
    return Response.json({ error: { code: "FORBIDDEN", message: "Only an accepted exchange can start an appointment." }, success: false }, { status: 403 });
  }) as typeof fetch;
  try {
    await act(async () => { renderer = create(element(ACCEPTED)); });
    const day24 = renderer.root.find((node) => node.type === "button" && node.props["data-events-schedule-day"] === "2026-09-24");
    await act(async () => { day24.props.onClick(); });
    for (const slot of ["10:00 - 10:30", "10:30 - 11:00", "11:00 - 11:30"]) {
      await act(async () => { slotButton(renderer, `2026-09-24 ${slot}`).props.onClick(); });
    }
    await act(async () => { await (sendButton(renderer).props.onClick() as Promise<void>); });
    assert.equal(bodies.length, 1, "no propose after a failed draft");
    assert.match(JSON.stringify(renderer.toJSON()), /"role":"alert"[^}]*\},"children":\["Only an accepted exchange can start an appointment\."\]/);
  } finally {
    globalThis.fetch = originalFetch;
    if (renderer) await act(async () => { renderer.unmount(); });
  }
});

test("schedule modal: an empty event venue sends the displayed fallback 「活动现场」 as in_person.location", async () => {
  const originalFetch = globalThis.fetch;
  const bodies: string[] = [];
  globalThis.fetch = (async (url, init) => {
    bodies.push(String(init?.body));
    if (String(url) === "/api/appointments") return Response.json({ data: { appointmentId: "appointment:3", version: 1 }, success: true }, { status: 201 });
    return Response.json({ data: { appointmentId: "appointment:3", version: 2 }, success: true });
  }) as typeof fetch;
  let renderer!: ReactTestRenderer;
  try {
    await act(async () => { renderer = create(element(ACCEPTED, { eventVenue: "" })); });
    assert.match(JSON.stringify(renderer.toJSON()), /会议地点[^]*?"ev-mo-sch-field"[^}]*\},"children":\["活动现场"\]/);
    const day24 = renderer.root.find((node) => node.type === "button" && node.props["data-events-schedule-day"] === "2026-09-24");
    await act(async () => { day24.props.onClick(); });
    for (const slot of ["10:00 - 10:30", "10:30 - 11:00", "11:00 - 11:30"]) {
      await act(async () => { slotButton(renderer, `2026-09-24 ${slot}`).props.onClick(); });
    }
    await act(async () => { await (sendButton(renderer).props.onClick() as Promise<void>); });
    assert.deepEqual((JSON.parse(bodies[1]) as { proposal: { medium: unknown } }).proposal.medium, { kind: "in_person", location: "活动现场" });
  } finally {
    globalThis.fetch = originalFetch;
    if (renderer) await act(async () => { renderer.unmount(); });
  }
});
