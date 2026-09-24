"use client";

/**
 * 交换联系方式控件（设计 a.exLabel：申请交换联系方式 / ✓ 已交换；其余真实状态按既有控件语义）。
 * 任务 4 时在 event-live.tsx 内；任务 5 抽出给参会者 / 交换弹窗复用。
 * `onRequest` 给出时，「申请交换」不直接 POST，而是交给调用方打开交换弹窗（设计 a.exchange → modal）。
 */
import { useOrbitLanguage } from "../../orbit-language-context";
import type { OrbitPartyPersonView } from "../../orbit-party-route-view-model";
import { useEventContactRequest } from "./live-controls";

type Translate = (copy: { en: string; zh: string }) => string;

export function ContactAction({
  dark = false,
  eventId,
  grow = "1",
  onRequest,
  open,
  person,
  t,
}: {
  dark?: boolean;
  eventId: string;
  /** 设计 380 全部参会者卡的交换按钮是 flex:1.4。 */
  grow?: "1" | "1.4";
  onRequest?: (person: OrbitPartyPersonView) => void;
  open: boolean;
  person: OrbitPartyPersonView;
  t: Translate;
}) {
  const control = useEventContactRequest({ eventId, person, t });
  const { preserveHref } = useOrbitLanguage();
  const growClass = grow === "1.4" ? "ev-lv-btn-grow-14" : "ev-lv-btn-grow";
  const primary = dark ? `btn ev-lv-btn-dark ${growClass}` : `btn ev-lv-btn-ghost ${growClass}`;
  const label = (copy: { en: string; zh: string }) => t(copy);
  return (
    <div aria-busy={control.busy} className="ev-lv-contact" data-event-contact-participant={person.id} data-event-contact-request-id={control.requestId ?? ""}>
      {control.status === "none" || (control.status === "withdrawn" && control.direction === "outgoing") ? (
        <button
          className={primary}
          data-event-contact-action={control.status === "none" ? "request" : "request-again"}
          disabled={control.busy || !open}
          onClick={() => (onRequest ? onRequest(person) : void control.createRequest())}
          type="button"
        >
          {control.busy
            ? label({ en: "Sending…", zh: "发送中…" })
            : open
              ? control.status === "none"
                ? label({ en: "Request contact", zh: "申请交换联系方式" })
                : label({ en: "Request again", zh: "再次申请交换" })
              : label({ en: "Opens when the event starts", zh: "活动开始后可申请交换" })}
        </button>
      ) : null}
      {control.canRespond ? (
        <>
          <button className="btn ev-lv-btn-dark ev-lv-btn-grow" data-event-contact-action="accept" disabled={control.busy} onClick={() => void control.respond(true)} type="button">
            {control.busy ? label({ en: "Saving…", zh: "保存中…" }) : label({ en: "Accept", zh: "同意交换" })}
          </button>
          <button className="btn ev-lv-btn-ghost ev-lv-btn-grow" data-event-contact-action="decline" disabled={control.busy} onClick={() => void control.respond(false)} type="button">
            {label({ en: "Decline", zh: "拒绝" })}
          </button>
        </>
      ) : null}
      {control.status === "awaiting_target_consent" && !control.canRespond ? (
        <>
          <span className="ev-lv-state">{label({ en: "Waiting for their consent", zh: "等待对方确认" })}</span>
          {control.canWithdraw ? (
            <button className="btn ev-lv-btn-ghost ev-lv-btn-grow" data-event-contact-action="withdraw" disabled={control.busy} onClick={() => void control.withdraw()} type="button">
              {label({ en: "Withdraw", zh: "撤回申请" })}
            </button>
          ) : null}
        </>
      ) : null}
      {control.status === "accepted" ? (
        control.contactId ? (
          <a className={primary} data-event-contact-action="open-contact" href={preserveHref(`/app/contacts/${encodeURIComponent(control.contactId)}`)}>
            ✓ {label({ en: "Exchanged · open contact", zh: "已交换 · 打开联系人" })}
          </a>
        ) : (
          <span className="ev-lv-state">✓ {label({ en: "Exchanged", zh: "已交换" })}</span>
        )
      ) : null}
      {control.status === "declined" ? <span className="ev-lv-state">{label({ en: "Declined", zh: "对方已拒绝" })}</span> : null}
      {control.status === "withdrawn" && control.direction !== "outgoing" ? <span className="ev-lv-state">{label({ en: "Withdrawn", zh: "申请已撤回" })}</span> : null}
      {control.error ? <span className="ev-lv-error" role="alert">{control.error}</span> : null}
    </div>
  );
}
