/**
 * 联系人详情弹窗（Network v2 第 708–788 行）。
 * 数据只来自详情路由的 OrbitContactView（真实 notes / editableTags / lastInteraction / publicProfile）。
 * W0059：×、底部关闭、Esc、遮罩、左上「‹ 返回 {来源}」都调用同一个 close()——有站内来路后退，
 * 否则导航到 closeHref；「写 memo」打开「写 memo」弹窗。
 * W0047：手动阶段 UI 下线——「更新状态」按钮与「待设置关系」面板不再渲染（接口与阶段数据保留）；
 * 改为显示自动档位标签（新认识／有往来／核心／待唤醒，只由关系时间线推出）与「依据」面板（信号的日期、来源、时间线标题），
 * 不显示数字分数（W47-6），用户不能手改档位。
 * W0046：「最近互动」是聚合关系时间线（contact.timeline，详情页服务端读好；七种来源，最近 20 条）。
 * 省略（无数据源 / 死链接，见台账）：「···」「✎ 编辑资料」「▦ 约时间」「查看全部 →」、概览「联系频率」。
 * W0060（D55）：五块——①名片头卡（档位＋依据、行业／职级／地区 chip 可编辑、来源、联系方式点击复制、「写 memo」「约 TA」）
 * ②「为什么是 TA」（洞察＋已关联计划需求＋「+ 关联到其他需求」＋唯一下一步＋为什么现在＋「约 TA／起草邮件」）
 * ③能给／需要／话题三栏（只显示真实值；据名片推测的条目浅色＋角标）④最近互动（顶部快速 memo）
 * ⑤关系概览＋名片备注（默认收起）。底部只剩「关闭」。
 *
 * W0005 示例模式（`useDemoMode()` 非空）：名字旁带「示例」角标，「写 memo」改走
 * `guardWrite`，弹「这是示例」、不打开记录跟进、不发请求。`useNetworkDemoDetail` 让列表／概览／
 * 管线在示例里点联系人时直接在本页打开示例详情（前端数据，不导航、不发请求）；传了 `onClose`
 * 时关闭只收起弹窗，不再导航。
 */
"use client";

import { useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent, type ReactNode, type Ref } from "react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";

import { buildDemoNetworkDetail, demoContactIdFromHref } from "../../_demo/demo-network";
import { DemoTag, useDemoMode } from "../../_demo/demo-mode-core";
import { timelineAnchorId } from "./network-insight-copy";
import type { RelationshipTimelineItem, RelationshipTimelineSource } from "../../../../../shared/contract/relationship-timeline";
import type { OrbitContactView } from "../../orbit-contacts-route-view-model";
import { useOrbitLanguage } from "../../orbit-language-context";
import { useOrbitModalA11y } from "../../orbit-modal-a11y";
/** 「约 TA」的去处：个人日程（与旧计划匹配卡片同一个入口）。 */
const SCHEDULE_HREF = "/app/tasks/personal";
import type { ContactInsightView } from "../../../../../features/contacts/insights/view";
import { ContactEnrichmentInline } from "./contact-enrichment-inline";
import { DEFAULT_DETAIL_CLOSE_HREF, detailReturnLabel } from "./detail-return";
import { consumeContactDetailReturn } from "./detail-return-recorder";
import { contactWhyNow, evidenceFactsFromDetail, profileColumn, type ContactWhyNowAction, type ProfileColumnView } from "./contact-value";
import { buildMemoPatch, tokyoDayWindow, tokyoToday } from "./network-follow-modal";
import { NetworkInsightPanel } from "./network-insight-panel";
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
        <div key={item.id} id={timelineAnchorId(item.id)} className="nw-tl-row" data-timeline-source={item.source}>
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
 * W0047「依据」：强度缓存里的信号（按贡献降序，至多 12 条）。标题取同 id 的时间线条目——最近 20 条之外的
 * 由详情页按信号 id 读回（relationshipSignalItems）；仍找不到（来源已删除）才退回来源名。日期按东京时间。不显示分数。
 */
function RelationshipBasis({ contact, t }: { contact: OrbitContactView; t: Translate }) {
  const strength = contact.relationshipStrength;
  const byId = new Map([...(contact.timeline?.items ?? []), ...(contact.relationshipSignalItems ?? [])].map((item) => [item.id, item]));
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

/** W0060：详情计划关联（`readContactPlanContext` 的输出形状；页面服务端读好随详情下发）。 */
export interface NetworkDetailPlanContext {
  linkedNeeds: readonly { needId: string; title: string; phaseNo: number | null; phaseTitle: string | null }[];
  weekAction: (ContactWhyNowAction & { id: string; title: string }) | null;
}

/** W0060：第②块的洞察数据（W0057 状态与轮询在 `NetworkInsightPanel` 内）。 */
export interface NetworkDetailInsight {
  view: ContactInsightView;
  quotaExhausted: boolean;
  /** 当前关系目标原文（「对照目标：…」）。 */
  goal: string | null;
}

/** 头卡「· 来自 {来源} · {日期}」的日期：时间线里「建立联系」那条（东京日期）；没有就不写日期。 */
function capturedOn(contact: OrbitContactView, t: Translate): string | null {
  const capture = contact.timeline?.items.find((item) => item.source === "capture");
  return capture ? formatTimelineTime({ occurredAt: capture.occurredAt, occurredAtPrecision: "day" }, t) : null;
}

/** 复制联系方式：剪贴板可用就写入；不存在或被拒绝时退回选中该文本（不发请求、不记日志）。 */
async function copyChannel(value: string, element: HTMLElement | null): Promise<"copied" | "selected"> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return "copied";
    }
  } catch {
    // 被拒绝：退回选中。
  }
  try {
    const selection = typeof window !== "undefined" ? window.getSelection?.() : null;
    if (selection && element && typeof document !== "undefined") {
      const range = document.createRange();
      range.selectNodeContents(element);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  } catch {
    // 选不中也只提示手动复制。
  }
  return "selected";
}

/** 第④块顶部的快速 memo：一句 + 日期（默认东京今天）+ 保存；与完整弹窗同一个 `buildMemoPatch` 与 PATCH。 */
function QuickMemo({ contact, guardWrite, t }: { contact: OrbitContactView; guardWrite?: (label: string) => void; t: Translate }) {
  const [body, setBody] = useState("");
  const [date, setDate] = useState(() => tokyoToday());
  const [status, setStatus] = useState<"idle" | "saving" | "error" | "saved">("idle");
  const inFlight = useRef(false);
  const canSave = body.trim().length > 0 && Boolean(tokyoDayWindow(date)) && status !== "saving" && status !== "saved";
  async function save(event?: FormEvent) {
    event?.preventDefault();
    if (!canSave || inFlight.current) return;
    if (guardWrite) {
      guardWrite(t({ en: "memo", zh: "memo" }));
      return;
    }
    inFlight.current = true;
    setStatus("saving");
    try {
      const response = await fetch(`/api/contacts/${encodeURIComponent(contact.id)}`, {
        method: "PATCH", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildMemoPatch({ body, date })),
      });
      if (!response.ok) throw new Error("save failed");
      setStatus("saved");
      // 整页刷新（不新增历史条目，W0059 的后退不受影响）：时间线、档位与洞察都按新 memo 重读。
      window.location.reload();
    } catch {
      inFlight.current = false;
      setStatus("error");
    }
  }
  return (
    <form className="nw-qm" data-network-quick-memo={status} onSubmit={(event) => void save(event)}>
      <div className="nw-qm-row">
        <label className="nw-sr" htmlFor={`nw-qm-${contact.id}`}>{t({ en: "Quick memo", zh: "快速记一句" })}</label>
        <input
          id={`nw-qm-${contact.id}`}
          className="nw-qm-input"
          value={body}
          maxLength={2000}
          disabled={status === "saving" || status === "saved"}
          placeholder={t({ en: "Note it: what you talked about, what they need…", zh: "记一句：今天聊了什么、TA 提到什么需要…" })}
          onChange={(event) => { setBody(event.target.value); if (status === "error") setStatus("idle"); }}
        />
        <input
          className="nw-qm-date"
          type="date"
          aria-label={t({ en: "Date", zh: "日期" })}
          value={date}
          max={tokyoToday()}
          disabled={status === "saving" || status === "saved"}
          onChange={(event) => setDate(event.target.value)}
        />
        <button type="submit" className="btn nw-dv-primary" data-network-quick-memo-save disabled={!canSave}>
          {status === "saving" ? t({ en: "Saving…", zh: "正在保存…" }) : t({ en: "Save", zh: "保存" })}
        </button>
      </div>
      <span className="nw-qm-hint">{t({ en: "Used to organise “can offer / needs / topics” with AI. Only you can see it.", zh: "会用于 AI 整理「能给你的／需要的／话题」，仅你可见" })}</span>
      {status === "error" ? <span className="nw-qm-error" role="alert">{t({ en: "Couldn't save. Your text is still here — try again.", zh: "没能保存，文字还在，请重试。" })}</span> : null}
      {status === "saved" ? <span className="nw-qm-hint" role="status">{t({ en: "Saved", zh: "已保存" })}</span> : null}
    </form>
  );
}

/** 「起草邮件」：现有模板草稿接口（不保存、不发送、0 次模型调用），草稿在本卡内可编辑、可复制。 */
function useEmailDraft(contactId: string, language: "zh" | "en" | "ja") {
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [draft, setDraft] = useState<{ subject: string; body: string } | null>(null);
  const busy = useRef(false);
  const request = async () => {
    if (busy.current) return;
    busy.current = true;
    setState("loading");
    try {
      const response = await fetch(`/api/contacts/${encodeURIComponent(contactId)}/reconnect-draft`, {
        body: JSON.stringify({ language: language === "zh" ? "zh" : "en" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const body = (await response.json().catch(() => null)) as { success?: boolean; data?: { draft?: { subject?: unknown; body?: unknown } } } | null;
      const value = body?.data?.draft;
      if (!response.ok || body?.success !== true || typeof value?.subject !== "string" || typeof value.body !== "string") throw new Error("draft");
      setDraft({ body: value.body, subject: value.subject });
      setState("idle");
    } catch {
      setState("error");
    } finally {
      busy.current = false;
    }
  };
  return { draft, request, setDraft, state };
}

function ProfileColumnCard({ title, hint, view, topics = false, t }: { title: string; hint?: string; view: ProfileColumnView; topics?: boolean; t: Translate }) {
  const guessTag = <span className="nw-guess">{t({ en: "Inferred from card", zh: "据名片推测" })}</span>;
  return (
    <div className="nw-panel nw-dv-col" data-network-profile-column data-profile-inferred={view.inferred ? "true" : undefined}>
      <strong className="nw-dv-col-t">{title}{hint ? <span className="nw-dv-col-hint">{hint}</span> : null}</strong>
      {view.items.length === 0 ? (
        <span className="nw-dv-col-empty" data-network-profile-empty>{t({ en: "Write a memo and AI will organise this.", zh: "写一条 memo，AI 会帮你整理" })}</span>
      ) : topics ? (
        <div className="nw-topic-wrap">
          {view.items.map((item) => view.inferred
            ? <span key={item} className="nw-topic nw-topic-guess" data-profile-guess>{item} · {t({ en: "inferred", zh: "推测" })}</span>
            : <span key={item} className="nw-topic">{item}</span>)}
        </div>
      ) : (
        view.items.map((item, i) => (
          <span key={i} className={`nw-li${view.inferred ? " nw-li-guess" : ""}`} data-profile-guess={view.inferred ? "" : undefined}>
            <span className="nw-li-dot">•</span><span>{item}{view.inferred ? guessTag : null}</span>
          </span>
        ))
      )}
    </div>
  );
}

export function NetworkDetailModal({ contact, closeHref, onFollow: openFollow, extra, insight = null, planContext = null, onClose, dialogRef }: {
  contact: OrbitContactView;
  closeHref: string;
  onFollow: () => void;
  extra?: ReactNode;
  /** W0060：第②块「为什么是 TA」的洞察数据（null = 没有洞察数据，例如示例）。 */
  insight?: NetworkDetailInsight | null;
  /** W0060：计划关联（已关联需求、本周行动）；null = 没有计划或未读取。 */
  planContext?: NetworkDetailPlanContext | null;
  onClose?: () => void;
  dialogRef?: Ref<HTMLDivElement>;
}) {
  const { t, language } = useOrbitLanguage();
  const demo = useDemoMode();
  const guardWrite = demo?.guardWrite;
  // 示例里「写 memo」弹拦截层；真实页面打开「写 memo」弹窗。
  const onFollow = guardWrite ? () => guardWrite(t({ en: "memo", zh: "memo" })) : openFollow;
  const [basisOpen, setBasisOpen] = useState(false);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [copyNote, setCopyNote] = useState<{ label: string; kind: "copied" | "selected" } | null>(null);
  // W0059（D53）：有站内来路（一次性导航意图，挂载时消费）→ 后退回原页，浏览器恢复滚动；
  // 无来路 → closeHref（页面已校验的 returnTo，或 /app/contacts）。示例弹窗（传了 onClose）只收起、不读来路。
  // 不用 useRouter()：没有 App Router 的渲染环境（组件测试、SSR 片段）下它会抛错；router.back() 本身就是 history.back()。
  const router = useContext(AppRouterContext);
  const [returnFrom, setReturnFrom] = useState<string | null>(null);
  const returnConsumed = useRef(false);
  useEffect(() => {
    if (onClose || returnConsumed.current) return;
    returnConsumed.current = true;
    const from = consumeContactDetailReturn();
    if (from) setReturnFrom(from);
  }, [onClose]);
  const close = useCallback(() => {
    if (onClose) onClose();
    else if (returnFrom) {
      if (router) router.back();
      else window.history.back();
    } else window.location.assign(closeHref);
  }, [closeHref, onClose, returnFrom, router]);
  // 两个关闭链接保留 href（无 JS、中键／修饰键新标签页仍可用）；普通点击走同一个 close()。
  const onCloseLink = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== undefined && event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    close();
  };
  const backLabel = detailReturnLabel(onClose ? null : returnFrom ?? (closeHref !== DEFAULT_DETAIL_CLOSE_HREF ? closeHref : null));
  const draftEmail = useEmailDraft(contact.id, language);
  const dash = "—";
  const tier = tierGroupOf(contact.relationshipStrength);
  const source = sourceOf(contact);
  const org = contact.company.trim();
  const title = contact.title.trim();
  const orgTitle = [org, title].filter(Boolean).join(" · ");
  const profile = contact.encounters[0]?.context.publicProfile;
  const offering = profileColumn(profile, "offering");
  const seeking = profileColumn(profile, "seeking");
  const topics = profileColumn(profile, "topics");
  const next = contact.nextAction;
  const interactionAt = contact.editableInteraction?.occurredAt ? formatNoteTime(contact.editableInteraction.occurredAt, t) : dash;
  const interactionSummary = contact.lastInteraction.trim();
  const closeRef = useRef<HTMLAnchorElement>(null);
  const capturedDate = capturedOn(contact, t);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const el = event.target as HTMLElement | null;
      // 弹窗内的输入框（快速 memo、会后纪要等）里按 Esc 不关闭
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
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

  // 联系方式胶囊（头卡分隔线下）：只渲染非空字段，四项全空则整行省略；点击复制。
  const channels: { key: string; icon: string; label: string; value: string }[] = [
    { key: "email", icon: "✉", label: t({ en: "Email", zh: "邮箱" }), value: (contact.email ?? "").trim() },
    { key: "phone", icon: "☎", label: t({ en: "Phone", zh: "电话" }), value: (contact.phone ?? "").trim() },
    { key: "wechat", icon: "", label: t({ en: "WeChat", zh: "微信" }), value: (contact.wechat ?? "").trim() },
    { key: "line", icon: "", label: "LINE", value: (contact.lineId ?? "").trim() },
  ].filter((c) => c.value);

  // 名片备注里的「正面 · 文件名」是确认页的分组标题，详情里不显示。
  const cardNotes = (contact.cardNotes ?? "")
    .split(/\r?\n/)
    .filter((line) => !/^(正面|反面) · /.test(line.trim()))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // 「约 TA」去个人日程新建页（与计划行动卡「定时间」同一去处，W60-3）；示例里走拦截层、不导航。
  const onSchedule = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!guardWrite) return;
    event.preventDefault();
    guardWrite(t({ en: "schedule", zh: "约 TA" }));
  };
  const onDraft = () => {
    if (guardWrite) {
      guardWrite(t({ en: "email draft", zh: "邮件草稿" }));
      return;
    }
    void draftEmail.request();
  };
  const onCopy = async (label: string, value: string, element: HTMLElement | null) => {
    setCopyNote({ kind: await copyChannel(value, element), label });
  };
  const scheduleButton = (
    <a className="btn nw-dv-primary" href={SCHEDULE_HREF} onClick={onSchedule} data-network-detail-schedule>{t({ en: "Meet", zh: "约 TA" })}</a>
  );
  const linkedNeeds = planContext?.linkedNeeds ?? [];
  // R25：旧的「+ 关联到计划需求」（`PlanNeedLinkPanel`）随 v1 计划界面删除；只剩已关联需求的只读 chip，没有就不渲染。
  const planStrip = linkedNeeds.length === 0 ? null : (
    <div className="nw-why-needs" data-network-detail-plan-link>
      <span className="nw-why-needs-l">{t({ en: "Plan needs", zh: "对应计划需求" })}</span>
      {linkedNeeds.map((need) => (
        <span key={need.needId} className="nw-chip nw-why-need" data-plan-linked-need={need.needId}>
          {need.phaseNo !== null ? t({ en: `Phase ${need.phaseNo} · `, zh: `阶段 ${need.phaseNo} · ` }) : ""}{need.title} ✓
        </span>
      ))}
    </div>
  );
  const whyActions = (
    <>
      {scheduleButton}
      <button type="button" className="btn nw-dv-ghost" data-network-detail-draft disabled={draftEmail.state === "loading"} onClick={onDraft}>
        {draftEmail.state === "loading" ? t({ en: "Drafting…", zh: "正在起草…" }) : t({ en: "Draft email", zh: "起草邮件" })}
      </button>
    </>
  );
  // 示例数据没有的块不渲染空壳：示例里②只在有下一步时出现、③只在至少一栏有值时出现。
  const showWhy = !demo || Boolean(insight || next?.text?.trim());
  const showProfile = !demo || offering.items.length + seeking.items.length + topics.items.length > 0;

  return (
    <div className="nw-overlay" onClick={onOverlayClick} data-network-modal="detail">
      <div ref={dialogRef} className="nw-modal nw-modal-detail" role="dialog" aria-modal="true" aria-label={t({ en: "Contact detail", zh: "联系人详情" })}>
        <div className="nw-modal-head">
          <a className="btn nw-detail-back" href={closeHref} onClick={onCloseLink} data-network-detail-back>‹ {t(backLabel)}</a>
          <a ref={closeRef} className="btn nw-modal-close" href={closeHref} onClick={onCloseLink} aria-label={t({ en: "Close", zh: "关闭" })}>×</a>
        </div>

        {/* ① 名片头卡 */}
        <div className="nw-panel nw-dv-head" data-network-detail-section="head">
          <div className="nw-dv-head-main">
            <span className="nw-dv-avatar" aria-hidden="true">{contact.initial || contact.displayName.slice(0, 1)}</span>
            <div className="nw-dv-id">
              <div className="nw-dv-name-row">
                <h2 className="nw-detail-name">{contact.displayName}{demo ? <DemoTag /> : null}</h2>
                {tier ? (
                  <>
                    <span className="nw-detail-stage" data-network-tier={tier} style={{ background: TIER_CHIP[tier].bg, color: TIER_CHIP[tier].fg }}>{t(TIER_LABEL[tier])}</span>
                    <button type="button" className="btn nw-basis-toggle" aria-expanded={basisOpen} onClick={() => setBasisOpen((open) => !open)}>{t({ en: "Why?", zh: "依据" })} {basisOpen ? "▴" : "▾"}</button>
                  </>
                ) : null}
              </div>
              {orgTitle ? <span className="nw-detail-org">{orgTitle}</span> : null}
              {/* W0045（W45-2）／W0060：行业／职级／地区 chip，点开编辑，保存走 PATCH 并标为手动值。 */}
              <ContactEnrichmentInline
                key={contact.id}
                contact={contact}
                guardWrite={guardWrite}
                language={language}
                t={t}
                trailing={<span className="nw-dv-src" data-network-detail-source>· {t({ en: "From", zh: "来自" })} {t(SOURCE_LABEL[source])}{capturedDate ? ` · ${capturedDate}` : ""}</span>}
              />
              {tier && basisOpen ? <RelationshipBasis contact={contact} t={t} /> : null}
            </div>
            <div className="nw-dv-head-acts">
              <button type="button" className="btn nw-detail-follow" onClick={onFollow}>✎ {t({ en: "Write memo", zh: "写 memo" })}</button>
              {scheduleButton}
            </div>
          </div>
          {channels.length > 0 ? (
            <div className="nw-dv-channels" data-network-detail-contacts>
              {channels.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  className="btn nw-dv-channel"
                  data-network-channel={c.key}
                  aria-label={t({ en: `Copy ${c.label}: ${c.value}`, zh: `复制${c.label}：${c.value}` })}
                  onClick={(event) => void onCopy(c.label, c.value, event.currentTarget.querySelector("[data-channel-value]"))}
                >
                  {c.icon ? <span className="nw-dv-channel-i" aria-hidden="true">{c.icon}</span> : <span className="nw-dv-channel-l">{c.label}</span>}
                  <span data-channel-value>{c.value}</span>
                </button>
              ))}
              <span className="nw-dv-channels-hint">{t({ en: "Click to copy", zh: "点击复制" })}</span>
              {copyNote ? (
                <span className="nw-dv-copied" role="status" data-network-copy-status={copyNote.kind}>
                  {copyNote.kind === "copied" ? t({ en: `${copyNote.label} copied`, zh: `已复制${copyNote.label}` }) : t({ en: "Selected — copy it manually", zh: "已选中，可手动复制" })}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* ② 为什么是 TA */}
        {showWhy ? (
          <NetworkInsightPanel
            key={`why:${contact.id}`}
            view={insight?.view ?? null}
            quotaExhausted={insight?.quotaExhausted ?? false}
            goal={insight?.goal ?? null}
            contactHref={`/app/contacts/${encodeURIComponent(contact.id)}`}
            fallbackNextStep={next?.text ?? null}
            whyNow={contactWhyNow(planContext?.weekAction, t)}
            evidenceFacts={evidenceFactsFromDetail(contact.id, contact.timeline?.items, planContext?.linkedNeeds, contact.source === "scan")}
            valueFallback={{ name: contact.displayName, needTitle: planContext?.linkedNeeds[0]?.title ?? null, subtitle: [contact.company, contact.title].filter(Boolean).join(" · ") || null }}
            planStrip={planStrip}
            actions={whyActions}
            after={draftEmail.draft || draftEmail.state === "error" ? (
              <div className="nw-op-draft nw-why-draft" data-network-detail-draft-result>
                {draftEmail.draft ? (
                  <>
                    <input className="nw-op-draft-subject" aria-label={t({ en: "Subject", zh: "主题" })} value={draftEmail.draft.subject} onChange={(event) => draftEmail.setDraft({ ...draftEmail.draft!, subject: event.target.value })} />
                    <textarea className="nw-op-draft-body" aria-label={t({ en: "Email draft", zh: "邮件草稿" })} rows={8} value={draftEmail.draft.body} onChange={(event) => draftEmail.setDraft({ ...draftEmail.draft!, body: event.target.value })} />
                    <span className="nw-ai-desc">{t({ en: "Only a draft — Orbit never sends it.", zh: "只是草稿，Orbit 不会替你发送。" })}</span>
                  </>
                ) : null}
                {draftEmail.state === "error" ? <span className="nw-op-error" role="alert">{t({ en: "Couldn't draft the email. Try again.", zh: "没能起草邮件，请重试。" })}</span> : null}
              </div>
            ) : null}
          />
        ) : null}

        {/* ③ 能给／需要／话题（D54 标签语义） */}
        {showProfile ? (
          <div className="nw-dv-cols" data-network-detail-section="profile">
            <ProfileColumnCard title={t({ en: "What they can offer you", zh: "TA 能给你的" })} view={offering} t={t} />
            <ProfileColumnCard title={t({ en: "What they need", zh: "TA 需要的" })} hint={t({ en: "you may help", zh: "你也许帮得上" })} view={seeking} t={t} />
            <ProfileColumnCard title={t({ en: "Topics to talk about", zh: "可以聊的话题" })} view={topics} topics t={t} />
          </div>
        ) : null}

        {/* ④ 最近互动（顶部快速 memo；会后纪要／约谈附加态在本块顶部） */}
        <div className="nw-panel nw-panel-16" data-network-detail-section="recent">
          <div className="nw-panel-head"><strong className="nw-panel-t">{t({ en: "Recent interactions", zh: "最近互动" })}</strong></div>
          {extra}
          <QuickMemo contact={contact} guardWrite={guardWrite} t={t} />
          <RecentInteractions contact={contact} t={t} />
        </div>

        {/* ⑤ 关系概览 · 名片备注（默认收起，不持久化） */}
        <div className="nw-panel nw-dv-fold" data-network-detail-section="overview">
          <button type="button" className="btn nw-dv-fold-btn" aria-expanded={overviewOpen} aria-controls={`nw-dv-overview-${contact.id}`} onClick={() => setOverviewOpen((open) => !open)}>
            <span className="nw-dv-fold-t">{cardNotes ? t({ en: "Relationship overview · Card notes", zh: "关系概览 · 名片备注" }) : t({ en: "Relationship overview", zh: "关系概览" })}</span>
            <span className="nw-dv-fold-s">{overviewOpen ? t({ en: "Collapse ▴", zh: "收起 ▴" }) : t({ en: "Expand ▾", zh: "展开 ▾" })}</span>
          </button>
          {overviewOpen ? (
            <div id={`nw-dv-overview-${contact.id}`} className="nw-dv-fold-body">
              <div className="nw-ov-grid">
                {overview.map((o) => (
                  <div key={o.label} className="nw-ov">
                    <span className="nw-ov-icon">{o.icon}</span>
                    <span className="nw-ov-copy"><span className="nw-ov-l">{o.label}</span><strong className="nw-ov-v">{o.value}</strong>{o.desc ? <span className="nw-ov-d">{o.desc}</span> : null}</span>
                  </div>
                ))}
              </div>
              {cardNotes ? (
                <div className="nw-dv-notes" data-network-detail-card-notes>
                  <span className="nw-ov-l">{t({ en: "Business card notes", zh: "名片备注" })}</span>
                  <p className="nw-card-notes">{cardNotes}</p>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="nw-detail-foot">
          <a className="btn nw-detail-close" href={closeHref} onClick={onCloseLink}>{t({ en: "Close", zh: "关闭" })}</a>
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
