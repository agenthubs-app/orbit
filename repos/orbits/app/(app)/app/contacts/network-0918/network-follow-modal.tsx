/**
 * 记录跟进弹窗（Network v2 第 789–856 行，含 toast 852–856）。
 * 保存 = PATCH /api/contacts/<id>（与 contact-notes-editor / contact-tag-editor / contact-interaction-editor 同一接口与 fetch 模式）。
 * 「同步到 AI 分析」无接口：渲染为 aria-disabled 说明，不做假开关。
 */
"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";

import type { OrbitContactView } from "../../orbit-contacts-route-view-model";
import { useOrbitLanguage } from "../../orbit-language-context";
import { NETWORK_STAGES, STAGE_LABEL, stageClip, stageOf, type NetworkStage } from "./network-model";

const STATUS_BY_STAGE = { explore: "needs_follow_up", keep: "nurture", advance: "active", archived: "archived" } as const;

export function buildFollowPatch(input: { summary: string; need: string; offer: string; next: string; date: string; remind: string; stage: NetworkStage | ""; tags: string[]; existingTags: string[] }): {
  note: { body: string; authorLabel: "我" };
  status?: "active" | "needs_follow_up" | "nurture" | "archived";
  addTags?: string[];
  removeTags?: string[];
  lastInteraction: { channel: "manual_note"; occurredAt: string; summary: string };
} {
  const lines = [`总结：${input.summary.trim()}`];
  if (input.need.trim()) lines.push(`对方需求：${input.need.trim()}`);
  if (input.offer.trim()) lines.push(`我能提供：${input.offer.trim()}`);
  if (input.next.trim()) lines.push(`下一步：${input.next.trim()}${input.date ? `（${input.date}）` : ""}`);
  if (input.remind) lines.push(`提醒：${input.remind}`);
  const addTags = input.tags.filter((tag) => !input.existingTags.includes(tag));
  const removeTags = input.existingTags.filter((tag) => !input.tags.includes(tag));
  return {
    note: { body: lines.join("\n"), authorLabel: "我" as const },
    ...(input.stage ? { status: STATUS_BY_STAGE[input.stage] } : {}),
    ...(addTags.length ? { addTags } : {}),
    ...(removeTags.length ? { removeTags } : {}),
    lastInteraction: { channel: "manual_note" as const, occurredAt: input.date || new Date().toISOString().slice(0, 10), summary: input.summary.trim() },
  };
}

function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function NetworkFollowModal({ contact, onClose, onSaved }: { contact: OrbitContactView; onClose: () => void; onSaved: () => void }) {
  const { t } = useOrbitLanguage();
  const existingTags = contact.editableTags?.map((tag) => tag.value) ?? [];
  const labelByValue = new Map((contact.editableTags ?? []).map((tag) => [tag.value, tag.label] as const));
  const [summary, setSummary] = useState("");
  const [need, setNeed] = useState("");
  const [offer, setOffer] = useState("");
  const [next, setNext] = useState("");
  const [date, setDate] = useState(today);
  const [remind, setRemind] = useState("");
  const initialStage = stageOf(contact);
  const [stage, setStage] = useState<NetworkStage | "">(initialStage);
  const [tags, setTags] = useState<string[]>(existingTags);
  const [tagInput, setTagInput] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "error" | "saved">("idle");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const org = contact.company.trim();
  const title = contact.title.trim();
  const orgTitle = [org, title].filter(Boolean).join(" · ");
  const canSave = summary.trim().length > 0 && status !== "saving" && status !== "saved";

  useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent | globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && status !== "saving" && status !== "saved") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, status]);

  const onOverlayClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && status !== "saving" && status !== "saved") onClose();
  };

  const onTagKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const value = tagInput.trim();
    if (!value) return;
    if (!tags.includes(value)) setTags([...tags, value]);
    setTagInput("");
  };

  async function save() {
    if (!canSave) return;
    setStatus("saving");
    try {
      const response = await fetch(`/api/contacts/${encodeURIComponent(contact.id)}`, {
        method: "PATCH", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" },
        // 阶段未改动时不发 status：详情服务对已有生命周期的关系拒绝任何 status 写入（CONTACT_DETAIL_CANONICAL_STATUS_LIFECYCLE_ONLY）。
        body: JSON.stringify(buildFollowPatch({ summary, need, offer, next, date, remind, stage: stage === initialStage ? "" : stage, tags, existingTags })),
      });
      if (!response.ok) {
        const envelope = await response.json().catch(() => null) as { error?: { context?: { contactDetailTagStatusErrorCode?: string } } } | null;
        setErrorCode(envelope?.error?.context?.contactDetailTagStatusErrorCode ?? null);
        setStatus("error");
        return;
      }
      setStatus("saved");
      savedTimer.current = setTimeout(onSaved, 1200);
    } catch {
      setErrorCode(null);
      setStatus("error");
    }
  }

  // 详情服务：已有生命周期的关系不接受 status 写入，阶段要走跟进任务流程（/app/tasks）。
  const errorCopy = errorCode === "CONTACT_DETAIL_CANONICAL_STATUS_LIFECYCLE_ONLY"
    ? t({ en: "This relationship's stage can only change through its follow-up tasks. Keep the current stage to save this note.", zh: "该关系的阶段只能通过跟进任务流程更新；保持当前阶段即可保存本次记录。" })
    : t({ en: "Saving failed. Please try again.", zh: "保存失败，请重试。" });

  return (
    <div className="nw-overlay nw-overlay-follow" onClick={onOverlayClick} data-network-modal="follow">
      <div className="nw-modal nw-modal-follow" role="dialog" aria-modal="true" aria-label={t({ en: "Log a follow-up", zh: "记录跟进" })}>
        <div className="nw-fu-head">
          <div className="nw-fu-head-copy">
            <strong className="nw-fu-title">{t({ en: "Log a follow-up", zh: "记录跟进" })}</strong>
            <span className="nw-fu-sub">{t({ en: "Record this conversation to keep the relationship moving.", zh: "记录本次与联系人的沟通情况，持续维护关系。" })}</span>
          </div>
          <button type="button" className="btn nw-modal-close" onClick={onClose} aria-label={t({ en: "Close", zh: "关闭" })}>×</button>
        </div>
        <div className="nw-fu-card">
          <span className="nw-fu-avatar">{contact.initial || contact.displayName.slice(0, 1)}</span>
          <span className="nw-fu-card-copy">
            <strong className="nw-fu-card-name">{contact.displayName}</strong>
            <span className="nw-fu-card-org">{orgTitle}</span>
            <span className="nw-fu-card-tags">{(contact.editableTags ?? []).map((tag) => <span key={tag.value} className="nw-fu-card-tag">{tag.label}</span>)}</span>
          </span>
          <button type="button" className="btn nw-fu-detail-link" onClick={onClose}>{t({ en: "View detail →", zh: "查看详情 →" })}</button>
        </div>
        <div className="nw-fu-form">
          <label className="nw-fu-label" htmlFor="nw-fu-summary">{t({ en: "Summary", zh: "本次沟通摘要" })} <span className="nw-fu-req">*</span></label>
          <textarea id="nw-fu-summary" className="nw-fu-textarea" rows={3} value={summary} onChange={(e) => { setSummary(e.target.value); if (status === "error") setStatus("idle"); }} placeholder={t({ en: "Briefly record what was discussed, their feedback and key points…", zh: "请简要记录本次沟通的主要内容、对方反馈及重点信息…" })} />
          <label className="nw-fu-label" htmlFor="nw-fu-need">{t({ en: "Their current needs", zh: "对方当前需求" })}</label>
          <textarea id="nw-fu-need" className="nw-fu-textarea" rows={2} value={need} onChange={(e) => setNeed(e.target.value)} placeholder={t({ en: "Their business needs, pain points or focus…", zh: "记录对方目前的业务需求、痛点或关注重点…" })} />
          <label className="nw-fu-label" htmlFor="nw-fu-offer">{t({ en: "What I can offer", zh: "我可提供的帮助" })}</label>
          <textarea id="nw-fu-offer" className="nw-fu-textarea" rows={2} value={offer} onChange={(e) => setOffer(e.target.value)} placeholder={t({ en: "Resources, proposals or support we can provide…", zh: "记录我方可以提供的资源、方案或下一步支持…" })} />
          <label className="nw-fu-label" htmlFor="nw-fu-next">{t({ en: "Next action", zh: "下一步动作" })}</label>
          <input id="nw-fu-next" className="nw-fu-input" value={next} onChange={(e) => setNext(e.target.value)} placeholder={t({ en: "e.g. send a proposal, schedule a demo, make an intro…", zh: "例如：发送方案、安排产品演示、引荐相关同事等…" })} />
        </div>
        <div className="nw-fu-dates">
          <label className="nw-fu-date-label">{t({ en: "Date", zh: "更新时间" })} <span className="nw-fu-req">*</span><input className="nw-fu-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label className="nw-fu-date-label">{t({ en: "Reminder", zh: "提醒日期" })}<input className="nw-fu-input nw-fu-input-muted" type="date" value={remind} onChange={(e) => setRemind(e.target.value)} /></label>
        </div>
        <div className="nw-fu-block">
          <span className="nw-fu-block-t">{t({ en: "Update stage", zh: "更新关系阶段" })} <span className="nw-fu-req">*</span></span>
          <div className="nw-fu-stages">
            {NETWORK_STAGES.map((key, i) => (
              <button key={key} type="button" className={`btn nw-fu-stage${stage === key ? " nw-fu-stage-on" : ""}`} aria-pressed={stage === key} style={{ clipPath: stageClip(i as 0 | 1 | 2 | 3) }} onClick={() => setStage(key)}>{t(STAGE_LABEL[key])}</button>
            ))}
          </div>
        </div>
        <div className="nw-fu-block">
          <span className="nw-fu-block-t">{t({ en: "Tags", zh: "标签" })}</span>
          <div className="nw-fu-tagbox">
            {tags.map((tag) => (
              <span key={tag} className="nw-fu-tag">{labelByValue.get(tag) ?? tag}<button type="button" className="btn nw-fu-tag-x" aria-label={t({ en: `Remove ${tag}`, zh: `移除 ${tag}` })} onClick={() => setTags(tags.filter((x) => x !== tag))}>×</button></span>
            ))}
            <input className="nw-fu-tag-input" value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={onTagKey} placeholder={t({ en: "Type a tag and press Enter", zh: "输入标签，按回车添加" })} />
          </div>
        </div>
        {status === "error" ? <p role="alert" className="nw-fu-error">{errorCopy}</p> : null}
        <div className="nw-fu-foot">
          <span className="nw-fu-sync" aria-disabled="true">
            <span className="nw-fu-sync-mark">✓</span>
            <span className="nw-fu-sync-copy"><span className="nw-fu-sync-t">{t({ en: "Synced to AI analysis", zh: "同步到 AI 分析" })}</span><span className="nw-fu-sync-d">{t({ en: "The next analysis run will read this follow-up.", zh: "分析会在下次生成时读取本次跟进" })}</span></span>
          </span>
          <div className="nw-fu-foot-actions">
            <button type="button" className="btn nw-fu-cancel" onClick={onClose} disabled={status === "saving" || status === "saved"}>{t({ en: "Cancel", zh: "取消" })}</button>
            <button type="button" className="btn nw-fu-save" disabled={!canSave} onClick={save}>{status === "saving" ? t({ en: "Saving…", zh: "保存中…" }) : t({ en: "Save", zh: "保存记录" })}</button>
          </div>
        </div>
      </div>
      {status === "saved" ? <div className="nw-toast" role="status">✓ {t({ en: "Follow-up saved", zh: "已保存跟进记录" })}</div> : null}
    </div>
  );
}
