"use client";

import type { OrbitAdminEventView, OrbitAdminViewModel } from "../orbit-admin-platform-route-view-model";
import { formatOrbitDateTime } from "../orbit-datetime";
import { eventCoverPhoto } from "../orbit-event-cover-photo";
import { useOrbitLanguage, type OrbitLanguage } from "../orbit-language-context";
import { Cover, StatusBadge } from "../orbit-reference-primitives";
import { HostShell, type OrbitT } from "./orbit-real-admin-shell";

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
