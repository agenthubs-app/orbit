"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createAppointmentActionIdempotencyRegistry } from "../../../../../features/appointments/client-idempotency";
import { useOrbitLanguage } from "../../orbit-language-context";

type AppointmentView = {
  appointmentId: string;
  authorityRequestId: string;
  confirmed: null | {
    candidateId: string;
    durationMinutes: number;
    medium: { kind: string };
    proposalRevision: number;
    startsAtUtc: string;
    timezone: string;
  };
  contactId: string;
  eventId: string | null;
  pendingProposalRevision: number | null;
  projection: {
    calendar: "pending" | "not_synced" | "synced" | "failed";
    meeting: "pending" | "not_synced" | "synced" | "failed";
    revision: number | null;
  };
  proposals: readonly {
    candidateTimes: readonly { candidateId: string; startsAtUtc: string }[];
    durationMinutes: number;
    medium: { kind: "in_person" | "video" | "phone" };
    note: string;
    proposedBy: "you" | "other";
    revision: number;
    timezone: string;
  }[];
  status: "draft" | "awaiting_response" | "negotiating" | "confirmed" | "reschedule_pending" | "cancelled" | "completed";
  version: number;
};

function messageFrom(value: unknown): string {
  if (value && typeof value === "object" && "error" in value && value.error && typeof value.error === "object" && "message" in value.error && typeof value.error.message === "string") return value.error.message;
  return "appointment-request-failed";
}

type AppointmentUiErrorCode = "APPOINTMENT_CONFLICT" | "APPOINTMENT_FORBIDDEN" | "APPOINTMENT_INVALID_INPUT" | "APPOINTMENT_INVALID_TRANSITION" | "APPOINTMENT_REQUEST_FAILED" | "APPOINTMENT_TIME_GATED" | "APPOINTMENT_UNAVAILABLE";

class AppointmentUiError extends Error {
  constructor(readonly code: AppointmentUiErrorCode) { super(code); }
}

function safeErrorCode(value: unknown, status: number): AppointmentUiErrorCode {
  const featureCode = value && typeof value === "object" && "error" in value && value.error && typeof value.error === "object" && "context" in value.error && value.error.context && typeof value.error.context === "object" && "featureCode" in value.error.context ? value.error.context.featureCode : null;
  if (featureCode === "APPOINTMENT_TIME_GATED") return "APPOINTMENT_TIME_GATED";
  if (featureCode === "APPOINTMENT_INVALID_TRANSITION") return "APPOINTMENT_INVALID_TRANSITION";
  if (featureCode === "APPOINTMENT_CONFLICT") return "APPOINTMENT_CONFLICT";
  if (featureCode === "APPOINTMENT_FORBIDDEN" || status === 403) return "APPOINTMENT_FORBIDDEN";
  if (status === 409) return "APPOINTMENT_CONFLICT";
  if (status === 400) return "APPOINTMENT_INVALID_INPUT";
  if (status === 503) return "APPOINTMENT_UNAVAILABLE";
  return "APPOINTMENT_REQUEST_FAILED";
}

export function appointmentCompletionGate(
  confirmed: AppointmentView["confirmed"],
  nowMs: number,
): { availableAtMs: number | null; enabled: boolean } {
  if (!confirmed) return { availableAtMs: null, enabled: false };
  const startsAtMs = Date.parse(confirmed.startsAtUtc);
  const availableAtMs = startsAtMs + confirmed.durationMinutes * 60_000;
  return { availableAtMs, enabled: Number.isFinite(availableAtMs) && nowMs >= availableAtMs };
}

function localInputToUtc(value: string): string | null {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function localDateTimeValue(date: Date): string {
  const offsetAdjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetAdjusted.toISOString().slice(0, 16);
}

function ProposalForm({ busy, counter, onSubmit }: { busy: boolean; counter: boolean; onSubmit: (value: { candidateTimes: { startsAtUtc: string }[]; durationMinutes: number; medium: { kind: "video"; provider: "google_meet"; joinUrl: null }; note: string; timezone: string }) => Promise<void> }) {
  const { t } = useOrbitLanguage();
  const [slots, setSlots] = useState(["", "", ""]);
  const [duration, setDuration] = useState(45);
  const [note, setNote] = useState("");
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const parsed = slots.map(localInputToUtc);
  return (
    <form onSubmit={(event) => { event.preventDefault(); if (parsed.every((value): value is string => Boolean(value))) void onSubmit({ candidateTimes: parsed.map((startsAtUtc) => ({ startsAtUtc })), durationMinutes: duration, medium: { kind: "video", provider: "google_meet", joinUrl: null }, note, timezone }); }} style={{ display: "grid", gap: 9 }}>
      <strong style={{ fontSize: 13 }}>{counter ? t({ en: "Counter with 3 times", zh: "反提 3 个时间" }) : t({ en: "Propose 3 times", zh: "提议 3 个时间" })}</strong>
      {slots.map((slot, index) => <input aria-label={t({ en: `Candidate ${index + 1}`, zh: `候选时间 ${index + 1}` })} className="field" key={index} min={localDateTimeValue(new Date(Date.now() + 30 * 60_000))} onChange={(event) => setSlots((values) => values.map((value, candidate) => candidate === index ? event.target.value : value))} type="datetime-local" value={slot} />)}
      <div style={{ display: "grid", gap: 8, gridTemplateColumns: "120px minmax(0, 1fr)" }}>
        <select aria-label={t({ en: "Duration", zh: "时长" })} className="field" onChange={(event) => setDuration(Number(event.target.value))} value={duration}><option value={30}>30 min</option><option value={45}>45 min</option><option value={60}>60 min</option><option value={90}>90 min</option></select>
        <input aria-label={t({ en: "Meeting note", zh: "约谈备注" })} className="field" onChange={(event) => setNote(event.target.value)} placeholder={t({ en: "Purpose and context", zh: "目的与上下文" })} value={note} />
      </div>
      <small style={{ color: "var(--text-3)" }}>{timezone} · {t({ en: "Google Meet is requested only after mutual confirmation; unconfigured providers remain not synced.", zh: "双方确认后才请求 Google Meet；未配置的服务会保持“未同步”。" })}</small>
      <button className="btn btn-primary btn-sm" disabled={busy || parsed.some((value) => !value)} style={{ justifySelf: "start" }} type="submit">{counter ? t({ en: "Send counter", zh: "发送反提议" }) : t({ en: "Send proposal", zh: "发送提议" })}</button>
    </form>
  );
}

export function OrbitAppointmentNegotiation({ contactId, eventContactRequestId, eventId }: { contactId: string; eventContactRequestId: string; eventId: string }) {
  const { t } = useOrbitLanguage();
  const [appointment, setAppointment] = useState<AppointmentView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showProposal, setShowProposal] = useState(false);
  const [clockMs, setClockMs] = useState(() => Date.now());
  const actionKeys = useRef<ReturnType<typeof createAppointmentActionIdempotencyRegistry> | null>(null);
  actionKeys.current ??= createAppointmentActionIdempotencyRegistry();
  const keyFor = useCallback((fingerprint: string) => {
    return actionKeys.current!.keyFor(fingerprint);
  }, []);
  const pendingProposal = useMemo(() => appointment?.proposals.find((proposal) => proposal.revision === appointment.pendingProposalRevision) ?? null, [appointment]);
  const completionGate = appointmentCompletionGate(appointment?.confirmed ?? null, clockMs);

  useEffect(() => {
    if (!completionGate.availableAtMs || completionGate.enabled) return;
    const timer = window.setTimeout(() => setClockMs(Date.now()), Math.min(2_147_000_000, Math.max(0, completionGate.availableAtMs - Date.now() + 50)));
    return () => window.clearTimeout(timer);
  }, [completionGate.availableAtMs, completionGate.enabled]);

  const load = useCallback(async () => {
    const response = await fetch("/api/appointments", { cache: "no-store" });
    const body = (await response.json().catch(() => ({}))) as { data?: AppointmentView[] };
    if (!response.ok || !body.data) throw new Error(messageFrom(body));
    setAppointment(body.data.find((value) => value.authorityRequestId === eventContactRequestId && value.eventId === eventId && value.status !== "cancelled") ?? null);
  }, [eventContactRequestId, eventId]);

  useEffect(() => { void load().catch(() => setError(t({ en: "Appointments are temporarily unavailable.", zh: "约谈功能暂时不可用。" }))); }, [load, t]);

  async function createDraft() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/appointments", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": keyFor(`appointment-create:${eventId}:${eventContactRequestId}`) }, body: JSON.stringify({ eventContactRequestId, eventId }) });
      const body = (await response.json().catch(() => ({}))) as { data?: AppointmentView };
      if (!response.ok || !body.data) throw new Error(messageFrom(body));
      setAppointment(body.data); setShowProposal(true);
    } catch { setError(t({ en: "Only an accepted business-card exchange can start an appointment.", zh: "只有已接受的名片交换才能发起约谈。" })); } finally { setBusy(false); }
  }

  async function command(commandName: string, body: Record<string, unknown> = {}) {
    if (!appointment) return;
    setBusy(true); setError("");
    try {
      const commandBody = { ...body, command: commandName, expectedVersion: appointment.version };
      const response = await fetch(`/api/appointments/${encodeURIComponent(appointment.appointmentId)}/commands`, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": keyFor(`appointment:${appointment.appointmentId}:${appointment.version}:${commandName}:${JSON.stringify(body)}`) }, body: JSON.stringify(commandBody) });
      const value = (await response.json().catch(() => ({}))) as { data?: AppointmentView };
      if (!response.ok || !value.data) throw new AppointmentUiError(safeErrorCode(value, response.status));
      setAppointment(value.data); setShowProposal(false);
    } catch (commandError) {
      const code = commandError instanceof AppointmentUiError ? commandError.code : "APPOINTMENT_REQUEST_FAILED";
      const guidance = code === "APPOINTMENT_CONFLICT"
        ? t({ en: "The appointment changed. Reload and retry the action.", zh: "约谈状态已变化，请刷新后重试。" })
        : code === "APPOINTMENT_TIME_GATED"
          ? t({ en: "You can mark the appointment completed only after its scheduled end time.", zh: "约谈结束后才能标记已完成。" })
          : code === "APPOINTMENT_INVALID_TRANSITION"
            ? t({ en: "This action is not available in the appointment's current state.", zh: "当前约谈状态不允许执行此操作。" })
        : code === "APPOINTMENT_INVALID_INPUT"
          ? t({ en: "Review the candidate times and meeting details, then retry.", zh: "请检查候选时间和约谈信息后重试。" })
          : code === "APPOINTMENT_FORBIDDEN"
            ? t({ en: "The accepted contact relationship is no longer available. Reload the participant detail.", zh: "已接受的联系人关系当前不可用，请刷新参会者详情。" })
            : code === "APPOINTMENT_UNAVAILABLE"
              ? t({ en: "Scheduling is temporarily unavailable. Your draft is unchanged; retry later.", zh: "约谈服务暂时不可用；草稿未变化，请稍后重试。" })
              : t({ en: "The request did not reach a confirmed result. Your draft is unchanged; retry safely.", zh: "请求未得到确认结果；草稿未变化，可以安全重试。" });
      setError(`${code} · ${guidance}`);
    } finally { setBusy(false); }
  }

  return (
    <section className="card-flat" data-appointment-negotiation style={{ display: "grid", gap: 11, padding: 14 }}>
      <div><strong>{t({ en: "Appointment", zh: "约谈" })}</strong><p style={{ color: "var(--text-3)", fontSize: 12, margin: "3px 0 0" }}>{t({ en: "Versioned negotiation with mutual confirmation", zh: "带版本记录的双方确认流程" })}</p></div>
      {!appointment ? <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void createDraft()} style={{ justifySelf: "start" }} type="button">{t({ en: "Start scheduling", zh: "开始约时间" })}</button> : null}
      {appointment ? <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}><span className="chip">{appointment.status}</span><span className="chip">v{appointment.version}</span>{appointment.projection.calendar === "not_synced" ? <span className="chip">{t({ en: "Calendar not synced", zh: "日历未同步" })}</span> : null}{appointment.projection.meeting === "not_synced" ? <span className="chip">{t({ en: "Meet not synced", zh: "会议未同步" })}</span> : null}</div> : null}
      {appointment?.status === "draft" || showProposal ? <ProposalForm busy={busy} counter={Boolean(pendingProposal)} onSubmit={(proposal) => command(pendingProposal ? "counter" : "propose", { proposal })} /> : null}
      {pendingProposal ? <div style={{ display: "grid", gap: 8 }}><p style={{ color: "var(--text-2)", fontSize: 13, margin: 0 }}>{pendingProposal.note || t({ en: "No additional note", zh: "无额外备注" })}</p>{pendingProposal.proposedBy === "other" ? <>{pendingProposal.candidateTimes.map((candidate) => <button className="btn btn-ghost btn-sm" disabled={busy} key={candidate.candidateId} onClick={() => void command("accept", { candidateId: candidate.candidateId })} type="button">{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: pendingProposal.timezone }).format(new Date(candidate.startsAtUtc))}</button>)}{!showProposal ? <button className="btn btn-ghost btn-sm" onClick={() => setShowProposal(true)} style={{ justifySelf: "start" }} type="button">{t({ en: "Counter", zh: "反提时间" })}</button> : null}<button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void command("decline")} style={{ justifySelf: "start" }} type="button">{t({ en: "Decline", zh: "拒绝" })}</button></> : <p style={{ color: "var(--text-3)", fontSize: 13, margin: 0 }}>{t({ en: "Waiting for the other person to respond.", zh: "等待对方回应。" })}</p>}</div> : null}
      {appointment?.confirmed ? <div className="card-flat" style={{ display: "grid", gap: 7, padding: 11 }}><strong>{new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short", timeZone: appointment.confirmed.timezone }).format(new Date(appointment.confirmed.startsAtUtc))}</strong><span style={{ color: "var(--text-2)", fontSize: 13 }}>{appointment.confirmed.durationMinutes} min · {appointment.confirmed.timezone}</span><span style={{ color: "var(--text-3)", fontSize: 12 }}>{t({ en: "In-app reminders: T−24h, T−1h; memo prompt: T+15m", zh: "站内提醒：提前 24 小时、提前 1 小时；会后 15 分钟提醒记录" })}</span></div> : null}
      {appointment?.status === "confirmed" && !showProposal ? <div style={{ display: "grid", gap: 6 }}><div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}><button className="btn btn-ghost btn-sm" onClick={() => setShowProposal(true)} type="button">{t({ en: "Request reschedule", zh: "申请改期" })}</button><button className="btn btn-primary btn-sm" disabled={busy || !completionGate.enabled} onClick={() => void command("complete")} type="button">{t({ en: "Mark completed", zh: "标记已完成" })}</button><button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void command("cancel")} type="button">{t({ en: "Cancel", zh: "取消约谈" })}</button></div>{!completionGate.enabled && completionGate.availableAtMs ? <small style={{ color: "var(--text-3)" }}>{t({ en: "Available after", zh: "可标记时间" })} {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: appointment.confirmed.timezone }).format(new Date(completionGate.availableAtMs))}</small> : null}</div> : null}
      {appointment?.status === "completed" ? <a className="btn btn-primary btn-sm" href={`/app/contacts/${encodeURIComponent(contactId)}?capture=meeting-memo&appointmentId=${encodeURIComponent(appointment.appointmentId)}`} style={{ justifySelf: "start" }}>{t({ en: "Record post-meeting memo", zh: "记录会后纪要" })}</a> : null}
      {error ? <p role="alert" style={{ color: "var(--danger)", fontSize: 12, margin: 0 }}>{error}</p> : null}
    </section>
  );
}
