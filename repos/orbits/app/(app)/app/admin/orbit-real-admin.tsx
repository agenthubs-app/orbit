"use client";

import type { OrbitAdminEventView, OrbitAdminMemberView, OrbitAdminViewModel } from "../orbit-admin-platform-route-view-model";
import { formatOrbitDateTime } from "../orbit-datetime";
import { eventCoverPhoto } from "../orbit-event-cover-photo";
import { useOrbitLanguage, type OrbitLanguage } from "../orbit-language-context";
import { Cover, Icon, Logo, StatusBadge } from "../orbit-reference-primitives";

type OrbitT = (copy: { en: string; zh: string }) => string;

function navigateTo(path: string) {
  window.location.href = path;
}

export function OrbitRealAdminLogin({ kind = "organizer" }: { kind?: "organizer" | "platform" }) {
  const { t, language } = useOrbitLanguage();
  const dest = kind === "platform" ? "/app/platform" : "/app/admin";
  const signInHref = `/app/account/login?next=${encodeURIComponent(dest)}`;

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
            <h1 className="h-display orbit-admin-access-title">{t({ en: "Sign in to admin", zh: "登录后台" })}</h1>
            <p className="orbit-admin-access-copy">{t({ en: "Continue through the secure account sign-in flow. Admin access is granted only after the authenticated session is verified.", zh: "请通过安全账号登录流程继续。只有在验证登录会话后，才能进入后台。" })}</p>
            <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
              <a className="btn btn-primary btn-lg btn-block" href={signInHref}>{t({ en: "Continue to secure sign in", zh: "继续安全登录" })}<Icon color="var(--on-dark)" name="arrow" size={17} /></a>
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

function EventSourceRow({
  event,
  language,
}: {
  event: OrbitAdminEventView;
  language: OrbitLanguage;
}) {
  return (
    <div className="orbit-host-event-stat-row">
      <Cover
        className="orbit-host-event-stat-cover"
        g={event.g}
        imageAlt={event.name}
        imageUrl={eventCoverPhoto(event.code)}
        monogram={
          eventCoverPhoto(event.code)
            ? null
            : { text: event.name.slice(0, 1), size: 20 }
        }
      />
      <div className="orbit-host-event-stat-main">
        <div className="orbit-host-title-row">
          <strong>{event.name}</strong>
          <StatusBadge language={language} status={event.status} />
        </div>
        <span className="orbit-host-muted">
          {formatOrbitDateTime(event.startsAt, language)} · {event.venue}
        </span>
      </div>
    </div>
  );
}

function AdminDashContent({ viewModel }: { viewModel: OrbitAdminViewModel }) {
  const { language, t } = useOrbitLanguage();
  return (
    <>
      <div className="orbit-host-page-head"><div><div className="eyebrow">DASHBOARD</div><h1 className="h-display">{t({ en: "Dashboard", zh: "仪表盘" })}</h1></div><span className="badge badge-soon">{t({ en: "Source records · read only", zh: "来源记录 · 只读" })}</span></div>
      <div className="orbit-host-stat-grid">{viewModel.adminStats.map((stat) => <StatTile key={stat.label} s={stat} />)}</div>
      <div className="orbit-host-dashboard-grid">
        <div className="card orbit-host-card"><div className="orbit-host-section-head"><h2 className="h-section">{t({ en: "Event source records", zh: "活动来源记录" })}</h2><span className="orbit-host-muted">{viewModel.adminEvents.length} {t({ en: "records", zh: "条" })}</span></div><div className="orbit-host-event-stats">{viewModel.adminEvents.map((event) => <EventSourceRow event={event} key={event.id} language={language} />)}</div></div>
        <div>
          <div className="card orbit-host-card"><div className="orbit-host-section-head"><h2 className="h-section">{t({ en: "Authenticated account profile", zh: "已登录账户资料" })}</h2><span className="orbit-host-muted">{t({ en: "Profile source", zh: "资料来源" })}</span></div><MemberRow member={viewModel.adminAccount} /></div>
          <div className="card orbit-host-card"><div className="orbit-host-section-head"><h2 className="h-section">{t({ en: "Data boundary", zh: "数据边界" })}</h2></div><p className="orbit-host-muted">{t({ en: "Registration, attendance, capacity, matching, team membership, and live activity metrics are hidden until dedicated actor-scoped providers are connected.", zh: "在接入专用且按账户隔离的数据服务前，不展示报名、签到、容量、匹配、团队成员或实时动态指标。" })}</p></div>
        </div>
      </div>
    </>
  );
}

function MemberRow({ member }: { member: OrbitAdminMemberView }) {
  const { t } = useOrbitLanguage();
  return <div className="orbit-host-member-row"><span className={`avatar ${member.g}`} style={{ fontSize: 15, height: 38, width: 38 }}>{member.initial}</span><div className="orbit-host-member-main"><strong>{member.name}</strong><span>{member.email || t({ en: "Email unavailable", zh: "邮箱不可用" })}</span></div><span className="orbit-host-role-pill">{member.role}</span></div>;
}

export function OrbitRealAdminWorkspace({ viewModel }: { viewModel: OrbitAdminViewModel }) {
  return <HostShell active="dash" viewModel={viewModel}><AdminDashContent viewModel={viewModel} /></HostShell>;
}

function HostPortfolioCard({ event, language, t }: { event: OrbitAdminEventView; language: OrbitLanguage; t: OrbitT }) {
  return <div className="card orbit-host-portfolio-card"><div className="orbit-host-portfolio-card-main"><Cover className="orbit-host-portfolio-cover" g={event.g} imageAlt={event.name} imageUrl={eventCoverPhoto(event.code)} monogram={eventCoverPhoto(event.code) ? null : { text: event.name.slice(0, 1), size: 24 }} /><div className="orbit-host-portfolio-info"><div className="orbit-host-title-row"><strong>{event.name}</strong><StatusBadge language={language} status={event.status} /></div><div className="orbit-host-portfolio-count"><span>{formatOrbitDateTime(event.startsAt, language)}</span><span>{event.venue}</span></div><p className="orbit-host-muted">{event.summary || t({ en: "No source summary", zh: "暂无来源摘要" })}</p></div></div></div>;
}

export function OrbitRealAdminEvents({ viewModel }: { viewModel: OrbitAdminViewModel }) {
  const { t, language } = useOrbitLanguage();
  const liveCount = viewModel.adminEvents.filter((event) => event.status === "active").length;
  const upcomingCount = viewModel.adminEvents.filter((event) => event.status === "upcoming").length;
  const endedCount = viewModel.adminEvents.filter((event) => event.status === "ended").length;
  return (
    <HostShell active="events" viewModel={viewModel}>
      <div className="orbit-host-page-head"><div><div className="eyebrow">EVENTS</div><h1 className="h-display">{t({ en: "Events", zh: "活动管理" })}</h1></div><span className="badge badge-soon">{t({ en: "Source events · read only", zh: "来源活动 · 只读" })}</span></div>
      <div className="orbit-host-chip-row"><span className="chip is-active">{t({ en: "All", zh: "全部" })} {viewModel.adminEvents.length}</span><span className="chip">{t({ en: "Live", zh: "进行中" })} {liveCount}</span><span className="chip">{t({ en: "Upcoming", zh: "即将" })} {upcomingCount}</span><span className="chip">{t({ en: "Ended", zh: "已结束" })} {endedCount}</span></div>
      <div className="orbit-host-event-grid">{viewModel.adminEvents.map((event) => <HostPortfolioCard event={event} key={event.id} language={language} t={t} />)}</div>
      <div className="card orbit-host-card" style={{ marginTop: 18 }}>
        <div className="orbit-host-section-head"><h2 className="h-section">{t({ en: "Authenticated account", zh: "已登录账户" })}</h2><span className="orbit-host-muted">{t({ en: "Profile source · read only", zh: "资料来源 · 只读" })}</span></div>
        <div className="orbit-host-access-notes"><div className="card-flat orbit-host-access-note"><span className={`avatar ${viewModel.adminAccount.g}`} style={{ flexShrink: 0, fontSize: 15, height: 38, width: 38 }}>{viewModel.adminAccount.initial}</span><div><strong>{viewModel.adminAccount.name} · {viewModel.adminAccount.role}</strong><span>{viewModel.adminAccount.email || t({ en: "Email unavailable", zh: "邮箱不可用" })}</span></div></div></div>
      </div>
    </HostShell>
  );
}
