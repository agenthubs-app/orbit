"use client";

import { useState } from "react";

import type { OrbitAdminEventView, OrbitAdminFeedView, OrbitAdminMemberView, OrbitAdminViewModel } from "../orbit-admin-platform-route-view-model";
import { Cover, Icon, Logo, StatusBadge } from "../orbit-reference-primitives";

function navigateTo(path: string) {
  window.location.href = path;
}

export function OrbitRealAdminLogin({ kind = "organizer" }: { kind?: "organizer" | "platform" }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const dest = kind === "platform" ? "/app/platform" : "/app/admin";

  return (
    <main className="orbit-admin-access-page" data-orbit-real-page>
      <section aria-hidden="true" className="orbit-admin-access-art">
        <div className="orbit-admin-access-art-inner">
          <Logo color="#fff" size={28} textColor="#fff" />
          <div>
            <div className="h-display orbit-admin-access-art-title">{kind === "platform" ? "产品平台后台" : "主办方后台"}</div>
            <p className="orbit-admin-access-art-copy">{kind === "platform" ? "审核活动、管理主办方账号，维护整个平台的质量与信任。" : "管理报名、签到与现场匹配，把每一场活动办成高质量的人脉局。"}</p>
          </div>
        </div>
      </section>
      <section className="orbit-admin-access-panel">
        <div className="orbit-admin-access-card card">
          <div className="orbit-admin-access-brand"><Logo size={26} /><div className="orbit-admin-access-brand-sub"><Icon name="lock" size={14} />ADMIN SESSION</div></div>
          <div className="eyebrow orbit-admin-access-eyebrow">{kind === "platform" ? "PLATFORM ADMIN" : "ORGANIZER ADMIN"} / MAGIC LINK</div>
          <h1 className="h-display orbit-admin-access-title">{sent ? "登录邮件已发送" : "登录后台"}</h1>
          <p className="orbit-admin-access-copy">{sent ? "请到邮箱点击登录链接。演示中可直接进入后台。" : "输入管理员邮箱，我们会发送一封一键登录邮件。"}</p>
          <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
            {!sent ? (
              <>
                <div className="orbit-admin-login-field" style={{ position: "relative" }}><Icon color="var(--text-3)" name="mail" size={17} style={{ left: 14, position: "absolute", top: "50%", transform: "translateY(-50%)" }} /><input className="field" onChange={(event) => setEmail(event.target.value)} placeholder="admin@orbit.events" style={{ height: 50, paddingLeft: 44 }} value={email} /></div>
                <button className="btn btn-primary btn-lg btn-block" onClick={() => setSent(true)} type="button">发送登录邮件<Icon color="#fff" name="arrow" size={17} /></button>
              </>
            ) : (
              <div className="orbit-admin-login-success"><div style={{ color: "var(--ink)", fontWeight: 650 }}>✓ 已发送至 {email || "admin@orbit.events"}</div><p>没收到？检查垃圾邮件，或重新发送。</p></div>
            )}
            <button className="btn btn-ghost btn-block" onClick={() => navigateTo(dest)} type="button">{sent ? "进入后台（演示）" : "跳过 · 直接进入后台（演示）"}<Icon name="arrowUR" size={16} /></button>
          </div>
          <div className="orbit-admin-access-chips"><span className="badge badge-soon">Admin</span><span className="chip orbit-lang-inline">ZH</span></div>
        </div>
      </section>
    </main>
  );
}

const HOST_NAV = [["dash", "grid", "仪表盘", "/app/admin"], ["events", "calendar", "活动管理", "/app/admin/events"], ["access", "lock", "访问管理", "/app/admin"], ["settings", "settings", "活动配置", "/app/admin/events"]] as const;

function HostShell({ active, children, viewModel }: { active: string; children: React.ReactNode; viewModel: OrbitAdminViewModel }) {
  return (
    <div className="orbit-host-admin-page" data-orbit-real-page>
      <div className="orbit-host-desktop-shell">
        <aside className="orbit-host-sidebar">
          <div className="orbit-host-logo"><Logo size={24} /></div>
          <div className="orbit-host-org-card"><span className={`avatar ${viewModel.adminOrg.g}`} style={{ borderRadius: 9, fontSize: 14, height: 34, width: 34 }}>{viewModel.adminOrg.initial}</span><div style={{ minWidth: 0 }}><div className="orbit-host-org-name">{viewModel.adminOrg.name}</div><div className="orbit-host-muted">{viewModel.adminOrg.sub}</div></div></div>
          <div className="orbit-host-nav-label eyebrow">工作区</div>
          <nav className="orbit-host-nav">{HOST_NAV.map(([key, icon, label, href]) => <button className={`orbit-host-nav-item${active === key ? " is-active" : ""}`} key={key} onClick={() => navigateTo(href)} type="button"><Icon name={icon} size={18} />{label}</button>)}</nav>
          <div className="orbit-host-sidebar-spacer" />
          <button className="orbit-host-exit" onClick={() => navigateTo("/app")} type="button"><Icon name="logout" size={16} />退出后台</button>
        </aside>
        <div className="orbit-host-main"><div className="orbit-host-content">{children}</div></div>
      </div>
      <div className="orbit-host-mobile-shell">
        <div className="orbit-host-mobile-header"><Logo size={22} /><span className={`avatar ${viewModel.adminOrg.g}`} style={{ borderRadius: 8, fontSize: 13, height: 32, width: 32 }}>{viewModel.adminOrg.initial}</span></div>
        <div className="orbit-host-mobile-tabs">{HOST_NAV.slice(0, 3).map(([key, , label, href]) => <button className={`chip${active === key ? " is-active" : ""}`} key={key} onClick={() => navigateTo(href)} type="button">{label}</button>)}</div>
        <div className="orbit-host-mobile-scroll" data-appscroll>{children}</div>
      </div>
    </div>
  );
}

function StatTile({ s }: { s: OrbitAdminViewModel["adminStats"][number] }) {
  return <div className="card orbit-host-stat-tile"><div className="orbit-host-stat-head"><span className={`avatar ${s.g}`}><Icon color="#fff" name={s.icon} size={18} /></span><span className="badge badge-soon" style={{ height: 22 }}>{s.delta}</span></div><div className="orbit-host-stat-value">{s.value}</div><div className="orbit-host-muted" style={{ marginTop: 2 }}>{s.label}</div></div>;
}

function PhaseRail({ phase, viewModel }: { phase: number; viewModel: OrbitAdminViewModel }) {
  return <div className="orbit-host-mini-phase-rail">{viewModel.adminPhases.map((phaseLabel, index) => <div className="orbit-host-mini-phase-part" key={phaseLabel}><div className="orbit-host-mini-phase"><span className={index < phase ? "is-done" : index === phase ? "is-current" : ""}>{index < phase ? <Icon color="#fff" name="check" size={9} /> : index === phase ? <i /> : null}</span><em>{phaseLabel}</em></div>{index < viewModel.adminPhases.length - 1 ? <b className={index < phase ? "is-done" : ""} /> : null}</div>)}</div>;
}

function FeedRow({ f }: { f: OrbitAdminFeedView }) {
  return <div className="orbit-host-member-row"><span className={`avatar ${f.g}`} style={{ fontSize: 15, height: 38, width: 38 }}>{f.initial}</span><div className="orbit-host-member-main"><strong>{f.name}</strong><span>{f.title} · {f.company}</span></div><div style={{ flexShrink: 0, textAlign: "right" }}><span className={`badge ${f.kind === "签到" || f.kind === "Check-in" ? "badge-live" : "badge-soon"}`} style={{ height: 22 }}>{f.kind}</span><div className="orbit-host-muted" style={{ fontSize: 11, marginTop: 4 }}>{f.t}</div></div></div>;
}

function AdminDashContent({ viewModel }: { viewModel: OrbitAdminViewModel }) {
  return (
    <>
      <div className="orbit-host-page-head"><div><div className="eyebrow">DASHBOARD</div><h1 className="h-display">仪表盘</h1></div><div className="orbit-host-actions"><button className="btn btn-ghost" type="button"><Icon name="download" size={16} />导出</button><button className="btn btn-primary" type="button"><Icon color="#fff" name="sparkle" size={16} />运行 AI 匹配</button></div></div>
      <div className="orbit-host-stat-grid">{viewModel.adminStats.map((stat) => <StatTile key={stat.label} s={stat} />)}</div>
      <div className="orbit-host-dashboard-grid">
        <div>
          <div className="card orbit-host-card"><div className="orbit-host-section-head"><div className="h-section">报名漏斗</div><span className="orbit-host-muted">TBC Spring · 2026</span></div><div className="orbit-host-funnel">{viewModel.adminFunnel.map(([label, value, percent], index) => <div key={label}><span className="orbit-host-muted">{label}</span><span className="orbit-host-mini-value">{value.toLocaleString()}</span><div className="orbit-host-bar"><span style={{ background: ["var(--accent)", "var(--sky)", "var(--live)"][index], width: `${percent * 100}%` }} /></div></div>)}</div></div>
          <div className="card orbit-host-card"><div className="orbit-host-section-head"><div className="h-section">各活动数据</div></div><div className="orbit-host-event-stats">{viewModel.adminEvents.map((event) => <div className="orbit-host-event-stat-row" key={event.id}><Cover className="orbit-host-event-stat-cover" g={event.g} monogram={{ text: event.name.slice(0, 1), size: 20 }} /><div className="orbit-host-event-stat-main"><div className="orbit-host-title-row"><strong>{event.name}</strong></div><div className="orbit-host-bar"><span style={{ background: "var(--accent)", width: `${(event.registered / event.cap) * 100}%` }} /></div></div><div className="orbit-host-event-stat-metrics"><div><span className="orbit-host-muted">报名</span><span className="orbit-host-mini-value">{event.registered}</span></div><div><span className="orbit-host-muted">签到</span><span className="orbit-host-mini-value">{event.checkedin}</span></div><div><span className="orbit-host-muted">匹配</span><span className="orbit-host-mini-value">{event.matched}</span></div><div><span className="orbit-host-muted">容量</span><span className="orbit-host-mini-value">{event.cap}</span></div></div></div>)}</div></div>
        </div>
        <div>
          <div className="card orbit-host-card"><div className="orbit-host-section-head"><div className="h-section">实时动态</div><span className="badge badge-live" style={{ height: 22 }}><span className="dot dot-live" />LIVE</span></div>{viewModel.adminFeed.map((feed) => <FeedRow f={feed} key={feed.id} />)}</div>
          <div className="card orbit-host-card"><div className="orbit-host-section-head"><div className="h-section">团队成员</div><button className="btn btn-ghost btn-sm" type="button"><Icon name="plus" size={14} />邀请</button></div>{viewModel.adminMembers.map((member) => <MemberRow key={member.email} member={member} />)}</div>
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

function CreateEventModal({ onClose }: { onClose: () => void }) {
  const [stepN, setStepN] = useState(0);
  const steps = ["基本信息", "时间地点", "报名表单", "流程自动化"];
  return (
    <div className="orbit-host-modal-layer">
      <button aria-label="关闭" className="orbit-host-modal-backdrop" onClick={onClose} type="button" />
      <div className="card orbit-host-create-modal">
        <div className="orbit-host-create-head"><span className="avatar g-indigo"><Icon color="#fff" name="calendar" size={18} /></span><div><strong>新建活动</strong><span>定期活动 · 自定义流程与表单</span></div><button onClick={onClose} type="button"><Icon name="x" size={17} /></button></div>
        <div className="orbit-host-create-dots">{steps.map((step, index) => <span className={index <= stepN ? "is-active" : ""} key={step} />)}</div>
        <div className="orbit-host-create-body"><div className="eyebrow">STEP 0{stepN + 1} / 0{steps.length} · {steps[stepN]}</div>{stepN === 0 ? <><div className="orbit-host-field"><label className="field-label">活动名称</label><input className="field" defaultValue="Tokyo Business Connect" /></div><div className="orbit-host-two-col"><div className="orbit-host-field"><label className="field-label">活动编号</label><input className="field" defaultValue="TBC26S" /></div><div className="orbit-host-field"><label className="field-label">主题色</label><input className="field" defaultValue="#6359E9" /></div></div><div className="orbit-host-field"><label className="field-label">一句话简介</label><input className="field" defaultValue="面向出海与跨境商务人群的高密度晚间社交局。" /></div></> : stepN === 1 ? <><div className="orbit-host-two-col"><div className="orbit-host-field"><label className="field-label">开始时间</label><input className="field" defaultValue="2026-06-27 18:00" /></div><div className="orbit-host-field"><label className="field-label">结束时间</label><input className="field" defaultValue="2026-06-27 21:30" /></div></div><div className="orbit-host-field"><label className="field-label">场地</label><input className="field" defaultValue="东京中城 · Hall B" /></div><div className="orbit-host-field"><label className="field-label">详细地址</label><input className="field" defaultValue="东京都港区赤坂 9-7-1" /></div></> : stepN === 2 ? <><div className="orbit-host-automation-note"><Icon color="var(--accent)" name="sparkle" size={17} /><span>报名问题只用于本场活动；通用画像会自动复用于匹配。</span></div>{[["你今晚最想达成的一件事", "必填"], ["所属行业", "选填"], ["一句话自我介绍", "选填"]].map(([question, required]) => <div className="orbit-host-automation-row" key={question}><span style={{ border: "1.5px solid var(--border-2)", borderRadius: 5, height: 18, width: 18 }} /><div><strong>{question}</strong><span>{required}</span></div><span className="chip">{required}</span></div>)}</> : <><div className="orbit-host-automation-note"><Icon color="var(--accent)" name="zap" size={17} /><span>到点自动开启签到、自动运行 AI 分组与推荐。</span></div>{[["开放签到", "活动开始前 30 分钟"], ["运行 AI 分组", "签到达到 60%"], ["公布匹配结果", "活动开始后 45 分钟"]].map(([action, time]) => <div className="orbit-host-automation-row" key={action}><Icon color="var(--accent)" name="clock" size={16} /><div><strong>{action}</strong><span>{time}</span></div><span className="chip chip-accent">自动</span></div>)}</>}</div>
        <div className="orbit-host-create-actions"><button className="btn btn-ghost" onClick={() => (stepN > 0 ? setStepN(stepN - 1) : onClose())} type="button">{stepN > 0 ? "上一步" : "取消"}</button><span /><button className="btn btn-primary" onClick={() => (stepN < steps.length - 1 ? setStepN(stepN + 1) : onClose())} type="button">{stepN < steps.length - 1 ? "下一步" : "创建活动"}</button></div>
      </div>
    </div>
  );
}

function HostPortfolioCard({ event, viewModel }: { event: OrbitAdminEventView; viewModel: OrbitAdminViewModel }) {
  return <div className="card orbit-host-portfolio-card"><div className="orbit-host-portfolio-card-main"><Cover className="orbit-host-portfolio-cover" g={event.g} monogram={{ text: event.name.slice(0, 1), size: 24 }} /><div className="orbit-host-portfolio-info"><div className="orbit-host-title-row"><strong>{event.name}</strong><StatusBadge status={event.status} /></div><div className="orbit-host-portfolio-count"><span><b>{event.registered}</b> / {event.cap} 报名</span><div className="orbit-host-bar"><span style={{ background: "var(--accent)", width: `${(event.registered / event.cap) * 100}%` }} /></div></div></div></div><div className="orbit-host-portfolio-rail"><PhaseRail phase={event.phase} viewModel={viewModel} /></div></div>;
}

export function OrbitRealAdminEvents({ viewModel }: { viewModel: OrbitAdminViewModel }) {
  const [createOpen, setCreateOpen] = useState(false);
  return (
    <HostShell active="events" viewModel={viewModel}>
      <div className="orbit-host-page-head"><div><div className="eyebrow">EVENTS</div><h1 className="h-display">活动管理</h1></div><div className="orbit-host-actions"><button className="btn btn-primary" onClick={() => setCreateOpen(true)} type="button"><Icon color="#fff" name="plus" size={16} />新建活动</button></div></div>
      <div className="orbit-host-chip-row"><span className="chip is-active">全部 {viewModel.adminEvents.length}</span><span className="chip">进行中 1</span><span className="chip">即将 2</span><span className="chip">已结束 1</span></div>
      <div className="orbit-host-event-grid">{viewModel.adminEvents.map((event) => <HostPortfolioCard event={event} key={event.id} viewModel={viewModel} />)}</div>
      <div className="card orbit-host-card" style={{ marginTop: 18 }}>
        <div className="orbit-host-section-head"><div className="h-section">访问管理 · 团队与角色</div><button className="btn btn-ghost btn-sm" onClick={() => setCreateOpen(false)} type="button"><Icon name="plus" size={14} />邀请成员</button></div>
        <div className="orbit-host-access-notes">{viewModel.adminMembers.map((member) => <div className="card-flat orbit-host-access-note" key={member.email}><span className={`avatar ${member.g}`} style={{ flexShrink: 0, fontSize: 15, height: 38, width: 38 }}>{member.initial}</span><div><strong>{member.name} · {member.role}</strong><span>{member.email}</span></div></div>)}</div>
      </div>
      {createOpen ? <CreateEventModal onClose={() => setCreateOpen(false)} /> : null}
    </HostShell>
  );
}
