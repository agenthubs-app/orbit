"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useState } from "react";

import { AccountTopNav } from "../orbit-account-shell";
import { CrmSidebar as SharedCrmSidebar } from "./orbit-crm-sidebar";
import { OrbitCardsInteractions } from "./orbit-cards-interactions";
import { useOrbitLanguage } from "../orbit-language-context";
import { Avatar, Icon } from "../orbit-reference-primitives";
import { Basis, SourceBadge } from "./orbit-real-contacts";
import { ORBIT_LEFT_SIDEBAR_WIDTH } from "../orbit-layout-constants";
import type {
  OrbitContactPipelineStatus,
  OrbitContactView,
  OrbitContactsViewModel,
} from "../orbit-contacts-route-view-model";

type Copy = { en: string; zh: string };
type Translate = (copy: Copy) => string;
type Src = "scan" | "qr" | "event" | "contact" | "referral";
type Strength = "strong" | "medium" | "dormant";
type Priority = "high" | "med" | "low";

// ---- flat surface (card-flat is not in the real app styles) ----
const flat: CSSProperties = {
  background: "var(--surface-2)",
  border: "1px solid var(--hairline)",
  borderRadius: "var(--r-md)",
};

// ---- static people (same as prototype, same gradients) ----
interface Person {
  g: string;
  ini: string;
  name: string; // combined display (always shown)
  org: Copy;
  pn: string; // short pager label
  qn: string; // queue name
}

const P: Record<string, Person> = {
  emily: { g: "g-sky", ini: "E", name: "Emily Wong", org: { en: "Northlight Capital · Partner", zh: "Northlight Capital · 投资合伙人" }, pn: "Emily", qn: "Emily Wong" },
  hana: { g: "g-violet", ini: "花", name: "佐藤花 · Hana Sato", org: { en: "Aki Robotics · Partnerships", zh: "Aki Robotics · 合作负责人" }, pn: "佐藤花", qn: "佐藤花" },
  ken: { g: "g-emerald", ini: "健", name: "田中健 · Ken Tanaka", org: { en: "Loop Events · BizDev", zh: "Loop Events · 商务拓展" }, pn: "田中健", qn: "田中健" },
  lin: { g: "g-slate", ini: "敏", name: "林敏 · Lin Min", org: { en: "Referral · linked", zh: "推荐关系 · 已建立" }, pn: "林敏", qn: "林敏" },
  liu: { g: "g-slate", ini: "洋", name: "刘洋 · Yang Liu", org: { en: "DevScale · Eng Director", zh: "DevScale · 技术总监" }, pn: "刘洋", qn: "刘洋" },
  sarah: { g: "g-rose", ini: "S", name: "Sarah Kim", org: { en: "Loop Events · Organizer", zh: "Loop Events · 活动主办方" }, pn: "Sarah", qn: "Sarah Kim" },
  wei: { g: "g-amber", ini: "伟", name: "陈伟 · Wei Chen", org: { en: "Weilai F&B · Founder", zh: "味来餐饮 · 创始人" }, pn: "陈伟", qn: "陈伟" },
};

// ---- after-event triage queue ----
interface Triage {
  done: boolean;
  p: Person;
  qs: Copy; // queue subtitle
  summary: string;
  tags: Copy[];
  where: Copy;
}

const triageQueue: Triage[] = [
  {
    p: P.hana, done: false,
    qs: { en: "Scanned · owe deck", zh: "名片扫描 · 待发资料" },
    where: { en: "AI Summit 2026 · on-site card scan · matched: you both seek manufacturing channels", zh: "AI 峰会 2026 · 现场名片扫描 · 匹配理由：双方都在找制造业渠道" },
    tags: [{ en: "Partnership", zh: "潜在合作" }, { en: "Tech", zh: "技术资源" }],
    summary: "聊了机器人渠道合作，对方想找日本制造业客户，我承诺发送产品资料",
  },
  {
    p: P.wei, done: false,
    qs: { en: "Event · F&B lead", zh: "活动导入 · 餐饮潜客" },
    where: { en: "AI Summit 2026 · booth chat · matched: F&B channel partnership", zh: "AI 峰会 2026 · 展位对话 · 匹配理由：餐饮渠道合作" },
    tags: [{ en: "F&B lead", zh: "餐饮潜客" }, { en: "Channel", zh: "渠道合作" }],
    summary: "在展位聊到渠道合作，计划会后打招呼并回顾展位对话",
  },
  {
    p: P.emily, done: false,
    qs: { en: "QR · owe a call", zh: "现场扫码 · 待约会议" },
    where: { en: "AI Summit 2026 · QR scan · matched: seed-round interest", zh: "AI 峰会 2026 · 现场扫码 · 匹配理由：种子轮投资意向" },
    tags: [{ en: "High value", zh: "高价值" }, { en: "Investor", zh: "投资人" }],
    summary: "对种子轮表达兴趣，计划约 30 分钟深聊介绍进展",
  },
  {
    p: P.ken, done: true,
    qs: { en: "QR · connector", zh: "现场扫码 · 资源介绍人" },
    where: { en: "AI Summit 2026 · QR scan · matched: connector", zh: "AI 峰会 2026 · 现场扫码 · 匹配理由：资源介绍人" },
    tags: [{ en: "Connector", zh: "资源介绍人" }],
    summary: "现场认识的资源介绍人，已引荐 Sarah，待回报一条对口资源",
  },
  {
    p: P.lin, done: true,
    qs: { en: "Referral · linked", zh: "推荐关系 · 已建立" },
    where: { en: "Referral · already linked", zh: "朋友推荐 · 已建立联系" },
    tags: [{ en: "Referral", zh: "推荐关系" }],
    summary: "通过朋友推荐建立联系，资料与标签已整理完成",
  },
];

// ---- reminders ----
interface Reminder {
  basisAlign?: "right";
  basisCopy: Copy;
  basisKind: "ai" | "rule";
  body: Copy;
  color: string;
  evidenceId?: string;
  icon: string;
  sub: Copy;
}

const reminders: Reminder[] = [
  {
    icon: "mail", color: "var(--amber)",
    body: { en: "You promised Hana Sato a product deck — not sent yet", zh: "你答应给 佐藤花 发产品资料，还没发出" },
    basisKind: "ai", evidenceId: "evidence:summary-hana-0705",
    basisCopy: { en: "Trigger: summary detected a promise to send the deck, unfulfilled for 2 days.", zh: "触发依据：交流摘要检出承诺“发产品资料”，2 天未兑现。" },
    sub: { en: "Promised 2 days ago · AI Summit 2026", zh: "承诺于 2 天前 · AI 峰会 2026" },
  },
  {
    icon: "calendar", color: "var(--sky)",
    body: { en: "Emily Wong is warm on the seed round — book a call soon", zh: "Emily Wong 对种子轮有兴趣，适合尽快约会议" },
    basisKind: "ai", evidenceId: "evidence:qr-exchange-emily",
    basisCopy: { en: "Trigger: yesterday's talk signaled interest + high value → nudge to follow up.", zh: "触发依据：昨日对话表达投资意向 + 高价值 → 建议尽快跟进。" },
    sub: { en: "High value · engaged yesterday", zh: "高价值 · 昨天互动" },
  },
  {
    icon: "bell", color: "var(--rose)",
    body: { en: "Yang Liu has stalled 30+ days — time to reactivate", zh: "与 刘洋 的关系已超 30 天未推进，建议重新激活" },
    basisKind: "rule", basisAlign: "right",
    basisCopy: { en: "Trigger: pipeline stage idle > 30 days → auto reminder to advance.", zh: "触发依据：管线阶段停滞 > 30 天 → 自动生成推进提醒。" },
    sub: { en: "Dormant · last touch 5 months ago", zh: "沉睡 · 上次互动 5 个月前" },
  },
];

const strengthMeta: Record<Strength, { cls: string; label: Copy }> = {
  strong: { cls: "nc-st-strong", label: { en: "Strong", zh: "强" } },
  medium: { cls: "nc-st-medium", label: { en: "Medium", zh: "中" } },
  dormant: { cls: "nc-st-dormant", label: { en: "Dormant", zh: "沉睡" } },
};

function StrengthTag({ strength, t }: { strength: Strength; t: Translate }) {
  const meta = strengthMeta[strength];
  return <span className={`nc-strength ${meta.cls}`}><span className="nc-dot" />{t(meta.label)}</span>;
}

function ValueTag({ copy, t }: { copy: Copy; t: Translate }) {
  return <span className="nc-tag nc-tag-value">{t(copy)}</span>;
}

const ellip: CSSProperties = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };

// ---- real-data kanban card: opens the contact + sets the relationship stage ----
function PipelineCard({
  contact,
  effStatus,
  onSetStatus,
  statuses,
  t,
}: {
  contact: OrbitContactView;
  effStatus: OrbitContactPipelineStatus;
  onSetStatus: (id: string, status: OrbitContactPipelineStatus) => void;
  statuses: { label: string; value: OrbitContactPipelineStatus }[];
  t: Translate;
}) {
  const showStrength = contact.strength === "strong" || contact.strength === "dormant";
  return (
    <a className="nc-kcard" href={`/app/contacts/${contact.id}`}>
      <div style={{ alignItems: "center", display: "flex", gap: 10 }}>
        <Avatar g={contact.g || "g-violet"} letter={contact.initial} size={44} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="nc-knm" style={ellip}>{contact.displayName}</div>
          <div className="nc-korg" style={ellip}>{contact.company}{contact.title ? ` · ${contact.title}` : ""}</div>
        </div>
      </div>
      <div className="nc-krow1">
        <SourceBadge source={contact.source} t={t} />
        {showStrength ? <StrengthTag strength={contact.strength === "dormant" ? "dormant" : "strong"} t={t} /> : null}
        {contact.valueTags[0] ? <span className="nc-tag nc-tag-value">{contact.valueTags[0]}</span> : null}
      </div>
      {contact.nextAction ? (
        <div className="nc-knext">
          <Icon name={contact.dormant ? "refresh" : "arrow"} size={16} />
          <span style={{ flex: 1 }}>{contact.nextAction.text}</span>
          <Basis copy={{ en: contact.nextAction.reason, zh: contact.nextAction.reason }} evidenceId={contact.nextAction.evidenceId} kind={contact.dormant ? "rule" : "ai"} t={t} />
        </div>
      ) : null}
      <div className="nc-kstage" onClick={(event) => event.stopPropagation()}>
        <span className="nc-kstage-lbl">{t({ en: "Stage", zh: "阶段" })}</span>
        {statuses.map((status) => (
          <button
            aria-pressed={effStatus === status.value}
            className={effStatus === status.value ? "is-on" : ""}
            key={status.value}
            onClick={(event) => { event.preventDefault(); event.stopPropagation(); onSetStatus(contact.id, status.value); }}
            type="button"
          >
            {status.label}
          </button>
        ))}
      </div>
    </a>
  );
}

function AetLabel({ children }: { children: ReactNode }) {
  return <div className="nc-aet-lbl">{children}</div>;
}

function TriageCard({
  compact,
  index,
  onDraft,
  onNext,
  onPrev,
  t,
  total,
  triage,
}: {
  compact?: boolean;
  index: number;
  onDraft: (name: string) => void;
  onNext: () => void;
  onPrev: () => void;
  t: Translate;
  total: number;
  triage: Triage;
}) {
  const { p } = triage;
  const counter = compact ? `${index + 1}/${total}` : `${index + 1} / ${total}`;

  return (
    <div className="nc-aet" style={flat}>
      <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div style={{ alignItems: "center", display: "flex", gap: compact ? 10 : 12, minWidth: 0 }}>
          <Avatar g={p.g} letter={p.ini} size={compact ? 44 : 56} />
          <div style={{ minWidth: 0 }}>
            <div className="h-section" style={{ fontSize: compact ? 14.5 : 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
            <div style={{ color: "var(--text-3)", fontSize: 13, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t(p.org)}</div>
          </div>
        </div>
        <div style={{ alignItems: "center", display: "flex", flexShrink: 0, gap: compact ? 6 : 8 }}>
          <span className="mono" style={{ color: "var(--text-3)", fontSize: 12, whiteSpace: "nowrap" }}>{counter}</span>
          <div className="nc-aet-nav">
            <button aria-label={t({ en: "Previous", zh: "上一位" })} onClick={onPrev} type="button">
              <Icon name="chevR" size={16} style={{ transform: "rotate(180deg)" }} />
            </button>
            <button aria-label={t({ en: "Next", zh: "下一位" })} onClick={onNext} type="button">
              <Icon name="chevR" size={16} />
            </button>
          </div>
        </div>
      </div>

      <div className="nc-aet-block">
        <AetLabel>
          <Icon color="var(--text-3)" name="pin" size={14} />
          {t({ en: "Where you met", zh: "来源与场景" })}
          <Basis align={compact ? "below" : undefined} copy={{ en: "From on-site card scan + host matching record — auto, read-only.", zh: "来自现场名片扫描 + 主办方匹配记录，自动带入、只读。" }} evidenceId="evidence:event-ai-summit-2026" kind="evidence" t={t} />
        </AetLabel>
        <div className="nc-aet-ctx">{t(triage.where)}</div>
      </div>

      <div className="nc-aet-block">
        <AetLabel>
          <Icon color="var(--text-3)" name="star" size={14} />
          {t({ en: "Suggested tags", zh: "建议标签 / 价值" })}
          <Basis align={compact ? "below" : undefined} copy={{ en: "Basis: your seeking × her offering — editable.", zh: "依据：你的 seeking × 对方 offering 推断，可增删。" }} kind="ai" t={t} />
        </AetLabel>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {triage.tags.map((tag) => <ValueTag copy={tag} key={tag.en} t={t} />)}
          <button className="chip nc-chip-sm" type="button"><Icon name="plus" size={14} />{t({ en: "Add", zh: "加标签" })}</button>
        </div>
      </div>

      <div className="nc-aet-block">
        <AetLabel>
          <Icon color="var(--text-3)" name="edit" size={14} />
          {t({ en: "Summary · about this contact", zh: `交流摘要 · 关于${p.pn}` })}
        </AetLabel>
        <textarea className="field" defaultValue={triage.summary} style={{ minHeight: compact ? 70 : 74 }} />
        <div style={{ color: "var(--text-3)", fontSize: 13, marginTop: 6 }}>{t({ en: "Saved to their connection profile timeline; feeds value analysis.", zh: "这条会存入 TA 的连接画像时间线，并参与价值分析。" })}</div>
      </div>

      <div className="nc-aet-block" style={{ display: "flex", flexDirection: compact ? "column" : "row", gap: 8 }}>
        <button className="btn btn-primary btn-sm" onClick={() => onDraft(p.name)} style={compact ? { width: "100%" } : { flex: 1, justifyContent: "center", minWidth: 0 }} type="button">
          <Icon name="mail" size={16} />{t({ en: "Draft email", zh: "起草个性化邮件" })}
        </button>
        <button className="btn btn-ghost btn-sm" style={compact ? { width: "100%" } : undefined} type="button">
          <Icon name="bell" size={16} />{t({ en: "Set reminder", zh: "设跟进提醒" })}
        </button>
      </div>
      <div style={{ alignItems: "flex-start", background: "var(--amber-soft)", borderRadius: "var(--r-md)", color: "var(--text-2)", display: "flex", fontSize: 12.5, gap: 8, lineHeight: 1.5, marginTop: 12, padding: "10px 12px" }}>
        <Icon color="var(--amber)" name="checkCircle" size={16} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>{t({ en: "The email is personalized from their summary and confirmed before sending — not a blast.", zh: "邮件按 TA 的摘要单独生成、外发前需你确认——不是群发。" })}</span>
      </div>
    </div>
  );
}

function QueueRow({ current, onPick, t, triage }: { current: boolean; onPick: () => void; t: Translate; triage: Triage }) {
  const dotColor = triage.done ? "var(--live)" : "var(--amber)";
  const textColor = triage.done ? "var(--live-text)" : "var(--amber)";
  return (
    <button className={`nc-qrow${current ? " is-cur" : ""}`} onClick={onPick} type="button">
      <Avatar g={triage.p.g} letter={triage.p.ini} size={34} />
      <div style={{ minWidth: 0 }}>
        <div className="nc-qn">{triage.p.qn}</div>
        <div className="nc-qs">{t(triage.qs)}</div>
      </div>
      <span className="nc-qbadge" style={{ color: textColor }}>
        <span className="nc-d" style={{ background: dotColor }} />
        {triage.done ? t({ en: "Done", zh: "已整理" }) : t({ en: "To do", zh: "待整理" })}
      </span>
    </button>
  );
}

function ReminderRow({ compact, reminder, t }: { compact?: boolean; reminder: Reminder; t: Translate }) {
  return (
    <div className="nc-rem">
      <span className="nc-rem-ic"><Icon color={reminder.color} name={reminder.icon} size={22} /></span>
      <div className="nc-rem-body">
        <span>{t(reminder.body)}</span>{" "}
        <Basis align={compact ? "below" : reminder.basisAlign} copy={reminder.basisCopy} evidenceId={reminder.evidenceId} kind={reminder.basisKind} t={t} />
        <div className="nc-rem-sub">{t(reminder.sub)}</div>
      </div>
      <div className="nc-rem-acts">
        {compact ? null : (
          <button className="chip nc-chip-sm" type="button"><Icon name="clock" size={14} />{t({ en: "Snooze", zh: "稍后" })}</button>
        )}
        <button className="chip nc-chip-sm chip-accent" type="button"><Icon name="check" size={14} />{compact ? null : t({ en: "Done", zh: "完成" })}</button>
      </div>
    </div>
  );
}

const LOCAL_STYLES = `
[data-orbit-real-page="contacts-pipeline"] .nc-evt { display:inline-flex; align-items:center; gap:7px; height:36px; padding:0 12px; border-radius:var(--r-pill); background:var(--amber-soft); color:var(--amber-text); font-size:13px; font-weight:600; border:1px solid transparent; }
[data-orbit-real-page="contacts-pipeline"] .nc-evt svg { color:var(--amber); }
[data-orbit-real-page="contacts-pipeline"] .nc-evt .nc-x { color:var(--amber); opacity:.7; margin-left:2px; }

[data-orbit-real-page="contacts-pipeline"] .nc-kanban { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; align-items:start; }
[data-orbit-real-page="contacts-pipeline"] .nc-kcol { background:var(--surface-2); border:1px solid var(--hairline); border-radius:var(--r-md); padding:12px; }
[data-orbit-real-page="contacts-pipeline"] .nc-kcol-head { display:flex; align-items:center; gap:8px; padding:2px 4px 12px; }
[data-orbit-real-page="contacts-pipeline"] .nc-kcol-head .nc-cdot { width:9px; height:9px; border-radius:50%; flex-shrink:0; }
[data-orbit-real-page="contacts-pipeline"] .nc-kcol-head .nc-clab { font-size:13.5px; font-weight:700; color:var(--ink); }
[data-orbit-real-page="contacts-pipeline"] .nc-kcol-head .nc-ccount { margin-left:auto; font-family:var(--ff-mono); font-size:12px; color:var(--text-2); background:var(--surface-3); border-radius:var(--r-pill); padding:2px 9px; }
[data-orbit-real-page="contacts-pipeline"] .nc-cdot-amber { background:var(--amber); }
[data-orbit-real-page="contacts-pipeline"] .nc-cdot-sky { background:var(--sky); }
[data-orbit-real-page="contacts-pipeline"] .nc-cdot-live { background:var(--live); }
[data-orbit-real-page="contacts-pipeline"] .nc-kcards { display:flex; flex-direction:column; gap:10px; }
[data-orbit-real-page="contacts-pipeline"] .nc-kcard { display:block; background:var(--surface); border:1px solid var(--border); border-radius:var(--r-md); padding:13px; box-shadow:var(--sh-xs); cursor:pointer; text-decoration:none; color:inherit; transition:box-shadow .18s, transform .18s, border-color .18s; }
[data-orbit-real-page="contacts-pipeline"] .nc-kcard:hover { border-color:var(--border-2); box-shadow:var(--sh-md); transform:translateY(-2px); }
[data-orbit-real-page="contacts-pipeline"] .nc-knm { font-size:14px; font-weight:700; color:var(--ink); }
[data-orbit-real-page="contacts-pipeline"] .nc-korg { font-size:12px; color:var(--text-3); margin-top:1px; }
[data-orbit-real-page="contacts-pipeline"] .nc-krow1 { display:flex; align-items:center; gap:6px; margin-top:9px; flex-wrap:wrap; }
[data-orbit-real-page="contacts-pipeline"] .nc-knext { display:flex; gap:7px; align-items:flex-start; font-size:12.5px; line-height:1.4; color:var(--text-2); margin-top:10px; padding:8px 10px; background:var(--surface-2); border-radius:var(--r-sm); }
[data-orbit-real-page="contacts-pipeline"] .nc-knext > svg { color:var(--accent); flex-shrink:0; margin-top:1px; }
[data-orbit-real-page="contacts-pipeline"] .nc-kfoot { display:flex; align-items:center; gap:8px; margin-top:11px; }
[data-orbit-real-page="contacts-pipeline"] .nc-kfoot .nc-kdue { margin-left:auto; font-family:var(--ff-mono); font-size:12px; color:var(--text-3); }
[data-orbit-real-page="contacts-pipeline"] .nc-pri { width:9px; height:9px; border-radius:50%; flex-shrink:0; box-shadow:0 0 0 3px var(--surface); }
[data-orbit-real-page="contacts-pipeline"] .nc-pri-high { background:var(--rose); }
[data-orbit-real-page="contacts-pipeline"] .nc-pri-med { background:var(--amber); }
[data-orbit-real-page="contacts-pipeline"] .nc-pri-low { background:var(--text-3); }

[data-orbit-real-page="contacts-pipeline"] .nc-kstage { display:flex; align-items:center; gap:5px; margin-top:11px; padding-top:11px; border-top:1px solid var(--hairline); }
[data-orbit-real-page="contacts-pipeline"] .nc-kstage-lbl { font-size:11px; font-weight:600; color:var(--text-4); letter-spacing:.04em; margin-right:1px; }
[data-orbit-real-page="contacts-pipeline"] .nc-kstage button { flex:1; min-width:0; height:26px; padding:0 6px; border-radius:var(--r-sm); border:1px solid var(--border); background:var(--surface-2); color:var(--text-3); font-size:11.5px; font-weight:600; cursor:pointer; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; transition:background .15s, color .15s, border-color .15s; }
[data-orbit-real-page="contacts-pipeline"] .nc-kstage button:hover { color:var(--text); border-color:var(--border-2); }
[data-orbit-real-page="contacts-pipeline"] .nc-kstage button.is-on { background:var(--accent-soft); border-color:var(--accent-ring); color:var(--accent); }

[data-orbit-real-page="contacts-pipeline"] .nc-chip-sm { height:24px; font-size:12px; padding:0 9px; }

[data-orbit-real-page="contacts-pipeline"] .nc-ae-sub { font-size:13px; font-weight:700; color:var(--ink); display:flex; align-items:center; gap:8px; margin:0 0 10px; }
[data-orbit-real-page="contacts-pipeline"] .nc-ae-sub > svg { color:var(--accent); }

[data-orbit-real-page="contacts-pipeline"] .nc-rem { display:flex; align-items:center; gap:12px; padding:12px 14px; border-radius:var(--r-md); background:var(--surface-2); border:1px solid var(--hairline); }
[data-orbit-real-page="contacts-pipeline"] .nc-rem-ic { flex-shrink:0; display:inline-flex; }
[data-orbit-real-page="contacts-pipeline"] .nc-rem-body { flex:1; min-width:0; font-size:13px; color:var(--text); line-height:1.4; }
[data-orbit-real-page="contacts-pipeline"] .nc-rem-body .nc-rem-sub { font-size:12px; color:var(--text-3); margin-top:2px; }
[data-orbit-real-page="contacts-pipeline"] .nc-rem-acts { display:flex; gap:6px; flex-shrink:0; }

[data-orbit-real-page="contacts-pipeline"] .nc-ae2 { display:grid; grid-template-columns:258px 1fr; gap:16px; align-items:start; }
[data-orbit-real-page="contacts-pipeline"] .nc-aeq { display:flex; flex-direction:column; gap:6px; }
[data-orbit-real-page="contacts-pipeline"] .nc-aeq-h { font-size:11px; font-weight:600; color:var(--text-4); letter-spacing:.08em; text-transform:uppercase; padding:0 4px 4px; }
[data-orbit-real-page="contacts-pipeline"] .nc-qrow { display:grid; grid-template-columns:34px 1fr auto; align-items:center; gap:10px; width:100%; text-align:left; background:var(--surface-2); border:1px solid transparent; border-radius:var(--r-md); padding:9px 11px; cursor:pointer; }
[data-orbit-real-page="contacts-pipeline"] .nc-qrow:hover { background:var(--surface-3); }
[data-orbit-real-page="contacts-pipeline"] .nc-qrow.is-cur { background:var(--accent-softer); border-color:var(--accent-ring); }
[data-orbit-real-page="contacts-pipeline"] .nc-qn { font-size:13.5px; font-weight:600; color:var(--ink); }
[data-orbit-real-page="contacts-pipeline"] .nc-qs { font-size:11.5px; color:var(--text-3); margin-top:1px; }
[data-orbit-real-page="contacts-pipeline"] .nc-qbadge { font-size:11px; font-weight:600; display:inline-flex; align-items:center; gap:5px; white-space:nowrap; }
[data-orbit-real-page="contacts-pipeline"] .nc-qbadge .nc-d { width:6px; height:6px; border-radius:50%; }
[data-orbit-real-page="contacts-pipeline"] .nc-aet { padding:16px; }
[data-orbit-real-page="contacts-pipeline"] .nc-aet-nav { display:flex; align-items:center; gap:4px; }
[data-orbit-real-page="contacts-pipeline"] .nc-aet-nav button { width:30px; height:30px; min-width:0; padding:0; display:inline-flex; align-items:center; justify-content:center; border-radius:var(--r-sm); background:var(--surface-2); border:1px solid var(--border-2); color:var(--text-2); cursor:pointer; }
[data-orbit-real-page="contacts-pipeline"] .nc-aet-block { margin-top:15px; }
[data-orbit-real-page="contacts-pipeline"] .nc-aet-lbl { font-size:12px; font-weight:600; color:var(--text-2); margin-bottom:7px; display:flex; align-items:center; gap:6px; }
[data-orbit-real-page="contacts-pipeline"] .nc-aet-ctx { font-size:13px; color:var(--text-2); line-height:1.6; background:var(--surface); border:1px solid var(--hairline); border-radius:var(--r-sm); padding:10px 12px; }

[data-orbit-real-page="contacts-pipeline"] .nc-qpager { display:flex; gap:12px; overflow-x:auto; padding:2px 2px 8px; margin-bottom:12px; }
[data-orbit-real-page="contacts-pipeline"] .nc-qav { display:flex; flex-direction:column; align-items:center; gap:5px; width:52px; flex-shrink:0; background:none; border:0; cursor:pointer; padding:0; }
[data-orbit-real-page="contacts-pipeline"] .nc-avwrap { position:relative; display:inline-flex; }
[data-orbit-real-page="contacts-pipeline"] .nc-qav.is-cur .nc-avwrap .avatar { box-shadow:0 0 0 2px var(--accent); }
[data-orbit-real-page="contacts-pipeline"] .nc-sdot { position:absolute; right:-1px; bottom:-1px; width:10px; height:10px; border-radius:50%; border:2px solid var(--bg); }
[data-orbit-real-page="contacts-pipeline"] .nc-qnm { font-size:10.5px; color:var(--text-3); max-width:52px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
[data-orbit-real-page="contacts-pipeline"] .nc-qav.is-cur .nc-qnm { color:var(--text); font-weight:600; }

[data-orbit-real-page="contacts-pipeline"] .nc-mgrp { display:flex; align-items:center; gap:8px; margin:16px 2px 10px; }
[data-orbit-real-page="contacts-pipeline"] .nc-mgrp .nc-cdot { width:8px; height:8px; border-radius:50%; }
[data-orbit-real-page="contacts-pipeline"] .nc-mgrp .nc-lab { font-size:13px; font-weight:700; color:var(--ink); }
[data-orbit-real-page="contacts-pipeline"] .nc-mgrp .nc-n { margin-left:auto; font-family:var(--ff-mono); font-size:12px; color:var(--text-3); }
[data-orbit-real-page="contacts-pipeline"] .nc-mseg { display:flex; gap:4px; background:var(--surface-2); border-radius:var(--r-pill); padding:4px; }
[data-orbit-real-page="contacts-pipeline"] .nc-mseg button { flex:1; text-align:center; height:34px; border-radius:var(--r-pill); font-size:13px; font-weight:600; color:var(--text-2); background:none; border:0; cursor:pointer; }
[data-orbit-real-page="contacts-pipeline"] .nc-mseg button.is-active { background:var(--ink); color:#0B0A15; }

[data-orbit-real-page="contacts-pipeline"] .nc-toast { position:fixed; left:50%; bottom:28px; transform:translateX(-50%); z-index:200; display:inline-flex; align-items:center; gap:9px; padding:11px 16px; border-radius:var(--r-pill); background:var(--surface-3); border:1px solid var(--border-2); box-shadow:var(--sh-pop); color:var(--text); font-size:13px; font-weight:500; }
[data-orbit-real-page="contacts-pipeline"] .nc-toast svg { color:var(--accent); }
`;

function AfterEventSection({ current, onDraft, setCurrent, t }: { current: number; onDraft: (name: string) => void; setCurrent: (index: number) => void; t: Translate }) {
  const total = triageQueue.length;
  return (
    <section className="card" style={{ marginTop: 20, padding: 18 }}>
      <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 6 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>{t({ en: "After-event triage", zh: "活动后整理" })}</div>
          <h2 className="h-title">{t({ en: "After AI Summit 2026", zh: "活动后整理 · AI 峰会 2026" })}</h2>
        </div>
        <div style={{ alignItems: "center", display: "flex", gap: 10 }}>
          <span className="nc-status nc-ps-to_contact"><span className="nc-dot" />{t({ en: "5 new · 3 to triage", zh: "5 位新联系人 · 3 待整理" })}</span>
          <button className="btn btn-ghost btn-sm" type="button"><Icon name="sparkle" size={16} />{t({ en: "One email each", zh: "为全部各起草一封" })}</button>
        </div>
      </div>
      <div style={{ color: "var(--text-3)", fontSize: 13, marginBottom: 14 }}>{t({ en: "Triage one by one: confirm tags · jot a summary · draft a personal email — each confirmed individually, no blast.", zh: "逐位整理：确认标签 · 记一句交流摘要 · 起草个性化邮件。每封单独确认，不群发。" })}</div>

      <div className="nc-ae2">
        <div className="nc-aeq">
          <div className="nc-aeq-h">{t({ en: "New · one by one", zh: "新联系人 · 逐一处理" })}</div>
          {triageQueue.map((triage, index) => (
            <QueueRow current={index === current} key={triage.p.qn} onPick={() => setCurrent(index)} t={t} triage={triage} />
          ))}
        </div>
        <TriageCard
          index={current}
          key={triageQueue[current].p.qn}
          onDraft={onDraft}
          onNext={() => setCurrent((current + 1) % total)}
          onPrev={() => setCurrent((current - 1 + total) % total)}
          t={t}
          total={total}
          triage={triageQueue[current]}
        />
      </div>

      <div className="nc-ae-sub" style={{ margin: "20px 0 12px" }}><Icon name="bell" size={16} />{t({ en: "Follow-up reminders", zh: "跟进提醒" })}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {reminders.map((reminder) => <ReminderRow key={reminder.icon + reminder.sub.en} reminder={reminder} t={t} />)}
      </div>
    </section>
  );
}

const cdotByStatus: Record<OrbitContactPipelineStatus, string> = {
  to_contact: "nc-cdot-amber",
  in_progress: "nc-cdot-sky",
  partnered: "nc-cdot-live",
};

export function OrbitRealCardsPipelineView({ viewModel }: { viewModel: OrbitContactsViewModel }) {
  const { t } = useOrbitLanguage();
  const [mView, setMView] = useState<"pipeline" | "todo" | "after">("pipeline");
  const [current, setCurrent] = useState(0);
  const [mCurrent, setMCurrent] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  // per-relationship stage overrides (demo — resets on reload)
  const [statusMap, setStatusMap] = useState<Record<string, OrbitContactPipelineStatus>>({});

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const draft = (name: string) => setToast(t({ en: `Draft started for ${name} — confirm before sending.`, zh: `已为 ${name} 起草邮件草稿，外发前请确认。` }));

  const effStatusOf = (contact: OrbitContactView) => statusMap[contact.id] ?? contact.pipelineStatus;
  const setStatus = (id: string, status: OrbitContactPipelineStatus) => {
    setStatusMap((map) => ({ ...map, [id]: status }));
    const label = viewModel.pipelineStatuses.find((item) => item.value === status)?.label ?? "";
    setToast(t({ en: `Stage updated → ${label}`, zh: `已更新阶段 → ${label}` }));
  };
  const liveColumns = viewModel.pipelineStatuses.map((status) => ({
    cdot: cdotByStatus[status.value],
    cards: viewModel.connections.filter((contact) => effStatusOf(contact) === status.value),
    label: status.label,
    value: status.value,
  }));

  const mTotal = triageQueue.length;
  const mReminders = [reminders[0], reminders[2]];

  const segItems: { key: "pipeline" | "todo" | "after"; label: Copy }[] = [
    { key: "pipeline", label: { en: "Pipeline", zh: "管线" } },
    { key: "todo", label: { en: "To-do", zh: "待办" } },
    { key: "after", label: { en: "Event", zh: "活动后" } },
  ];

  return (
    <main className="orbit-page" data-orbit-real-page="contacts-pipeline">
      <OrbitCardsInteractions />
      <style dangerouslySetInnerHTML={{ __html: LOCAL_STYLES }} />

      {/* ===================== DESKTOP ===================== */}
      <div className="orbit-desktop-only" style={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
        <AccountTopNav active="cards" />
        <div style={{ display: "grid", gridTemplateColumns: `${ORBIT_LEFT_SIDEBAR_WIDTH}px 1fr`, height: "calc(100dvh - 64px)", minHeight: 0 }}>
          <SharedCrmSidebar active="pipeline" counts={{ pipeline: liveColumns.reduce((sum, column) => sum + column.cards.length, 0) }} />
          <div className="scroll" data-appscroll style={{ overflowY: "auto", padding: "28px 32px 60px" }}>
            <div style={{ alignItems: "flex-end", display: "flex", gap: 16, justifyContent: "space-between", marginBottom: 22 }}>
              <div>
                <h1 className="h-display" style={{ margin: 0 }}>{t({ en: "Pipeline", zh: "跟进管线" })}</h1>
                <div style={{ color: "var(--text-3)", fontSize: 14, marginTop: 6 }}>{t({ en: "Move cards to update stage · tap a card to open the contact", zh: "拖动/切换卡片更新阶段 · 点卡片打开联系人" })}</div>
              </div>
              <div style={{ alignItems: "center", display: "flex", gap: 10 }}>
                <span className="nc-evt">
                  <Icon name="ticket" size={16} />
                  {t({ en: "Event: AI Summit 2026", zh: "来源活动：AI 峰会 2026" })}
                  <Icon name="x" size={14} style={{ marginLeft: 2, opacity: 0.7 }} />
                </span>
                <button className="btn btn-primary" type="button"><Icon name="sparkle" size={16} />{t({ en: "Organize after-event contacts", zh: "一键整理活动后联系人" })}</button>
              </div>
            </div>

            <div className="nc-kanban">
              {liveColumns.map((column) => (
                <section className="nc-kcol" key={column.value}>
                  <header className="nc-kcol-head">
                    <span className={`nc-cdot ${column.cdot}`} />
                    <span className="nc-clab">{column.label}</span>
                    <span className="nc-ccount">{column.cards.length}</span>
                  </header>
                  <div className="nc-kcards">
                    {column.cards.map((contact) => (
                      <PipelineCard
                        contact={contact}
                        effStatus={effStatusOf(contact)}
                        key={contact.id}
                        onSetStatus={setStatus}
                        statuses={viewModel.pipelineStatuses}
                        t={t}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <AfterEventSection current={current} onDraft={draft} setCurrent={setCurrent} t={t} />
          </div>
        </div>
      </div>

      {/* ===================== MOBILE ===================== */}
      <div className="orbit-mobile-only" style={{ background: "var(--bg)", display: "flex", flexDirection: "column", height: "100dvh", minHeight: "100dvh", overflow: "hidden", position: "relative" }}>
        <AccountTopNav active="cards" />
        <div className="scroll" data-appscroll style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 16px 36px" }}>
          <div className="nc-mseg" style={{ marginBottom: 14 }}>
            {segItems.map((item) => (
              <button className={mView === item.key ? "is-active" : ""} key={item.key} onClick={() => setMView(item.key)} type="button">{t(item.label)}</button>
            ))}
          </div>

          {mView === "pipeline" ? (
            <div>
              <span className="nc-evt" style={{ height: 32, marginBottom: 6 }}>
                <Icon name="ticket" size={14} />{t({ en: "AI Summit 2026", zh: "AI 峰会 2026" })}
              </span>
              {liveColumns.map((column) => (
                <div key={column.value}>
                  <div className="nc-mgrp">
                    <span className={`nc-cdot ${column.cdot}`} />
                    <span className="nc-lab">{column.label}</span>
                    <span className="nc-n">{column.cards.length}</span>
                  </div>
                  <div className="nc-kcards">
                    {column.cards.map((contact) => (
                      <PipelineCard
                        contact={contact}
                        effStatus={effStatusOf(contact)}
                        key={contact.id}
                        onSetStatus={setStatus}
                        statuses={viewModel.pipelineStatuses}
                        t={t}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {mView === "todo" ? (
            <div>
              <div className="nc-ae-sub" style={{ margin: "2px 2px 10px" }}><Icon name="bell" size={16} />{t({ en: "Reminders", zh: "跟进提醒" })}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {mReminders.map((reminder) => <ReminderRow compact key={reminder.icon + reminder.sub.en} reminder={reminder} t={t} />)}
              </div>
            </div>
          ) : null}

          {mView === "after" ? (
            <div>
              <div className="h-section" style={{ fontSize: 15 }}>{t({ en: "After AI Summit 2026", zh: "活动后整理 · AI 峰会 2026" })}</div>
              <div style={{ color: "var(--text-3)", fontSize: 13, margin: "4px 0 12px" }}>{t({ en: "5 new · 3 to triage · one by one", zh: "5 位新联系人 · 3 待整理 · 逐位处理" })}</div>
              <div className="nc-qpager">
                {triageQueue.map((triage, index) => (
                  <button className={`nc-qav${index === mCurrent ? " is-cur" : ""}`} key={triage.p.pn} onClick={() => setMCurrent(index)} type="button">
                    <span className="nc-avwrap">
                      <Avatar g={triage.p.g} letter={triage.p.ini} size={40} />
                      <span className="nc-sdot" style={{ background: triage.done ? "var(--live)" : "var(--amber)" }} />
                    </span>
                    <span className="nc-qnm">{triage.p.pn}</span>
                  </button>
                ))}
              </div>
              <TriageCard
                compact
                index={mCurrent}
                key={triageQueue[mCurrent].p.pn}
                onDraft={draft}
                onNext={() => setMCurrent((mCurrent + 1) % mTotal)}
                onPrev={() => setMCurrent((mCurrent - 1 + mTotal) % mTotal)}
                t={t}
                total={mTotal}
                triage={triageQueue[mCurrent]}
              />
            </div>
          ) : null}
        </div>
      </div>

      {toast ? (
        <div aria-live="polite" className="nc-toast" role="status"><Icon name="mail" size={15} />{toast}</div>
      ) : null}
    </main>
  );
}
