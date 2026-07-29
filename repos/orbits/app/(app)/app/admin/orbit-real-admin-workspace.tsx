"use client";

import type { OrbitAdminEventView, OrbitAdminMemberView, OrbitAdminViewModel } from "../orbit-admin-platform-route-view-model";
import { formatOrbitDateTime } from "../orbit-datetime";
import { eventCoverPhoto } from "../orbit-event-cover-photo";
import { useOrbitLanguage, type OrbitLanguage } from "../orbit-language-context";
import { Cover, Icon, StatusBadge } from "../orbit-reference-primitives";
import { HostShell } from "./orbit-real-admin-shell";

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
