"use client";

import { useEffect, useState, type ReactNode } from "react";
import { signOut } from "next-auth/react";

import { useOrbitLanguage } from "./orbit-language-context";
import { Avatar, Icon, Logo, gradientFromString } from "./orbit-reference-primitives";
import { productHref } from "./orbit-product-href";
import { ORBIT_Z } from "./orbit-z";

export type OrbitNavActive = "home" | "today" | "events" | "schedule" | "cards" | "agent" | "me";

export { productHref } from "./orbit-product-href";

type OrbitNavSessionUser = { email: string; id: string; name: string };

// 右上角账号位:未知会话时渲染与旧"我的"链接完全相同的 DOM(避免闪烁);
// 已登录显示头像+菜单(个人资料/退出登录),未登录显示 登录/注册。
// 会话通过 /api/auth/session 客户端获取,不需要 SessionProvider。
function OrbitNavAccountControl({ meHref }: { meHref: string }) {
  const { preserveHref, t } = useOrbitLanguage();
  const [sessionUser, setSessionUser] = useState<
    OrbitNavSessionUser | null | undefined
  >(undefined);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/auth/session")
      .then((response) => response.json())
      .then((session: { user?: { email?: string; id?: string; name?: string } } | null) => {
        if (cancelled) return;
        setSessionUser(
          session?.user?.id
            ? {
                email: session.user.email ?? "",
                id: session.user.id,
                name: session.user.name ?? session.user.email ?? "Orbit",
              }
            : null,
        );
      })
      .catch(() => {
        if (!cancelled) setSessionUser(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  // 会话未知:保持旧导航的原样,首屏与登录系统接入前逐像素一致。
  if (sessionUser === undefined) {
    return (
      <a className="orbit-me-link" href={preserveHref(meHref)}>
        {t({ en: "Me", zh: "我的" })}
      </a>
    );
  }

  if (sessionUser === null) {
    const nextPath =
      typeof window === "undefined"
        ? "/app"
        : window.location.pathname + window.location.search;

    return (
      <span style={{ alignItems: "center", display: "inline-flex", gap: 10 }}>
        <a
          className="orbit-me-link"
          href={preserveHref(`/app/account/login?next=${encodeURIComponent(nextPath)}`)}
        >
          {t({ en: "Sign in", zh: "登录" })}
        </a>
        <a
          href={preserveHref(`/app/account/signup?next=${encodeURIComponent(nextPath)}`)}
          style={{
            background: "var(--accent)",
            borderRadius: "var(--r-pill)",
            color: "var(--on-accent)",
            fontSize: 13.5,
            fontWeight: 600,
            padding: "7px 15px",
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          {t({ en: "Sign up", zh: "注册" })}
        </a>
      </span>
    );
  }

  return (
    <span style={{ position: "relative" }}>
      <button
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        aria-label={t({ en: "Account menu", zh: "账号菜单" })}
        data-orbit-nav-account={sessionUser.id}
        onClick={() => setMenuOpen((current) => !current)}
        type="button"
        style={{ background: "transparent", border: 0, cursor: "pointer", display: "inline-flex", padding: 0 }}
      >
        <Avatar
          g={gradientFromString(sessionUser.email || sessionUser.id)}
          letter={(sessionUser.name || "O").slice(0, 1).toUpperCase()}
          size={32}
        />
      </button>
      {menuOpen ? (
        <div
          role="menu"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            boxShadow: "var(--sh-pop)",
            minWidth: 200,
            padding: 6,
            position: "absolute",
            right: 0,
            top: 40,
            zIndex: ORBIT_Z.dropdown,
          }}
        >
          <div style={{ borderBottom: "1px solid var(--border)", margin: "0 4px 5px", padding: "8px 6px 10px" }}>
            <div style={{ color: "var(--ink)", fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sessionUser.name}</div>
            <div style={{ color: "var(--text-3)", fontSize: 12, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sessionUser.email}</div>
          </div>
          <a
            href={preserveHref("/app/profile")}
            role="menuitem"
            style={{ alignItems: "center", borderRadius: 8, color: "var(--text)", display: "flex", fontSize: 13.5, fontWeight: 600, gap: 8, padding: "9px 10px", textDecoration: "none" }}
          >
            <Icon name="users" size={15} />
            {t({ en: "Profile", zh: "个人资料" })}
          </a>
          <button
            onClick={() => {
              setMenuOpen(false);
              void signOut({ callbackUrl: preserveHref("/app") });
            }}
            role="menuitem"
            type="button"
            style={{ alignItems: "center", background: "transparent", border: 0, borderRadius: 8, color: "var(--danger, #C2410C)", cursor: "pointer", display: "flex", fontFamily: "var(--ff)", fontSize: 13.5, fontWeight: 600, gap: 8, padding: "9px 10px", textAlign: "left", width: "100%" }}
          >
            <Icon name="x" size={15} />
            {t({ en: "Sign out", zh: "退出登录" })}
          </button>
        </div>
      ) : null}
    </span>
  );
}

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
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return undefined;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  const pageLabels: Record<OrbitNavActive, { en: string; zh: string }> = {
    agent: { en: "iOrbit", zh: "iOrbit" },
    cards: { en: "Contacts", zh: "人脉" },
    events: { en: "Events", zh: "活动" },
    home: { en: "Me", zh: "我的" },
    me: { en: "Me", zh: "我的" },
    schedule: { en: "Calendar", zh: "日程" },
    today: { en: "Today", zh: "Today" },
  };
  const links = [
    ["/today", t({ en: "Today", zh: "Today" }), "today"],
    ["/events", t({ en: "Events", zh: "活动" }), "events"],
    ["/schedule", t({ en: "Calendar", zh: "日程" }), "schedule"],
    ["/contacts", t({ en: "Contacts", zh: "人脉" }), "cards"],
  ] as const;
  const menuItems = [
    { active: active === "today", href: productHref("/today"), icon: "target", key: "today", label: t({ en: "Today", zh: "Today" }) },
    { active: active === "events", href: productHref("/events"), icon: "calendar", key: "events", label: t({ en: "Events", zh: "活动" }) },
    { active: active === "schedule", href: productHref("/schedule"), icon: "clock", key: "schedule", label: t({ en: "Calendar", zh: "日程" }) },
    { active: active === "cards", href: productHref("/contacts"), icon: "users", key: "cards", label: t({ en: "Contacts", zh: "人脉" }) },
    { active: active === "me" || active === "home", href: meHref, icon: "user", key: "me", label: t({ en: "Me", zh: "我的" }) },
  ];

  const langButtons: readonly { code: "zh" | "en" | "ja"; label: string; aria: { en: string; zh: string } }[] = [
    { aria: { en: "Switch to Chinese", zh: "切换到中文" }, code: "zh", label: "中" },
    { aria: { en: "Switch to English", zh: "切换到英文" }, code: "en", label: "EN" },
    { aria: { en: "Switch to Japanese", zh: "切换到日文" }, code: "ja", label: "日" },
  ];

  return (
    <>
      <header className="orbit-top-nav orbit-nav-menu">
        <div className="orbit-nav-lead">
          <a aria-label="Orbit" className={`orbit-brand-link hit-44${active === "home" ? " is-active" : ""}`} href={preserveHref("/")} style={{ textDecoration: "none" }}>
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
            {langButtons.map((entry, index) => (
              <span key={entry.code} style={{ display: "contents" }}>
                {index > 0 ? (
                  <span aria-hidden="true" className="orbit-lang-sep">/</span>
                ) : null}
                <button
                  aria-label={t(entry.aria)}
                  aria-pressed={language === entry.code}
                  className={language === entry.code ? "is-active" : ""}
                  onClick={() => setLanguage(entry.code)}
                  type="button"
                >
                  {entry.label}
                </button>
              </span>
            ))}
          </span>
          {rightExtra}
          <OrbitNavAccountControl meHref={meHref} />
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
