"use client";

/**
 * 约谈时间选择弹窗。JSX 逐元素来自 docs/designs/Orbit_0918/Events.dc.html 第 744–760 行：
 * 747 标题行；748 双方卡（52 头像 / 发起人（你） / 对方）；749–756 表单栅格 130px/1fr（时区 / 日期 / 时段 / 会议形式 / 会议地点 / 附加说明）；757 底部。
 * 只有已接受（accepted）的交换可发起（`orbit-appointment-negotiation.tsx:177`）：
 *   ① `POST /api/appointments { eventContactRequestId, eventId }`（Idempotency-Key = registry.keyFor("appointment-create:<eventId>:<requestId>")）
 *   ② `POST /api/appointments/{id}/commands { command:"propose", expectedVersion:<draft.version>, proposal }`
 *      proposal = { candidateTimes[3–5]{startsAtUtc}, durationMinutes:30, timezone:Intl, medium: in_person{location:eventVenue} | video{provider:"google_meet",joinUrl:null}, note }
 *      （校验 `app/api/appointments/handlers.ts:24–34`）。
 * 偏差（记录）：设计「一天 + 一时段」单选 → 多选 ≥3（≤5）个候选时段，少于 3 时按钮禁用并提示；日期 = 从今天起 5 个真实 JST 日历日；
 * 时区行 = Intl 时区（无下拉）；会议地点 = 现场 → 活动场地（无 ×），线上 → Google Meet 说明；时长固定 30 分钟。
 */
import { useMemo, useRef, useState } from "react";

import { createAppointmentActionIdempotencyRegistry } from "../../../../../features/appointments/client-idempotency";
import type { OrbitPartyMeView, OrbitPartyPersonView } from "../../orbit-party-route-view-model";
import {
  SCHEDULE_DURATION_MINUTES,
  SCHEDULE_MAX_CANDIDATES,
  SCHEDULE_MIN_CANDIDATES,
  SCHEDULE_SLOTS,
  candidateKey,
  candidateTimesFrom,
  canSendSchedule,
  scheduleDays,
  slotStartsAtUtc,
  type EventListLanguage,
} from "./events-model";
import { EventModalFrame, EventModalHead } from "./event-modal-frame";
import { useEventContactRequest } from "./live-controls";

type Translate = (copy: { en: string; zh: string }) => string;
type Medium = "in_person" | "video";

export interface ScheduleModalProps {
  eventId: string;
  eventVenue: string;
  language: EventListLanguage;
  me: Pick<OrbitPartyMeView, "initial" | "name" | "role">;
  now: number;
  onClose: () => void;
  onSent: (person: OrbitPartyPersonView) => void;
  person: OrbitPartyPersonView;
  t: Translate;
}

function roleDot(person: Pick<OrbitPartyPersonView, "title" | "company">): string {
  return [person.title, person.company].filter((value) => value && value.trim()).join(" · ");
}

function messageFrom(value: unknown, fallback: string): string {
  if (typeof value === "object" && value !== null && "error" in value) {
    const error = (value as { error?: { message?: unknown } }).error;
    if (error && typeof error.message === "string") return error.message;
  }
  return fallback;
}

export function EventScheduleModal({ eventId, eventVenue, language, me, now, onClose, onSent, person, t }: ScheduleModalProps) {
  const control = useEventContactRequest({ eventId, person, t });
  const days = useMemo(() => scheduleDays(now, language), [language, now]);
  const [dayIndex, setDayIndex] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [medium, setMedium] = useState<Medium>("in_person");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const registry = useRef<ReturnType<typeof createAppointmentActionIdempotencyRegistry> | null>(null);
  registry.current ??= createAppointmentActionIdempotencyRegistry();
  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", []);

  const accepted = control.status === "accepted";
  const requestId = control.requestId;
  const enabled = accepted && Boolean(requestId);
  const day = days[dayIndex] ?? days[0];
  const count = selected.length;
  const canSend = enabled && !busy && canSendSchedule(count);

  function toggle(slot: string) {
    const key = candidateKey(day.iso, slot);
    setSelected((current) => {
      if (current.includes(key)) return current.filter((value) => value !== key);
      if (current.length >= SCHEDULE_MAX_CANDIDATES) return current;
      return [...current, key];
    });
  }

  async function send() {
    if (!canSend || !requestId) return;
    setBusy(true);
    setError("");
    try {
      const keyFor = registry.current!.keyFor.bind(registry.current);
      const createResponse = await fetch("/api/appointments", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": keyFor(`appointment-create:${eventId}:${requestId}`) },
        body: JSON.stringify({ eventContactRequestId: requestId, eventId }),
      });
      const created = (await createResponse.json().catch(() => ({}))) as { data?: { appointmentId: string; version: number } };
      if (!createResponse.ok || !created.data) {
        throw new Error(messageFrom(created, t({ en: "Only an accepted business-card exchange can start an appointment.", zh: "只有已接受的名片交换才能发起约谈。" })));
      }
      const proposal = {
        candidateTimes: candidateTimesFrom(selected),
        durationMinutes: SCHEDULE_DURATION_MINUTES,
        medium: medium === "in_person"
          ? { kind: "in_person" as const, location: eventVenue }
          : { kind: "video" as const, provider: "google_meet" as const, joinUrl: null },
        note: note.trim(),
        timezone,
      };
      const body = { proposal };
      const commandResponse = await fetch(`/api/appointments/${encodeURIComponent(created.data.appointmentId)}/commands`, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": keyFor(`appointment:${created.data.appointmentId}:${created.data.version}:propose:${JSON.stringify(body)}`) },
        body: JSON.stringify({ ...body, command: "propose", expectedVersion: created.data.version }),
      });
      const commanded = (await commandResponse.json().catch(() => ({}))) as { data?: unknown };
      if (!commandResponse.ok || !commanded.data) {
        throw new Error(messageFrom(commanded, t({ en: "Review the candidate times and meeting details, then retry.", zh: "请检查候选时间和约谈信息后重试。" })));
      }
      onSent(person);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t({ en: "The invitation could not be sent.", zh: "邀约未能发送。" }));
    } finally {
      setBusy(false);
    }
  }

  const modes: { key: Medium; title: { en: string; zh: string }; desc: { en: string; zh: string } }[] = [
    { key: "in_person", title: { en: "In person", zh: "现场会议" }, desc: { en: "Meet face to face at the venue", zh: "在活动现场进行面对面交流" } },
    { key: "video", title: { en: "Video call", zh: "线上会议" }, desc: { en: "Talk over a video call", zh: "通过视频会议进行交流" } },
  ];

  return (
    <EventModalFrame kind="schedule" labelledBy="ev-mo-sch-title" onClose={onClose} panelClass="ev-mo-panel-gap-20" size="680" z="120">
      <EventModalHead
        closeLabel={t({ en: "Close", zh: "关闭" })}
        id="ev-mo-sch-title"
        onClose={onClose}
        sub={t({ en: "Offer a few times for a one-to-one chat. The appointment takes effect once they confirm.", zh: "选择几个合适的时间邀请对方进行一对一交流。发送后，等待对方确认后生效。" })}
        title={t({ en: "Pick a time", zh: "约谈时间选择" })}
      />
      <div className="ev-mo-sch-pair">
        <span className="ev-mo-sch-person">
          <span aria-hidden="true" className="ev-mo-sch-avatar">{me.initial}</span>
          <span className="ev-mo-sch-person-copy"><span className="ev-mo-sch-person-label">{t({ en: "Host (you)", zh: "发起人（你）" })}</span><strong className="ev-mo-sch-person-name">{me.name}</strong><span className="ev-mo-sch-person-label">{me.role}</span></span>
        </span>
        <span aria-hidden="true" className="ev-mo-sch-swap">⇄</span>
        <span className="ev-mo-sch-person">
          <span aria-hidden="true" className="ev-mo-sch-avatar">{person.initial}</span>
          <span className="ev-mo-sch-person-copy"><span className="ev-mo-sch-person-label">{t({ en: "Guest", zh: "对方" })}</span><strong className="ev-mo-sch-person-name">{person.name}</strong><span className="ev-mo-sch-person-label">{roleDot(person)}</span></span>
        </span>
      </div>
      <div className="ev-mo-sch-grid">
        <span className="ev-mo-sch-label">◎ {t({ en: "Time zone", zh: "时区设置" })}</span>
        <span className="ev-mo-sch-field" data-events-schedule-timezone={timezone}>{timezone}</span>

        <span className="ev-mo-sch-label">▦ {t({ en: "Date", zh: "选择日期" })}</span>
        <div className="ev-mo-sch-days">
          <span aria-hidden="true" className="ev-mo-sch-arrow ev-mo-sch-arrow-muted">‹</span>
          {days.map((item, index) => {
            const on = index === dayIndex;
            const picked = selected.filter((key) => key.startsWith(`${item.iso} `)).length;
            return (
              <button aria-pressed={on} className={`btn ev-mo-sch-day${on ? " ev-mo-sch-day-on" : ""}`} data-events-schedule-day={item.iso} key={item.iso} onClick={() => setDayIndex(index)} type="button">
                <span className="ev-mo-sch-day-sub">{item.month}</span>
                <strong className="ev-mo-sch-day-n">{item.day}</strong>
                <span className="ev-mo-sch-day-sub">{picked ? `${item.weekday} · ${picked}` : item.weekday}</span>
              </button>
            );
          })}
          <span aria-hidden="true" className="ev-mo-sch-arrow">›</span>
        </div>

        <span className="ev-mo-sch-label">◷ {t({ en: "Time slots", zh: "可选时间段" })}</span>
        <div className="ev-mo-sch-slots-wrap">
          <div className="ev-mo-sch-slots">
            {SCHEDULE_SLOTS.map((slot) => {
              const key = candidateKey(day.iso, slot);
              const on = selected.includes(key);
              const past = Date.parse(slotStartsAtUtc(day.iso, slot)) <= now;
              const full = !on && count >= SCHEDULE_MAX_CANDIDATES;
              return (
                <button aria-pressed={on} className={`btn ev-mo-sch-slot${on ? " ev-mo-sch-slot-on" : ""}`} data-events-schedule-slot={key} disabled={!enabled || past || full} key={slot} onClick={() => toggle(slot)} type="button">{slot}</button>
              );
            })}
          </div>
          <span className={`ev-mo-hint${count < SCHEDULE_MIN_CANDIDATES ? " ev-mo-hint-warn" : ""}`} data-events-schedule-count={count}>
            {t({
              en: `${count} selected · choose ${SCHEDULE_MIN_CANDIDATES}–${SCHEDULE_MAX_CANDIDATES} candidate times (JST) across the days above`,
              zh: `已选 ${count} 个时段 · 请在上方日期中选择 ${SCHEDULE_MIN_CANDIDATES}–${SCHEDULE_MAX_CANDIDATES} 个候选时段（JST）`,
            })}
          </span>
        </div>

        <span className="ev-mo-sch-label">▣ {t({ en: "Format", zh: "会议形式" })}</span>
        <div className="ev-mo-sch-modes">
          {modes.map((mode) => {
            const on = medium === mode.key;
            return (
              <button aria-pressed={on} className={`btn ev-mo-sch-mode${on ? " ev-mo-sch-mode-on" : ""}`} data-events-schedule-medium={mode.key} key={mode.key} onClick={() => setMedium(mode.key)} type="button">
                <span aria-hidden="true" className="ev-mo-sch-radio"><span className="ev-mo-sch-radio-dot" /></span>
                <span className="ev-mo-sch-mode-copy"><strong className="ev-mo-sch-mode-title">{t(mode.title)}</strong><span className="ev-mo-sch-mode-desc">{t(mode.desc)}</span></span>
              </button>
            );
          })}
        </div>

        <span className="ev-mo-sch-label">◎ {t({ en: "Location", zh: "会议地点" })}</span>
        <span className="ev-mo-sch-field">{medium === "in_person" ? (eventVenue || t({ en: "Event venue", zh: "活动现场" })) : t({ en: "Google Meet — the link is created after both confirm", zh: "Google Meet（双方确认后生成链接）" })}</span>

        <label className="ev-mo-sch-label" htmlFor="ev-mo-sch-note">▤ {t({ en: "Note (optional)", zh: "附加说明（可选）" })}</label>
        <div className="ev-mo-textarea-wrap">
          <textarea className="ev-mo-textarea" id="ev-mo-sch-note" maxLength={300} onChange={(event) => setNote(event.target.value)} rows={3} value={note} />
          <span className="ev-mo-counter">{note.length}/300</span>
        </div>
      </div>
      {!accepted ? <span className="ev-mo-hint ev-mo-hint-warn" role="status">{t({ en: "Only an accepted business-card exchange can start an appointment.", zh: "只有已接受的名片交换才能发起约谈。" })}</span> : null}
      {error ? <span className="ev-lv-error" role="alert">{error}</span> : null}
      <div className="ev-mo-foot-row">
        <span className="ev-mo-foot-note">ⓘ {t({ en: "The invitation takes effect once they confirm. You will be notified by email and in Orbit.", zh: "发送邀约后，等待对方确认后生效。你会收到邮件和站内通知。" })}</span>
        <span className="ev-mo-foot-actions">
          <button className="btn ev-mo-btn-cancel ev-mo-btn-sm" onClick={onClose} type="button">{t({ en: "Cancel", zh: "取消" })}</button>
          <button className="btn ev-mo-btn-primary ev-mo-btn-sm" data-events-modal-action="send-schedule" disabled={!canSend} onClick={() => void send()} type="button">
            {busy ? t({ en: "Sending…", zh: "发送中…" }) : t({ en: "Send invitation", zh: "发送邀约" })}
          </button>
        </span>
      </div>
    </EventModalFrame>
  );
}
