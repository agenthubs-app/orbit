"use client";

/**
 * 申请交换联系方式弹窗 + 交换成功态。JSX 逐元素来自 docs/designs/Orbit_0918/Events.dc.html：
 * 704–718（表单：707 标题行；708 对方卡 80 头像；709 申请留言；710–712 将共享的联系方式；713 联系目的；714 同意；715 底部）
 * 721–741（成功：724 ×；725 ✓ 100 圆 + 四色小方块；726 标题 28；727 副标题；728–732 双方 84 头像 + ⇄；733–736 联系方式卡；737 小提示；738 三按钮）。
 * API `POST /api/events/{id}/operations/contact-requests` 只接 `{ expectedRevision, targetParticipantId }`
 * （逻辑 = live-controls `useEventContactRequest.createRequest`）→ 申请留言 textarea、联系目的 chips 省略（记偏差）；
 * 说明 / 同意文案保留（非必选、不发送）；「将共享的联系方式」三格（邮箱 / LinkedIn / 姓名）无真实来源 → 省略，只留说明句。
 * 成功态按真实状态：awaiting_target_consent → 「申请已发送，等待对方确认」；accepted 且 contactId → 「已互换名片」+ 链接 `/app/contacts/<id>`；
 * 设计的邮箱 / LinkedIn / 微信 / 复制按钮省略；自己的卡 = `me`。
 */
import { useState } from "react";

import { useOrbitLanguage } from "../../orbit-language-context";
import type { OrbitPartyMeView, OrbitPartyPersonView } from "../../orbit-party-route-view-model";
import { EventModalFrame, EventModalHead } from "./event-modal-frame";
import { useEventContactRequest } from "./live-controls";

type Translate = (copy: { en: string; zh: string }) => string;

export interface ExchangeModalProps {
  eventId: string;
  me: Pick<OrbitPartyMeView, "initial" | "name" | "role">;
  onClose: () => void;
  onNote: (person: OrbitPartyPersonView) => void;
  onSchedule: (person: OrbitPartyPersonView) => void;
  open: boolean;
  person: OrbitPartyPersonView;
  t: Translate;
}

function roleAt(person: Pick<OrbitPartyPersonView, "title" | "company">): string {
  return person.company?.trim() ? `${person.title} @ ${person.company}` : person.title;
}

function PersonBadge({ initial, name, role }: { initial: string; name: string; role: string }) {
  return (
    <span className="ev-mo-ok-person">
      <span aria-hidden="true" className="ev-mo-ok-avatar">{initial}</span>
      <strong className="ev-mo-ok-name">{name}</strong>
      <span className="ev-mo-ok-role">{role}</span>
    </span>
  );
}

export function EventExchangeModal({ eventId, me, onClose, onNote, onSchedule, open, person, t }: ExchangeModalProps) {
  const control = useEventContactRequest({ eventId, person, t });
  const { preserveHref } = useOrbitLanguage();
  const [agree, setAgree] = useState(true);
  const [sent, setSent] = useState(false);
  const exchanged = control.status === "accepted";
  const pending = control.status === "awaiting_target_consent";
  const showSuccess = exchanged || (sent && pending);
  // 「我同意…」是发送门槛（设计 714 → 715 发送按钮；终审 M4）：未勾选不能发送。
  const canSend = open && agree && !control.busy && (control.status === "none" || (control.status === "withdrawn" && control.direction === "outgoing"));

  async function send() {
    await control.createRequest();
    setSent(true);
  }

  if (showSuccess) {
    const title = exchanged
      ? t({ en: "Business cards exchanged", zh: "已互换名片" })
      : t({ en: "Request sent — waiting for their confirmation", zh: "申请已发送，等待对方确认" });
    const sub = exchanged
      ? t({ en: "You can now reach each other directly. Enjoy the conversation!", zh: "你们现在可以直接联系，期待更多精彩的交流与合作！" })
      : t({ en: "Once they accept, you exchange business cards and can keep in touch here.", zh: "对方同意后，你们将互换名片，并可在这里继续联系。" });
    return (
      <EventModalFrame center kind="exchange" labelledBy="ev-mo-ok-title" onClose={onClose} panelClass="ev-mo-panel-ok" size="680" z="120">
        <button aria-label={t({ en: "Close", zh: "关闭" })} className="btn ev-modal-close ev-mo-ok-close" onClick={onClose} type="button">×</button>
        <span aria-hidden="true" className={`ev-mo-ok-mark${exchanged ? "" : " ev-mo-ok-mark-wait"}`}>
          {exchanged ? "✓" : "⇢"}
          <span className="ev-mo-ok-confetti ev-mo-ok-confetti-1" /><span className="ev-mo-ok-confetti ev-mo-ok-confetti-2" /><span className="ev-mo-ok-confetti ev-mo-ok-confetti-3" /><span className="ev-mo-ok-confetti ev-mo-ok-confetti-4" />
        </span>
        <strong className="ev-mo-ok-title" data-events-exchange-result={exchanged ? "accepted" : "sent"} id="ev-mo-ok-title">{title}</strong>
        <span className="ev-mo-ok-sub">{sub}</span>
        <div className="ev-mo-ok-pair">
          <PersonBadge initial={person.initial} name={person.name} role={roleAt(person)} />
          <span aria-hidden="true" className="ev-mo-ok-swap">⇄</span>
          <PersonBadge initial={me.initial} name={me.name} role={me.role} />
        </div>
        {exchanged && control.contactId ? (
          <a className="ev-mo-ok-contact" data-events-modal-action="open-contact" href={preserveHref(`/app/contacts/${encodeURIComponent(control.contactId)}`)}>
            ◎ {t({ en: "Open the contact card", zh: "打开联系人名片" })} →
          </a>
        ) : null}
        <div className="ev-mo-ok-tip">
          ✦ {exchanged
            ? t({ en: "Tip: a sincere follow-up opens more doors — why not schedule a chat right now?", zh: "小提示：真诚的后续沟通能带来更多机会，不妨现在就约个时间继续交流吧！" })
            : t({ en: "Tip: while it is pending you can withdraw the request with 「撤回申请」 on the attendee detail or the attendee list card.", zh: "小提示：在对方确认前，你可以在参会者详情或参会者卡片上点「撤回申请」撤回。" })}
        </div>
        <div className="ev-mo-ok-actions">
          {exchanged ? (
            <button className="btn ev-mo-btn-ghost ev-mo-btn-14" data-events-modal-action="schedule" onClick={() => onSchedule(person)} type="button">▦ {t({ en: "Schedule a chat", zh: "去约个时间" })}</button>
          ) : null}
          {exchanged && control.contactId ? (
            <button className="btn ev-mo-btn-ghost ev-mo-btn-14" data-events-modal-action="note" onClick={() => onNote(person)} type="button">▤ {t({ en: "Record a conversation", zh: "记录交流" })}</button>
          ) : null}
          <button className="btn ev-mo-btn-primary ev-mo-btn-14" data-events-modal-action="done" onClick={onClose} type="button">✓ {t({ en: "Done", zh: "完成" })}</button>
        </div>
      </EventModalFrame>
    );
  }

  return (
    <EventModalFrame kind="exchange" labelledBy="ev-mo-ex-title" onClose={onClose} panelClass="ev-mo-panel-gap-20" size="660" z="110">
      <EventModalHead
        closeLabel={t({ en: "Close", zh: "关闭" })}
        id="ev-mo-ex-title"
        onClose={onClose}
        sub={t({ en: "Send a request to exchange contacts. They can accept or decline it.", zh: "向对方发送请求，交换联系方式。对方可以选择接受或拒绝你的请求。" })}
        title={t({ en: "Request contact exchange", zh: "申请交换联系方式" })}
      />
      <div className="ev-mo-ex-person">
        <span aria-hidden="true" className="ev-mo-ex-avatar">{person.initial}</span>
        <span className="ev-mo-ex-copy">
          <strong className="ev-mo-ex-name">{person.name}</strong>
          <span className="ev-mo-ex-role">{roleAt(person)}</span>
          {person.topics.length ? <span className="ev-mo-ex-tags">{person.topics.slice(0, 3).map((topic, index) => <span className="ev-mo-ex-tag" key={`${index}-${topic}`}>{topic}</span>)}</span> : null}
          {person.summary ? <span className="ev-mo-ex-bio">{person.summary}</span> : null}
        </span>
      </div>
      <div className="ev-mo-ex-block">
        <strong className="ev-mo-ex-h">{t({ en: "What gets shared", zh: "将共享的联系方式" })}</strong>
        <span className="ev-mo-ex-desc">{t({ en: "If they accept, you exchange business cards: name, role and company as recorded in your Orbit profile.", zh: "如果对方接受你的请求，双方将互换名片：你在 Orbit 上的姓名、职位与公司。" })}</span>
      </div>
      <button aria-pressed={agree} className={`btn ev-mo-agree${agree ? " ev-mo-agree-on" : ""}`} data-events-modal-action="agree" onClick={() => setAgree((value) => !value)} type="button">
        <span aria-hidden="true" className="ev-mo-agree-box">{agree ? "✓" : ""}</span>
        {t({ en: "I agree to share the business card above once they accept.", zh: "我同意在对方接受请求后，向对方分享上述名片。" })}
      </button>
      {control.error ? <span className="ev-lv-error" role="alert">{control.error}</span> : null}
      {!open ? <span className="ev-mo-hint">{t({ en: "Contact requests open when the event starts.", zh: "活动开始后可申请交换。" })}</span> : null}
      {open && !agree ? <span className="ev-mo-hint" data-events-exchange-consent="required">{t({ en: "Agree to share your business card to send the request.", zh: "勾选同意分享名片后才能发送申请。" })}</span> : null}
      {control.status === "declined" ? <span className="ev-mo-hint">{t({ en: "They declined this exchange.", zh: "对方已拒绝交换。" })}</span> : null}
      {pending && !sent ? <span className="ev-mo-hint">{t({ en: "A request is already pending.", zh: "已有申请在等待对方确认。" })}</span> : null}
      <div className="ev-mo-foot-grid">
        <button className="btn ev-mo-btn-cancel" onClick={onClose} type="button">{t({ en: "Cancel", zh: "取消" })}</button>
        <button className="btn ev-mo-btn-primary ev-mo-btn-15" data-events-modal-action="send-exchange" disabled={!canSend} onClick={() => void send()} type="button">
          {control.busy ? t({ en: "Sending…", zh: "发送中…" }) : t({ en: "Send request", zh: "发送申请" })}
        </button>
      </div>
    </EventModalFrame>
  );
}
