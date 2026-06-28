"use client";

import { useOrbitLanguage } from "./orbit-language-context";
import { Icon, Logo } from "./orbit-reference-primitives";

export function productHref(prototypeHref: string) {
  if (prototypeHref === "/") return "/app";
  if (prototypeHref === "/explore") return "/app/events";
  if (prototypeHref === "/agent") return "/app/agent";
  if (prototypeHref.startsWith("/agent?")) return `/app/agent?${prototypeHref.split("?")[1]}`;
  if (prototypeHref === "/home") return "/app/account/login";
  if (prototypeHref === "/home/events") return "/app/home/events";
  if (prototypeHref === "/home/profile") return "/app/profile";
  if (prototypeHref === "/home/schedule") return "/app/followups";
  if (prototypeHref === "/home/cards") return "/app/contacts";
  if (prototypeHref === "/home/cards/scan") return "/app/contacts/new";
  if (prototypeHref.startsWith("/home/cards/")) return `/app/contacts/${prototypeHref.split("/").pop()}`;
  if (prototypeHref === "/party") return "/app/party";
  if (prototypeHref.startsWith("/events/")) return `/app/events/${prototypeHref.split("/").pop()}`;
  if (prototypeHref.startsWith("/o/")) return `/app/o/${prototypeHref.split("/").pop()}`;
  if (prototypeHref.startsWith("/register")) return `/app/register${prototypeHref.includes("?") ? `?${prototypeHref.split("?")[1]}` : ""}`;
  return `/app${prototypeHref}`;
}

export function PublicTopNav({ active = "events" }: { active?: "home" | "events" | "schedule" | "cards" | "agent" }) {
  const { language, preserveHref, setLanguage, t } = useOrbitLanguage();
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
      <a className={`orbit-agent-btn${active === "agent" ? " is-active" : ""}`} href={preserveHref("/app/agent")}>
        <Icon name="sparkle" size={15} />
        iOrbit
      </a>
      <nav aria-label="Public" className="orbit-nav-links">
        {links.map(([href, label, key]) => (
          <a
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
          className="mono orbit-lang-button"
          onClick={() => setLanguage(language === "en" ? "zh" : "en")}
          style={{ background: "transparent", border: 0, color: "var(--text-3)", cursor: "pointer", fontSize: 12.5, padding: 0 }}
          type="button"
        >
          <span style={{ color: language === "zh" ? "var(--accent)" : "var(--text-3)", fontWeight: language === "zh" ? 700 : 500 }}>中</span>
          <span style={{ color: "var(--text-4)", padding: "0 1px" }}>/</span>
          <span style={{ color: language === "en" ? "var(--accent)" : "var(--text-3)", fontWeight: language === "en" ? 700 : 500 }}>EN</span>
        </button>
        <a className="orbit-me-link" href={preserveHref("/app/account/login")}>
          {t({ en: "Me", zh: "我的" })}
        </a>
      </div>
    </header>
  );
}
