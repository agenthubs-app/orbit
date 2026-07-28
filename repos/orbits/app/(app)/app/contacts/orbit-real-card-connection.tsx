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
import { OrbitCardsInteractions } from "./orbit-cards-interactions";
import { OrbitContactAvatar } from "./orbit-contact-avatar";
import { useOrbitLanguage } from "../orbit-language-context";
import { Icon } from "../orbit-reference-primitives";
import { openRelationshipInboxCompose } from "../inbox/relationship-inbox-panel";
import { Basis, SourceBadge } from "./orbit-real-contacts";
import { ORBIT_LEFT_SIDEBAR_WIDTH } from "../orbit-layout-constants";
import { ORBIT_Z } from "../orbit-z";
import { agentHrefForContext } from "../orbit-agent-context-href";

type Copy = { en: string; zh: string };
type Translate = (copy: Copy) => string;

const strengthMeta: Record<OrbitContactView["strength"], { cls: string; label: Copy }> = {
  strong: { cls: "nc-st-strong", label: { en: "Strong", zh: "强关系" } },
  medium: { cls: "nc-st-medium", label: { en: "Medium", zh: "中关系" } },
  weak: { cls: "nc-st-weak", label: { en: "Weak", zh: "弱关系" } },
  dormant: { cls: "nc-st-dormant", label: { en: "Dormant", zh: "沉睡" } },
  unscored: { cls: "nc-st-unscored", label: { en: "Unscored", zh: "未评分" } },
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

function StatusPicker({ status, viewModel, t }: { status: OrbitContactPipelineStatus; viewModel: OrbitContactsViewModel; t: Translate }) {
  return (
    <span className="nc-status-pick">
      <span className="nc-sp-lbl">{t({ en: "Stage", zh: "关系阶段" })}</span>
      <StatusPill status={status} t={t} viewModel={viewModel} />
      <span className="nc-sp-readonly">{t({ en: "Source-backed · read only", zh: "来源数据 · 只读" })}</span>
    </span>
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
      {contact.location ? <Frow icon="pin" k={t({ en: "Location", zh: "所在地" })}>{contact.location}</Frow> : null}
      {contact.met ? <Frow icon="checkCircle" k={t({ en: "Met via", zh: "认识来源" })}>{contact.met}</Frow> : null}
      {contact.lastInteraction ? <Frow icon="clock" k={t({ en: "Last touch", zh: "最近互动" })}>{contact.lastInteraction}</Frow> : null}
    </div>
  );
}

// 个人资料卡：渲染联系人真实的公开画像（简介、自我介绍、关注话题、对话切入点）
// 与关系背景。数据来自 view model（adapter 已按当前语言清洗），全部缺失时不渲染。
function AboutCard({ contact, t }: { contact: OrbitContactView; t: Translate }) {
  const profile = contact.encounters[0]?.context.publicProfile;
  const bio = profile?.bio?.trim() ?? "";
  const intro = profile?.intro?.trim() ?? "";
  const topics = (profile?.topics ?? []).filter(Boolean);
  const prompts = (profile?.conversationPrompts ?? []).filter(Boolean);
  const relationship = contact.note?.trim() ?? "";

  if (!bio && !intro && !topics.length && !prompts.length && !relationship) {
    return null;
  }

  return (
    <div className="card nc-card-pad">
      <CardTitle icon="user">{t({ en: "Profile", zh: "个人资料" })}</CardTitle>
      {relationship ? (
        <div className="nc-about-rel">
          <span className="nc-about-k">{t({ en: "Relationship context", zh: "关系背景" })}</span>
          <p className="nc-about-p">{relationship}</p>
        </div>
      ) : null}
      {bio ? (
        <div className="nc-about-sec">
          <span className="nc-about-k">{t({ en: "Bio", zh: "简介" })}</span>
          <p className="nc-about-p">{bio}</p>
        </div>
      ) : null}
      {intro ? (
        <div className="nc-about-sec">
          <span className="nc-about-k">{t({ en: "Self-introduction", zh: "自我介绍" })}</span>
          <p className="nc-about-p">{intro}</p>
        </div>
      ) : null}
      {topics.length ? (
        <div className="nc-about-sec">
          <span className="nc-about-k">{t({ en: "Topics", zh: "关注话题" })}</span>
          <div className="nc-about-chips">
            {topics.map((topic) => <span className="nc-tag" key={topic}>{topic}</span>)}
          </div>
        </div>
      ) : null}
      {prompts.length ? (
        <div className="nc-about-sec">
          <span className="nc-about-k">{t({ en: "Conversation starters", zh: "对话切入点" })}</span>
          <div className="nc-about-prompts">
            {prompts.map((prompt) => (
              <div className="nc-about-prompt" key={prompt}>
                <Icon name="sparkle" size={14} />
                <span>{prompt}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
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
  const profile = contact.encounters[0]?.context.publicProfile;
  // 对方的 offering = 对方能给我的；对方的 seeking = 对方想要的（即我能给对方的）。
  const theyOffer = (profile?.offering ?? []).filter(Boolean);
  const theySeek = (profile?.seeking ?? []).filter(Boolean);
  const hasReal = theyOffer.length > 0 || theySeek.length > 0;
  const give = theySeek;
  const get = theyOffer;

  return (
    <div className="card nc-card-pad">
      <div className="nc-cardtitle">
        <Icon name="share" size={16} />
        <h2 className="h-section">{t({ en: "Two-way value", zh: "双向价值分析" })}</h2>
        {hasReal ? (
          <Basis
            kind="evidence"
            copy={{ en: "Basis: contact profile offering / seeking", zh: "依据：联系人画像的 offering / seeking" }}
            t={t}
          />
        ) : null}
      </div>
      <div className="nc-vblock nc-give">
        <div className="nc-vhead"><Icon name="arrow" size={14} />{t({ en: `You → ${name}`, zh: "我能为对方提供" })}</div>
        <div className="nc-vlist">
          {give.length ? give.map((item, index) => (
            <div className="nc-vitem" key={`give-${index}`}><Icon name="check" size={16} />{item}</div>
          )) : <div className="nc-vitem nc-vitem-empty">{t({ en: "No stated needs yet", zh: "暂无对方的需求信息" })}</div>}
        </div>
      </div>
      <div className="nc-vblock nc-get">
        <div className="nc-vhead"><Icon name="arrow" size={14} />{t({ en: `${name} → You`, zh: "对方能为我提供" })}</div>
        <div className="nc-vlist">
          {get.length ? get.map((item, index) => (
            <div className="nc-vitem" key={`get-${index}`}><Icon name="check" size={16} />{item}</div>
          )) : <div className="nc-vitem nc-vitem-empty">{t({ en: "No stated offerings yet", zh: "暂无对方的资源信息" })}</div>}
        </div>
      </div>
    </div>
  );
}

type TimelineItem = { time: string; body: string; evidenceId?: string; muted?: boolean };

function formatTimelineDate(value: string, t: Translate): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return t({
    en: new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date),
    zh: new Intl.DateTimeFormat("zh-CN", {
      dateStyle: "long",
      timeStyle: "short",
    }).format(date),
  });
}

function TimelineCard({ contact, t }: { contact: OrbitContactView; t: Translate }) {
  const items: TimelineItem[] = (contact.notes ?? [])
    .filter((note) => note.body?.trim())
    .map((note) => ({ time: note.createdAt, body: note.body, evidenceId: note.id }));

  return (
    <div className="card nc-card-pad">
      <CardTitle icon="clock">{t({ en: "Timeline", zh: "互动时间线" })}</CardTitle>
      {items.length ? <div className="nc-timeline">
        {items.map((item, index) => (
          <div className={`nc-tl-item${item.muted ? " is-muted" : ""}`} key={`${item.body}-${index}`} style={item.muted ? { paddingBottom: 0 } : undefined}>
            <time className="nc-tl-time mono" dateTime={item.time}>{formatTimelineDate(item.time, t)}</time>
            <div className="nc-tl-body" style={item.muted ? { color: "var(--text-3)" } : undefined}>{item.body}</div>
            {item.evidenceId ? (
              <span className="nc-tl-src">
                <Icon name="checkCircle" size={13} />
                {t({ en: "Evidence", zh: "来源证据" })}
                <span className="nc-eid mono">{item.evidenceId}</span>
              </span>
            ) : null}
          </div>
        ))}
      </div> : (
        <p className="nc-empty-copy">{t({ en: "No sourced interaction evidence is available for this contact.", zh: "该联系人暂无可核验的互动证据。" })}</p>
      )}
    </div>
  );
}

function NextStepCard({ contact, t, compact }: { contact: OrbitContactView; t: Translate; compact?: boolean }) {
  const real = contact.nextAction;
  const text = real?.text?.trim();
  const reason = real?.reason?.trim();

  return (
    <div className="card nc-card-pad">
      <CardTitle icon="sparkle">{t({ en: "Next step", zh: "下一步建议" })}</CardTitle>
      <div className="nc-note">
        <Icon name="sparkle" size={16} />
        <span>{text || t({ en: "No sourced next step is available.", zh: "暂无来源明确的下一步建议。" })}</span>
        {!compact && real ? (
          <Basis
            kind="evidence"
            align="right"
            evidenceId={real?.evidenceId}
            copy={
              reason
                ? { en: `Basis: ${reason}`, zh: `依据：${reason}` }
                : { en: "Basis: sourced contact record", zh: "依据：联系人来源记录" }
            }
            t={t}
          />
        ) : null}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <a className={`btn btn-quiet btn-sm${compact ? " btn-block" : ""}`} href="/app/contacts/pipeline">
          {t({ en: "View pipeline", zh: "查看跟进管线" })}
        </a>
      </div>
    </div>
  );
}

export function OrbitRealCardConnection({ contactId, viewModel }: { contactId: string; viewModel: OrbitContactsViewModel }) {
  const { language, t } = useOrbitLanguage();
  const contact = viewModel.connections.find((item) => item.id === contactId) ?? viewModel.connections[0];
  const askAgentHref = agentHrefForContext({
    details: crmRole(contact, t),
    id: contactId,
    kind: "contact",
    label: contact.displayName,
    language: language === "zh" ? "zh" : "en",
  });
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // "起草邮件"进入关系收件箱的发起新对话流程，预填当前联系人。
  const draftEmail = () => {
    openRelationshipInboxCompose({
      contactId: contact.id,
      recipient: contact.displayName,
      organization: contact.company,
    });
    setToast(t({ en: "Draft started in inbox", zh: "已在收件箱开始起草" }));
  };
  return (
    <main className="orbit-page" data-orbit-real-page="contacts">
      <OrbitCardsInteractions />
      {/* ============ DESKTOP ============ */}
      <div className="orbit-desktop-only" style={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
        <AccountTopNav active="cards" />
        <div style={{ display: "grid", gridTemplateColumns: `${ORBIT_LEFT_SIDEBAR_WIDTH}px 1fr`, height: "calc(100dvh - 64px)", minHeight: 0 }}>
          <SharedCrmSidebar />
          <div className="scroll" data-appscroll style={{ overflowY: "auto", padding: "28px 32px 60px" }}>
            <a className="nc-back" href="/app/contacts"><Icon name="chevL" size={16} />{t({ en: "Back to contacts", zh: "返回名片夹" })}</a>

            <div className="nc-hero">
              <OrbitContactAvatar contact={contact} size={72} />
              <div style={{ minWidth: 0 }}>
                <div className="nc-hero-id">
                  <h1 className="h-display">{contact.displayName || t({ en: "Unnamed contact", zh: "未命名联系人" })}</h1>
                  <SourceBadge source={contact.source} t={t} />
                </div>
                <div style={{ color: "var(--text-2)", fontSize: 14, marginTop: 10 }}>{crmRole(contact, t)}</div>
                <div className="nc-hero-meta">
                  <StatusPicker status={contact.pipelineStatus} viewModel={viewModel} t={t} />
                  <StrengthTag strength={contact.strength} t={t} />
                  {contact.met ? (
                    <span style={{ color: "var(--text-3)", fontSize: 13 }}>· {t({ en: "Met at", zh: "认识于" })} {contact.met}</span>
                  ) : null}
                </div>
              </div>
              <div className="nc-hero-cta">
                <a className="btn btn-soft" data-agent-context="contact" href={askAgentHref}><Icon name="sparkle" size={16} />{t({ en: "Ask iOrbit", zh: "问 iOrbit" })}</a>
                <button className="btn btn-primary" data-inbox-compose onClick={draftEmail} type="button"><Icon name="mail" size={16} />{t({ en: "Draft email", zh: "起草邮件" })}</button>
              </div>
            </div>

            <div className="nc-cols">
              <div className="nc-stack">
                <AboutCard contact={contact} t={t} />
                <ContactCard contact={contact} t={t} />
                <TagsCard contact={contact} t={t} />
                <TwoWayCard contact={contact} t={t} />
              </div>
              <div className="nc-stack">
                <TimelineCard contact={contact} t={t} />
                <NextStepCard contact={contact} t={t} />
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
          {/* Mobile audit P2: this used to repeat the person's name — the
              hero right below it already shows that. Show the section
              context (matches the desktop "nc-back" label's intent) instead
              so the two lines aren't identical. */}
          <span className="h-section" style={{ fontSize: 16 }}>{t({ en: "Contacts", zh: "人脉" })}</span>
        </div>
        <div className="scroll" data-appscroll style={{ display: "flex", flex: 1, flexDirection: "column", minHeight: 0, overflowY: "auto", padding: "10px 18px 36px" }}>
          <div className="nc-mhero">
            <OrbitContactAvatar contact={contact} size={56} />
            <div style={{ minWidth: 0 }}>
              <div style={{ alignItems: "center", display: "flex", gap: 8 }}>
                <span className="h-section" style={{ fontSize: 16 }}>{contact.displayName || t({ en: "Unnamed contact", zh: "未命名联系人" })}</span>
                <SourceBadge source={contact.source} t={t} />
              </div>
              <div style={{ color: "var(--text-3)", fontSize: 12.5, marginTop: 3 }}>{crmRole(contact, t)}</div>
              <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                <StatusPicker status={contact.pipelineStatus} viewModel={viewModel} t={t} />
                <StrengthTag strength={contact.strength} t={t} />
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr", margin: "16px 0" }}>
            <a className="btn btn-soft btn-block" data-agent-context="contact" href={askAgentHref}><Icon name="sparkle" size={16} />{t({ en: "Ask iOrbit", zh: "问 iOrbit" })}</a>
            <button className="btn btn-primary btn-block" data-inbox-compose onClick={draftEmail} type="button"><Icon name="mail" size={16} />{t({ en: "Draft email", zh: "起草邮件" })}</button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <AboutCard contact={contact} t={t} />
            <ContactCard contact={contact} t={t} />
            <TagsCard contact={contact} t={t} />
            <TwoWayCard contact={contact} t={t} />
            <TimelineCard contact={contact} t={t} />
            <NextStepCard compact contact={contact} t={t} />
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
            zIndex: ORBIT_Z.toast,
          }}
        >
          {toast}
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

[data-orbit-real-page] .nc-status-pick { display:inline-flex; align-items:center; gap:6px; flex-wrap:wrap; }
[data-orbit-real-page] .nc-status-pick .nc-sp-lbl { font-size:12px; font-weight:600; color:var(--text-3); }
[data-orbit-real-page] .nc-sp-readonly { color:var(--text-4); font-size:11.5px; }

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
[data-orbit-real-page] .nc-vblock.nc-get .nc-vhead { color:var(--live-text); }
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

[data-orbit-real-page] .nc-about-rel { padding:10px 12px; border-radius:var(--r-md); background:var(--accent-softer); }
[data-orbit-real-page] .nc-about-sec { margin-top:14px; }
[data-orbit-real-page] .nc-about-k { display:block; font-size:12px; font-weight:600; color:var(--text-3); margin-bottom:5px; }
[data-orbit-real-page] .nc-about-p { font-size:13.5px; color:var(--text); line-height:1.6; margin:0; white-space:pre-wrap; }
[data-orbit-real-page] .nc-about-chips { display:flex; flex-wrap:wrap; gap:6px; }
[data-orbit-real-page] .nc-about-prompts { display:flex; flex-direction:column; gap:8px; }
[data-orbit-real-page] .nc-about-prompt { display:grid; grid-template-columns:16px 1fr; gap:8px; align-items:start; font-size:13px; color:var(--text-2); line-height:1.45; }
[data-orbit-real-page] .nc-about-prompt svg { color:var(--accent); margin-top:2px; flex-shrink:0; }
[data-orbit-real-page] .nc-vitem.nc-vitem-empty { display:block; color:var(--text-3); font-size:13px; }
[data-orbit-real-page] .nc-empty-copy { color:var(--text-3); font-size:13px; line-height:1.55; margin:0; }
` }} />
    </main>
  );
}
