"use client";

/**
 * 记录交流弹窗。JSX 逐元素来自 docs/designs/Orbit_0918/Events.dc.html 第 763–780 行：
 * 766 标题行；767 对方卡（64 头像 / 名字 17 / roleDot / 标签 / 查看资料 →）；768–776 表单栅格 120px/1fr
 * （聊了什么* / 对方需求 / 我能提供 / 后续动作 / 语音备忘 / 添加标签 / 后续提醒）；777 底部。
 * API `POST /api/encounters`，请求体与 `orbit-encounter-capture.tsx:33` 完全一致：
 *   { commitments: [], contactId, eventId, nextStep, noteText, observedAt: ISO, privacy: "private", talked: "yes", tags }
 *   + `idempotency-key: encounter:<uuid>`（校验 `app/api/encounters/route.ts:27–29`：talked / privacy / contactId / observedAt 必填）。
 * 映射：聊了什么 → noteText；对方需求 / 我能提供 → 并入 noteText（前缀走 t()）；后续动作 → nextStep；标签 → tags。
 * 省略（记录）：◉ 语音备忘（无上传通道）、▦ 后续提醒（API 无字段）；标签预设 = 对方的真实话题 + 自定义输入（设计的六个标签是 mock）。
 * 未交换名片（无 contactId）→ 保存禁用 + 「先交换名片」。
 */
import { useRef, useState } from "react";

import type { OrbitPartyPersonView } from "../../orbit-party-route-view-model";
import { composeNoteText } from "./events-model";
import { EventModalFrame, EventModalHead } from "./event-modal-frame";
import { useEventContactRequest } from "./live-controls";

type Translate = (copy: { en: string; zh: string }) => string;

export interface NoteModalProps {
  eventId: string;
  onClose: () => void;
  onOpenProfile: (person: OrbitPartyPersonView) => void;
  onSaved: (person: OrbitPartyPersonView) => void;
  person: OrbitPartyPersonView;
  t: Translate;
}

export function newEncounterIdempotencyKey(): string {
  return `encounter:${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
}

function roleDot(person: Pick<OrbitPartyPersonView, "title" | "company">): string {
  return [person.title, person.company].filter((value) => value && value.trim()).join(" · ");
}

const LIMIT = 500;

function Field({ id, label, onChange, placeholder, required = false, rows, value }: { id: string; label: string; onChange: (value: string) => void; placeholder: string; required?: boolean; rows: number; value: string }) {
  return (
    <>
      <label className="ev-mo-note-label" htmlFor={id}>{label}{required ? <> <span className="ev-mo-required">*</span></> : null}</label>
      <div className="ev-mo-textarea-wrap">
        <textarea className="ev-mo-textarea" id={id} maxLength={LIMIT} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} rows={rows} value={value} />
        <span className="ev-mo-counter">{value.length}/{LIMIT}</span>
      </div>
    </>
  );
}

export function EventNoteModal({ eventId, onClose, onOpenProfile, onSaved, person, t }: NoteModalProps) {
  const control = useEventContactRequest({ eventId, person, t });
  const contactId = control.contactId;
  const [what, setWhat] = useState("");
  const [need, setNeed] = useState("");
  const [offer, setOffer] = useState("");
  const [next, setNext] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const idempotencyKey = useRef(newEncounterIdempotencyKey());
  const observedAt = useRef<string | null>(null);
  const presets = Array.from(new Set([...person.topics, ...tags].map((tag) => tag.trim()).filter(Boolean)));
  const canSave = Boolean(contactId) && what.trim().length > 0 && !busy;

  function toggleTag(tag: string) {
    setTags((current) => (current.includes(tag) ? current.filter((value) => value !== tag) : [...current, tag]));
  }

  function addCustom() {
    const tag = custom.trim();
    if (!tag) return;
    setTags((current) => (current.includes(tag) ? current : [...current, tag]));
    setCustom("");
  }

  async function save() {
    if (!canSave || !contactId) return;
    setBusy(true);
    setError("");
    try {
      observedAt.current ??= new Date().toISOString();
      const noteText = composeNoteText({ what, need, offer }, { need: t({ en: "Their needs", zh: "对方需求" }), offer: t({ en: "I can offer", zh: "我能提供" }) });
      const response = await fetch("/api/encounters", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey.current },
        body: JSON.stringify({ commitments: [], contactId, eventId, nextStep: next.trim(), noteText, observedAt: observedAt.current, privacy: "private", talked: "yes", tags }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? t({ en: "Save failed; nothing was recorded.", zh: "保存失败，未创建任何记录。" }));
      }
      idempotencyKey.current = newEncounterIdempotencyKey();
      observedAt.current = null;
      onSaved(person);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t({ en: "Save failed; nothing was recorded.", zh: "保存失败，未创建任何记录。" }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <EventModalFrame kind="note" labelledBy="ev-mo-note-title" onClose={onClose} panelClass="ev-mo-panel-gap-20" size="700" z="120">
      <EventModalHead
        closeLabel={t({ en: "Close", zh: "关闭" })}
        id="ev-mo-note-title"
        onClose={onClose}
        sub={t({ en: "Capture what you discussed so you can follow up later. Only what you save is recorded.", zh: "记录你与参会者的交流内容，方便后续跟进。只有你主动保存的内容才会被记录。" })}
        title={t({ en: "Record a conversation", zh: "记录交流" })}
      />
      <div className="ev-mo-note-person">
        <span aria-hidden="true" className="ev-mo-note-avatar">{person.initial}</span>
        <span className="ev-mo-note-person-copy">
          <strong className="ev-mo-note-name">{person.name}</strong>
          <span className="ev-mo-note-role">{roleDot(person)}</span>
          {person.topics.length ? <span className="ev-mo-ex-tags">{person.topics.slice(0, 3).map((topic, index) => <span className="ev-mo-ex-tag" key={`${index}-${topic}`}>{topic}</span>)}</span> : null}
        </span>
        <button className="btn ev-mo-note-open" data-events-modal-action="open-profile" onClick={() => onOpenProfile(person)} type="button">{t({ en: "View profile →", zh: "查看资料 →" })}</button>
      </div>
      <div className="ev-mo-note-grid">
        <Field id="ev-mo-note-what" label={`▤ ${t({ en: "What you discussed", zh: "聊了什么" })}`} onChange={setWhat} placeholder={t({ en: "e.g. introduced our product and discussed market trends…", zh: "例如：介绍了我们的产品，聊了行业趋势…" })} required rows={3} value={what} />
        <Field id="ev-mo-note-need" label={`◎ ${t({ en: "Their needs", zh: "对方需求" })}`} onChange={setNeed} placeholder={t({ en: "e.g. looking for partners, watching a market…", zh: "例如：正在寻找合作伙伴，关注某个市场的落地机会…" })} rows={2} value={need} />
        <Field id="ev-mo-note-offer" label={`✦ ${t({ en: "I can offer", zh: "我能提供" })}`} onChange={setOffer} placeholder={t({ en: "e.g. an introduction, a case study, a demo…", zh: "例如：可以介绍相关团队，分享案例，安排后续演示…" })} rows={2} value={offer} />
        <Field id="ev-mo-note-next" label={`⇢ ${t({ en: "Next step", zh: "后续动作" })}`} onChange={setNext} placeholder={t({ en: "e.g. send materials next week, book a call…", zh: "例如：下周发送资料，安排进一步的线上会议…" })} rows={2} value={next} />

        <span className="ev-mo-note-label ev-mo-note-label-8">◈ {t({ en: "Tags", zh: "添加标签" })}</span>
        <span className="ev-mo-note-tags">
          {presets.map((tag) => {
            const on = tags.includes(tag);
            return <button aria-pressed={on} className={`btn ev-mo-note-tag${on ? " ev-mo-note-tag-on" : ""}`} data-events-note-tag={tag} key={tag} onClick={() => toggleTag(tag)} type="button">{tag}</button>;
          })}
          <input
            aria-label={t({ en: "Add a custom tag", zh: "自定义标签" })}
            className="ev-mo-note-custom"
            onChange={(event) => setCustom(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addCustom(); } }}
            placeholder={`＋ ${t({ en: "Custom", zh: "自定义" })}`}
            value={custom}
          />
        </span>
      </div>
      {!contactId ? <span className="ev-mo-hint ev-mo-hint-warn" data-events-note-gate="no-contact" role="status">{t({ en: "Exchange business cards first — notes attach to a contact.", zh: "先交换名片：交流记录挂在联系人名片上。" })}</span> : null}
      {error ? <span className="ev-lv-error" role="alert">{error}</span> : null}
      <div className="ev-mo-foot-row">
        <span className="ev-mo-foot-note">{t({ en: "Only what you save is recorded; organizers and other attendees cannot see it.", zh: "只有你主动保存的内容才会被记录，会议组织方和其他参会者不可见。" })}</span>
        <span className="ev-mo-foot-actions">
          <button className="btn ev-mo-btn-cancel ev-mo-btn-sm" onClick={onClose} type="button">{t({ en: "Cancel", zh: "取消" })}</button>
          <button className="btn ev-mo-btn-primary ev-mo-btn-sm" data-events-modal-action="save-note" disabled={!canSave} onClick={() => void save()} type="button">
            {busy ? t({ en: "Saving…", zh: "保存中…" }) : t({ en: "Save note", zh: "保存记录" })}
          </button>
        </span>
      </div>
    </EventModalFrame>
  );
}
