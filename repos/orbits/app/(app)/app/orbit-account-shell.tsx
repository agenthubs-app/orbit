"use client";

import type { ReactNode } from "react";
import { useState } from "react";

import { productHref } from "./orbit-public-shell";
import { Avatar, Icon, Logo } from "./orbit-reference-primitives";

function accountHref(prototypeHref: string) {
  if (prototypeHref === "/home") return "/app/home";
  return productHref(prototypeHref);
}

export function orbitNavigate(prototypeHref: string) {
  if (typeof window === "undefined") return;
  window.location.href = accountHref(prototypeHref);
}

export function AccountTopNav({
  accountInitial = "李",
  active = "me",
}: {
  accountInitial?: string;
  active?: "events" | "schedule" | "cards" | "me";
}) {
  const [open, setOpen] = useState(false);
  const links = [
    { href: "/explore", k: "events", label: "活动浏览" },
    { href: "/home/schedule", k: "schedule", label: "日程" },
    { href: "/home/cards", k: "cards", label: "名片夹" },
  ];

  return (
    <header className="orbit-top-nav">
      <a href="/app" onClick={(event) => { event.preventDefault(); orbitNavigate("/"); }} aria-label="Orbit" style={{ textDecoration: "none" }}>
        <Logo size={25} />
      </a>
      <button type="button" onClick={() => orbitNavigate("/agent")} className="orbit-agent-btn" style={{ marginRight: 4 }}>
        <Icon name="sparkle" size={15} />
        Orbit Agent
      </button>
      <nav className="orbit-nav-links">
        {links.map((link) => (
          <a
            key={link.k}
            href={productHref(link.href)}
            onClick={(event) => {
              event.preventDefault();
              orbitNavigate(link.href);
            }}
            className={`orbit-nav-link${active === link.k ? " is-active" : ""}`}
          >
            {link.label}
          </a>
        ))}
      </nav>
      <div style={{ flex: 1 }} />
      <div style={{ alignItems: "center", display: "flex", gap: 14 }}>
        <span className="mono orbit-lang-ctl" style={{ color: "var(--text-3)", cursor: "pointer", fontSize: 12.5 }}>中 / 日</span>
        <div style={{ position: "relative" }}>
          <button onClick={() => setOpen((value) => !value)} style={{ background: "none", border: "none", color: "#000", cursor: "pointer", fontSize: "13.3333px", padding: 0 }} type="button">
            <Avatar letter={accountInitial} size={34} />
          </button>
          {open ? (
            <div className="orbit-menu" onMouseLeave={() => setOpen(false)}>
              <button className="orbit-menu-item" onClick={() => { setOpen(false); orbitNavigate("/home"); }}>我的主页</button>
              <button className="orbit-menu-item" onClick={() => { setOpen(false); orbitNavigate("/home/cards"); }}>名片夹</button>
              <button className="orbit-menu-item" onClick={() => { setOpen(false); orbitNavigate("/home/profile"); }}>通用画像</button>
              <button className="orbit-menu-item" onClick={() => { setOpen(false); orbitNavigate("/"); }}>退出登录</button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}

export function AccountBottomTab({ active }: { active: "home" | "agent" | "events" | "me" | "cards" }) {
  const tabs = [
    { href: "/", icon: "home", k: "home", label: "首页" },
    { href: "/agent", icon: "sparkle", k: "agent", label: "Orbit Agent" },
    { href: "/explore", icon: "calendar", k: "events", label: "活动浏览" },
    { href: "/home", icon: "user", k: "me", label: "我的" },
  ];

  return (
    <div style={{ backdropFilter: "blur(16px)", background: "rgba(255,255,255,0.92)", borderTop: "1px solid var(--border)", bottom: 0, display: "flex", height: 62, left: 0, position: "fixed", right: 0, zIndex: 60 }}>
      {tabs.map((tab) => {
        const selected = active === tab.k || (tab.k === "me" && active === "cards");

        return (
          <button
            key={tab.k}
            type="button"
            onClick={() => orbitNavigate(tab.href)}
            style={{ alignItems: "center", background: "none", border: "none", color: selected ? "var(--accent)" : "var(--text-4)", cursor: "pointer", display: "flex", flex: 1, flexDirection: "column", gap: 3, paddingTop: 9 }}
          >
            <Icon name={tab.icon} size={21} stroke={selected ? 2 : 1.7} />
            <span style={{ fontSize: 9.5, fontWeight: selected ? 650 : 500, whiteSpace: "nowrap" }}>{tab.label}</span>
          </button>
        );
      })}
    </div>
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
