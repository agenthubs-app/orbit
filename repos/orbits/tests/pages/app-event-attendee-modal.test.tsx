import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { EventAttendeeModal } from "../../app/(app)/app/events/events-0918/event-attendee-modal";
import { loopFocus } from "../../app/(app)/app/events/events-0918/event-modal-frame";
import { contactStatusCopy } from "../../app/(app)/app/events/events-0918/events-model";
import { DESIGN_MODAL_MOCKS, MODAL_EVENT_ID, modalPerson, stripStyles, t } from "./event-modal-fixtures";
import { resetContactRequestStateCache } from "../../app/(app)/app/events/events-0918/live-controls";

// 交换状态缓存按 <eventId participantId> 键跨挂载共享（终审 M1）；每条用例从空缓存开始。
test.beforeEach(() => resetContactRequestStateCache());

/**
 * 参会者详情弹窗（Orbit_0918 Events 设计 675–701）：真实 OrbitPartyPersonView 字段、按状态的按钮、省略项。
 */
const noop = () => undefined;

function render(overrides: Parameters<typeof modalPerson>[0] = {}, open = true): string {
  return stripStyles(renderToStaticMarkup(
    <EventAttendeeModal
      eventDate="9月22日（周二）17:30 – 21:00"
      eventId={MODAL_EVENT_ID}
      eventName="Orbit Connection Night"
      onClose={noop}
      onExchange={noop}
      onNote={noop}
      onSchedule={noop}
      open={open}
      person={modalPerson(overrides)}
      t={t}
    />,
  ));
}

test("attendee modal: overlay / panel / title / real person fields / four cards / relationship band / footnote", () => {
  const html = render();
  assert.match(html, /<div class="ev-mo-overlay ev-mo-z100" data-events-modal="attendee">/);
  assert.match(html, /<div aria-labelledby="ev-mo-att-title" aria-modal="true" class="ev-mo-panel ev-mo-panel-800" role="dialog">/);
  assert.match(html, /<strong class="ev-mo-title ev-mo-title-22" id="ev-mo-att-title">参会者详情<\/strong>/);
  assert.match(html, /<button aria-label="关闭" class="btn ev-modal-close" type="button">×<\/button>/);
  assert.match(html, /<span aria-hidden="true" class="ev-mo-att-avatar">A<\/span>/);
  assert.match(html, /<strong class="ev-mo-att-name">Aiko Mori<\/strong><span class="ev-mo-att-score">✦ 91% 匹配<\/span>/);
  assert.match(html, /<span class="ev-mo-att-line">Founder<\/span><span class="ev-mo-att-line">LoopMatter<\/span>/);
  assert.match(html, /<span class="ev-mo-att-meta"><span>◎ Circular economy<\/span><\/span>/);
  assert.match(html, /<span class="ev-mo-att-tag">Reuse systems<\/span><span class="ev-mo-att-tag">Enterprise procurement<\/span>/);
  assert.match(html, /▦ 本次活动参会<\/span><span class="ev-mo-att-event-line">Orbit Connection Night<\/span><span class="ev-mo-att-event-line">9月22日（周二）17:30 – 21:00<\/span>/);
  assert.match(html, /<p class="ev-mo-att-bio">Founder · LoopMatter · Scaling reusable packaging in Japan.<\/p>/);
  assert.match(html, /我能提供<\/strong><\/span><span class="ev-mo-att-card-body"><span class="ev-mo-att-card-line">• Packaging reuse pilot data<\/span><span class="ev-mo-att-card-line">• Japan retail introductions<\/span>/);
  assert.match(html, /我正在寻找<\/strong><\/span><span class="ev-mo-att-card-body"><span class="ev-mo-att-card-line">• Manufacturing buyers<\/span>/);
  assert.match(html, /想聊的话题<\/strong><\/span><span class="ev-mo-att-card-body"><span class="ev-mo-att-card-line">• Reuse systems<\/span>/);
  assert.match(html, /AI 推荐理由<\/strong><\/span><span class="ev-mo-att-card-body"><span class="ev-mo-att-card-line">• Her enterprise pilots complement your manufacturing network.<\/span>/);
  assert.match(html, /<div class="ev-mo-att-status" data-events-contact-status="none">/);
  assert.match(html, /当前关系状态<\/strong><span class="ev-mo-att-status-line">你们尚未建立连接<\/span>/);
  assert.match(html, /<span class="ev-mo-att-foot">◈ 你的请求将附带本次活动的背景信息。请尊重对方的时间与意愿，文明交流。<\/span>/);
  assert.doesNotMatch(html, DESIGN_MODAL_MOCKS);
  assert.doesNotMatch(html, /font-size:|font-weight:|gap:\d/u, "no inline numeric typography");
});

test("attendee modal: buttons follow the real contact request status", () => {
  const none = render();
  assert.match(none, /<button class="btn ev-mo-btn-primary" data-events-modal-action="exchange" type="button">⇢ 申请交换联系方式<\/button>/);
  assert.doesNotMatch(none, /data-events-modal-action="schedule"|data-events-modal-action="note"/);

  const closed = render({}, false);
  assert.match(closed, /<button class="btn ev-mo-btn-primary" data-events-modal-action="exchange" disabled="" type="button">活动开始后可申请交换<\/button>/);

  const waiting = render({ contactRequestDirection: "outgoing", contactRequestId: "req:1", contactRequestRevision: 1, contactRequestStatus: "awaiting_target_consent" });
  assert.match(waiting, /data-events-contact-status="awaiting_target_consent"/);
  assert.match(waiting, /申请已发送，等待对方确认/);
  // 终审 M6：自己发出的待确认申请 → 禁用的状态标签 + 「撤回申请」
  // 2026-09-24：状态标签由 <button disabled> 改为 <span aria-disabled>（P0 missing static
  // behavior evidence 的本域既定改法，同 event-detail 两枚常驻禁用 CTA），几何与色阶不变。
  assert.match(waiting, /<span aria-disabled="true" class="btn ev-mo-btn-primary ev-mo-btn-disabled" data-events-modal-action="exchange">等待对方确认<\/span><button class="btn ev-mo-btn-ghost" data-events-modal-action="withdraw" type="button">撤回申请<\/button>/);

  const incoming = render({ contactRequestDirection: "incoming", contactRequestId: "req:2", contactRequestRevision: 1, contactRequestStatus: "awaiting_target_consent" });
  assert.match(incoming, /对方向你发起了交换申请/);
  assert.match(incoming, /data-events-modal-action="accept" type="button">同意交换<\/button><button class="btn ev-mo-btn-ghost" data-events-modal-action="decline" type="button">拒绝<\/button>/);

  const accepted = render({ contactId: "contact:aiko", contactRequestId: "req:3", contactRequestRevision: 2, contactRequestStatus: "accepted", contactRequestDirection: "outgoing" });
  assert.match(accepted, /data-events-contact-status="accepted"/);
  assert.match(accepted, /已互换名片/);
  // accepted → 设计 a.exLabel「✓ 已交换」仍是同一入口：打开交换弹窗的成功态（含联系人链接）
  assert.match(accepted, /<button class="btn ev-mo-btn-primary" data-events-modal-action="exchange" type="button">✓ 已交换<\/button>/);
  assert.match(accepted, /data-events-modal-action="schedule" type="button">▦ 约个时间<\/button>/);
  assert.match(accepted, /data-events-modal-action="note" type="button">▤ 记录交流<\/button>/);

  const declined = render({ contactRequestId: "req:4", contactRequestRevision: 2, contactRequestStatus: "declined", contactRequestDirection: "outgoing" });
  assert.match(declined, /对方已拒绝交换/);
  assert.match(declined, /data-events-modal-action="exchange" disabled=""/);

  const noReason = render({ isRecommended: false, reason: "", score: 0, summary: "", offering: "" });
  assert.doesNotMatch(noReason, /AI 推荐理由|ev-mo-att-score|ev-mo-att-bio|我能提供/);
});

test("attendee modal: the live VM's 「Not provided」 placeholders count as empty; bullets split on newline and 「 · 」", () => {
  const html = render({ industry: "Not provided", offering: "Not provided", seeking: "Buyers · Distributors\nPartners" });
  assert.doesNotMatch(html, /Not provided|ev-mo-att-meta|我能提供/);
  assert.match(html, /我正在寻找<\/strong><\/span><span class="ev-mo-att-card-body"><span class="ev-mo-att-card-line">• Buyers<\/span><span class="ev-mo-att-card-line">• Distributors<\/span><span class="ev-mo-att-card-line">• Partners<\/span>/);
});

test("attendee modal (reduced / recap): no exchange status button, no 约个时间; only 打开联系人名片 (with contactId) + 记录交流", () => {
  const withContact = stripStyles(renderToStaticMarkup(
    <EventAttendeeModal eventDate="—" eventId={MODAL_EVENT_ID} eventName="E" onClose={noop} onExchange={noop} onNote={noop} onSchedule={noop} open={false} person={modalPerson({ contactId: "contact:aiko", contactRequestStatus: "accepted" })} reduced t={t} />,
  ));
  assert.match(withContact, /data-events-attendee-mode="reduced"/);
  assert.match(withContact, /<a class="btn ev-mo-btn-primary" data-events-modal-action="open-contact" href="\/app\/contacts\/contact%3Aaiko">◎ 打开联系人名片<\/a>/);
  assert.match(withContact, /data-events-modal-action="note"/);
  assert.doesNotMatch(withContact, /data-events-modal-action="exchange"|data-events-modal-action="schedule"|活动开始后可申请交换/);
  const noContact = stripStyles(renderToStaticMarkup(
    <EventAttendeeModal eventDate="—" eventId={MODAL_EVENT_ID} eventName="E" onClose={noop} onExchange={noop} onNote={noop} onSchedule={noop} open={false} person={modalPerson()} reduced t={t} />,
  ));
  assert.doesNotMatch(noContact, /data-events-modal-action=|活动开始后可申请交换/);
});

test("attendee modal: exchange / schedule / note buttons hand the same person to the host", async () => {
  const calls: string[] = [];
  const person = modalPerson({ contactId: "contact:aiko", contactRequestId: "req:3", contactRequestRevision: 2, contactRequestStatus: "accepted", contactRequestDirection: "outgoing" });
  let renderer!: ReactTestRenderer;
  try {
    await act(async () => {
      renderer = create(
        <EventAttendeeModal
          eventDate="—"
          eventId={MODAL_EVENT_ID}
          eventName="Orbit Connection Night"
          onClose={() => calls.push("close")}
          onExchange={(target) => calls.push(`exchange:${target.id}`)}
          onNote={(target) => calls.push(`note:${target.id}`)}
          onSchedule={(target) => calls.push(`schedule:${target.id}`)}
          open
          person={person}
          t={t}
        />,
      );
    });
    for (const action of ["exchange", "schedule", "note"]) {
      const button = renderer.root.find((node) => node.type === "button" && node.props["data-events-modal-action"] === action);
      await act(async () => { button.props.onClick(); });
    }
    const close = renderer.root.find((node) => node.type === "button" && node.props["aria-label"] === "关闭");
    await act(async () => { close.props.onClick(); });
    assert.deepEqual(calls, ["exchange:participant:aiko", "schedule:participant:aiko", "note:participant:aiko", "close"]);
  } finally {
    if (renderer) await act(async () => { renderer.unmount(); });
  }
});

test("contactStatusCopy: line / action / canRequest per status", () => {
  assert.equal(contactStatusCopy("none", null, false).canRequest, true);
  assert.equal(contactStatusCopy("withdrawn", "outgoing", false).canRequest, true);
  assert.equal(contactStatusCopy("withdrawn", "incoming", false).canRequest, false);
  assert.equal(contactStatusCopy("awaiting_target_consent", "outgoing", false).line.zh, "申请已发送，等待对方确认");
  assert.equal(contactStatusCopy("awaiting_target_consent", "incoming", false).action.zh, "同意交换");
  assert.equal(contactStatusCopy("none", null, true).line.zh, "已互换名片");
  assert.equal(contactStatusCopy("declined", "outgoing", false).canRequest, false);
});

test("attendee modal: 撤回申请 posts withdraw with the persisted request id + revision and returns to a requestable state", async () => {
  const originalFetch = globalThis.fetch;
  const calls: { url: string; body: string }[] = [];
  globalThis.fetch = (async (url, init) => {
    calls.push({ url: String(url), body: String(init?.body) });
    return Response.json({ data: { contactId: null, revision: 2, status: "withdrawn" }, success: true });
  }) as typeof fetch;
  let renderer!: ReactTestRenderer;
  try {
    await act(async () => {
      renderer = create(
        <EventAttendeeModal eventDate="d" eventId={MODAL_EVENT_ID} eventName="n" onClose={noop} onExchange={noop} onNote={noop} onSchedule={noop} open person={modalPerson({ contactRequestDirection: "outgoing", contactRequestId: "req:1", contactRequestRevision: 1, contactRequestStatus: "awaiting_target_consent" })} t={t} />,
      );
    });
    // P0「missing static behavior evidence」的改法：撤回分支里那枚只渲染状态文案的常驻禁用件
    // 不再是 <button disabled>，而是 <span aria-disabled>（同 event-detail 两枚常驻禁用 CTA）。
    const statusAffordance = renderer.root.find((node) => node.props["data-events-modal-action"] === "exchange");
    assert.equal(statusAffordance.type, "span");
    assert.equal(statusAffordance.props["aria-disabled"], "true");
    assert.equal(statusAffordance.props.className, "btn ev-mo-btn-primary ev-mo-btn-disabled");
    assert.equal(statusAffordance.props.onClick, undefined, "状态件不带任何 handler");
    assert.equal(
      renderer.root.findAll((node) => node.type === "button" && node.props["data-events-modal-action"] === "exchange").length,
      0,
      "撤回分支里不应再有无 handler 的 <button>",
    );
    const withdraw = renderer.root.find((node) => node.type === "button" && node.props["data-events-modal-action"] === "withdraw");
    await act(async () => { await (withdraw.props.onClick() as Promise<void>); });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `/api/events/${encodeURIComponent(MODAL_EVENT_ID)}/operations/contact-requests/req%3A1/withdraw`);
    assert.equal(calls[0].body, JSON.stringify({ expectedRevision: 1 }));
    const json = JSON.stringify(renderer.toJSON());
    assert.match(json, /"data-events-contact-status":"withdrawn"/);
    assert.match(json, /你已撤回申请/);
    assert.match(json, /⇢ 再次申请交换/);
    assert.equal(renderer.root.findAll((node) => node.type === "button" && node.props["data-events-modal-action"] === "withdraw").length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (renderer) await act(async () => { renderer.unmount(); });
  }
});

test("modal frame: Tab on the last focusable wraps to the first, Shift+Tab on the first wraps to the last (M5)", async () => {
  const focused: string[] = [];
  const el = (name: string) => ({ name, focus: () => focused.push(name) });
  const first = el("close");
  const middle = el("exchange");
  const last = el("note");
  const root = { querySelectorAll: () => [first, middle, last] };
  assert.equal(loopFocus(root, last, false), true);
  assert.equal(loopFocus(root, first, true), true);
  assert.equal(loopFocus(root, middle, false), false, "Tab in the middle is left to the browser");
  assert.equal(loopFocus(root, null, false), true, "focus outside the panel is pulled back in");
  assert.deepEqual(focused, ["close", "note", "close"]);
  assert.equal(loopFocus(null, last, false), false);
  assert.equal(loopFocus({ querySelectorAll: () => [] }, last, false), false);

  // 真实路径：面板 onKeyDown 读 document.activeElement（这里模拟在最后一个按钮上按 Tab）
  const originalDocument = (globalThis as { document?: unknown }).document;
  let renderer!: ReactTestRenderer;
  try {
    await act(async () => {
      renderer = create(
        <EventAttendeeModal eventDate="d" eventId={MODAL_EVENT_ID} eventName="n" onClose={noop} onExchange={noop} onNote={noop} onSchedule={noop} open person={modalPerson()} t={t} />,
        { createNodeMock: (element) => (element.props.role === "dialog" ? root : null) },
      );
    });
    (globalThis as { document?: unknown }).document = { activeElement: last };
    const panel = renderer.root.find((node) => node.props.role === "dialog");
    let prevented = 0;
    await act(async () => { panel.props.onKeyDown({ key: "Tab", shiftKey: false, preventDefault: () => { prevented += 1; } }); });
    assert.equal(prevented, 1);
    assert.equal(focused.at(-1), "close");
    await act(async () => { panel.props.onKeyDown({ key: "Enter", shiftKey: false, preventDefault: () => { prevented += 1; } }); });
    assert.equal(prevented, 1, "non-Tab keys are ignored");
  } finally {
    (globalThis as { document?: unknown }).document = originalDocument;
    if (renderer) await act(async () => { renderer.unmount(); });
  }
});
