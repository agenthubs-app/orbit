"use client";

import type { ReactNode } from "react";

import { useOrbitLanguage } from "./orbit-language-context";
import { productHref } from "./orbit-public-shell";
import { Icon, Logo } from "./orbit-reference-primitives";

function accountHref(prototypeHref: string) {
  if (prototypeHref === "/home") return "/app/home";
  return productHref(prototypeHref);
}

export function orbitNavigate(prototypeHref: string) {
  if (typeof window === "undefined") return;
  window.location.href = accountHref(prototypeHref);
}

export function AccountTopNav({
  active = "me",
  agentTone,
  rightExtra,
}: {
  accountInitial?: string;
  active?: "agent" | "events" | "schedule" | "cards" | "me";
  agentTone?: "default" | "selected";
  rightExtra?: ReactNode;
}) {
  const { language, preserveHref, setLanguage, t } = useOrbitLanguage();
  const isAgent = agentTone ? agentTone === "selected" : active === "agent";
  const links = [
    { href: "/explore", k: "events", label: t({ en: "Events", zh: "活动" }) },
    { href: "/home/schedule", k: "schedule", label: t({ en: "Calendar", zh: "日程" }) },
    { href: "/home/cards", k: "cards", label: t({ en: "Contacts", zh: "人脉" }) },
  ];

  return (
    <header className="orbit-top-nav">
      <a className="orbit-brand-link" href={preserveHref("/app")} onClick={(event) => { event.preventDefault(); window.location.href = preserveHref(accountHref("/")); }} aria-label="Orbit" style={{ textDecoration: "none" }}>
        <Logo size={25} withText={false} />
      </a>
      <button type="button" onClick={() => { window.location.href = preserveHref(accountHref("/agent")); }} className={`orbit-agent-btn${isAgent ? " is-active" : ""}`} style={{ marginRight: 4 }}>
        <Icon name="sparkle" size={15} />
        iOrbit
      </button>
      <nav className="orbit-nav-links">
        {links.map((link) => (
          <a
            key={link.k}
            href={preserveHref(productHref(link.href))}
            onClick={(event) => {
              event.preventDefault();
              window.location.href = preserveHref(accountHref(link.href));
            }}
            className={`orbit-nav-link${active === link.k ? " is-active" : ""}`}
          >
            {link.label}
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
        {rightExtra}
        <a className="orbit-me-link" href={preserveHref("/app/home")} onClick={(event) => { event.preventDefault(); window.location.href = preserveHref(accountHref("/home")); }}>
          {t({ en: "Me", zh: "我的" })}
        </a>
      </div>
    </header>
  );
}

export function StatusBar({ dark = false }: { dark?: boolean }) {
  const color = dark ? "#fff" : "var(--ink)";

  return (
    <div className="statusbar" style={{ color }}>
      <span className="mono" style={{ fontSize: 14, fontWeight: 600 }}>9:41</span>
      <div style={{ alignItems: "center", display: "flex", gap: 6 }}>
        <span style={{ border: `2px solid ${color}`, borderRadius: 3, display: "inline-block", height: 12, width: 17 }} />
        <span style={{ border: `2px solid ${color}`, borderRadius: 999, display: "inline-block", height: 12, width: 17 }} />
        <span style={{ border: `1px solid ${color}`, borderRadius: 4, display: "inline-block", height: 12, width: 25 }} />
      </div>
    </div>
  );
}

export function MobileBar({
  dark = false,
  onBack,
  right,
  title,
  transparent = false,
}: {
  dark?: boolean;
  onBack?: () => void;
  right?: ReactNode;
  title?: string;
  transparent?: boolean;
}) {
  return (
    <div
      style={{
        alignItems: "center",
        backdropFilter: transparent ? "none" : "blur(14px)",
        background: transparent ? "transparent" : "rgba(255,255,255,0.86)",
        borderBottom: transparent ? "none" : "1px solid var(--border)",
        display: "flex",
        flexShrink: 0,
        gap: 10,
        height: 52,
        padding: "0 16px",
        position: "relative",
        width: "100%",
        zIndex: 20,
      }}
    >
      {onBack ? (
        <button
          onClick={onBack}
          style={{
            alignItems: "center",
            background: dark ? "rgba(0,0,0,0.3)" : "var(--surface-2)",
            border: "none",
            borderRadius: 999,
            color: dark ? "#fff" : "var(--ink)",
            cursor: "pointer",
            display: "flex",
            height: 36,
            justifyContent: "center",
            width: 36,
          }}
          type="button"
        >
          <Icon name="chevL" size={20} />
        </button>
      ) : null}
      {title ? <span style={{ color: dark ? "#fff" : "var(--ink)", fontFamily: "var(--ff-tight)", fontSize: 17, fontWeight: 600, letterSpacing: "-0.02em" }}>{title}</span> : null}
      <div style={{ flex: 1 }} />
      {right}
    </div>
  );
}

export function ModalShell({
  children,
  maxW = 440,
  onClose,
  step,
}: {
  children: ReactNode;
  maxW?: number;
  onClose: () => void;
  step?: string;
}) {
  return (
    <div className="orbit-modal-overlay" style={{ alignItems: "center", display: "flex", inset: 0, justifyContent: "center", position: "absolute", zIndex: 200 }}>
      <div className="orbit-modal-scrim" onClick={onClose} style={{ backdropFilter: "blur(4px)", background: "rgba(20,20,28,0.42)", inset: 0, position: "absolute" }} />
      <div className="orbit-modal-card card" style={{ animation: "pop .2s cubic-bezier(.22,1,.36,1)", borderRadius: 20, boxShadow: "var(--sh-pop)", display: "flex", flexDirection: "column", margin: 16, maxHeight: "92%", overflow: "hidden", position: "relative", width: `min(100%, ${maxW}px)`, zIndex: 1 }}>
        <div style={{ alignItems: "center", display: "flex", gap: 12, padding: "20px 22px 6px" }}>
          <Logo size={22} />
          <div style={{ flex: 1 }} />
          {step ? <span className="mono" style={{ color: "var(--text-3)", fontSize: 12, whiteSpace: "nowrap" }}>{step}</span> : null}
          <button type="button" onClick={onClose} aria-label="关闭" style={{ alignItems: "center", background: "var(--surface-2)", border: "none", borderRadius: 999, color: "var(--text-2)", cursor: "pointer", display: "flex", height: 32, justifyContent: "center", width: 32 }}>
            <Icon name="x" size={17} />
          </button>
        </div>
        <div className="scroll" style={{ overflowY: "auto", padding: "10px 28px 28px" }}>{children}</div>
      </div>
    </div>
  );
}
