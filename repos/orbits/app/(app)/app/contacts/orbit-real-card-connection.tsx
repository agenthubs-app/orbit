"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import type {
  OrbitContactPipelineStatus,
  OrbitContactsViewModel,
  OrbitContactView,
} from "../orbit-contacts-route-view-model";
import { AccountTopNav } from "../orbit-account-shell";
import { CrmSidebar as SharedCrmSidebar } from "./orbit-crm-sidebar";
import { useOrbitLanguage } from "../orbit-language-context";
import { Avatar, Icon } from "../orbit-reference-primitives";
import { Basis, SourceBadge } from "./orbit-real-contacts";

type Copy = { en: string; zh: string };
type Translate = (copy: Copy) => string;

// —— 连接画像专属静态演示数据（仅 UI，无后端）——
const rel: Copy = { en: "Partnership", zh: "潜在合作" };

const stageDemo = {
  current: 5,
  total: 12,
  label: { en: "Potential need identified", zh: "已发现潜在需求" } as Copy,
  rationale: {
    en: 'Hana expressed interest in an AI quality-inspection solution at the salon. The next stage — "pilot intent" — needs a partnership deck and a deeper meeting.',
    zh: "对方在沙龙上表达了对 AI 质检方案的兴趣；下一阶段目标为「达成试点意向」，需提供合作资料并安排一次深入会议。",
  } as Copy,
};

const valueAToB: Copy[] = [
  { en: "AI product capability & algorithm team", zh: "AI 产品能力与算法团队" },
  { en: "Pilot partnership in the China market", zh: "中国市场试点合作机会" },
];

const valueBToA: Copy[] = [
  { en: "Robotics hardware channels", zh: "机器人硬件渠道资源" },
  { en: "Japan manufacturing network", zh: "日本制造业人脉网络" },
  { en: "Industry tech endorsement", zh: "行业技术背书" },
];

const timelineDemo: { time: Copy; body: Copy; evidenceId?: string; muted?: boolean }[] = [
  {
    time: { en: "2026-06-12 · 14:20", zh: "2026-06-12 · 14:20" },
    body: {
      en: "Connection created by scanning her card at the Robotics Investor Salon",
      zh: "于「机器人投资沙龙」扫描名片建立连接",
    },
    evidenceId: "evidence:business-card-review-source-hana",
  },
  {
    time: { en: "2026-06-12 · 14:35", zh: "2026-06-12 · 14:35" },
    body: {
      en: "Exchanged contacts on-site, brief chat on AI inspection needs",
      zh: "现场交换联系方式并简短交流 AI 质检需求",
    },
    evidenceId: "evidence:event-exchange-salon-0612",
  },
  {
    time: { en: "2026-06-14 · 09:10", zh: "2026-06-14 · 09:10" },
    body: { en: "Sent first email: post-event note + intro", zh: "发送首封邮件：会后问候 + 自我介绍" },
    evidenceId: "evidence:message-draft-greeting-hana",
  },
  {
    time: { en: "2026-07-04 · 16:48", zh: "2026-07-04 · 16:48" },
    body: { en: "Sent company deck and AI inspection case studies", zh: "发送公司资料与 AI 质检案例集" },
    evidenceId: "evidence:material-send-deck-0704",
  },
  {
    time: { en: "Pending", zh: "待安排" },
    body: { en: "Book a 30-min deep-dive meeting (not yet)", zh: "约一次 30 分钟深入会议（未发生）" },
    muted: true,
  },
];

const nextStep: Copy = {
  en: 'Send the partnership deck and book a 30-min meeting to push toward the "pilot intent" stage. Follow-up needed.',
  zh: "发送合作资料并预约一次 30 分钟会议，推动关系进入「达成试点意向」阶段。当前需跟进。",
};

const strengthMeta: Record<OrbitContactView["strength"], { cls: string; label: Copy }> = {
  strong: { cls: "nc-st-strong", label: { en: "Strong", zh: "强关系" } },
  medium: { cls: "nc-st-medium", label: { en: "Medium", zh: "中关系" } },
  weak: { cls: "nc-st-weak", label: { en: "Weak", zh: "弱关系" } },
  dormant: { cls: "nc-st-dormant", label: { en: "Dormant", zh: "沉睡" } },
};

function crmInitial(value: string) {
  return String(value || "?").trim().slice(0, 1).toUpperCase() || "?";
}

function crmRole(contact: Pick<OrbitContactView, "company" | "title">, t: Translate) {
  return [contact.company, contact.title].filter(Boolean).join(" · ") || t({ en: "No company or title yet", zh: "暂无公司职位" });
}

function StrengthTag({ strength, t }: { strength: OrbitContactView["strength"]; t: Translate }) {
  const meta = strengthMeta[strength];
  return <span className={`nc-strength ${meta.cls}`}><span className="nc-dot" />{t(meta.label)}</span>;
}

function StatusPill({ status, viewModel, t }: { status: OrbitContactPipelineStatus; viewModel: OrbitContactsViewModel; t: Translate }) {
  const label = viewModel.pipelineStatuses.find((item) => item.value === status)?.label ?? status;
  return <span className={`nc-status nc-ps-${status}`}><span className="nc-dot" />{label}</span>;
}

// —— sidebar (replicates the prototype `.crm-side`) ——
function SideLink({ href, icon, label, count }: { href: string; icon: string; label: string; count?: number }) {
  return (
    <a
      href={href}
      style={{
        alignItems: "center",
        background: "transparent",
        borderRadius: 11,
        color: "var(--text-2)",
        display: "flex",
        fontFamily: "var(--ff)",
        fontSize: 14,
        fontWeight: 500,
        gap: 12,
        padding: "10px 12px",
        textDecoration: "none",
      }}
    >
      <Icon name={icon} size={19} stroke={1.7} />
      <span style={{ flex: 1 }}>{label}</span>
      {count != null ? <span style={{ fontFamily: "var(--ff-mono)", fontSize: 12, opacity: 0.8 }}>{count}</span> : null}
    </a>
  );
}

function CrmSide({ t }: { t: Translate }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div className="eyebrow" style={{ padding: "0 12px 10px" }}>{t({ en: "Contacts", zh: "名片夹" })}</div>
      <SideLink href="/app/contacts" icon="wallet" label={t({ en: "All contacts", zh: "全部人脉" })} count={128} />
      <SideLink href="/app/contacts/pipeline" icon="list" label={t({ en: "Pipeline", zh: "跟进管线" })} count={24} />
      <SideLink href="/app/contacts/graph" icon="network" label={t({ en: "Network graph", zh: "人脉图谱" })} />
      <SideLink href="/app/contacts/intros" icon="share" label={t({ en: "Introductions", zh: "引荐记录" })} count={6} />
      <SideLink href="/app/contacts/dashboard" icon="grid" label={t({ en: "Dashboard", zh: "人脉表盘" })} />
      <div className="eyebrow" style={{ margin: "18px 0 0", padding: "0 12px 10px" }}>{t({ en: "Capture", zh: "采集" })}</div>
      <SideLink href="/app/contacts/new" icon="download" label={t({ en: "Import hub", zh: "导入中心" })} />
      <SideLink href="/app/contacts/new" icon="scan" label={t({ en: "Scan card", zh: "扫名片" })} />
    </div>
  );
}

function CardTitle({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <div className="nc-cardtitle">
      <Icon name={icon} size={16} />
      <h2 className="h-section">{children}</h2>
    </div>
  );
}

function Frow({ icon, k, children }: { icon: string; k: string; children: ReactNode }) {
  return (
    <div className="nc-frow">
      <span className="nc-ic"><Icon name={icon} size={16} /></span>
      <span className="nc-fk">{k}</span>
      <span className="nc-fv">{children}</span>
    </div>
  );
}

function ContactCard({ contact, t }: { contact: OrbitContactView; t: Translate }) {
  return (
    <div className="card nc-card-pad">
      <CardTitle icon="user">{t({ en: "Contact", zh: "联系方式" })}</CardTitle>
      {contact.email ? <Frow icon="mail" k={t({ en: "Email", zh: "邮箱" })}><span className="mono">{contact.email}</span></Frow> : null}
      {contact.phone ? <Frow icon="phone" k={t({ en: "Phone", zh: "电话" })}><span className="mono">{contact.phone}</span></Frow> : null}
      {contact.lineId ? <Frow icon="message" k="LINE"><span className="mono">{contact.lineId}</span></Frow> : null}
      {contact.industry ? <Frow icon="briefcase" k={t({ en: "Industry", zh: "行业" })}>{contact.industry}</Frow> : null}
      {contact.met ? <Frow icon="pin" k={t({ en: "Met via", zh: "认识来源" })}>{contact.met}</Frow> : null}
      {contact.lastInteraction ? <Frow icon="clock" k={t({ en: "Last event", zh: "最近互动" })}>{contact.lastInteraction}</Frow> : null}
    </div>
  );
}

function TagsCard({ contact, t }: { contact: OrbitContactView; t: Translate }) {
  if (!contact.valueTags.length) return null;
  return (
    <div className="card nc-card-pad">
      <CardTitle icon="star">{t({ en: "Tags", zh: "标签" })}</CardTitle>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {contact.valueTags.map((tag) => <span className="nc-tag nc-tag-value" key={tag}>{tag}</span>)}
      </div>
    </div>
  );
}

function TwoWayCard({ contact, t }: { contact: OrbitContactView; t: Translate }) {
  const name = contact.displayName || t({ en: "them", zh: "对方" });
  return (
    <div className="card nc-card-pad">
      <div className="nc-cardtitle">
        <Icon name="share" size={16} />
        <h2 className="h-section">{t({ en: "Two-way value", zh: "双向价值分析" })}</h2>
        <Basis kind="ai" copy={{ en: "Basis: inferred from both profiles; editable", zh: "依据：由双方画像 offering/seeking 推断，可编辑" }} t={t} />
      </div>
      <div className="nc-vblock nc-give">
        <div className="nc-vhead"><Icon name="arrow" size={14} />{t({ en: `You → ${name}`, zh: "我能为对方提供" })}</div>
        <div className="nc-vlist">
          {valueAToB.map((item) => (
            <div className="nc-vitem" key={item.en}><Icon name="check" size={16} />{t(item)}</div>
          ))}
        </div>
      </div>
      <div className="nc-vblock nc-get">
        <div className="nc-vhead"><Icon name="arrow" size={14} />{t({ en: `${name} → You`, zh: "对方能为我提供" })}</div>
        <div className="nc-vlist">
          {valueBToA.map((item) => (
            <div className="nc-vitem" key={item.en}><Icon name="check" size={16} />{t(item)}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProfileCard({ t }: { t: Translate }) {
  const dots = Array.from({ length: stageDemo.total });
  return (
    <div className="card nc-card-pad">
      <CardTitle icon="target">{t({ en: "Connection profile", zh: "关系画像" })}</CardTitle>
      <div className="nc-stage-head">
        <span className="chip chip-accent"><Icon name="network" size={14} />{t(rel)}</span>
        <span style={{ color: "var(--text-3)", fontSize: 13 }}>{t({ en: `Stage ${stageDemo.current} / ${stageDemo.total}`, zh: `阶段 ${stageDemo.current} / ${stageDemo.total}` })}</span>
      </div>
      <div className="nc-stage-track" role="img" aria-label={t({ en: `Stage ${stageDemo.current} of ${stageDemo.total}`, zh: `关系阶段进度 ${stageDemo.current}/${stageDemo.total}` })}>
        {dots.map((_, index) => {
          const on = index < stageDemo.current;
          const cur = index === stageDemo.current - 1;
          return <i className={`${on ? "on" : ""}${cur ? " cur" : ""}`.trim()} key={index} />;
        })}
      </div>
      <div className="nc-stage-meta">
        <span className="nc-cur-label">{t(stageDemo.label)}</span>
        <span className="nc-step-n mono">{String(stageDemo.current).padStart(2, "0")}</span>
        <Basis kind="evidence" copy={{ en: "Stage basis: card exchange + first message", zh: "阶段变更依据：现场交换名片 + 首次消息记录" }} evidenceId="evidence:stage-hana-0614" t={t} />
      </div>
      <p className="nc-stage-rationale">{t(stageDemo.rationale)}</p>
    </div>
  );
}

function TimelineCard({ t }: { t: Translate }) {
  return (
    <div className="card nc-card-pad">
      <CardTitle icon="clock">{t({ en: "Timeline", zh: "互动时间线" })}</CardTitle>
      <div className="nc-timeline">
        {timelineDemo.map((item) => (
          <div className={`nc-tl-item${item.muted ? " is-muted" : ""}`} key={item.body.en} style={item.muted ? { paddingBottom: 0 } : undefined}>
            <div className="nc-tl-time mono">{t(item.time)}</div>
            <div className="nc-tl-body" style={item.muted ? { color: "var(--text-3)" } : undefined}>{t(item.body)}</div>
            {item.evidenceId ? (
              <a className="nc-tl-src" href="#" onClick={(event) => event.preventDefault()}>
                <Icon name="checkCircle" size={13} />
                {t({ en: "Evidence", zh: "来源证据" })}
                <span className="nc-eid mono">{item.evidenceId}</span>
              </a>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function NextStepCard({ t, compact }: { t: Translate; compact?: boolean }) {
  return (
    <div className="card nc-card-pad">
      <CardTitle icon="sparkle">{t({ en: "Next step", zh: "下一步建议" })}</CardTitle>
      <div className="nc-note">
        <Icon name="sparkle" size={16} />
        <span>{t(nextStep)}</span>
        {!compact ? (
          <Basis kind="ai" align="right" copy={{ en: "Basis: open promise + stage 'needs discovered'", zh: "依据：承诺发资料未兑现 + 关系停在“已发现需求”" }} t={t} />
        ) : null}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <a className={`btn btn-primary btn-sm${compact ? " btn-block" : ""}`} href="#" onClick={(event) => event.preventDefault()}>
          <Icon name="calendar" size={16} />{t({ en: "Book meeting", zh: "预约会议" })}
        </a>
        {!compact ? (
          <a className="btn btn-quiet btn-sm" href="/app/contacts/pipeline">{t({ en: "Add to pipeline", zh: "加入跟进管线" })}</a>
        ) : null}
      </div>
    </div>
  );
}

export function OrbitRealCardConnection({ contactId, viewModel }: { contactId: string; viewModel: OrbitContactsViewModel }) {
  const { t } = useOrbitLanguage();
  const contact = viewModel.connections.find((item) => item.id === contactId) ?? viewModel.connections[0];
  const [toast, setToast] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(false), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const draftEmail = () => setToast(true);

  return (
    <main className="orbit-page" data-orbit-real-page="contacts">
      {/* ============ DESKTOP ============ */}
      <div className="orbit-desktop-only" style={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
        <AccountTopNav active="cards" />
        <div style={{ display: "grid", gridTemplateColumns: "212px 1fr", height: "calc(100dvh - 64px)", minHeight: 0 }}>
          <SharedCrmSidebar />
          <div className="scroll" data-appscroll style={{ overflowY: "auto", padding: "28px 32px 60px" }}>
            <a className="nc-back" href="/app/contacts"><Icon name="chevL" size={16} />{t({ en: "Back to contacts", zh: "返回名片夹" })}</a>

            <div className="nc-hero">
              <Avatar letter={crmInitial(contact.displayName)} g={contact.g || "g-violet"} size={72} />
              <div style={{ minWidth: 0 }}>
                <div className="nc-hero-id">
                  <h1 className="h-display">{contact.displayName || t({ en: "Unnamed contact", zh: "未命名联系人" })}</h1>
                  <SourceBadge source={contact.source} t={t} />
                </div>
                <div style={{ color: "var(--text-2)", fontSize: 14, marginTop: 10 }}>{crmRole(contact, t)}</div>
                <div className="nc-hero-meta">
                  <StatusPill status={contact.pipelineStatus} viewModel={viewModel} t={t} />
                  <StrengthTag strength={contact.strength} t={t} />
                  {contact.met ? (
                    <span style={{ color: "var(--text-3)", fontSize: 13 }}>· {t({ en: "Met at", zh: "认识于" })} {contact.met}</span>
                  ) : null}
                </div>
              </div>
              <div className="nc-hero-cta">
                <a className="btn btn-ghost" href="#" onClick={(event) => event.preventDefault()}><Icon name="edit" size={16} />{t({ en: "Edit", zh: "编辑" })}</a>
                <button className="btn btn-primary" onClick={draftEmail} type="button"><Icon name="mail" size={16} />{t({ en: "Draft email", zh: "起草邮件" })}</button>
              </div>
            </div>

            <div className="nc-cols">
              <div className="nc-stack">
                <ContactCard contact={contact} t={t} />
                <TagsCard contact={contact} t={t} />
                <TwoWayCard contact={contact} t={t} />
              </div>
              <div className="nc-stack">
                <ProfileCard t={t} />
                <TimelineCard t={t} />
                <NextStepCard t={t} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ============ MOBILE ============ */}
      <div className="orbit-mobile-only" style={{ background: "var(--bg)", display: "flex", flexDirection: "column", height: "100dvh", minHeight: "100dvh", overflow: "hidden", position: "relative" }}>
        <AccountTopNav active="cards" />
        <div style={{ alignItems: "center", display: "flex", flexShrink: 0, gap: 8, padding: "12px 18px 4px" }}>
          <a aria-label={t({ en: "Back to contacts", zh: "返回名片夹" })} href="/app/contacts" style={{ color: "var(--text-2)", display: "inline-flex" }}><Icon name="chevL" size={22} /></a>
          <span className="h-section" style={{ fontSize: 16 }}>{contact.displayName || t({ en: "Unnamed contact", zh: "未命名联系人" })}</span>
        </div>
        <div className="scroll" data-appscroll style={{ display: "flex", flex: 1, flexDirection: "column", minHeight: 0, overflowY: "auto", padding: "10px 18px 36px" }}>
          <div className="nc-mhero">
            <Avatar letter={crmInitial(contact.displayName)} g={contact.g || "g-violet"} size={56} />
            <div style={{ minWidth: 0 }}>
              <div style={{ alignItems: "center", display: "flex", gap: 8 }}>
                <span className="h-section" style={{ fontSize: 16 }}>{contact.displayName || t({ en: "Unnamed contact", zh: "未命名联系人" })}</span>
                <SourceBadge source={contact.source} t={t} />
              </div>
              <div style={{ color: "var(--text-3)", fontSize: 12.5, marginTop: 3 }}>{crmRole(contact, t)}</div>
              <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                <StatusPill status={contact.pipelineStatus} viewModel={viewModel} t={t} />
                <StrengthTag strength={contact.strength} t={t} />
              </div>
            </div>
          </div>

          <button className="btn btn-primary btn-block" onClick={draftEmail} style={{ margin: "16px 0" }} type="button"><Icon name="mail" size={16} />{t({ en: "Draft email", zh: "起草邮件" })}</button>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <ContactCard contact={contact} t={t} />
            <TagsCard contact={contact} t={t} />
            <TwoWayCard contact={contact} t={t} />
            <ProfileCard t={t} />
            <TimelineCard t={t} />
            <NextStepCard compact t={t} />
          </div>
        </div>
      </div>

      {toast ? (
        <div
          role="status"
          style={{
            background: "var(--ink)",
            borderRadius: "var(--r-pill)",
            bottom: 28,
            color: "var(--on-dark, #fff)",
            fontSize: 13,
            fontWeight: 600,
            left: "50%",
            padding: "10px 18px",
            position: "fixed",
            transform: "translateX(-50%)",
            zIndex: 200,
          }}
        >
          {t({ en: "Email draft started", zh: "已开始起草邮件" })}
        </div>
      ) : null}

      <style dangerouslySetInnerHTML={{ __html: `
[data-orbit-real-page] .nc-card-pad { padding: 18px; }

[data-orbit-real-page] .nc-back { display:inline-flex; align-items:center; gap:7px; height:32px; color:var(--text-3); font-size:13px; font-weight:600; margin-bottom:18px; text-decoration:none; }
[data-orbit-real-page] .nc-back:hover { color:var(--text); }

[data-orbit-real-page] .nc-hero { display:grid; grid-template-columns:72px 1fr auto; gap:18px; align-items:start; margin-bottom:24px; }
[data-orbit-real-page] .nc-hero-id { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
[data-orbit-real-page] .nc-hero-meta { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-top:10px; }
[data-orbit-real-page] .nc-hero-cta { display:flex; align-items:center; gap:10px; padding-top:4px; }

[data-orbit-real-page] .nc-cols { display:grid; grid-template-columns:1fr 1.25fr; gap:24px; align-items:start; }
[data-orbit-real-page] .nc-stack { display:flex; flex-direction:column; gap:16px; }

[data-orbit-real-page] .nc-cardtitle { display:flex; align-items:center; gap:8px; margin-bottom:14px; }
[data-orbit-real-page] .nc-cardtitle svg { color:var(--accent); }
[data-orbit-real-page] .nc-cardtitle .h-section { margin:0; }

[data-orbit-real-page] .nc-frow { display:grid; grid-template-columns:20px 96px 1fr; gap:10px; align-items:center; padding:9px 0; border-top:1px solid var(--hairline); }
[data-orbit-real-page] .nc-frow:first-of-type { border-top:0; }
[data-orbit-real-page] .nc-ic { color:var(--text-3); display:inline-flex; }
[data-orbit-real-page] .nc-fk { font-size:12.5px; color:var(--text-3); }
[data-orbit-real-page] .nc-fv { font-size:14px; color:var(--text); min-width:0; overflow:hidden; text-overflow:ellipsis; }
[data-orbit-real-page] .nc-fv .mono { font-size:13px; }

[data-orbit-real-page] .nc-vblock + .nc-vblock { margin-top:14px; padding-top:14px; border-top:1px solid var(--hairline); }
[data-orbit-real-page] .nc-vhead { display:flex; align-items:center; gap:7px; font-size:12.5px; font-weight:600; margin-bottom:9px; }
[data-orbit-real-page] .nc-vblock.nc-give .nc-vhead { color:var(--accent); }
[data-orbit-real-page] .nc-vblock.nc-get .nc-vhead { color:var(--live); }
[data-orbit-real-page] .nc-vlist { display:flex; flex-direction:column; gap:8px; }
[data-orbit-real-page] .nc-vitem { display:grid; grid-template-columns:18px 1fr; gap:9px; align-items:start; font-size:13.5px; color:var(--text); line-height:1.4; }
[data-orbit-real-page] .nc-vitem svg { margin-top:1px; }
[data-orbit-real-page] .nc-vblock.nc-give .nc-vitem svg { color:var(--accent); }
[data-orbit-real-page] .nc-vblock.nc-get .nc-vitem svg { color:var(--live); }

[data-orbit-real-page] .nc-stage-head { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px; }
[data-orbit-real-page] .nc-stage-track { display:flex; gap:4px; }
[data-orbit-real-page] .nc-stage-track i { flex:1; height:6px; border-radius:var(--r-pill); background:var(--surface-3); }
[data-orbit-real-page] .nc-stage-track i.on { background:var(--accent); }
[data-orbit-real-page] .nc-stage-track i.cur { background:var(--accent); box-shadow:0 0 0 3px var(--accent-ring); }
[data-orbit-real-page] .nc-stage-meta { display:flex; align-items:baseline; gap:8px; margin-top:12px; }
[data-orbit-real-page] .nc-cur-label { font-size:14px; font-weight:600; color:var(--ink); }
[data-orbit-real-page] .nc-step-n { font-size:12px; color:var(--text-3); }
[data-orbit-real-page] .nc-stage-rationale { font-size:13px; color:var(--text-2); line-height:1.55; margin-top:8px; }

[data-orbit-real-page] .nc-timeline { position:relative; padding-left:26px; }
[data-orbit-real-page] .nc-timeline::before { content:""; position:absolute; left:7px; top:4px; bottom:4px; width:2px; background:var(--hairline); }
[data-orbit-real-page] .nc-tl-item { position:relative; padding-bottom:18px; }
[data-orbit-real-page] .nc-tl-item::before { content:""; position:absolute; left:-26px; top:3px; width:16px; height:16px; border-radius:50%; background:var(--surface); border:2px solid var(--accent); box-shadow:0 0 0 4px var(--bg); }
[data-orbit-real-page] .nc-tl-item.is-muted::before { border-color:var(--text-4); }
[data-orbit-real-page] .nc-tl-time { font-size:11.5px; color:var(--text-3); }
[data-orbit-real-page] .nc-tl-body { font-size:14px; color:var(--text); margin-top:2px; }
[data-orbit-real-page] .nc-tl-src { display:inline-flex; align-items:center; gap:5px; margin-top:6px; font-size:11.5px; font-weight:600; color:var(--accent); text-decoration:none; }
[data-orbit-real-page] .nc-eid { font-size:10.5px; color:var(--text-3); font-weight:500; }
[data-orbit-real-page] .nc-tl-src:hover .nc-eid { color:var(--text-2); }

[data-orbit-real-page] .nc-note { display:flex; gap:8px; align-items:flex-start; padding:10px 12px; border-radius:var(--r-md); background:var(--accent-softer); color:var(--text-2); font-size:12.5px; line-height:1.5; }
[data-orbit-real-page] .nc-note > svg { color:var(--accent); flex-shrink:0; margin-top:1px; }

[data-orbit-real-page] .nc-mhero { display:grid; grid-template-columns:56px 1fr; gap:14px; align-items:center; margin-bottom:14px; }
` }} />
    </main>
  );
}
