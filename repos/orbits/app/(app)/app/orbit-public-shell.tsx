"use client";

import type { ReactNode } from "react";

import { useOrbitLanguage } from "./orbit-language-context";
import { productHref } from "./orbit-product-href";
import { Icon, Logo } from "./orbit-reference-primitives";

export { productHref } from "./orbit-product-href";

export type OrbitNavActive = "home" | "events" | "schedule" | "cards" | "agent" | "me";

/**
 * Single source of truth for the top navigation across public AND account
 * surfaces. Both PublicTopNav and AccountTopNav render this, so spacing,
 * fonts, and structure are guaranteed identical on every page.
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
  const links = [
    ["/explore", t({ en: "Events", zh: "活动" }), "events"],
    ["/home/schedule", t({ en: "Calendar", zh: "日程" }), "schedule"],
    ["/home/cards", t({ en: "Contacts", zh: "人脉" }), "cards"],
  ] as const;

  return (
    <header className="orbit-top-nav">
      <a aria-label="Orbit" className={`orbit-brand-link${active === "home" ? " is-active" : ""}`} href={preserveHref("/app")} style={{ textDecoration: "none" }}>
        <Logo size={25} withText={false} />
      </a>
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
        <button
          aria-label={t({ en: "Switch language", zh: "切换语言" })}
          className="mono orbit-lang-button"
          onClick={() => setLanguage(language === "en" ? "zh" : "en")}
          style={{ background: "transparent", border: 0, color: "var(--text-3)", cursor: "pointer", fontSize: 12.5, padding: 0 }}
          type="button"
        >
          <span style={{ color: language === "zh" ? "var(--accent)" : "var(--text-3)", fontWeight: language === "zh" ? 700 : 500 }}>中</span>
          <span style={{ color: "var(--text-4)", padding: "0 1px" }}>/</span>
          <span style={{ color: language === "en" ? "var(--accent)" : "var(--text-3)", fontWeight: language === "en" ? 700 : 500 }}>EN</span>
        </button>
        {rightExtra}
        <a className="orbit-me-link" href={preserveHref(meHref)}>
          {t({ en: "Me", zh: "我的" })}
        </a>
      </div>
    </header>
  );
}

export function PublicTopNav({ active = "events" }: { active?: OrbitNavActive }) {
  return <OrbitTopNav active={active} meHref="/app/account/login" />;
}
