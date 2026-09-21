"use client";

/**
 * 参会者详情弹窗。JSX 逐元素来自 docs/designs/Orbit_0918/Events.dc.html 第 675–701 行：
 * 678 标题行；679–689 头部（140 头像 / 名字 28 / 职位 / 公司 / 信息行 / 标签 / 右侧「本次活动参会」卡 / 简介段）；
 * 690–695 四卡（我能提供 / 我正在寻找 / 想聊的话题 / AI 推荐理由）；696 当前关系状态；697 三按钮；698 提示。
 * 数据 = 真实 `OrbitPartyPersonView`（无 bio / city；summary 作简介，industry 放信息行）。
 * 省略（无来源 / 无 API）：● 在线、⇢ 公司官网、in LinkedIn、···、「● 对方愿意被联系 / 通常会在 1–2 天内回复」、➶ 打招呼。
 * 按钮：申请交换联系方式（按真实 contactRequestStatus 文案 / 禁用；none → 交换弹窗；accepted →「✓ 已交换」打开交换成功态，设计 a.exLabel 同一入口）、
 * 约谈（仅 accepted）、记录交流（仅有 contactId）。
 */
import type { OrbitPartyPersonView } from "../../orbit-party-route-view-model";
import { contactStatusCopy } from "./events-model";
import { EventModalFrame, EventModalHead } from "./event-modal-frame";
import { useEventContactRequest } from "./live-controls";

type Translate = (copy: { en: string; zh: string }) => string;

export interface AttendeeModalProps {
  eventDate: string;
  eventId: string;
  eventName: string;
  onClose: () => void;
  onExchange: (person: OrbitPartyPersonView) => void;
  onNote: (person: OrbitPartyPersonView) => void;
  onSchedule: (person: OrbitPartyPersonView) => void;
  /** 交换申请是否开放（活动开始后）。 */
  open: boolean;
  person: OrbitPartyPersonView;
  t: Translate;
}

function lines(value: string): string[] {
  return value.split(/\r?\n|；|;/u).map((line) => line.trim()).filter(Boolean);
}

function InfoCard({ icon, items, title }: { icon: string; items: readonly string[]; title: string }) {
  if (!items.length) return null;
  return (
    <div className="ev-mo-att-card">
      <span className="ev-mo-att-card-head"><span className="ev-mo-att-card-icon">{icon}</span><strong className="ev-mo-att-card-title">{title}</strong></span>
      <span className="ev-mo-att-card-body">{items.map((item, index) => <span className="ev-mo-att-card-line" key={`${index}-${item}`}>• {item}</span>)}</span>
    </div>
  );
}

export function EventAttendeeModal({ eventDate, eventId, eventName, onClose, onExchange, onNote, onSchedule, open, person, t }: AttendeeModalProps) {
  const control = useEventContactRequest({ eventId, person, t });
  const status = contactStatusCopy(control.status, control.direction, Boolean(control.contactId));
  const canRequest = status.canRequest && open;
  const accepted = control.status === "accepted";
  return (
    <EventModalFrame kind="attendee" labelledBy="ev-mo-att-title" onClose={onClose} size="800" z="100">
      <EventModalHead closeLabel={t({ en: "Close", zh: "关闭" })} id="ev-mo-att-title" onClose={onClose} title={t({ en: "Attendee", zh: "参会者详情" })} titleSize="22" />
      <div className="ev-mo-att-hero">
        <span aria-hidden="true" className="ev-mo-att-avatar">{person.initial}</span>
        <div className="ev-mo-att-copy">
          <span className="ev-mo-att-name-row">
            <strong className="ev-mo-att-name">{person.name}</strong>
            {person.isRecommended && person.score > 0 ? <span className="ev-mo-att-score">✦ {t({ en: `${person.score}% match`, zh: `${person.score}% 匹配` })}</span> : null}
          </span>
          {person.title ? <span className="ev-mo-att-line">{person.title}</span> : null}
          {person.company ? <span className="ev-mo-att-line">{person.company}</span> : null}
          {person.industry ? <span className="ev-mo-att-meta"><span>◎ {person.industry}</span></span> : null}
          {person.topics.length ? <span className="ev-mo-att-tags">{person.topics.map((topic, index) => <span className="ev-mo-att-tag" key={`${index}-${topic}`}>{topic}</span>)}</span> : null}
        </div>
        <div className="ev-mo-att-side">
          <div className="ev-mo-att-event">
            <span className="ev-mo-att-event-label">▦ {t({ en: "Attending this event", zh: "本次活动参会" })}</span>
            <span className="ev-mo-att-event-line">{eventName}</span>
            <span className="ev-mo-att-event-line">{eventDate}</span>
          </div>
        </div>
        {person.summary ? <p className="ev-mo-att-bio">{person.summary}</p> : null}
      </div>
      <div className="ev-mo-att-cards">
        <InfoCard icon="◎" items={lines(person.offering)} title={t({ en: "I can offer", zh: "我能提供" })} />
        <InfoCard icon="⌕" items={lines(person.seeking)} title={t({ en: "I am looking for", zh: "我正在寻找" })} />
        <InfoCard icon="▤" items={person.topics} title={t({ en: "Topics to discuss", zh: "想聊的话题" })} />
        {person.isRecommended && person.reason ? <InfoCard icon="✦" items={lines(person.reason)} title={t({ en: "Why we recommend", zh: "AI 推荐理由" })} /> : null}
      </div>
      <div className="ev-mo-att-status" data-events-contact-status={control.status}>
        <span className="ev-mo-att-status-icon">◎</span>
        <span className="ev-mo-att-status-copy">
          <strong className="ev-mo-att-status-title">{t({ en: "Relationship", zh: "当前关系状态" })}</strong>
          <span className="ev-mo-att-status-line">{t(status.line)}</span>
          <span className="ev-mo-att-status-hint">{t({ en: "After you send a request, they are notified. If they accept, you exchange business cards.", zh: "发送交换申请后，对方将收到通知。若对方同意，你们将互换名片。" })}</span>
        </span>
      </div>
      <div className="ev-mo-att-actions">
        {control.canRespond ? (
          <>
            <button className="btn ev-mo-btn-primary" data-events-modal-action="accept" disabled={control.busy} onClick={() => void control.respond(true)} type="button">{control.busy ? t({ en: "Saving…", zh: "保存中…" }) : t({ en: "Accept exchange", zh: "同意交换" })}</button>
            <button className="btn ev-mo-btn-ghost" data-events-modal-action="decline" disabled={control.busy} onClick={() => void control.respond(false)} type="button">{t({ en: "Decline", zh: "拒绝" })}</button>
          </>
        ) : (
          <button
            className="btn ev-mo-btn-primary"
            data-events-modal-action="exchange"
            disabled={(!canRequest && !accepted) || control.busy}
            onClick={() => onExchange(person)}
            type="button"
          >
            {open || !status.canRequest ? t(status.action) : t({ en: "Opens when the event starts", zh: "活动开始后可申请交换" })}
          </button>
        )}
        {accepted ? (
          <button className="btn ev-mo-btn-ghost" data-events-modal-action="schedule" onClick={() => onSchedule(person)} type="button">▦ {t({ en: "Schedule a chat", zh: "约个时间" })}</button>
        ) : null}
        {control.contactId ? (
          <button className="btn ev-mo-btn-ghost" data-events-modal-action="note" onClick={() => onNote(person)} type="button">▤ {t({ en: "Record a conversation", zh: "记录交流" })}</button>
        ) : null}
        {control.error ? <span className="ev-lv-error" role="alert">{control.error}</span> : null}
      </div>
      <span className="ev-mo-att-foot">◈ {t({ en: "Your request carries this event's context. Please respect the other person's time and wishes.", zh: "你的请求将附带本次活动的背景信息。请尊重对方的时间与意愿，文明交流。" })}</span>
    </EventModalFrame>
  );
}
