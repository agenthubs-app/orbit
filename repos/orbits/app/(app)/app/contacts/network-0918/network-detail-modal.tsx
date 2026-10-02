/**
 * 联系人详情弹窗（Network v2 第 708–788 行）。
 * 数据只来自详情路由的 OrbitContactView（真实 notes / editableTags / lastInteraction / publicProfile）。
 * 关闭 = 真实导航到 closeHref；「写 memo」打开「写 memo」弹窗。
 * W0047：手动阶段 UI 下线——「更新状态」按钮与「待设置关系」面板不再渲染（接口与阶段数据保留）；
 * 改为显示自动档位标签（新认识／有往来／核心／待唤醒，只由关系时间线推出）与「依据」面板（信号的日期、来源、时间线标题），
 * 不显示数字分数（W47-6），用户不能手改档位。
 * W0046：「最近互动」是聚合关系时间线（contact.timeline，详情页服务端读好；七种来源，最近 20 条）。
 * 省略（无数据源 / 死链接，见台账）：「···」「✎ 编辑资料」「▦ 约时间」「查看全部 →」、概览「联系频率」。
 * W0010：右栏「下一步建议」下方有「关联到计划人脉需求」（手动关联，只能关联本人的计划与本人的联系人；
 * 点开才读计划，示例模式下被拦截）。
 *
 * W0005 示例模式（`useDemoMode()` 非空）：名字旁带「示例」角标，「写 memo」改走
 * `guardWrite`，弹「这是示例」、不打开记录跟进、不发请求。`useNetworkDemoDetail` 让列表／概览／
 * 管线在示例里点联系人时直接在本页打开示例详情（前端数据，不导航、不发请求）；传了 `onClose`
 * 时关闭只收起弹窗，不再导航。
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode, type Ref } from "react";

import { buildDemoNetworkDetail, demoContactIdFromHref } from "../../_demo/demo-network";
import { DemoTag, useDemoMode } from "../../_demo/demo-mode-core";
import type { RelationshipTimelineItem, RelationshipTimelineSource } from "../../../../../shared/contract/relationship-timeline";
import type { OrbitContactView } from "../../orbit-contacts-route-view-model";
import { useOrbitLanguage } from "../../orbit-language-context";
import { useOrbitModalA11y } from "../../orbit-modal-a11y";
import { PlanNeedLinkPanel } from "../../agent/iorbit-0918/plan-match-sheet";
import { ContactEnrichmentInline } from "./contact-enrichment-inline";
import { SOURCE_LABEL, TIER_CHIP, TIER_LABEL, TIER_STYLE, metSummary, sourceOf, tierGroupOf } from "./network-model";

type Translate = (copy: { en: string; zh: string }) => string;
const EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * 设计稿时间线 `4月18日 15:30` 格式。只用 UTC 分量（与 network-overview.tsx formatMonthDay 同一做法），
 * 服务端与客户端渲染结果一致，避免 hydration 差异；en 为 `Sep 21 08:00`。
 */
export function formatNoteTime(iso: string, t: Translate = (copy) => copy.zh): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const hm = `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
  return t({ zh: `${m}月${day}日 ${hm}`, en: `${EN_MONTHS[m - 1]} ${day} ${hm}` });
}

const TOKYO_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * W0046 时间线时间：按东京时间显示（固定 +9，服务端与客户端一致，无 hydration 差异）；
 * day 精度只显示日期，不编时分。
 */
export function formatTimelineTime(item: Pick<RelationshipTimelineItem, "occurredAt" | "occurredAtPrecision">, t: Translate = (copy) => copy.zh): string {
  const at = Date.parse(item.occurredAt);
  if (!Number.isFinite(at)) return "—";
  const d = new Date(at + TOKYO_OFFSET_MS);
  const p = (n: number) => String(n).padStart(2, "0");
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  if (item.occurredAtPrecision === "day") return t({ zh: `${m}月${day}日`, en: `${EN_MONTHS[m - 1]} ${day}` });
  const hm = `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
  return t({ zh: `${m}月${day}日 ${hm}`, en: `${EN_MONTHS[m - 1]} ${day} ${hm}` });
}

export const TIMELINE_SOURCE_LABEL: Record<RelationshipTimelineSource, { zh: string; en: string }> = {
  memo: { zh: "memo", en: "Memo" },
  encounter: { zh: "见面", en: "Met" },
  note: { zh: "笔记", en: "Note" },
  plan: { zh: "计划", en: "Plan" },
  schedule: { zh: "日程", en: "Schedule" },
  followup_done: { zh: "跟进", en: "Follow-up" },
  capture: { zh: "建立联系", en: "Connected" },
};

/** 「最近互动」：聚合时间线（W0046）。没有 timeline（旧调用方）时退回详情 notes。 */
function RecentInteractions({ contact, t }: { contact: OrbitContactView; t: Translate }) {
  const timeline = contact.timeline;
  if (!timeline) {
    const notes = sortedNotes(contact.notes);
    return (
      <div className="nw-tl">
        {notes.length === 0 ? <span className="nw-tl-empty">{t({ en: "No interactions recorded yet", zh: "还没有互动记录" })}</span> : null}
        {notes.map((note, i) => (
          <div key={note.id} className="nw-tl-row">
            <span className="nw-tl-rail"><span className="nw-tl-dot" style={{ background: i === 0 ? "#4B4FC7" : "#B9BCEB" }}></span><span className="nw-tl-line" style={{ background: i === notes.length - 1 ? "transparent" : "#DDDEFA" }}></span></span>
            <span className="nw-tl-body"><span className="nw-tl-meta"><span className="nw-tl-time">{formatNoteTime(note.createdAt, t)}</span><strong className="nw-tl-kind">{t({ en: "Note", zh: "备注" })}</strong></span><span className="nw-tl-text">{note.body}</span></span>
          </div>
        ))}
      </div>
    );
  }
  const items = timeline.items;
  const total = timeline.total ?? items.length;
  const partial = timeline.unavailableSources.length > 0;
  return (
    <div className="nw-tl" data-network-timeline>
      {partial ? <span className="nw-tl-partial" role="status">{t({ en: "Some records can't be loaded right now.", zh: "部分记录暂时读不到" })}</span> : null}
      {items.length === 0 && !partial ? <span className="nw-tl-empty">{t({ en: "No interactions recorded yet", zh: "还没有互动记录" })}</span> : null}
      {items.map((item, i) => (
        <div key={item.id} className="nw-tl-row" data-timeline-source={item.source}>
          <span className="nw-tl-rail"><span className="nw-tl-dot" style={{ background: i === 0 ? "#4B4FC7" : "#B9BCEB" }}></span><span className="nw-tl-line" style={{ background: i === items.length - 1 ? "transparent" : "#DDDEFA" }}></span></span>
          <span className="nw-tl-body">
            <span className="nw-tl-meta"><span className="nw-tl-time">{formatTimelineTime(item, t)}</span><strong className="nw-tl-kind">{t(TIMELINE_SOURCE_LABEL[item.source])}</strong></span>
            <span className="nw-tl-title">{t(item.title)}</span>
            {item.excerpt ? <span className="nw-tl-text">{item.excerpt}</span> : null}
          </span>
        </div>
      ))}
      {total > items.length ? <span className="nw-tl-more">{t({ en: `${total} records in total · showing the latest ${items.length}`, zh: `共 ${total} 条 · 显示最近 ${items.length} 条` })}</span> : null}
    </div>
  );
}

/**
 * W0047「依据」：强度缓存里的信号（按贡献降序，至多 12 条）。标题取详情时间线里同 id 的条目，
 * 不在最近 20 条里的退回来源名；日期按东京时间。不显示分数。
 */
function RelationshipBasis({ contact, t }: { contact: OrbitContactView; t: Translate }) {
  const strength = contact.relationshipStrength;
  const byId = new Map((contact.timeline?.items ?? []).map((item) => [item.id, item]));
  const signals = strength?.signals ?? [];
  return (
    <div className="nw-basis" data-network-basis role="region" aria-label={t({ en: "Why this tier", zh: "档位依据" })}>
      <span className="nw-basis-head">{t({ en: "Based on these records (updated automatically):", zh: "根据以下记录自动判断：" })}</span>
      {signals.length === 0 ? <span className="nw-tl-empty">{t({ en: "No interaction records yet", zh: "还没有往来记录" })}</span> : null}
      {signals.map((signal) => {
        const item = byId.get(signal.timelineItemId);
        return (
          <span key={signal.timelineItemId} className="nw-basis-row" data-basis-source={signal.source}>
            <span className="nw-tl-time">{formatTimelineTime({ occurredAt: signal.occurredAt, occurredAtPrecision: item?.occurredAtPrecision ?? "instant" }, t)}</span>
            <strong className="nw-tl-kind">{t(TIMELINE_SOURCE_LABEL[signal.source])}</strong>
            <span className="nw-basis-title">{item ? t(item.title) : t(TIMELINE_SOURCE_LABEL[signal.source])}</span>
          </span>
        );
      })}
      {strength?.dormant ? <span className="nw-basis-foot">{t({ en: "No interactions in the last 60 days.", zh: "最近 60 天没有往来。" })}</span> : null}
    </div>
  );
}

export function sortedNotes(notes: OrbitContactView["notes"]): OrbitContactView["notes"] {
  return [...notes].sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
}

export function NetworkDetailModal({ contact, closeHref, onFollow: openFollow, extra, onClose, dialogRef }: { contact: OrbitContactView; closeHref: string; onFollow: () => void; extra?: ReactNode; onClose?: () => void; dialogRef?: Ref<HTMLDivElement> }) {
  const { t, language } = useOrbitLanguage();
  const demo = useDemoMode();
  const guardWrite = demo?.guardWrite;
  // 示例里「写 memo」弹拦截层；真实页面打开「写 memo」弹窗。
  const onFollow = guardWrite ? () => guardWrite(t({ en: "memo", zh: "memo" })) : openFollow;
  const [basisOpen, setBasisOpen] = useState(false);
  const close = useCallback(() => {
    if (onClose) onClose();
    else window.location.assign(closeHref);
  }, [closeHref, onClose]);
  const onCloseLink = onClose
    ? (event: MouseEvent<HTMLAnchorElement>) => {
        event.preventDefault();
        onClose();
      }
    : undefined;
  const dash = "—";
  const tier = tierGroupOf(contact.relationshipStrength);
  const source = sourceOf(contact);
  const org = contact.company.trim();
  const title = contact.title.trim();
  const orgTitle = [org, title].filter(Boolean).join(" · ");
  const location = (contact.location ?? "").trim();
  const profile = contact.encounters[0]?.context.publicProfile;
  const topics = profile?.topics ?? [];
  const offering = profile?.offering ?? [];
  const seeking = profile?.seeking ?? [];
  const next = contact.nextAction;
  const interactionAt = contact.editableInteraction?.occurredAt ? formatNoteTime(contact.editableInteraction.occurredAt, t) : dash;
  const interactionSummary = contact.lastInteraction.trim();
  const closeRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const el = event.target as HTMLElement | null;
      // 弹窗内附加态（会后纪要等）的输入框里按 Esc 不关闭
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      // 示例拦截层开着时 Esc 归它（它自己关），不连带关掉详情。
      if (demo?.intercept) return;
      close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, demo?.intercept]);

  const onOverlayClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) close();
  };

  // 设计 selOverview：图标 / 标签 / 值 / 说明；「联系频率」无数据源不渲染。
  const overview: { icon: string; label: string; value: string; desc: string }[] = [
    { icon: "⇢", label: t({ en: "Relationship tier", zh: "关系档位" }), value: tier ? t(TIER_LABEL[tier]) : t({ en: "Not scored yet", zh: "暂未评估" }), desc: tier ? t(TIER_STYLE[tier].desc) : t({ en: "Updates automatically after the next visit", zh: "下次打开时自动更新" }) },
    // 上次互动：值 = 互动时间，说明 = 互动摘要（无则下一步）；下次计划的 reason 与互动摘要相同时不重复。
    { icon: "◷", label: t({ en: "Last contact", zh: "上次互动" }), value: interactionAt, desc: interactionSummary || next?.text || dash },
    { icon: "▦", label: t({ en: "Next plan", zh: "下次计划" }), value: next?.text || dash, desc: next?.reason && next.reason.trim() !== interactionSummary ? next.reason : "" },
    // 来源说明经 metSummary 清洗：账号邮箱 / 「confirmed by」句不渲染（空则省略说明）。
    { icon: "◎", label: t({ en: "Source", zh: "来源" }), value: t(SOURCE_LABEL[source]), desc: metSummary(contact.met) },
  ];

  // 联系方式（台账偏差：设计稿无此块；沿用 nw-ov 行样式，只渲染非空字段，四项全空则整块省略）。
  const contacts: { icon: string; label: string; value: string }[] = [
    { icon: "✉", label: t({ en: "Email", zh: "邮箱" }), value: (contact.email ?? "").trim() },
    { icon: "☎", label: t({ en: "Phone", zh: "电话" }), value: (contact.phone ?? "").trim() },
    { icon: "▤", label: t({ en: "WeChat", zh: "微信" }), value: (contact.wechat ?? "").trim() },
    { icon: "▤", label: "LINE", value: (contact.lineId ?? "").trim() },
  ].filter((c) => c.value);

  // 名片备注里的「正面 · 文件名」是确认页的分组标题，详情里不显示。
  const cardNotes = (contact.cardNotes ?? "")
    .split(/\r?\n/)
    .filter((line) => !/^(正面|反面) · /.test(line.trim()))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const bullets = (items: readonly string[]) =>
    items.length ? items.map((item, i) => <span key={i} className="nw-li"><span className="nw-li-dot">•</span>{item}</span>) : <span className="nw-li"><span className="nw-li-dot">•</span>{dash}</span>;

  return (
    <div className="nw-overlay" onClick={onOverlayClick} data-network-modal="detail">
      <div ref={dialogRef} className="nw-modal nw-modal-detail" role="dialog" aria-modal="true" aria-label={t({ en: "Contact detail", zh: "联系人详情" })}>
        <div className="nw-modal-head">
          <strong className="nw-modal-title">{t({ en: "Contact detail", zh: "联系人详情" })}</strong>
          <a ref={closeRef} className="btn nw-modal-close" href={closeHref} onClick={onCloseLink} aria-label={t({ en: "Close", zh: "关闭" })}>×</a>
        </div>
        <div className="nw-detail-hero">
          <span className="nw-modal-avatar">{contact.initial || contact.displayName.slice(0, 1)}</span>
          <div className="nw-detail-id">
            <h2 className="nw-detail-name">{contact.displayName}{demo ? <DemoTag /> : null}</h2>
            <span className="nw-detail-org">{orgTitle}</span>
            <div className="nw-detail-meta">
              {location ? <span>◎ {location}</span> : null}
              <span>⇢ {t({ en: "From", zh: "来自" })} {t(SOURCE_LABEL[source])}</span>
              {tier ? (
                <>
                  <span className="nw-detail-stage" data-network-tier={tier} style={{ background: TIER_CHIP[tier].bg, color: TIER_CHIP[tier].fg }}>{t(TIER_LABEL[tier])}</span>
                  <button type="button" className="btn nw-basis-toggle" aria-expanded={basisOpen} onClick={() => setBasisOpen((open) => !open)}>{t({ en: "Why?", zh: "依据" })} {basisOpen ? "▴" : "▾"}</button>
                </>
              ) : null}
            </div>
            {tier && basisOpen ? <RelationshipBasis contact={contact} t={t} /> : null}
            {/* W0045（W45-2）：行业／职级／地区轻量编辑，保存走 PATCH 并标为手动值。 */}
            <ContactEnrichmentInline key={contact.id} contact={contact} guardWrite={guardWrite} language={language} t={t} />
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
        {contacts.length > 0 ? (
          <div className="nw-panel nw-panel-16" data-network-detail-contacts>
            <strong className="nw-panel-t">{t({ en: "Contact details", zh: "联系方式" })}</strong>
            <div className="nw-ov-grid">
              {contacts.map((c) => (
                <div key={c.label} className="nw-ov">
                  <span className="nw-ov-icon">{c.icon}</span>
                  <span className="nw-ov-copy"><span className="nw-ov-l">{c.label}</span><strong className="nw-ov-v">{c.value}</strong></span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {cardNotes ? (
          <div className="nw-panel nw-panel-16" data-network-detail-card-notes>
            <strong className="nw-panel-t">{t({ en: "Business card notes", zh: "名片备注" })}</strong>
            <p className="nw-card-notes">{cardNotes}</p>
          </div>
        ) : null}
        <div className="nw-detail-cols">
          <div className="nw-detail-col">
            {extra}
            <div className="nw-panel nw-panel-16">
              <div className="nw-panel-head"><strong className="nw-panel-t">{t({ en: "Recent interactions", zh: "最近互动" })}</strong></div>
              <RecentInteractions contact={contact} t={t} />
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
            <div className="nw-panel nw-panel-12" data-network-detail-plan-link>
              <strong className="nw-panel-t">{t({ en: "My plan", zh: "我的计划" })}</strong>
              <PlanNeedLinkPanel
                contactId={contact.id}
                guard={guardWrite ? () => (guardWrite(t({ en: "plan link", zh: "计划关联" })), true) : undefined}
              />
            </div>
          </div>
        </div>
        <div className="nw-detail-foot">
          <a className="btn nw-detail-close" href={closeHref} onClick={onCloseLink}>{t({ en: "Close", zh: "关闭" })}</a>
          <div className="nw-detail-foot-actions">
            <button type="button" className="btn nw-detail-follow" onClick={onFollow}>▤ {t({ en: "Write memo", zh: "写 memo" })}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 本页打开的示例详情：套上共用的弹窗无障碍行为（初始焦点、Tab 焦点圈定、Esc 关闭）。 */
function NetworkDemoDetailDialog({ closeHref, contact, onClose }: { closeHref: string; contact: OrbitContactView; onClose: () => void }) {
  const demo = useDemoMode();
  const interceptOpen = Boolean(demo?.intercept);
  // 「这是示例」拦截层叠在上面时 Esc 只归它；详情留着。
  const dialogRef = useOrbitModalA11y(() => {
    if (!interceptOpen) onClose();
  });
  return <NetworkDetailModal closeHref={closeHref} contact={contact} dialogRef={dialogRef} onClose={onClose} onFollow={() => undefined} />;
}

/**
 * 示例模式里点联系人：在本页打开示例详情弹窗（`buildDemoNetworkDetail`，纯前端），不导航、
 * 不发请求。不在示例里、不是示例联系人、或按了修饰键（新标签页打开）时什么都不做，
 * 链接照常导航。`closeHref` 只作关闭按钮的 href 语义，关闭本身只收起弹窗，并把焦点还给
 * 打开它的那个链接（Safari 点击链接不给链接焦点，所以不能只靠 activeElement 还原）。
 */
export function useNetworkDemoDetail(closeHref: string): {
  modal: ReactNode;
  openFromHref: (event: MouseEvent<HTMLElement>, href: string) => void;
} {
  const demo = useDemoMode();
  const { language } = useOrbitLanguage();
  const [openId, setOpenId] = useState<string | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const inDemo = demo !== null;
  const openFromHref = useCallback(
    (event: MouseEvent<HTMLElement>, href: string) => {
      if (!inDemo || event.defaultPrevented) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const id = demoContactIdFromHref(href);
      if (!id) return;
      event.preventDefault();
      triggerRef.current = event.currentTarget;
      setOpenId(id);
    },
    [inDemo],
  );
  const close = useCallback(() => setOpenId(null), []);
  // 弹窗卸载（含共用弹窗 hook 的焦点还原）之后再把焦点交回触发链接。
  useEffect(() => {
    if (openId !== null || !triggerRef.current) return;
    const trigger = triggerRef.current;
    triggerRef.current = null;
    trigger.focus?.();
  }, [openId]);
  const contact = useMemo(
    () => (inDemo && openId ? buildDemoNetworkDetail(openId, new Date(), language === "en" ? "en" : "zh") : null),
    [inDemo, language, openId],
  );
  const modal = contact ? <NetworkDemoDetailDialog closeHref={closeHref} contact={contact} onClose={close} /> : null;
  return { modal, openFromHref };
}
