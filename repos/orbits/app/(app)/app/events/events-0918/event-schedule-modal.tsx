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
 * 时区行 = 固定 Asia/Tokyo (JST)（时段按 JST 计算，proposal.timezone 同值；无下拉）；会议地点 = 现场 → 活动场地（无 ×），线上 → Google Meet 说明；时长固定 30 分钟。
 * 打开时先 `GET /api/appointments`（no-store）找同一 authorityRequestId + eventId 且非 cancelled / completed 的约谈（同 `orbit-appointment-negotiation.tsx` load）：
 *   draft → 跳过 ①，② 的 expectedVersion = draft.version；其余状态 → 只渲染现状摘要 + 「查看约谈」链接（`/app/contacts/<contactId>?appointmentId=&eventId=`，既有协商面），不再创建。
 *   ①/② 返回 APPOINTMENT_CONFLICT（featureCode 或 409）→ 「已有进行中的约谈」+ 同一链接。
 */
import { useEffect, useMemo, useRef, useState } from "react";

import { createAppointmentActionIdempotencyRegistry } from "../../../../../features/appointments/client-idempotency";
import type { AppointmentStatus } from "../../../../../features/appointments/contract";
import type { OrbitPartyMeView, OrbitPartyPersonView } from "../../orbit-party-route-view-model";
import {
  SCHEDULE_DURATION_MINUTES,
  formatJstStamp,
  SCHEDULE_TIMEZONE,
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

/** `GET /api/appointments` 单项（`app/api/appointments/handlers.ts` publicAppointment 的子集）。 */
export interface ExistingAppointment {
  appointmentId: string;
  authorityRequestId: string;
  confirmed: { startsAtUtc: string } | null;
  contactId: string | null;
  eventId: string | null;
  proposals: readonly { candidateTimes: readonly { startsAtUtc: string }[] }[];
  status: AppointmentStatus;
  version: number;
}

const ACTIVE_APPOINTMENT_END: readonly AppointmentStatus[] = ["cancelled", "completed"];

/** 同一交换 + 同一活动的进行中约谈（cancelled / completed 视为无）。 */
export function findActiveAppointment(list: readonly ExistingAppointment[], requestId: string, eventId: string): ExistingAppointment | null {
  return list.find((item) => item.authorityRequestId === requestId && item.eventId === eventId && !ACTIVE_APPOINTMENT_END.includes(item.status)) ?? null;
}

function isConflict(value: unknown, status: number): boolean {
  if (status === 409) return true;
  if (typeof value !== "object" || value === null || !("error" in value)) return false;
  const error = (value as { error?: { context?: { featureCode?: unknown } } }).error;
  return error?.context?.featureCode === "APPOINTMENT_CONFLICT";
}

class ScheduleConflictError extends Error {
  constructor() { super("APPOINTMENT_CONFLICT"); this.name = "ScheduleConflictError"; }
}

export function appointmentReviewHref(contactId: string, appointmentId: string, eventId: string): string {
  return `/app/contacts/${encodeURIComponent(contactId)}?appointmentId=${encodeURIComponent(appointmentId)}&eventId=${encodeURIComponent(eventId)}`;
}

const APPOINTMENT_STATUS_COPY: Record<Exclude<AppointmentStatus, "draft" | "cancelled" | "completed">, { en: string; zh: string }> = {
  awaiting_response: { en: "Invitation sent — waiting for their reply", zh: "邀约已发送，等待对方回复" },
  negotiating: { en: "Negotiating times", zh: "正在协商时间" },
  confirmed: { en: "Appointment confirmed", zh: "约谈已确认" },
  reschedule_pending: { en: "Reschedule pending", zh: "改期待确认" },
};

/** 现状摘要里的候选时间：已确认 → 那一条；否则最新一轮提案的候选时段。 */
export function appointmentCandidateTimes(appointment: Pick<ExistingAppointment, "confirmed" | "proposals">): string[] {
  if (appointment.confirmed) return [appointment.confirmed.startsAtUtc];
  const latest = appointment.proposals[appointment.proposals.length - 1];
  return latest ? latest.candidateTimes.map((candidate) => candidate.startsAtUtc) : [];
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
  const [existing, setExisting] = useState<ExistingAppointment | null>(null);
  const [lookup, setLookup] = useState<"idle" | "loading" | "ready" | "failed">("idle");
  const [conflict, setConflict] = useState(false);
  const registry = useRef<ReturnType<typeof createAppointmentActionIdempotencyRegistry> | null>(null);
  registry.current ??= createAppointmentActionIdempotencyRegistry();
  // 时段按 JST 计算 → 发送的 timezone 也固定为 Asia/Tokyo（不用浏览器 Intl 时区，保持一致）。
  const timezone = SCHEDULE_TIMEZONE;

  const accepted = control.status === "accepted";
  const requestId = control.requestId;
  const enabled = accepted && Boolean(requestId) && lookup !== "loading";
  const day = days[dayIndex] ?? days[0];
  const count = selected.length;
  const canSend = enabled && !busy && canSendSchedule(count);

  async function lookupExisting(): Promise<ExistingAppointment | null> {
    if (!requestId) return null;
    const response = await fetch("/api/appointments", { cache: "no-store" });
    const body = (await response.json().catch(() => ({}))) as { data?: unknown };
    if (!response.ok || !Array.isArray(body.data)) throw new Error("appointments-unavailable");
    return findActiveAppointment(body.data as ExistingAppointment[], requestId, eventId);
  }

  useEffect(() => {
    if (!accepted || !requestId) return;
    let cancelled = false;
    setLookup("loading");
    lookupExisting()
      .then((found) => { if (!cancelled) { setExisting(found); setLookup("ready"); } })
      .catch(() => { if (!cancelled) setLookup("failed"); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accepted, eventId, requestId]);

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
      let draft: { appointmentId: string; version: number };
      if (existing?.status === "draft") {
        // 已有草稿 → 跳过创建，直接在草稿版本上提案。
        draft = { appointmentId: existing.appointmentId, version: existing.version };
      } else {
        const createResponse = await fetch("/api/appointments", {
          method: "POST",
          headers: { "content-type": "application/json", "idempotency-key": keyFor(`appointment-create:${eventId}:${requestId}`) },
          body: JSON.stringify({ eventContactRequestId: requestId, eventId }),
        });
        const created = (await createResponse.json().catch(() => ({}))) as { data?: { appointmentId: string; version: number } };
        if (!createResponse.ok || !created.data) {
          if (isConflict(created, createResponse.status)) throw new ScheduleConflictError();
          throw new Error(messageFrom(created, t({ en: "Only an accepted business-card exchange can start an appointment.", zh: "只有已接受的名片交换才能发起约谈。" })));
        }
        draft = created.data;
      }
      const proposal = {
        candidateTimes: candidateTimesFrom(selected),
        durationMinutes: SCHEDULE_DURATION_MINUTES,
        medium: medium === "in_person"
          ? { kind: "in_person" as const, location: eventVenue || venueFallback }
          : { kind: "video" as const, provider: "google_meet" as const, joinUrl: null },
        note: note.trim(),
        timezone,
      };
      const body = { proposal };
      const commandResponse = await fetch(`/api/appointments/${encodeURIComponent(draft.appointmentId)}/commands`, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": keyFor(`appointment:${draft.appointmentId}:${draft.version}:propose:${JSON.stringify(body)}`) },
        body: JSON.stringify({ ...body, command: "propose", expectedVersion: draft.version }),
      });
      const commanded = (await commandResponse.json().catch(() => ({}))) as { data?: unknown };
      if (!commandResponse.ok || !commanded.data) {
        if (isConflict(commanded, commandResponse.status)) throw new ScheduleConflictError();
        throw new Error(messageFrom(commanded, t({ en: "Review the candidate times and meeting details, then retry.", zh: "请检查候选时间和约谈信息后重试。" })));
      }
      onSent(person);
    } catch (cause) {
      if (cause instanceof ScheduleConflictError) {
        // 已有进行中的约谈：重新读取现状，摘要视图给出「查看约谈」链接。
        setConflict(true);
        setError("");
        try { setExisting(await lookupExisting()); } catch { /* 摘要退化为无链接 */ }
      } else {
        setError(cause instanceof Error ? cause.message : t({ en: "The invitation could not be sent.", zh: "邀约未能发送。" }));
      }
    } finally {
      setBusy(false);
    }
  }

  const venueFallback = t({ en: "Event venue", zh: "活动现场" });
  const modes: { key: Medium; title: { en: string; zh: string }; desc: { en: string; zh: string } }[] = [
    { key: "in_person", title: { en: "In person", zh: "现场会议" }, desc: { en: "Meet face to face at the venue", zh: "在活动现场进行面对面交流" } },
    { key: "video", title: { en: "Video call", zh: "线上会议" }, desc: { en: "Talk over a video call", zh: "通过视频会议进行交流" } },
  ];

  const reviewContactId = existing?.contactId ?? control.contactId;
  const activeAppointment = existing && existing.status !== "draft" ? existing : null;
  const reviewHref = activeAppointment && reviewContactId ? appointmentReviewHref(reviewContactId, activeAppointment.appointmentId, eventId) : null;
  const reviewLabel = t({ en: "Review the appointment", zh: "查看约谈" });

  if (activeAppointment || conflict) {
    const candidates = activeAppointment ? appointmentCandidateTimes(activeAppointment) : [];
    return (
      <EventModalFrame kind="schedule" labelledBy="ev-mo-sch-title" onClose={onClose} panelClass="ev-mo-panel-gap-20" size="680" z="120">
        <EventModalHead
          closeLabel={t({ en: "Close", zh: "关闭" })}
          id="ev-mo-sch-title"
          onClose={onClose}
          sub={t({ en: "An appointment with this person is already in progress.", zh: "你与对方已有进行中的约谈。" })}
          title={t({ en: "Appointment in progress", zh: "已有进行中的约谈" })}
        />
        <div className="ev-mo-att-status" data-events-schedule-existing={activeAppointment?.status ?? "conflict"} role="status">
          <span className="ev-mo-att-status-icon">▦</span>
          <span className="ev-mo-att-status-copy">
            <strong className="ev-mo-att-status-title">
              {activeAppointment ? t(APPOINTMENT_STATUS_COPY[activeAppointment.status as keyof typeof APPOINTMENT_STATUS_COPY] ?? { en: activeAppointment.status, zh: activeAppointment.status }) : t({ en: "An appointment is already in progress", zh: "已有进行中的约谈" })}
            </strong>
            {candidates.length ? (
              <span className="ev-mo-att-status-line">
                {activeAppointment?.confirmed ? t({ en: "Confirmed time: ", zh: "已确认时间：" }) : t({ en: "Candidate times: ", zh: "候选时间：" })}
                {candidates.map((iso) => formatJstStamp(iso, language)).join(" · ")}
              </span>
            ) : null}
            <span className="ev-mo-att-status-hint">{t({ en: "Continue the negotiation on the contact page.", zh: "请在联系人页继续协商或查看进度。" })}</span>
          </span>
        </div>
        {reviewHref ? (
          <a className="ev-mo-ok-contact" data-events-modal-action="review-appointment" href={reviewHref}>▦ {reviewLabel} →</a>
        ) : null}
        <div className="ev-mo-foot-row">
          <span className="ev-mo-foot-note">ⓘ {t({ en: "One appointment per exchange at a time.", zh: "同一交换同一时间只能有一个进行中的约谈。" })}</span>
          <span className="ev-mo-foot-actions">
            <button className="btn ev-mo-btn-cancel ev-mo-btn-sm" onClick={onClose} type="button">{t({ en: "Close", zh: "关闭" })}</button>
          </span>
        </div>
      </EventModalFrame>
    );
  }

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
        <span className="ev-mo-sch-field" data-events-schedule-timezone={timezone}>{t({ en: `Time zone ${timezone} (JST)`, zh: `时区 ${timezone} (JST)` })}</span>

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
          <span className={`ev-mo-hint${count > 0 && count < SCHEDULE_MIN_CANDIDATES ? " ev-mo-hint-warn" : ""}`} data-events-schedule-count={count}>
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
        <span className="ev-mo-sch-field">{medium === "in_person" ? (eventVenue || venueFallback) : t({ en: "Google Meet — the link is created after both confirm", zh: "Google Meet（双方确认后生成链接）" })}</span>

        <label className="ev-mo-sch-label" htmlFor="ev-mo-sch-note">▤ {t({ en: "Note (optional)", zh: "附加说明（可选）" })}</label>
        <div className="ev-mo-textarea-wrap">
          <textarea className="ev-mo-textarea" id="ev-mo-sch-note" maxLength={300} onChange={(event) => setNote(event.target.value)} rows={3} value={note} />
          <span className="ev-mo-counter">{note.length}/300</span>
        </div>
      </div>
      {!accepted ? <span className="ev-mo-hint ev-mo-hint-warn" role="status">{t({ en: "Only an accepted business-card exchange can start an appointment.", zh: "只有已接受的名片交换才能发起约谈。" })}</span> : null}
      {lookup === "loading" ? <span className="ev-mo-hint" role="status">{t({ en: "Checking existing appointments…", zh: "正在检查已有约谈…" })}</span> : null}
      {lookup === "failed" ? <span className="ev-mo-hint" role="status">{t({ en: "Could not check existing appointments; sending will report a conflict if one exists.", zh: "未能检查已有约谈；若已存在，发送时会提示。" })}</span> : null}
      {existing?.status === "draft" ? <span className="ev-mo-hint" data-events-schedule-draft={existing.appointmentId} role="status">{t({ en: "Continuing your saved draft.", zh: "将在已保存的草稿上继续。" })}</span> : null}
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
