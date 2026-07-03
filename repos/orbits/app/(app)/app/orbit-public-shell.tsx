"use client";

import { useEffect, useState, type ReactNode } from "react";

import { useOrbitLanguage } from "./orbit-language-context";
import { productHref } from "./orbit-product-href";
import { Icon, Logo } from "./orbit-reference-primitives";

export { productHref } from "./orbit-product-href";

export type OrbitNavActive = "home" | "events" | "schedule" | "cards" | "agent" | "me";

/**
 * Single source of truth for the top navigation across public AND account
 * surfaces. Both PublicTopNav and AccountTopNav render this, so spacing,
 * fonts, and structure are guaranteed identical on every page.
 *
 * Desktop: brand + iOrbit pill + text links + language toggle + Me pill.
 * Mobile (<=640px): brand + current page title on the left; iOrbit icon,
 * language toggle, and a hamburger opening a full-width menu panel on the
 * right (the in-bar links and Me pill are hidden by CSS).
 */
export function OrbitTopNav({
  active = "events",
  agentActive,
  meHref,
  rightExtra,
}: {
  active?: OrbitNavActive;
  agentActive?: boolean;
  meHref: string;
  rightExtra?: ReactNode;
}) {
  const { language, preserveHref, setLanguage, t } = useOrbitLanguage();
  const isAgent = agentActive ?? active === "agent";
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  const pageLabels: Record<OrbitNavActive, { en: string; zh: string }> = {
    cards: { en: "Contacts", zh: "人脉" },
    events: { en: "Events", zh: "活动" },
    agent: { en: "iOrbit", zh: "iOrbit" },
    home: { en: "Me", zh: "我的" },
    me: { en: "Me", zh: "我的" },
    schedule: { en: "Calendar", zh: "日程" },
  };
  const links = [
    ["/explore", t({ en: "Events", zh: "活动" }), "events"],
    ["/home/schedule", t({ en: "Calendar", zh: "日程" }), "schedule"],
    ["/home/cards", t({ en: "Contacts", zh: "人脉" }), "cards"],
  ] as const;
  const menuItems = [
    { active: active === "events", href: productHref("/explore"), icon: "calendar", key: "events", label: t({ en: "Events", zh: "活动" }) },
    { active: active === "schedule", href: productHref("/home/schedule"), icon: "clock", key: "schedule", label: t({ en: "Calendar", zh: "日程" }) },
    { active: active === "cards", href: productHref("/home/cards"), icon: "users", key: "cards", label: t({ en: "Contacts", zh: "人脉" }) },
    { active: active === "me" || active === "home", href: meHref, icon: "user", key: "me", label: t({ en: "Me", zh: "我的" }) },
  ];

  return (
    <>
      <header className="orbit-top-nav orbit-nav-menu">
        <a aria-label="Orbit" className={`orbit-brand-link hit-44${active === "home" ? " is-active" : ""}`} href={preserveHref("/app")} style={{ textDecoration: "none" }}>
          <Logo size={25} withText={false} />
        </a>
        <span className="orbit-nav-page-title">{t(pageLabels[active])}</span>
        <a className={`orbit-agent-btn${isAgent ? " is-active" : ""}`} href={preserveHref("/app/agent")} style={{ marginRight: 4 }}>
          <Icon name="sparkle" size={15} />
          iOrbit
        </a>
        <nav aria-label={t({ en: "Primary", zh: "主导航" })} className="orbit-nav-links">
          {links.map(([href, label, key]) => (
            <a
              aria-current={active === key ? "page" : undefined}
              className={`orbit-nav-link${active === key ? " is-active" : ""}`}
              key={href}
              href={preserveHref(productHref(href))}
            >
              {label}
            </a>
          ))}
        </nav>
        <div style={{ flex: 1 }} />
        <div className="orbit-top-actions" style={{ alignItems: "center", display: "flex", gap: 14 }}>
          <a aria-label="iOrbit" className={`orbit-nav-iorbit-icon hit-44${isAgent ? " is-active" : ""}`} href={preserveHref("/app/agent")}>
            <Icon name="sparkle" size={18} />
          </a>
          <button
            aria-label={t({ en: "Switch language", zh: "切换语言" })}
            className="orbit-lang-toggle hit-44"
            onClick={() => setLanguage(language === "en" ? "zh" : "en")}
            type="button"
          >
            <span className={`mono${language === "zh" ? " is-active" : ""}`}>中</span>
            <span className={`mono${language === "en" ? " is-active" : ""}`}>EN</span>
          </button>
          {rightExtra}
          <a className="orbit-me-link" href={preserveHref(meHref)}>
            {t({ en: "Me", zh: "我的" })}
          </a>
          <button
            aria-expanded={menuOpen}
            aria-label={menuOpen ? t({ en: "Close menu", zh: "关闭菜单" }) : t({ en: "Open menu", zh: "打开菜单" })}
            className="orbit-nav-menu-btn hit-44"
            onClick={() => setMenuOpen((open) => !open)}
            type="button"
          >
            <Icon name={menuOpen ? "x" : "menu"} size={20} />
          </button>
        </div>
      </header>
      {menuOpen ? (
        <div className="orbit-nav-menu-layer">
          <button aria-label={t({ en: "Close menu", zh: "关闭菜单" })} className="orbit-nav-menu-scrim" onClick={() => setMenuOpen(false)} type="button" />
          <nav aria-label={t({ en: "Primary", zh: "主导航" })} className="orbit-nav-menu-panel">
            {menuItems.map((item) => (
              <a
                aria-current={item.active ? "page" : undefined}
                className={`orbit-nav-menu-item${item.active ? " is-active" : ""}`}
                href={preserveHref(item.href)}
                key={item.key}
              >
                <Icon name={item.icon} size={20} />
                <span>{item.label}</span>
                <Icon name="chevR" size={16} style={{ marginLeft: "auto", opacity: 0.5 }} />
              </a>
            ))}
          </nav>
        </div>
      ) : null}
    </>
  );
}

export function PublicTopNav({ active = "events" }: { active?: OrbitNavActive }) {
  return <OrbitTopNav active={active} meHref="/app/account/login" />;
}
