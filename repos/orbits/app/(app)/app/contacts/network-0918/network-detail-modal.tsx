/**
 * 联系人详情弹窗（Network v2 第 708–788 行）。
 * 数据只来自详情路由的 OrbitContactView（真实 notes / editableTags / lastInteraction / publicProfile）。
 * 关闭 = 真实导航到 closeHref；「记录互动」「更新状态」都打开记录跟进弹窗。
 * 省略（无数据源 / 死链接，见台账）：「···」「✎ 编辑资料」「▦ 约时间」「查看全部 →」、概览「联系频率」。
 */
"use client";

import { useEffect, useRef, type MouseEvent, type ReactNode } from "react";

import type { OrbitContactView } from "../../orbit-contacts-route-view-model";
import { useOrbitLanguage } from "../../orbit-language-context";
import { SOURCE_LABEL, STAGE_CHIP, STAGE_LABEL, STAGE_STYLE, metSummary, sourceOf, stageOf } from "./network-model";

/** 设计稿时间线 `4月18日 15:30` 格式（本地时区）。 */
export function formatNoteTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}月${d.getDate()}日 ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function sortedNotes(notes: OrbitContactView["notes"]): OrbitContactView["notes"] {
  return [...notes].sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
}

export function NetworkDetailModal({ contact, closeHref, onFollow, extra }: { contact: OrbitContactView; closeHref: string; onFollow: () => void; extra?: ReactNode }) {
  const { t } = useOrbitLanguage();
  const dash = "—";
  const stage = stageOf(contact);
  const source = sourceOf(contact);
  const org = contact.company.trim();
  const title = contact.title.trim();
  const orgTitle = [org, title].filter(Boolean).join(" · ");
  const location = (contact.location ?? "").trim();
  const profile = contact.encounters[0]?.context.publicProfile;
  const topics = profile?.topics ?? [];
  const offering = profile?.offering ?? [];
  const seeking = profile?.seeking ?? [];
  const notes = sortedNotes(contact.notes);
  const next = contact.nextAction;
  const interactionAt = contact.editableInteraction?.occurredAt ? formatNoteTime(contact.editableInteraction.occurredAt) : dash;
  const interactionSummary = contact.lastInteraction.trim();
  const closeRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const el = event.target as HTMLElement | null;
      // 弹窗内附加态（会后纪要等）的输入框里按 Esc 不关闭
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      window.location.assign(closeHref);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeHref]);

  const onOverlayClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) window.location.assign(closeHref);
  };

  // 设计 selOverview：图标 / 标签 / 值 / 说明；「联系频率」无数据源不渲染。
  const overview: { icon: string; label: string; value: string; desc: string }[] = [
    { icon: "⇢", label: t({ en: "Stage", zh: "关系阶段" }), value: t(STAGE_LABEL[stage]), desc: t(STAGE_STYLE[stage].desc) },
    // 上次互动：值 = 互动时间，说明 = 互动摘要（无则下一步）；下次计划的 reason 与互动摘要相同时不重复。
    { icon: "◷", label: t({ en: "Last contact", zh: "上次互动" }), value: interactionAt, desc: interactionSummary || next?.text || dash },
    { icon: "▦", label: t({ en: "Next plan", zh: "下次计划" }), value: next?.text || dash, desc: next?.reason && next.reason.trim() !== interactionSummary ? next.reason : "" },
    // 来源说明经 metSummary 清洗：账号邮箱 / 「confirmed by」句不渲染（空则省略说明）。
    { icon: "◎", label: t({ en: "Source", zh: "来源" }), value: t(SOURCE_LABEL[source]), desc: metSummary(contact.met) },
  ];

  const bullets = (items: readonly string[]) =>
    items.length ? items.map((item, i) => <span key={i} className="nw-li"><span className="nw-li-dot">•</span>{item}</span>) : <span className="nw-li"><span className="nw-li-dot">•</span>{dash}</span>;

  return (
    <div className="nw-overlay" onClick={onOverlayClick} data-network-modal="detail">
      <div className="nw-modal nw-modal-detail" role="dialog" aria-modal="true" aria-label={t({ en: "Contact detail", zh: "联系人详情" })}>
        <div className="nw-modal-head">
          <strong className="nw-modal-title">{t({ en: "Contact detail", zh: "联系人详情" })}</strong>
          <a ref={closeRef} className="btn nw-modal-close" href={closeHref} aria-label={t({ en: "Close", zh: "关闭" })}>×</a>
        </div>
        <div className="nw-detail-hero">
          <span className="nw-modal-avatar">{contact.initial || contact.displayName.slice(0, 1)}</span>
          <div className="nw-detail-id">
            <h2 className="nw-detail-name">{contact.displayName}</h2>
            <span className="nw-detail-org">{orgTitle}</span>
            <div className="nw-detail-meta">
              {location ? <span>◎ {location}</span> : null}
              <span>⇢ {t({ en: "From", zh: "来自" })} {t(SOURCE_LABEL[source])}</span>
              <span className="nw-detail-stage" style={{ background: STAGE_CHIP[stage].bg, color: STAGE_CHIP[stage].fg }}>{t(STAGE_LABEL[stage])}</span>
            </div>
          </div>
        </div>
        <div className="nw-panel nw-panel-16">
          <strong className="nw-panel-t">{t({ en: "Relationship overview", zh: "关系概览" })}</strong>
          <div className="nw-ov-grid">
            {overview.map((o) => (
              <div key={o.label} className="nw-ov">
                <span className="nw-ov-icon">{o.icon}</span>
                <span className="nw-ov-copy"><span className="nw-ov-l">{o.label}</span><strong className="nw-ov-v">{o.value}</strong>{o.desc ? <span className="nw-ov-d">{o.desc}</span> : null}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="nw-detail-cols">
          <div className="nw-detail-col">
            {extra}
            <div className="nw-panel nw-panel-16">
              <div className="nw-panel-head"><strong className="nw-panel-t">{t({ en: "Recent interactions", zh: "最近互动" })}</strong></div>
              <div className="nw-tl">
                {notes.length === 0 ? <span className="nw-tl-empty">{t({ en: "No interactions recorded yet", zh: "还没有互动记录" })}</span> : null}
                {notes.map((note, i) => (
                  <div key={note.id} className="nw-tl-row">
                    <span className="nw-tl-rail"><span className="nw-tl-dot" style={{ background: i === 0 ? "#4B4FC7" : "#B9BCEB" }}></span><span className="nw-tl-line" style={{ background: i === notes.length - 1 ? "transparent" : "#DDDEFA" }}></span></span>
                    <span className="nw-tl-body"><span className="nw-tl-meta"><span className="nw-tl-time">{formatNoteTime(note.createdAt)}</span><strong className="nw-tl-kind">{t({ en: "Note", zh: "备注" })}</strong></span><span className="nw-tl-text">{note.body}</span></span>
                  </div>
                ))}
              </div>
            </div>
            <div className="nw-panel nw-panel-14">
              <strong className="nw-panel-t">{t({ en: "Shared topics", zh: "共同话题" })}</strong>
              <div className="nw-topic-wrap">
                {topics.length ? topics.map((tp) => <span key={tp} className="nw-topic">{tp}</span>) : <span className="nw-topic">{dash}</span>}
              </div>
            </div>
          </div>
          <div className="nw-detail-col">
            <div className="nw-panel nw-panel-12">
              <strong className="nw-panel-t">{t({ en: "What they offer", zh: "我能提供" })}</strong>
              {bullets(offering)}
            </div>
            <div className="nw-panel nw-panel-12">
              <strong className="nw-panel-t">{t({ en: "What they need", zh: "对方需求" })}</strong>
              {bullets(seeking)}
            </div>
            <div className="nw-panel nw-panel-12">
              <strong className="nw-panel-t">{t({ en: "Suggested next steps", zh: "下一步建议" })}</strong>
              <span className="nw-step"><span className="nw-step-n">1</span><span className="nw-step-text">{next?.text || dash}{next?.reason && next.reason.trim() !== interactionSummary ? <span className="nw-step-reason">{next.reason}</span> : null}</span></span>
            </div>
          </div>
        </div>
        <div className="nw-detail-foot">
          <a className="btn nw-detail-close" href={closeHref}>{t({ en: "Close", zh: "关闭" })}</a>
          <div className="nw-detail-foot-actions">
            <button type="button" className="btn nw-detail-follow" onClick={onFollow}>▤ {t({ en: "Log interaction", zh: "记录互动" })}</button>
            <button type="button" className="btn nw-detail-status" onClick={onFollow}>⇢ {t({ en: "Update status", zh: "更新状态" })}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
