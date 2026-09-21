import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { EventAttendeeModal } from "../../app/(app)/app/events/events-0918/event-attendee-modal";
import { contactStatusCopy } from "../../app/(app)/app/events/events-0918/events-model";
import { DESIGN_MODAL_MOCKS, MODAL_EVENT_ID, modalPerson, stripStyles, t } from "./event-modal-fixtures";

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
  assert.match(waiting, /<button class="btn ev-mo-btn-primary" data-events-modal-action="exchange" disabled="" type="button">等待对方确认<\/button>/);

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
