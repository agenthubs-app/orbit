"use client";

import type { ReactNode } from "react";
import type { OrbitAdminViewModel } from "../orbit-admin-platform-route-view-model";
import { useOrbitLanguage } from "../orbit-language-context";
import { Icon, Logo } from "../orbit-reference-primitives";

export type OrbitT = (copy: { en: string; zh: string }) => string;

function navigateTo(path: string) {
  window.location.href = path;
}

function buildHostNav(t: OrbitT): Array<[string, string, string, string]> {
  return [
    ["dash", "grid", t({ en: "Dashboard", zh: "仪表盘" }), "/app/admin"],
    ["events", "calendar", t({ en: "Events", zh: "活动管理" }), "/app/admin/events"],
  ];
}

export function HostShell({
  active,
  children,
  viewModel,
}: {
  active: string;
  children: ReactNode;
  viewModel: OrbitAdminViewModel;
}) {
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
        <div className="orbit-host-mobile-tabs">{hostNav.map(([key, , label, href]) => <button className={`chip${active === key ? " is-active" : ""}`} key={key} onClick={() => navigateTo(href)} type="button">{label}</button>)}</div>
        <div className="orbit-host-mobile-scroll" data-appscroll>{children}</div>
      </div>
    </div>
  );
}
