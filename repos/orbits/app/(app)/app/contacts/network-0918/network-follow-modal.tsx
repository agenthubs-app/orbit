/**
 * 「写 memo」弹窗（W0046，RN-04；沿用 Network v2 记录跟进弹窗 789–856 行的外框与 toast）。
 *
 * 只写 `contact_detail_states.notes`：保存 = PATCH /api/contacts/<id>，body 为
 * `{ note: { body, authorLabel, occurredAt, eventId?, kind: "memo" } }`（服务端按 memo 日期决定是否推进「上次互动」）。
 * 字段：文字（必填）、日期（默认东京今天）、可选关联活动（所选日期的已报名活动推荐，数据由详情页服务端随详情下发，
 * 读失败只隐藏推荐；弹窗本身除保存外不发请求）。
 * 删去：需求／提供／下一步、阶段箭头、标签区、「同步到 AI 分析」摆设。
 * W0005 示例模式（`useDemoMode()` 非空）：「保存」改走 `guardWrite`，不发请求。
 */
"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";

import { useDemoMode } from "../../_demo/demo-mode-core";
import type { OrbitContactView } from "../../orbit-contacts-route-view-model";
import { useOrbitLanguage } from "../../orbit-language-context";

const TOKYO_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

/** 东京当天 `YYYY-MM-DD`（与时间线、跟进到期同一口径；不依赖浏览器时区）。 */
export function tokyoToday(now: Date = new Date()): string {
  return new Date(now.getTime() + TOKYO_OFFSET_MS).toISOString().slice(0, 10);
}

/** 东京日期 → 该日 [00:00, 次日 00:00) 的 UTC ISO 窗口；非法日期返回 null。 */
export function tokyoDayWindow(day: string): { from: string; to: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  const start = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - TOKYO_OFFSET_MS;
  if (!Number.isFinite(start) || new Date(start + TOKYO_OFFSET_MS).toISOString().slice(0, 10) !== day) return null;
  return { from: new Date(start).toISOString(), to: new Date(start + DAY_MS).toISOString() };
}

export interface MemoPatch {
  note: { body: string; authorLabel: "我"; occurredAt: string; eventId?: string; kind: "memo" };
}

/** memo 请求体：只有 note，不带 status／标签／lastInteraction（「上次互动」由服务端按日期规则推进）。 */
export function buildMemoPatch(input: { body: string; date: string; eventId?: string | null }): MemoPatch {
  const eventId = input.eventId?.trim();
  return {
    note: {
      body: input.body.trim(),
      authorLabel: "我",
      occurredAt: input.date,
      ...(eventId ? { eventId } : {}),
      kind: "memo",
    },
  };
}

export interface MemoEventSuggestion { eventId: string; title: string }

/**
 * 当天已报名活动推荐：详情页服务端读好的近期活动日程（`contact.memoEventOptions`）里，开始时间落在
 * 所选东京日期的项；同一活动只列一次，至多 6 个。
 */
export function memoEventSuggestions(options: OrbitContactView["memoEventOptions"], day: string): MemoEventSuggestion[] {
  const dayWindow = tokyoDayWindow(day);
  if (!dayWindow || !options?.length) return [];
  const from = Date.parse(dayWindow.from);
  const to = Date.parse(dayWindow.to);
  const seen = new Set<string>();
  const out: MemoEventSuggestion[] = [];
  for (const item of options) {
    const at = Date.parse(item.startsAt);
    if (!(at >= from && at < to) || !item.eventId || !item.title.trim() || seen.has(item.eventId)) continue;
    seen.add(item.eventId);
    out.push({ eventId: item.eventId, title: item.title.trim() });
  }
  return out.slice(0, 6);
}

export function NetworkFollowModal({ contact, onClose, onSaved }: { contact: OrbitContactView; onClose: () => void; onSaved: () => void }) {
  const { t } = useOrbitLanguage();
  const demo = useDemoMode();
  const [body, setBody] = useState("");
  const [date, setDate] = useState(() => tokyoToday());
  const [eventId, setEventId] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "error" | "saved">("idle");
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const org = contact.company.trim();
  const title = contact.title.trim();
  const orgTitle = [org, title].filter(Boolean).join(" · ");
  const canSave = body.trim().length > 0 && Boolean(tokyoDayWindow(date)) && status !== "saving" && status !== "saved";

  useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent | globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && status !== "saving" && status !== "saved") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, status]);

  // 当天已报名活动推荐来自详情页服务端读取（示例与读失败时为空，只隐藏推荐，不影响保存）。
  const suggestions = memoEventSuggestions(contact.memoEventOptions, date);
  useEffect(() => { setEventId(null); }, [date]);

  const onOverlayClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && status !== "saving" && status !== "saved") onClose();
  };

  async function save() {
    if (!canSave) return;
    if (demo) {
      demo.guardWrite(t({ en: "memo", zh: "memo" }));
      return;
    }
    setStatus("saving");
    try {
      const response = await fetch(`/api/contacts/${encodeURIComponent(contact.id)}`, {
        method: "PATCH", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildMemoPatch({ body, date, eventId })),
      });
      if (!response.ok) { setStatus("error"); return; }
      setStatus("saved");
      savedTimer.current = setTimeout(onSaved, 1200);
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="nw-overlay nw-overlay-follow" onClick={onOverlayClick} data-network-modal="follow">
      <div className="nw-modal nw-modal-follow" role="dialog" aria-modal="true" aria-label={t({ en: "Write a memo", zh: "写 memo" })}>
        <div className="nw-fu-head">
          <div className="nw-fu-head-copy">
            <strong className="nw-fu-title">{t({ en: "Write a memo", zh: "写 memo" })}</strong>
            <span className="nw-fu-sub">{t({ en: "Note what happened with this contact, in your own words.", zh: "用自己的话记下和这位联系人之间发生的事。" })}</span>
          </div>
          <button type="button" className="btn nw-modal-close" onClick={onClose} aria-label={t({ en: "Close", zh: "关闭" })}>×</button>
        </div>
        <div className="nw-fu-card">
          <span className="nw-fu-avatar">{contact.initial || contact.displayName.slice(0, 1)}</span>
          <span className="nw-fu-card-copy">
            <strong className="nw-fu-card-name">{contact.displayName}</strong>
            <span className="nw-fu-card-org">{orgTitle}</span>
          </span>
          <button type="button" className="btn nw-fu-detail-link" onClick={onClose}>{t({ en: "View detail →", zh: "查看详情 →" })}</button>
        </div>
        <div className="nw-fu-form">
          <label className="nw-fu-label" htmlFor="nw-fu-memo">{t({ en: "Memo", zh: "memo" })} <span className="nw-fu-req">*</span></label>
          <textarea id="nw-fu-memo" className="nw-fu-textarea" rows={5} autoFocus value={body} onChange={(e) => { setBody(e.target.value); if (status === "error") setStatus("idle"); }} placeholder={t({ en: "What did you talk about? What do they need, what can you offer?", zh: "聊了什么？对方需要什么、你能提供什么？" })} />
          <label className="nw-fu-label" htmlFor="nw-fu-date">{t({ en: "Date", zh: "日期" })} <span className="nw-fu-req">*</span></label>
          <input id="nw-fu-date" className="nw-fu-input" type="date" value={date} max={tokyoToday()} onChange={(e) => setDate(e.target.value)} />
        </div>
        {suggestions.length ? (
          <div className="nw-fu-block" data-memo-event-suggestions>
            <span className="nw-fu-block-t">{t({ en: "Related event (optional)", zh: "关联活动（可选）" })}</span>
            <div className="nw-fu-events" role="group" aria-label={t({ en: "Events that day", zh: "当天的活动" })}>
              {suggestions.map((item) => (
                <button key={item.eventId} type="button" className={`btn nw-fu-event${eventId === item.eventId ? " nw-fu-event-on" : ""}`} aria-pressed={eventId === item.eventId} onClick={() => setEventId(eventId === item.eventId ? null : item.eventId)}>{item.title}</button>
              ))}
            </div>
          </div>
        ) : null}
        <span className="nw-fu-hint" data-memo-privacy-hint>{t({ en: "Memos are used to build your network analysis. Only you can see them.", zh: "memo 会用于为你生成人脉分析，仅你可见" })}</span>
        {status === "error" ? <p role="alert" className="nw-fu-error">{t({ en: "Saving failed. Please try again.", zh: "保存失败，请重试。" })}</p> : null}
        <div className="nw-fu-foot">
          <span />
          <div className="nw-fu-foot-actions">
            <button type="button" className="btn nw-fu-cancel" onClick={onClose} disabled={status === "saving" || status === "saved"}>{t({ en: "Cancel", zh: "取消" })}</button>
            <button type="button" className="btn nw-fu-save" disabled={!canSave} onClick={save}>{status === "saving" ? t({ en: "Saving…", zh: "保存中…" }) : t({ en: "Save memo", zh: "保存 memo" })}</button>
          </div>
        </div>
      </div>
      {status === "saved" ? <div className="nw-toast" role="status">✓ {t({ en: "Memo saved", zh: "已保存 memo" })}</div> : null}
    </div>
  );
}
