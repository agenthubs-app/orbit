"use client";

import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import type { OrbitContactView } from "../orbit-contacts-route-view-model";
import { useOrbitModalA11y } from "../orbit-modal-a11y";
import { ORBIT_Z } from "../orbit-z";

type Interaction = NonNullable<OrbitContactView["editableInteraction"]>;
const channels = ["manual_note", "event_note", "email_signal", "calendar_signal", "referral"] as const;

function localDateTime(value: string) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function ContactInteractionEditor({ contactId, initialInteraction, language, onClose, onSaved }: {
  contactId: string;
  initialInteraction: Interaction;
  language: "zh" | "en" | "ja";
  onClose: () => void;
  onSaved: (interaction: Interaction) => void;
}) {
  const copy = {
    zh: { title: "最近互动", channel: "互动渠道", time: "互动时间", summary: "互动摘要", hint: "时间按当前设备时区填写。留空保留原值；保存不会发送消息或创建日程。", options: ["手动记录", "活动记录", "邮件", "日程", "引荐"], save: "保存互动", saving: "正在保存…", close: "关闭", error: "未能确认保存结果。输入已保留，请重试。", invalid: "请填写有效的互动时间。" },
    en: { title: "Last interaction", channel: "Channel", time: "Interaction time", summary: "Summary", hint: "Use your device’s time zone. Blank fields keep their current values. Saving does not send messages or create events.", options: ["Manual note", "Event note", "Email", "Calendar", "Referral"], save: "Save interaction", saving: "Saving…", close: "Close", error: "Could not confirm the save. Your input is still here; please retry.", invalid: "Enter a valid interaction time." },
    ja: { title: "最近のやり取り", channel: "連絡方法", time: "日時", summary: "概要", hint: "端末のタイムゾーンで入力してください。空欄は元の値を保持します。保存してもメッセージの送信や予定の作成は行いません。", options: ["手動メモ", "イベントメモ", "メール", "カレンダー", "紹介"], save: "やり取りを保存", saving: "保存中…", close: "閉じる", error: "保存結果を確認できませんでした。入力内容は残っています。もう一度お試しください。", invalid: "有効な日時を入力してください。" },
  }[language];
  const [baseline, setBaseline] = useState(initialInteraction);
  const [channel, setChannel] = useState(initialInteraction.channel);
  const [time, setTime] = useState(() => localDateTime(initialInteraction.occurredAt));
  const [summary, setSummary] = useState(initialInteraction.summary);
  const [status, setStatus] = useState<"idle" | "saving" | "error" | "invalid">("idle");
  const pending = useRef(false);
  const mounted = useRef(true);
  const modalRef = useOrbitModalA11y(() => { if (!pending.current) onClose(); });
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const changedTime = Boolean(time && time !== localDateTime(baseline.occurredAt));
  const changedSummary = Boolean(summary.trim() && summary !== baseline.summary);
  const changed = channel !== baseline.channel || changedTime || changedSummary;

  async function save() {
    if (pending.current || !changed || !channels.some((value) => value === channel)) return;
    const date = new Date(time);
    if (changedTime && (Number.isNaN(date.getTime()) || localDateTime(date.toISOString()) !== (time.length === 16 ? `${time}:00` : time))) {
      setStatus("invalid");
      return;
    }
    const update = { channel, ...(changedTime ? { occurredAt: date.toISOString() } : {}), ...(changedSummary ? { summary: summary.trim() } : {}) };
    pending.current = true;
    setStatus("saving");
    try {
      const response = await fetch(`/api/contacts/${encodeURIComponent(contactId)}`, {
        method: "PATCH", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lastInteraction: update }),
      });
      const result = z.object({ success: z.literal(true), data: z.object({ contact: z.object({
        id: z.literal(contactId), lastInteraction: z.object({ channel: z.enum(channels), occurredAt: z.string(), summary: z.string() }),
      }) }) }).parse(await response.json());
      const saved = result.data.contact.lastInteraction;
      if (!response.ok || !Number.isFinite(Date.parse(saved.occurredAt)) || saved.channel !== update.channel || (update.summary !== undefined && saved.summary !== update.summary) ||
        (update.occurredAt !== undefined && Date.parse(saved.occurredAt) !== date.getTime())) throw new Error("Unconfirmed interaction");
      if (!mounted.current) return;
      setBaseline(saved);
      setChannel(saved.channel);
      setTime(localDateTime(saved.occurredAt));
      setSummary(saved.summary);
      setStatus("idle");
      onSaved(saved);
    } catch {
      if (mounted.current) setStatus("error");
    } finally { pending.current = false; }
  }

  const fieldStyle = { width: "100%", minHeight: 44, padding: "8px 10px", color: "var(--text)", background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: "var(--r-md)", boxSizing: "border-box" as const };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: ORBIT_Z.modal, background: "rgba(0,0,0,.35)", display: "grid", placeItems: "center", padding: 18 }}>
      <div ref={modalRef} role="dialog" aria-modal="true" aria-label={copy.title} tabIndex={-1} className="card" style={{ width: "100%", maxWidth: 460, maxHeight: "90dvh", overflowY: "auto", padding: 22 }}>
        <h2 className="h-section" style={{ margin: "0 0 18px" }}>{copy.title}</h2>
        <div style={{ display: "grid", gap: 14 }}>
          <label>{copy.channel}<select aria-label={copy.channel} value={channel} disabled={status === "saving"} onChange={(event) => { setChannel(event.target.value); setStatus("idle"); }} style={fieldStyle}>
            {channels.map((value, index) => <option key={value} value={value}>{copy.options[index]}</option>)}
          </select></label>
          <label>{copy.time}<input aria-label={copy.time} type="datetime-local" step="1" value={time} disabled={status === "saving"} onChange={(event) => { setTime(event.target.value); setStatus("idle"); }} style={fieldStyle} /></label>
          <label>{copy.summary}<textarea aria-label={copy.summary} rows={3} value={summary} disabled={status === "saving"} onChange={(event) => { setSummary(event.target.value); setStatus("idle"); }} style={{ ...fieldStyle, resize: "vertical" }} /></label>
        </div>
        <p style={{ color: "var(--text-3)", fontSize: 12.5, lineHeight: 1.5 }}>{copy.hint}</p>
        {status === "error" || status === "invalid" ? <p role="alert" style={{ color: "var(--danger)", fontSize: 13 }}>{status === "invalid" ? copy.invalid : copy.error}</p> : null}
        <div style={{ display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: 10, marginTop: 20 }}>
          <button type="button" className="btn btn-quiet" disabled={status === "saving"} onClick={onClose}>{copy.close}</button>
          <button type="button" className="btn btn-primary" data-interaction-save disabled={status === "saving" || !changed} onClick={save}>{status === "saving" ? copy.saving : copy.save}</button>
        </div>
      </div>
    </div>
  );
}
