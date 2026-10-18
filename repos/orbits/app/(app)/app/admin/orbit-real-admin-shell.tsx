"use client";

import type { ReactNode } from "react";
import type { OrbitLanguage } from "../orbit-language-core";
import type { OrbitAdminViewModel } from "../orbit-admin-platform-route-view-model";
import { adminText } from "../orbit-2026/copy/admin";
import { Avatar, Button, Orbit2026Scope, Segmented, ToastProvider } from "../orbit-2026/ui";
import styles from "./Admin.module.css";

type HostSection = "dash" | "events";

const paths: Record<HostSection, string> = { dash: "/app/admin", events: "/app/admin/events" };
function navigateTo(path: string) { window.location.assign(path); }

export function HostShell({ active, children, language, viewModel }: {
  active: HostSection;
  children: ReactNode;
  language: OrbitLanguage;
  viewModel: OrbitAdminViewModel;
}) {
  const sections = [
    { key: "dash" as const, label: adminText("dashboard", language) },
    { key: "events" as const, label: adminText("events", language) },
  ];
  return (
    <Orbit2026Scope language={language} className={styles.page}>
      <ToastProvider>
        <div className={styles.shell} data-orbit-admin-shell="">
          <aside className={styles.sidebar}>
            <div className={styles.brand}>Orbit · {adminText("workspace", language)}</div>
            <div className={styles.org}><Avatar name={viewModel.adminOrg.name} /><span className={styles.orgCopy}>{viewModel.adminOrg.name}</span></div>
            <nav className={styles.nav} aria-label={adminText("workspace", language)}>
              {sections.map((item) => <Button key={item.key} className={styles.navButton} label={item.label} variant={active === item.key ? "primary" : "ghost"} onClick={() => navigateTo(paths[item.key])} />)}
            </nav>
            <Button className={styles.exit} label={adminText("exit", language)} variant="ghost" onClick={() => navigateTo("/app")} />
          </aside>
          <div className={styles.mobileHead}>
            <div className={styles.mobileBrand}><strong>Orbit · {adminText("workspace", language)}</strong><Button label={adminText("exit", language)} size="sm" variant="ghost" onClick={() => navigateTo("/app")} /></div>
            <Segmented segments={sections} value={active} onChange={(section) => navigateTo(paths[section])} label={adminText("workspace", language)} wide variant="seg" />
          </div>
          <main className={styles.main}><div className={styles.content}>{children}</div></main>
        </div>
      </ToastProvider>
    </Orbit2026Scope>
  );
}
