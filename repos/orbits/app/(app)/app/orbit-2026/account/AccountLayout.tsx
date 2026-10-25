"use client";

import { signOut } from "next-auth/react";
import type { ReactNode } from "react";

import { useOrbitLanguage } from "../../orbit-language-context";
import { accountCopy } from "../copy/account";
import { pickCopy } from "../copy/types";
import { clearKioskDevice } from "../host/kiosk-store";
import { ShellPage } from "../shell/slots";
import { Icon, Orbit2026Scope, ToastProvider, type IconName } from "../ui";
import s from "./AccountLayout.module.css";

export type AccountSection =
  | "home" | "profile" | "account" | "iorbit" | "integrations"
  | "notifications" | "appearance" | "permissions" | "export" | "help";

const menu: readonly { section: Exclude<AccountSection, "home">; href: string; icon: IconName }[] = [
  { section: "profile", href: "/app/profile", icon: "user" },
  { section: "account", href: "/app/settings/account", icon: "settings" },
  { section: "iorbit", href: "/app/settings/iorbit", icon: "sparkle" },
  { section: "integrations", href: "/app/settings/integrations", icon: "link" },
  { section: "notifications", href: "/app/settings/notifications", icon: "bell" },
  { section: "appearance", href: "/app/settings/appearance", icon: "grid" },
  { section: "permissions", href: "/app/settings/permissions", icon: "layers" },
  { section: "export", href: "/app/settings/exports", icon: "share" },
  { section: "help", href: "/app/settings/help", icon: "book" },
];

export function AccountLayout({ active, title, subtitle, children, rightRail, largeTitle = false }: {
  active: AccountSection;
  title: string;
  subtitle?: string;
  children: ReactNode;
  rightRail?: ReactNode | false;
  largeTitle?: boolean;
}) {
  const { language } = useOrbitLanguage();
  const t = (key: keyof typeof accountCopy) => pickCopy(accountCopy[key], language);
  const home = active === "home";
  return (
    <Orbit2026Scope language={language} className={`${s.page} ${home ? s.home : s.detail}`}>
      <ToastProvider>
        <ShellPage title={t("settings")} rightRail={rightRail ?? false} phoneFold={!home} phoneBare={!home} />
        <div className={s.grid} data-account-section={active}>
          <nav className={s.menu} aria-label={t("settings")}>
            <div className={s.phoneTitle}>{t("settings")}</div>
            {menu.map(({ section, href, icon }) => (
              <a key={section} className={`${s.menuItem} ${section === active || (home && section === "profile") ? s.selected : ""}`} href={href} aria-current={section === active ? "page" : undefined}>
                <Icon name={icon} size={16} />
                <span>{t(section)}</span>
                <span className={s.menuChevron}><Icon name="right" size={16} /></span>
              </a>
            ))}
            <div className={s.rule} />
            <button className={`${s.menuItem} ${s.signOut}`} type="button" onClick={() => void clearKioskDevice().finally(() => signOut({ callbackUrl: "/app" }))}>
              <Icon name="out" size={16} /><span>{t("signOut")}</span>
            </button>
          </nav>
          <main className={s.content}>
            {/* b12 W-R18a-2x (390): a detail page is full screen with the kit .topbar — back + centred title. */}
            <div className={s.phoneTopbar}><a className={`btn ${s.phoneBack}`} href="/app/settings" aria-label={t("backToSettings")}><Icon name="left" size={20} /></a><b>{title}</b><span /></div>
            <div className={`${s.heading} ${largeTitle ? s.largeTitle : ""}`}><h1>{title}</h1>{subtitle ? <p>{subtitle}</p> : null}</div>
            {children}
          </main>
        </div>
      </ToastProvider>
    </Orbit2026Scope>
  );
}
