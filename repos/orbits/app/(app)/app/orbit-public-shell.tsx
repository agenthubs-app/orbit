"use client";

import { useEffect, useState, type ReactNode } from "react";

import { useOrbitLanguage } from "./orbit-language-context";
import { productHref } from "./orbit-product-href";
import { Icon, Logo } from "./orbit-reference-primitives";

export { productHref } from "./orbit-product-href";

export type OrbitNavActive = "home" | "events" | "schedule" | "cards" | "agent" | "me";

/**
 * Single source of truth for the top navigation across public AND account
 * surfaces. Both PublicTopNav and AccountTopNav render this, so it stays
 * visually identical to the starfield homepage nav (orbit-starfield-desktop):
 *
 * Desktop: brand wordmark + tagline · centered plain-text links
 *   (iOrbit / 活动 / 日程 / 人脉) · plain 中/EN toggle + subtle "Me" pill.
 * Mobile (<=640px): brand + current page title on the left; iOrbit icon,
 *   language toggle, and a hamburger opening a full-width menu panel on the
 *   right (the centered links and Me pill are hidden by CSS).
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
        <div className="orbit-nav-lead">
          <a aria-label="Orbit" className={`orbit-brand-link hit-44${active === "home" ? " is-active" : ""}`} href={preserveHref("/app")} style={{ textDecoration: "none" }}>
            <Logo size={24} withText={false} />
            <span className="orbit-brand-word">
              <span className="orbit-brand-name">Orbit</span>
              <span className="orbit-brand-sub mono">{t({ en: "Powered by the iOrbit matching engine", zh: "由 iOrbit 智能匹配引擎驱动" })}</span>
            </span>
          </a>
          <span className="orbit-nav-page-title">{t(pageLabels[active])}</span>
        </div>

        <nav aria-label={t({ en: "Primary", zh: "主导航" })} className="orbit-nav-links">
          <a aria-current={isAgent ? "page" : undefined} className={`orbit-nav-link${isAgent ? " is-active" : ""}`} href={preserveHref("/app/agent")}>iOrbit</a>
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

        <div className="orbit-top-actions">
          <span className="orbit-lang-toggle mono">
            <button
              aria-label={t({ en: "Switch to Chinese", zh: "切换到中文" })}
              aria-pressed={language === "zh"}
              className={language === "zh" ? "is-active" : ""}
              onClick={() => setLanguage("zh")}
              type="button"
            >
              中
            </button>
            <span className="orbit-lang-sep" aria-hidden="true">/</span>
            <button
              aria-label={t({ en: "Switch to English", zh: "切换到英文" })}
              aria-pressed={language === "en"}
              className={language === "en" ? "is-active" : ""}
              onClick={() => setLanguage("en")}
              type="button"
            >
              EN
            </button>
          </span>
          {rightExtra}
          <a className="orbit-me-link" href={preserveHref(meHref)}>
            {t({ en: "Me", zh: "我的" })}
          </a>
          <a aria-label="iOrbit" className={`orbit-nav-iorbit-icon hit-44${isAgent ? " is-active" : ""}`} href={preserveHref("/app/agent")}>
            <Icon name="sparkle" size={18} />
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
