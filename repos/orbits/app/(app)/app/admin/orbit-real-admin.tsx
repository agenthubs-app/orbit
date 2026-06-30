"use client";

import { useEffect, useState } from "react";

import type { OrbitAdminEventView, OrbitAdminFeedView, OrbitAdminMemberView, OrbitAdminViewModel } from "../orbit-admin-platform-route-view-model";
import { useOrbitLanguage, type OrbitLanguage } from "../orbit-language-context";
import { Cover, Icon, Logo, StatusBadge } from "../orbit-reference-primitives";

type OrbitT = (copy: { en: string; zh: string }) => string;

function navigateTo(path: string) {
  window.location.href = path;
}

export function OrbitRealAdminLogin({ kind = "organizer" }: { kind?: "organizer" | "platform" }) {
  const { t, language } = useOrbitLanguage();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const dest = kind === "platform" ? "/app/platform" : "/app/admin";

  return (
    <main className="orbit-admin-access-page" data-orbit-real-page>
      <section aria-hidden="true" className="orbit-admin-access-art">
        <div className="orbit-admin-access-art-inner">
          <Logo color="var(--on-dark)" size={28} textColor="var(--on-dark)" />
          <div>
            <h1 className="h-display orbit-admin-access-art-title">{kind === "platform" ? t({ en: "Product platform admin", zh: "产品平台后台" }) : t({ en: "Organizer admin", zh: "主办方后台" })}</h1>
            <p className="orbit-admin-access-art-copy">{kind === "platform" ? t({ en: "Review events, manage organizer accounts, and maintain quality and trust across the platform.", zh: "审核活动、管理主办方账号，维护整个平台的质量与信任。" }) : t({ en: "Manage registration, check-in, and on-site matching to turn every event into a high-quality networking experience.", zh: "管理报名、签到与现场匹配，把每一场活动办成高质量的人脉局。" })}</p>
          </div>
        </div>
      </section>
      <section className="orbit-admin-access-panel">
        <div className="orbit-admin-access-card card">
          <div className="orbit-admin-access-brand"><Logo size={26} /><div className="orbit-admin-access-brand-sub"><Icon name="lock" size={14} />ADMIN SESSION</div></div>
          <div className="eyebrow orbit-admin-access-eyebrow">{kind === "platform" ? "PLATFORM ADMIN" : "ORGANIZER ADMIN"} / MAGIC LINK</div>
          <h1 className="h-display orbit-admin-access-title">{sent ? t({ en: "Login email sent", zh: "登录邮件已发送" }) : t({ en: "Sign in to admin", zh: "登录后台" })}</h1>
          <p className="orbit-admin-access-copy">{sent ? t({ en: "Click the sign-in link in your inbox. In this demo you can enter the admin directly.", zh: "请到邮箱点击登录链接。演示中可直接进入后台。" }) : t({ en: "Enter your admin email and we'll send you a one-tap sign-in email.", zh: "输入管理员邮箱，我们会发送一封一键登录邮件。" })}</p>
          <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
            {!sent ? (
              <>
                <div className="orbit-admin-login-field" style={{ position: "relative" }}><Icon color="var(--text-3)" name="mail" size={17} style={{ left: 14, position: "absolute", top: "50%", transform: "translateY(-50%)" }} /><input className="field" onChange={(event) => setEmail(event.target.value)} placeholder="admin@orbit.events" style={{ height: 50, paddingLeft: 44 }} value={email} /></div>
                <button className="btn btn-primary btn-lg btn-block" onClick={() => setSent(true)} type="button">{t({ en: "Send sign-in email", zh: "发送登录邮件" })}<Icon color="var(--on-dark)" name="arrow" size={17} /></button>
              </>
            ) : (
              <div className="orbit-admin-login-success"><div style={{ color: "var(--ink)", fontWeight: 650 }}>✓ {t({ en: "Sent to", zh: "已发送至" })} {email || "admin@orbit.events"}</div><p>{t({ en: "Didn't get it? Check your spam folder, or resend.", zh: "没收到？检查垃圾邮件，或重新发送。" })}</p></div>
            )}
            <button className="btn btn-ghost btn-block" onClick={() => navigateTo(dest)} type="button">{sent ? t({ en: "Enter admin (demo)", zh: "进入后台（演示）" }) : t({ en: "Skip · enter admin directly (demo)", zh: "跳过 · 直接进入后台（演示）" })}<Icon name="arrowUR" size={16} /></button>
          </div>
          <div className="orbit-admin-access-chips"><span className="badge badge-soon">Admin</span><span className="chip orbit-lang-inline">{language === "zh" ? "ZH" : "EN"}</span></div>
        </div>
      </section>
    </main>
  );
}

function buildHostNav(t: OrbitT): Array<[string, string, string, string]> {
  return [
    ["dash", "grid", t({ en: "Dashboard", zh: "仪表盘" }), "/app/admin"],
    ["events", "calendar", t({ en: "Events", zh: "活动管理" }), "/app/admin/events"],
    ["access", "lock", t({ en: "Access", zh: "访问管理" }), "/app/admin"],
    ["settings", "settings", t({ en: "Event setup", zh: "活动配置" }), "/app/admin/events"],
  ];
}

function HostShell({ active, children, viewModel }: { active: string; children: React.ReactNode; viewModel: OrbitAdminViewModel }) {
  const { t } = useOrbitLanguage();
  const hostNav = buildHostNav(t);
  return (
    <div className="orbit-host-admin-page" data-orbit-real-page>
      <div className="orbit-host-desktop-shell">
        <aside className="orbit-host-sidebar">
          <div className="orbit-host-logo"><Logo size={24} /></div>
          <div className="orbit-host-org-card"><span className={`avatar ${viewModel.adminOrg.g}`} style={{ borderRadius: 9, fontSize: 14, height: 34, width: 34 }}>{viewModel.adminOrg.initial}</span><div style={{ minWidth: 0 }}><div className="orbit-host-org-name">{viewModel.adminOrg.name}</div><div className="orbit-host-muted">{viewModel.adminOrg.sub}</div></div></div>
          <div className="orbit-host-nav-label eyebrow">{t({ en: "Workspace", zh: "工作区" })}</div>
          <nav className="orbit-host-nav">{hostNav.map(([key, icon, label, href]) => <button className={`orbit-host-nav-item${active === key ? " is-active" : ""}`} key={key} onClick={() => navigateTo(href)} type="button"><Icon name={icon} size={18} />{label}</button>)}</nav>
          <div className="orbit-host-sidebar-spacer" />
          <button className="orbit-host-exit" onClick={() => navigateTo("/app")} type="button"><Icon name="logout" size={16} />{t({ en: "Exit admin", zh: "退出后台" })}</button>
        </aside>
        <div className="orbit-host-main"><div className="orbit-host-content">{children}</div></div>
      </div>
      <div className="orbit-host-mobile-shell">
        <div className="orbit-host-mobile-header"><Logo size={22} /><span className={`avatar ${viewModel.adminOrg.g}`} style={{ borderRadius: 8, fontSize: 13, height: 32, width: 32 }}>{viewModel.adminOrg.initial}</span></div>
        <div className="orbit-host-mobile-tabs">{hostNav.slice(0, 3).map(([key, , label, href]) => <button className={`chip${active === key ? " is-active" : ""}`} key={key} onClick={() => navigateTo(href)} type="button">{label}</button>)}</div>
        <div className="orbit-host-mobile-scroll" data-appscroll>{children}</div>
      </div>
    </div>
  );
}

function StatTile({ s }: { s: OrbitAdminViewModel["adminStats"][number] }) {
  return <div className="card orbit-host-stat-tile"><div className="orbit-host-stat-head"><span className={`avatar ${s.g}`}><Icon color="var(--on-dark)" name={s.icon} size={18} /></span><span className="badge badge-soon" style={{ height: 22 }}>{s.delta}</span></div><div className="orbit-host-stat-value">{s.value}</div><div className="orbit-host-muted" style={{ marginTop: 2 }}>{s.label}</div></div>;
}

function PhaseRail({ phase, viewModel }: { phase: number; viewModel: OrbitAdminViewModel }) {
  return <div className="orbit-host-mini-phase-rail">{viewModel.adminPhases.map((phaseLabel, index) => <div className="orbit-host-mini-phase-part" key={phaseLabel}><div className="orbit-host-mini-phase"><span className={index < phase ? "is-done" : index === phase ? "is-current" : ""}>{index < phase ? <Icon color="var(--on-dark)" name="check" size={9} /> : index === phase ? <i /> : null}</span><em>{phaseLabel}</em></div>{index < viewModel.adminPhases.length - 1 ? <b className={index < phase ? "is-done" : ""} /> : null}</div>)}</div>;
}

function FeedRow({ f }: { f: OrbitAdminFeedView }) {
  return <div className="orbit-host-member-row"><span className={`avatar ${f.g}`} style={{ fontSize: 15, height: 38, width: 38 }}>{f.initial}</span><div className="orbit-host-member-main"><strong>{f.name}</strong><span>{f.title} · {f.company}</span></div><div style={{ flexShrink: 0, textAlign: "right" }}><span className={`badge ${f.kind === "签到" || f.kind === "Check-in" ? "badge-live" : "badge-soon"}`} style={{ height: 22 }}>{f.kind}</span><div className="orbit-host-muted" style={{ fontSize: 11, marginTop: 4 }}>{f.t}</div></div></div>;
}

function AdminDashContent({ viewModel }: { viewModel: OrbitAdminViewModel }) {
  const { t } = useOrbitLanguage();
  return (
    <>
      <div className="orbit-host-page-head"><div><div className="eyebrow">DASHBOARD</div><h1 className="h-display">{t({ en: "Dashboard", zh: "仪表盘" })}</h1></div><div className="orbit-host-actions"><button className="btn btn-ghost" type="button"><Icon name="download" size={16} />{t({ en: "Export", zh: "导出" })}</button><button className="btn btn-primary" type="button"><Icon color="var(--on-dark)" name="sparkle" size={16} />{t({ en: "Run AI matching", zh: "运行 AI 匹配" })}</button></div></div>
      <div className="orbit-host-stat-grid">{viewModel.adminStats.map((stat) => <StatTile key={stat.label} s={stat} />)}</div>
      <div className="orbit-host-dashboard-grid">
        <div>
          <div className="card orbit-host-card"><div className="orbit-host-section-head"><h2 className="h-section">{t({ en: "Registration funnel", zh: "报名漏斗" })}</h2><span className="orbit-host-muted">TBC Spring · 2026</span></div><div className="orbit-host-funnel">{viewModel.adminFunnel.map(([label, value, percent], index) => <div key={label}><span className="orbit-host-muted">{label}</span><span className="orbit-host-mini-value">{value.toLocaleString()}</span><div className="orbit-host-bar"><span style={{ background: ["var(--accent)", "var(--sky)", "var(--live)"][index], width: `${percent * 100}%` }} /></div></div>)}</div></div>
          <div className="card orbit-host-card"><div className="orbit-host-section-head"><h2 className="h-section">{t({ en: "Per-event metrics", zh: "各活动数据" })}</h2></div><div className="orbit-host-event-stats">{viewModel.adminEvents.map((event) => <div className="orbit-host-event-stat-row" key={event.id}><Cover className="orbit-host-event-stat-cover" g={event.g} monogram={{ text: event.name.slice(0, 1), size: 20 }} /><div className="orbit-host-event-stat-main"><div className="orbit-host-title-row"><strong>{event.name}</strong></div><div className="orbit-host-bar"><span style={{ background: "var(--accent)", width: `${(event.registered / event.cap) * 100}%` }} /></div></div><div className="orbit-host-event-stat-metrics"><div><span className="orbit-host-muted">{t({ en: "Registered", zh: "报名" })}</span><span className="orbit-host-mini-value">{event.registered}</span></div><div><span className="orbit-host-muted">{t({ en: "Checked in", zh: "签到" })}</span><span className="orbit-host-mini-value">{event.checkedin}</span></div><div><span className="orbit-host-muted">{t({ en: "Matched", zh: "匹配" })}</span><span className="orbit-host-mini-value">{event.matched}</span></div><div><span className="orbit-host-muted">{t({ en: "Capacity", zh: "容量" })}</span><span className="orbit-host-mini-value">{event.cap}</span></div></div></div>)}</div></div>
        </div>
        <div>
          <div className="card orbit-host-card"><div className="orbit-host-section-head"><h2 className="h-section">{t({ en: "Live activity", zh: "实时动态" })}</h2><span className="badge badge-live" style={{ height: 22 }}><span className="dot dot-live" />LIVE</span></div>{viewModel.adminFeed.map((feed) => <FeedRow f={feed} key={feed.id} />)}</div>
          <div className="card orbit-host-card"><div className="orbit-host-section-head"><h2 className="h-section">{t({ en: "Team members", zh: "团队成员" })}</h2><button className="btn btn-ghost btn-sm" type="button"><Icon name="plus" size={14} />{t({ en: "Invite", zh: "邀请" })}</button></div>{viewModel.adminMembers.map((member) => <MemberRow key={member.email} member={member} />)}</div>
        </div>
      </div>
    </>
  );
}

function MemberRow({ member }: { member: OrbitAdminMemberView }) {
  return <div className="orbit-host-member-row"><span className={`avatar ${member.g}`} style={{ fontSize: 15, height: 38, width: 38 }}>{member.initial}</span><div className="orbit-host-member-main"><strong>{member.name}</strong><span>{member.email}</span></div><span className="orbit-host-role-pill">{member.role}</span></div>;
}

export function OrbitRealAdminWorkspace({ viewModel }: { viewModel: OrbitAdminViewModel }) {
  return <HostShell active="dash" viewModel={viewModel}><AdminDashContent viewModel={viewModel} /></HostShell>;
}

function CreateEventModal({ initialEvent, onClose }: { initialEvent?: OrbitAdminEventView; onClose: () => void }) {
  const { t } = useOrbitLanguage();
  const [stepN, setStepN] = useState(0);
  const steps = [t({ en: "Basics", zh: "基本信息" }), t({ en: "Time & place", zh: "时间地点" }), t({ en: "Registration form", zh: "报名表单" }), t({ en: "Automation", zh: "流程自动化" })];

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const formQuestions: Array<[string, string]> = [
    [t({ en: "The one thing you most want to achieve tonight", zh: "你今晚最想达成的一件事" }), t({ en: "Required", zh: "必填" })],
    [t({ en: "Industry", zh: "所属行业" }), t({ en: "Optional", zh: "选填" })],
    [t({ en: "One-line self introduction", zh: "一句话自我介绍" }), t({ en: "Optional", zh: "选填" })],
  ];
  const automationRows: Array<[string, string]> = [
    [t({ en: "Open check-in", zh: "开放签到" }), t({ en: "30 minutes before the event starts", zh: "活动开始前 30 分钟" })],
    [t({ en: "Run AI grouping", zh: "运行 AI 分组" }), t({ en: "When check-in reaches 60%", zh: "签到达到 60%" })],
    [t({ en: "Publish match results", zh: "公布匹配结果" }), t({ en: "45 minutes after the event starts", zh: "活动开始后 45 分钟" })],
  ];

  return (
    <div className="orbit-host-modal-layer">
      <button aria-label={t({ en: "Close", zh: "关闭" })} className="orbit-host-modal-backdrop" onClick={onClose} type="button" />
      <div className="card orbit-host-create-modal">
        <div className="orbit-host-create-head"><span className="avatar g-indigo"><Icon color="var(--on-dark)" name="calendar" size={18} /></span><div><strong>{t({ en: "Create event", zh: "新建活动" })}</strong><span>{t({ en: "Recurring event · custom flow and form", zh: "定期活动 · 自定义流程与表单" })}</span></div><button aria-label={t({ en: "Close", zh: "关闭" })} className="hit-44" onClick={onClose} type="button"><Icon name="x" size={17} /></button></div>
        <div className="orbit-host-create-dots">{steps.map((step, index) => <span className={index <= stepN ? "is-active" : ""} key={step} />)}</div>
        <div className="orbit-host-create-body"><div className="eyebrow">STEP 0{stepN + 1} / 0{steps.length} · {steps[stepN]}</div>{stepN === 0 ? <><div className="orbit-host-field"><label className="field-label">{t({ en: "Event name", zh: "活动名称" })}</label><input className="field" defaultValue={initialEvent?.name ?? ""} /></div><div className="orbit-host-two-col"><div className="orbit-host-field"><label className="field-label">{t({ en: "Event code", zh: "活动编号" })}</label><input className="field" defaultValue={initialEvent?.code ?? ""} /></div><div className="orbit-host-field"><label className="field-label">{t({ en: "Theme color", zh: "主题色" })}</label><input className="field" defaultValue={initialEvent?.themeColor ?? "#6359E9"} /></div></div><div className="orbit-host-field"><label className="field-label">{t({ en: "One-line summary", zh: "一句话简介" })}</label><input className="field" defaultValue={initialEvent?.summary ?? ""} /></div></> : stepN === 1 ? <><div className="orbit-host-two-col"><div className="orbit-host-field"><label className="field-label">{t({ en: "Start time", zh: "开始时间" })}</label><input className="field" defaultValue={initialEvent?.startsAt ?? ""} /></div><div className="orbit-host-field"><label className="field-label">{t({ en: "End time", zh: "结束时间" })}</label><input className="field" defaultValue={initialEvent?.endsAt ?? ""} /></div></div><div className="orbit-host-field"><label className="field-label">{t({ en: "Venue", zh: "场地" })}</label><input className="field" defaultValue={initialEvent?.venue ?? ""} /></div><div className="orbit-host-field"><label className="field-label">{t({ en: "Full address", zh: "详细地址" })}</label><input className="field" defaultValue={initialEvent?.venue ?? ""} /></div></> : stepN === 2 ? <><div className="orbit-host-automation-note"><Icon color="var(--accent)" name="sparkle" size={17} /><span>{t({ en: "Registration questions apply only to this event; the general profile is reused for matching automatically.", zh: "报名问题只用于本场活动；通用画像会自动复用于匹配。" })}</span></div>{formQuestions.map(([question, required]) => <div className="orbit-host-automation-row" key={question}><span style={{ border: "1.5px solid var(--border-2)", borderRadius: 5, height: 18, width: 18 }} /><div><strong>{question}</strong><span>{required}</span></div><span className="chip">{required}</span></div>)}</> : <><div className="orbit-host-automation-note"><Icon color="var(--accent)" name="zap" size={17} /><span>{t({ en: "Automatically opens check-in and runs AI grouping and recommendations on schedule.", zh: "到点自动开启签到、自动运行 AI 分组与推荐。" })}</span></div>{automationRows.map(([action, time]) => <div className="orbit-host-automation-row" key={action}><Icon color="var(--accent)" name="clock" size={16} /><div><strong>{action}</strong><span>{time}</span></div><span className="chip chip-accent">{t({ en: "Auto", zh: "自动" })}</span></div>)}</>}</div>
        <div className="orbit-host-create-actions"><button className="btn btn-ghost" onClick={() => (stepN > 0 ? setStepN(stepN - 1) : onClose())} type="button">{stepN > 0 ? t({ en: "Back", zh: "上一步" }) : t({ en: "Cancel", zh: "取消" })}</button><span /><button className="btn btn-primary" onClick={() => (stepN < steps.length - 1 ? setStepN(stepN + 1) : onClose())} type="button">{stepN < steps.length - 1 ? t({ en: "Next", zh: "下一步" }) : t({ en: "Create event", zh: "创建活动" })}</button></div>
      </div>
    </div>
  );
}

function HostPortfolioCard({ event, language, t, viewModel }: { event: OrbitAdminEventView; language: OrbitLanguage; t: OrbitT; viewModel: OrbitAdminViewModel }) {
  return <div className="card orbit-host-portfolio-card"><div className="orbit-host-portfolio-card-main"><Cover className="orbit-host-portfolio-cover" g={event.g} monogram={{ text: event.name.slice(0, 1), size: 24 }} /><div className="orbit-host-portfolio-info"><div className="orbit-host-title-row"><strong>{event.name}</strong><StatusBadge language={language} status={event.status} /></div><div className="orbit-host-portfolio-count"><span><b>{event.registered}</b> / {event.cap} {t({ en: "registered", zh: "报名" })}</span><div className="orbit-host-bar"><span style={{ background: "var(--accent)", width: `${(event.registered / event.cap) * 100}%` }} /></div></div></div></div><div className="orbit-host-portfolio-rail"><PhaseRail phase={event.phase} viewModel={viewModel} /></div></div>;
}

export function OrbitRealAdminEvents({ viewModel }: { viewModel: OrbitAdminViewModel }) {
  const { t, language } = useOrbitLanguage();
  const [createOpen, setCreateOpen] = useState(false);
  const liveCount = viewModel.adminEvents.filter((event) => event.status === "active").length;
  const upcomingCount = viewModel.adminEvents.filter((event) => event.status === "upcoming").length;
  const endedCount = viewModel.adminEvents.filter((event) => event.status === "ended").length;
  return (
    <HostShell active="events" viewModel={viewModel}>
      <div className="orbit-host-page-head"><div><div className="eyebrow">EVENTS</div><h1 className="h-display">{t({ en: "Events", zh: "活动管理" })}</h1></div><div className="orbit-host-actions"><button className="btn btn-primary" onClick={() => setCreateOpen(true)} type="button"><Icon color="var(--on-dark)" name="plus" size={16} />{t({ en: "Create event", zh: "新建活动" })}</button></div></div>
      <div className="orbit-host-chip-row"><span className="chip is-active">{t({ en: "All", zh: "全部" })} {viewModel.adminEvents.length}</span><span className="chip">{t({ en: "Live", zh: "进行中" })} {liveCount}</span><span className="chip">{t({ en: "Upcoming", zh: "即将" })} {upcomingCount}</span><span className="chip">{t({ en: "Ended", zh: "已结束" })} {endedCount}</span></div>
      <div className="orbit-host-event-grid">{viewModel.adminEvents.map((event) => <HostPortfolioCard event={event} key={event.id} language={language} t={t} viewModel={viewModel} />)}</div>
      <div className="card orbit-host-card" style={{ marginTop: 18 }}>
        <div className="orbit-host-section-head"><h2 className="h-section">{t({ en: "Access · team & roles", zh: "访问管理 · 团队与角色" })}</h2><button className="btn btn-ghost btn-sm" onClick={() => setCreateOpen(false)} type="button"><Icon name="plus" size={14} />{t({ en: "Invite member", zh: "邀请成员" })}</button></div>
        <div className="orbit-host-access-notes">{viewModel.adminMembers.map((member) => <div className="card-flat orbit-host-access-note" key={member.email}><span className={`avatar ${member.g}`} style={{ flexShrink: 0, fontSize: 15, height: 38, width: 38 }}>{member.initial}</span><div><strong>{member.name} · {member.role}</strong><span>{member.email}</span></div></div>)}</div>
      </div>
      {createOpen ? <CreateEventModal initialEvent={viewModel.adminEvents[0]} onClose={() => setCreateOpen(false)} /> : null}
    </HostShell>
  );
}
