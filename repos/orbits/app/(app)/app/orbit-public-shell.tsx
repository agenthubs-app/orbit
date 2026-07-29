"use client";

import { useContext, useEffect, useState, type ReactNode } from "react";
import { SessionContext, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";

import { useOrbitLanguage } from "./orbit-language-context";
import { Avatar, Icon, Logo, gradientFromString } from "./orbit-reference-primitives";
import { productHref } from "./orbit-product-href";
import { ORBIT_Z } from "./orbit-z";

// "schedule" no longer has a nav entry of its own (T3, today-schedule merge —
// folded into "today", now labeled 日程/Schedule) but stays in the union:
// app/(app)/app/schedule/orbit-real-schedule-page.tsx and
// app/(app)/app/followups/orbit-real-schedule.tsx still reference
// `active="schedule"` — both files stay in place (unreachable from normal
// navigation now that schedule/page.tsx and followups/page.tsx redirect to
// /app/today, but not deleted; see those route adapters).
export type OrbitNavActive = "home" | "today" | "events" | "schedule" | "cards" | "agent" | "me" | "settings";

export { productHref } from "./orbit-product-href";

type OrbitNavSessionUser = { email: string; id: string; name: string };

/**
 * Read the session injected by the shared /app layout without making the
 * navigation impossible to render in isolation (error boundaries, previews,
 * and server-side UI tests do not necessarily mount the layout provider).
 *
 * The provider is always present in the real /app tree. Outside that tree we
 * fail closed to the anonymous state instead of throwing or inventing a
 * signed-in user.
 */
function useOrbitNavSession() {
  return useContext(SessionContext) ?? { data: null, status: "unauthenticated" as const };
}

// 右上角账号位:未知会话时渲染与旧"我的"链接完全相同的 DOM(避免闪烁);
// 已登录显示头像+菜单(个人资料/退出登录),未登录显示 登录/注册。
// 会话由 /app layout 在服务端读取并注入 SessionProvider，导航和页面保护共用
// 同一份 NextAuth session，避免客户端二次请求造成的闪烁和状态分裂。
// `meHref` used to feed the session-unknown branch's "Me" link; that branch is
// now a neutral placeholder (UI-audit P0-4) and the signed-in menu links to
// /app/profile directly, so the control no longer needs a caller-supplied href.
function OrbitNavAccountControl() {
  const { preserveHref, t } = useOrbitLanguage();
  const { data: session, status } = useOrbitNavSession();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const sessionUser: OrbitNavSessionUser | null | undefined =
    status === "loading"
      ? undefined
      : session?.user?.id
        ? {
            email: session.user.email ?? "",
            id: session.user.id,
            name: session.user.name ?? session.user.email ?? "Orbit",
          }
        : null;

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  // 会话未知:渲染一个中性占位,不断言登录状态。
  //
  // UI-audit fix P0-4. This used to render a "Me" link, which is an assertion
  // in the other direction — an anonymous visitor got a link into an account
  // area they do not have. A placeholder that reserves the same footprint keeps
  // the nav honest while the session resolves and keeps the bar from reflowing
  // when the real control swaps in.
  if (sessionUser === undefined) {
    return (
      <span
        aria-busy="true"
        aria-label={t({ en: "Checking sign-in status", zh: "正在确认登录状态" })}
        role="status"
        style={{
          background: "var(--surface-2)",
          borderRadius: "var(--r-pill)",
          display: "inline-block",
          height: 32,
          minWidth: 64,
        }}
      />
    );
  }

  if (sessionUser === null) {
    const nextPath = pathname || "/app";

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
          <a
            href={preserveHref("/app/settings")}
            role="menuitem"
            style={{ alignItems: "center", borderRadius: 8, color: "var(--text)", display: "flex", fontSize: 13.5, fontWeight: 600, gap: 8, padding: "9px 10px", textDecoration: "none" }}
          >
            <Icon name="settings" size={15} />
            {t({ en: "Settings", zh: "设置" })}
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

const ORBIT_LANG_BUTTONS: readonly {
  code: "zh" | "en" | "ja";
  label: string;
  aria: { en: string; zh: string };
}[] = [
  { aria: { en: "Switch to Chinese", zh: "切换到中文" }, code: "zh", label: "中" },
  { aria: { en: "Switch to English", zh: "切换到英文" }, code: "en", label: "EN" },
  { aria: { en: "Switch to Japanese", zh: "切换到日文" }, code: "ja", label: "日" },
];

/**
 * Shared language switcher. The same compact pill is used in the desktop and
 * mobile top bars; account/inbox actions move into the mobile menu so the
 * current page title still has enough room.
 */
function OrbitLangToggle() {
  const { language, setLanguage, t } = useOrbitLanguage();

  return (
    <span className="orbit-lang-toggle mono">
      {ORBIT_LANG_BUTTONS.map((entry, index) => (
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
  );
}

function OrbitNavMobileAccountLinks({
  active,
  meHref,
}: {
  active: OrbitNavActive;
  meHref: string;
}) {
  const { preserveHref, t } = useOrbitLanguage();
  const { data: session, status } = useOrbitNavSession();
  const pathname = usePathname();

  if (status === "loading") {
    return (
      <span className="orbit-nav-menu-status" role="status">
        {t({ en: "Checking sign-in status…", zh: "正在确认登录状态…" })}
      </span>
    );
  }

  if (session?.user?.id) {
    return (
      <>
        <a
          aria-current={active === "me" || active === "home" ? "page" : undefined}
          className={`orbit-nav-menu-item${active === "me" || active === "home" ? " is-active" : ""}`}
          href={preserveHref(meHref)}
        >
          {t({ en: "Me", zh: "我的" })}
        </a>
        <a
          aria-current={active === "settings" ? "page" : undefined}
          className={`orbit-nav-menu-item is-accent${active === "settings" ? " is-active" : ""}`}
          href={preserveHref("/app/settings")}
        >
          {t({ en: "Settings", zh: "设置" })}
        </a>
      </>
    );
  }

  const nextPath = pathname || "/app";

  return (
    <>
      <a
        className="orbit-nav-menu-item"
        href={preserveHref(`/app/account/login?next=${encodeURIComponent(nextPath)}`)}
      >
        {t({ en: "Sign in", zh: "登录" })}
      </a>
      <a
        className="orbit-nav-menu-item is-accent"
        href={preserveHref(`/app/account/signup?next=${encodeURIComponent(nextPath)}`)}
      >
        {t({ en: "Sign up", zh: "注册" })}
      </a>
    </>
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
  mobileRightExtra,
  rightExtra,
}: {
  active?: OrbitNavActive;
  agentActive?: boolean;
  meHref: string;
  mobileRightExtra?: ReactNode;
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
    // Unreachable via the nav (see the OrbitNavActive comment above) but kept
    // for the two orphaned components that still pass active="schedule".
    schedule: { en: "Calendar", zh: "日程" },
    settings: { en: "Settings", zh: "设置" },
    today: { en: "Schedule", zh: "日程" },
  };
  const links = [
    ["/events", t({ en: "Events", zh: "活动" }), "events"],
    ["/today", t({ en: "Schedule", zh: "日程" }), "today"],
    ["/contacts", t({ en: "Contacts", zh: "人脉" }), "cards"],
  ] as const;
  const menuItems = [
    { active: isAgent, href: "/app/agent", key: "agent", label: "iOrbit" },
    { active: active === "events", href: productHref("/events"), key: "events", label: t({ en: "Events", zh: "活动" }) },
    { active: active === "today", href: productHref("/today"), key: "today", label: t({ en: "Schedule", zh: "日程" }) },
    { active: active === "cards", href: productHref("/contacts"), key: "cards", label: t({ en: "Contacts", zh: "人脉" }) },
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
          <OrbitLangToggle />
          <span className="orbit-nav-mobile-extra">{mobileRightExtra}</span>
          <span className="orbit-nav-extra">{rightExtra}</span>
          <span className="orbit-nav-account-slot"><OrbitNavAccountControl /></span>
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
                <span>{item.label}</span>
              </a>
            ))}
            <span aria-hidden="true" className="orbit-nav-menu-divider" />
            <OrbitNavMobileAccountLinks active={active} meHref={meHref} />
          </nav>
        </div>
      ) : null}
    </>
  );
}

export function PublicTopNav({ active = "events" }: { active?: OrbitNavActive }) {
  return <OrbitTopNav active={active} meHref="/app/profile" />;
}
