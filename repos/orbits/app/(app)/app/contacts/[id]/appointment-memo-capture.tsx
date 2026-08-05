"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

type MemoEntry = {
  appointmentId: string;
  completedAt: string;
  contactId: string;
  eventId: string;
  scheduledAt: string;
};

function errorMessage(value: unknown): string {
  if (value && typeof value === "object" && "error" in value) {
    const error = value.error;
    if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  }
  return "会后纪要暂时不可用。";
}

export function AppointmentMemoCapture({
  appointmentId,
  contactId,
  eventId,
  invalidRequest,
}: {
  appointmentId: string | null;
  contactId: string;
  eventId: string | null;
  invalidRequest: boolean;
}) {
  const [entry, setEntry] = useState<MemoEntry | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(Boolean(appointmentId && eventId));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [commitments, setCommitments] = useState("");
  const idempotencyKey = useRef("");

  useEffect(() => {
    if (!appointmentId || !eventId || invalidRequest) return;
    let active = true;
    const query = new URLSearchParams({ contactId, eventId });
    void fetch(`/api/appointments/${encodeURIComponent(appointmentId)}/memo?${query}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({})) as { data?: MemoEntry };
        if (!response.ok || !body.data) throw new Error(errorMessage(body));
        if (active) setEntry(body.data);
      })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "会后纪要暂时不可用。"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [appointmentId, contactId, eventId, invalidRequest]);

  if (invalidRequest) return <p role="alert" style={{ color: "var(--danger)" }}>纪要链接无效：需要唯一的 capture=meeting-memo、appointmentId 和 eventId。</p>;
  if (!appointmentId && !eventId) return null;
  if (loading) return <section aria-busy="true" className="card-flat" style={{ margin: "16px", padding: 16 }}>正在核验约谈与联系人…</section>;
  if (error || !entry) return <p role="alert" style={{ color: "var(--danger)", margin: 16 }}>{error || "无法核验这次约谈。"}</p>;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!entry || saving) return;
    setSaving(true);
    setError("");
    idempotencyKey.current ||= globalThis.crypto?.randomUUID?.() ?? `memo-${Date.now()}`;
    try {
      const response = await fetch(`/api/appointments/${encodeURIComponent(entry.appointmentId)}/memo`, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey.current },
        body: JSON.stringify({
          commitments: commitments.split("\n").map((item) => item.trim()).filter(Boolean),
          contactId: entry.contactId,
          eventId: entry.eventId,
          nextStep,
          noteText,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(errorMessage(body));
      setSaved(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败，请重试。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card-flat" data-appointment-memo-capture style={{ display: "grid", gap: 12, margin: 16, padding: 16 }}>
      <div>
        <strong>会后纪要</strong>
        <p style={{ color: "var(--text-3)", fontSize: 12, margin: "4px 0 0" }}>
          已核验约谈完成记录：{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.completedAt))}
        </p>
      </div>
      {saved ? <p role="status" style={{ color: "var(--success)", margin: 0 }}>纪要已保存为该联系人的私密互动证据，等待投影到联系人详情。</p> : (
        <form onSubmit={submit} style={{ display: "grid", gap: 10 }}>
          <label style={{ display: "grid", gap: 5 }}>
            <span>纪要</span>
            <textarea className="field" maxLength={5000} onChange={(event) => setNoteText(event.target.value)} required rows={5} value={noteText} />
          </label>
          <label style={{ display: "grid", gap: 5 }}>
            <span>下一步</span>
            <input className="field" maxLength={1000} onChange={(event) => setNextStep(event.target.value)} value={nextStep} />
          </label>
          <label style={{ display: "grid", gap: 5 }}>
            <span>承诺事项（每行一项）</span>
            <textarea className="field" onChange={(event) => setCommitments(event.target.value)} rows={3} value={commitments} />
          </label>
          <button className="btn btn-primary btn-sm" disabled={saving || !noteText.trim()} style={{ justifySelf: "start" }} type="submit">{saving ? "保存中…" : "保存纪要"}</button>
          {error ? <p role="alert" style={{ color: "var(--danger)", margin: 0 }}>{error}</p> : null}
        </form>
      )}
    </section>
  );
}
