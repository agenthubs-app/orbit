"use client";

import { SessionContext } from "next-auth/react";
import { useContext, type ReactNode } from "react";

import { useOrbitLanguage } from "../../orbit-language-context";
import { accountCopy } from "../copy/account";
import { pickCopy } from "../copy/types";
import { signOutAndForget } from "../../orbit-sign-out";
import { ShellPage } from "../shell/slots";
import { Avatar, Icon, Orbit2026Scope, ToastProvider, type IconName } from "../ui";
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
  // Read the context directly: outside a SessionProvider (tests, static renders) there is simply no account card.
  const account = useContext(SessionContext)?.data?.user;
  return (
    <Orbit2026Scope language={language} className={`${s.page} ${home ? s.home : s.detail}`}>
      <ToastProvider>
        <ShellPage title={t("settings")} rightRail={rightRail ?? false} phoneFold phoneBare />
        <div className={s.grid} data-account-section={active}>
          {/* b12 W-R18a-20 (390): kit .topbar「‹ 設定」, the account card, then one .sgroup card of rows. */}
          <div className={s.phoneTopbar}><a className={`btn ${s.phoneBack}`} href="/app/home" aria-label={t("backToHome")}><Icon name="left" size={20} /></a><b>{t("settings")}</b><span /></div>
          {account?.name || account?.email ? <div className={s.phoneAccount}><Avatar name={account.name || account.email || ""} tone="lav" /><div><b>{account.name || account.email}</b>{account.name && account.email ? <span>{account.email}</span> : null}</div></div> : null}
          <nav className={s.menu} aria-label={t("settings")}>
            {menu.map(({ section, href, icon }) => (
              <a key={section} className={`${s.menuItem} ${section === active || (home && section === "profile") ? s.selected : ""}`} href={href} aria-current={section === active ? "page" : undefined}>
                <span className={s.menuIcon}><Icon name={icon} size={16} /></span>
                <span>{t(section)}</span>
                <span className={s.menuChevron}><Icon name="right" size={16} /></span>
              </a>
            ))}
            <div className={s.rule} />
            <button className={`${s.menuItem} ${s.signOut}`} type="button" onClick={() => void signOutAndForget("/app")}>
              <span className={s.menuIcon}><Icon name="out" size={16} /></span><span>{t("signOut")}</span>
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
