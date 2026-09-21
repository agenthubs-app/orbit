import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { EventExchangeModal } from "../../app/(app)/app/events/events-0918/event-exchange-modal";
import { DESIGN_MODAL_MOCKS, MODAL_EVENT_ID, MODAL_ME, jsonHeaders, modalPerson, stripStyles, t } from "./event-modal-fixtures";

/**
 * 申请交换联系方式弹窗 + 交换成功态（Orbit_0918 Events 设计 704–741）。
 * API 只接 { expectedRevision, targetParticipantId } → 留言 / 目的省略；成功态按真实状态两种文案。
 */
const noop = () => undefined;

function element(overrides: Parameters<typeof modalPerson>[0] = {}, extra: Partial<Parameters<typeof EventExchangeModal>[0]> = {}) {
  return (
    <EventExchangeModal
      eventId={MODAL_EVENT_ID}
      me={MODAL_ME}
      onClose={noop}
      onNote={noop}
      onSchedule={noop}
      open
      person={modalPerson(overrides)}
      t={t}
      {...extra}
    />
  );
}

test("exchange modal form: shell, person card, explanation + consent, no message / purposes / contact tiles", () => {
  const html = stripStyles(renderToStaticMarkup(element()));
  assert.match(html, /<div class="ev-mo-overlay ev-mo-z110" data-events-modal="exchange">/);
  assert.match(html, /<div aria-labelledby="ev-mo-ex-title" aria-modal="true" class="ev-mo-panel ev-mo-panel-660 ev-mo-panel-gap-20" role="dialog">/);
  assert.match(html, /<strong class="ev-mo-title ev-mo-title-26" id="ev-mo-ex-title">申请交换联系方式<\/strong><span class="ev-mo-sub">向对方发送请求，交换联系方式。对方可以选择接受或拒绝你的请求。<\/span>/);
  assert.match(html, /<span aria-hidden="true" class="ev-mo-ex-avatar">A<\/span><span class="ev-mo-ex-copy"><strong class="ev-mo-ex-name">Aiko Mori<\/strong><span class="ev-mo-ex-role">Founder @ LoopMatter<\/span>/);
  assert.match(html, /<span class="ev-mo-ex-tag">Reuse systems<\/span>/);
  assert.match(html, /<span class="ev-mo-ex-bio">Founder · LoopMatter · Scaling reusable packaging in Japan.<\/span>/);
  assert.match(html, /<strong class="ev-mo-ex-h">将共享的联系方式<\/strong>/);
  assert.match(html, /<button aria-pressed="true" class="btn ev-mo-agree ev-mo-agree-on" type="button"><span aria-hidden="true" class="ev-mo-agree-box">✓<\/span>我同意在对方接受请求后，向对方分享上述名片。<\/button>/);
  assert.match(html, /<button class="btn ev-mo-btn-cancel" type="button">取消<\/button><button class="btn ev-mo-btn-primary ev-mo-btn-15" data-events-modal-action="send-exchange" type="button">发送申请<\/button>/);
  assert.doesNotMatch(html, /<textarea|申请留言|联系目的|邮箱地址|LinkedIn 主页|⧉/);
  assert.doesNotMatch(html, DESIGN_MODAL_MOCKS);
  assert.doesNotMatch(html, /font-size:|font-weight:/u);
});

test("exchange modal: send posts only { expectedRevision, targetParticipantId } and switches to the 「申请已发送」 success state", async () => {
  const originalFetch = globalThis.fetch;
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  globalThis.fetch = (async (url, init) => {
    calls.push({ url: String(url), init });
    return Response.json({ data: { requestId: "event-contact-request:aiko", revision: 1 }, success: true });
  }) as typeof fetch;
  const hostCalls: string[] = [];
  let renderer!: ReactTestRenderer;
  try {
    await act(async () => {
      renderer = create(element({ contactRequestRevision: 4 }, { onClose: () => hostCalls.push("close"), onSchedule: () => hostCalls.push("schedule") }));
    });
    const send = renderer.root.find((node) => node.type === "button" && node.props["data-events-modal-action"] === "send-exchange");
    await act(async () => { await (send.props.onClick() as Promise<void>); });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `/api/events/${encodeURIComponent(MODAL_EVENT_ID)}/operations/contact-requests`);
    assert.equal(calls[0].init?.method, "POST");
    assert.equal(jsonHeaders(calls[0].init)["content-type"], "application/json");
    assert.equal(calls[0].init?.body, JSON.stringify({ expectedRevision: 4, targetParticipantId: "participant:aiko" }));

    const json = JSON.stringify(renderer.toJSON());
    assert.match(json, /"data-events-modal":"exchange"/);
    assert.match(json, /"data-events-exchange-result":"sent"/);
    assert.match(json, /申请已发送，等待对方确认/);
    assert.match(json, /"ev-mo-ok-avatar"[^}]*\},"children":\["A"\]/);
    assert.match(json, /Li Wei/);
    assert.equal(renderer.root.findAll((node) => node.type === "button" && node.props["data-events-modal-action"] === "schedule").length, 0, "no schedule before acceptance");
    assert.equal(renderer.root.findAll((node) => node.type === "button" && node.props["data-events-modal-action"] === "note").length, 0);
    const done = renderer.root.find((node) => node.type === "button" && node.props["data-events-modal-action"] === "done");
    await act(async () => { done.props.onClick(); });
    assert.deepEqual(hostCalls, ["close"]);
  } finally {
    globalThis.fetch = originalFetch;
    if (renderer) await act(async () => { renderer.unmount(); });
  }
});

test("exchange modal: an accepted exchange with a contact id renders the 「已互换名片」 success state with the contact link", () => {
  const html = stripStyles(renderToStaticMarkup(element({ contactId: "contact:aiko", contactRequestId: "req:3", contactRequestRevision: 2, contactRequestStatus: "accepted", contactRequestDirection: "outgoing" })));
  assert.match(html, /<div class="ev-mo-overlay ev-mo-z120 ev-mo-overlay-center" data-events-modal="exchange">/);
  assert.match(html, /class="ev-mo-panel ev-mo-panel-680 ev-mo-panel-ok"/);
  assert.match(html, /<strong class="ev-mo-ok-title" data-events-exchange-result="accepted" id="ev-mo-ok-title">已互换名片<\/strong>/);
  assert.match(html, /<a class="ev-mo-ok-contact" data-events-modal-action="open-contact" href="\/app\/contacts\/contact%3Aaiko">◎ 打开联系人名片 →<\/a>/);
  assert.match(html, /<span aria-hidden="true" class="ev-mo-ok-avatar">A<\/span><strong class="ev-mo-ok-name">Aiko Mori<\/strong><span class="ev-mo-ok-role">Founder @ LoopMatter<\/span>/);
  assert.match(html, /<span aria-hidden="true" class="ev-mo-ok-avatar">L<\/span><strong class="ev-mo-ok-name">Li Wei<\/strong><span class="ev-mo-ok-role">Investor · Orbit Capital<\/span>/);
  assert.match(html, /data-events-modal-action="schedule" type="button">▦ 去约个时间<\/button><button class="btn ev-mo-btn-ghost ev-mo-btn-14" data-events-modal-action="note" type="button">▤ 记录交流<\/button><button class="btn ev-mo-btn-primary ev-mo-btn-14" data-events-modal-action="done" type="button">✓ 完成<\/button>/);
  assert.doesNotMatch(html, /⧉|邮箱|@orbit|linkedin/i);
  assert.doesNotMatch(html, DESIGN_MODAL_MOCKS);
});

test("exchange modal: send is disabled while the event has not started or a request is pending", () => {
  const closed = stripStyles(renderToStaticMarkup(element({}, { open: false })));
  assert.match(closed, /data-events-modal-action="send-exchange" disabled=""/);
  assert.match(closed, /活动开始后可申请交换/);
  const pending = stripStyles(renderToStaticMarkup(element({ contactRequestDirection: "outgoing", contactRequestId: "req:1", contactRequestRevision: 1, contactRequestStatus: "awaiting_target_consent" })));
  assert.match(pending, /data-events-modal-action="send-exchange" disabled=""/);
  assert.match(pending, /已有申请在等待对方确认/);
});
