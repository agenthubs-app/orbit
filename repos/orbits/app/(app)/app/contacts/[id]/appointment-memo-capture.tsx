"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { useOrbitLanguage } from "../../orbit-language-context";

type MemoEntry = {
  appointmentId: string;
  completedAt: string;
  contactId: string;
  eventId: string;
  scheduledAt: string;
};

const UNAVAILABLE = { ja: "面談メモはいま使えません。", zh: "会后纪要暂时不可用。", en: "Meeting notes are unavailable right now." };

function errorMessage(value: unknown, fallback: string): string {
  if (value && typeof value === "object" && "error" in value) {
    const error = value.error;
    if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  }
  return fallback;
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
  const { language, t } = useOrbitLanguage();
  const unavailable = t(UNAVAILABLE);

  useEffect(() => {
    if (!appointmentId || !eventId || invalidRequest) return;
    let active = true;
    const query = new URLSearchParams({ contactId, eventId });
    void fetch(`/api/appointments/${encodeURIComponent(appointmentId)}/memo?${query}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({})) as { data?: MemoEntry };
        if (!response.ok || !body.data) throw new Error(errorMessage(body, unavailable));
        if (active) setEntry(body.data);
      })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : unavailable); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [appointmentId, contactId, eventId, invalidRequest, unavailable]);

  if (invalidRequest) return <p role="alert" style={{ color: "var(--coral-text)" }}>{t({ ja: "メモのリンクが正しくありません。capture=meeting-memo・appointmentId・eventId がそれぞれ 1 つずつ必要です。", zh: "纪要链接无效：需要唯一的 capture=meeting-memo、appointmentId 和 eventId。", en: "Invalid notes link: it needs exactly one capture=meeting-memo, appointmentId and eventId." })}</p>;
  if (!appointmentId && !eventId) return null;
  if (loading) return <section aria-busy="true" className="card-flat" style={{ margin: "16px", padding: 16 }}>{t({ ja: "面談と連絡先を確認しています…", zh: "正在核验约谈与联系人…", en: "Checking the meeting and contact…" })}</section>;
  if (error || !entry) return <p role="alert" style={{ color: "var(--coral-text)", margin: 16 }}>{error || t({ ja: "この面談を確認できませんでした。", zh: "无法核验这次约谈。", en: "This meeting could not be verified." })}</p>;

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
      if (!response.ok) throw new Error(errorMessage(body, unavailable));
      setSaved(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t({ ja: "保存できませんでした。もう一度お試しください。", zh: "保存失败，请重试。", en: "Saving failed. Please try again." }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card-flat" data-appointment-memo-capture style={{ display: "grid", gap: 12, margin: 16, padding: 16 }}>
      <div>
        <strong>{t({ ja: "面談メモ", zh: "会后纪要", en: "Meeting notes" })}</strong>
        <p style={{ color: "var(--ink-3-text)", fontSize: 12, margin: "4px 0 0" }}>
          {t({ ja: "面談の完了を確認済み：", zh: "已核验约谈完成记录：", en: "Meeting completion verified: " })}{new Intl.DateTimeFormat(language === "ja" ? "ja-JP" : language === "zh" ? "zh-CN" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.completedAt))}
        </p>
      </div>
      {saved ? <p role="status" style={{ color: "var(--success)", margin: 0 }}>{t({ ja: "メモをこの連絡先との非公開の記録として保存しました。連絡先の詳細にはこのあと反映されます。", zh: "纪要已保存为该联系人的私密互动证据，等待投影到联系人详情。", en: "Notes saved as a private record with this contact. They will appear on the contact detail shortly." })}</p> : (
        <form onSubmit={submit} style={{ display: "grid", gap: 10 }}>
          <label style={{ display: "grid", gap: 5 }}>
            <span>{t({ ja: "メモ", zh: "纪要", en: "Notes" })}</span>
            <textarea className="field" maxLength={5000} onChange={(event) => setNoteText(event.target.value)} required rows={5} value={noteText} />
          </label>
          <label style={{ display: "grid", gap: 5 }}>
            <span>{t({ ja: "次の一歩", zh: "下一步", en: "Next step" })}</span>
            <input className="field" maxLength={1000} onChange={(event) => setNextStep(event.target.value)} value={nextStep} />
          </label>
          <label style={{ display: "grid", gap: 5 }}>
            <span>{t({ ja: "約束したこと（1 行に 1 つ）", zh: "承诺事项（每行一项）", en: "Commitments (one per line)" })}</span>
            <textarea className="field" onChange={(event) => setCommitments(event.target.value)} rows={3} value={commitments} />
          </label>
          <button className="btn btn-primary btn-sm" disabled={saving || !noteText.trim()} style={{ justifySelf: "start" }} type="submit">{saving ? t({ ja: "保存中…", zh: "保存中…", en: "Saving…" }) : t({ ja: "メモを保存", zh: "保存纪要", en: "Save notes" })}</button>
          {error ? <p role="alert" style={{ color: "var(--coral-text)", margin: 0 }}>{error}</p> : null}
        </form>
      )}
    </section>
  );
}
