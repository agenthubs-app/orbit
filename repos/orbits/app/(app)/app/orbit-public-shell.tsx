"use client";

import { useEffect, useState, type ReactNode } from "react";
import { signOut } from "next-auth/react";

import { useOrbitLanguage } from "./orbit-language-context";
import { Avatar, Icon, Logo, gradientFromString } from "./orbit-reference-primitives";
import { productHref } from "./orbit-product-href";
import { getOrbitTheme, toggleOrbitTheme, type OrbitTheme } from "./orbit-theme";
import { ORBIT_Z } from "./orbit-z";

// "schedule" no longer has a nav entry of its own (T3, today-schedule merge —
// folded into "today", now labeled 日程/Schedule) but stays in the union:
// app/(app)/app/schedule/orbit-real-schedule-page.tsx and
// app/(app)/app/followups/orbit-real-schedule.tsx still reference
// `active="schedule"` — both files stay in place (unreachable from normal
// navigation now that schedule/page.tsx and followups/page.tsx redirect to
// /app/today, but not deleted; see those route adapters).
export type OrbitNavActive = "home" | "today" | "events" | "schedule" | "cards" | "agent" | "me";

export { productHref } from "./orbit-product-href";

type OrbitNavSessionUser = { email: string; id: string; name: string };

// 右上角账号位:未知会话时渲染与旧"我的"链接完全相同的 DOM(避免闪烁);
// 已登录显示头像+菜单(个人资料/退出登录),未登录显示 登录/注册。
// 会话通过 /api/auth/session 客户端获取,不需要 SessionProvider。
// `meHref` used to feed the session-unknown branch's "Me" link; that branch is
// now a neutral placeholder (UI-audit P0-4) and the signed-in menu links to
// /app/profile directly, so the control no longer needs a caller-supplied href.
function OrbitNavAccountControl() {
  const { preserveHref, t } = useOrbitLanguage();
  const [sessionUser, setSessionUser] = useState<
    OrbitNavSessionUser | null | undefined
  >(undefined);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // UI-audit fix P0-4. A failing session endpoint (a 500 from a missing
    // AUTH_SECRET, an offline network) used to resolve to `null`, and `null`
    // renders "Sign in / Sign up" — the nav asserted "you are signed out" when
    // it had simply failed to find out. On a page whose body was rendering a
    // profile and a "Sign out" button, that read as a broken app. An
    // indeterminate result must stay indeterminate.
    fetch("/api/auth/session")
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("session unavailable"))))
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
        // Stay `undefined` (unknown) rather than claiming signed-out.
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

// Mobile audit P1: `.orbit-theme-toggle` (orbit-theme.tsx) is hidden at
// <=640px because its fixed right:18/bottom:18 corner overlaps sticky bottom
// CTA bars on mobile pages. This menu item is the mobile replacement — it
// lives in the hamburger panel and drives the exact same
// document.documentElement[data-theme] + localStorage toggle via the shared
// toggleOrbitTheme() helper, so both triggers always agree.
//
// Hydration safety: theme starts `null` (not read from `document` — that
// would differ between the server's guess and the client's real DOM
// attribute) so the first client render matches SSR exactly; the real theme
// is read once after mount, matching the mounted-state pattern used
// elsewhere in this file (OrbitNavAccountControl's sessionUser).
//
// Ratchet note: the sitewide non-.btn button-element count is at its
// ceiling (tests/ui/orbit-button-ratchet.test.ts), so this reuses the
// existing `<a className="orbit-nav-menu-item">` pattern (role="button", no
// real navigation) instead of a hand-rolled button element.
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
 * Language switcher, rendered in two places from ONE source (so the button
 * ratchet in tests/ui/orbit-button-ratchet.test.ts still sees a single
 * hand-rolled button): the desktop top bar, and the mobile hamburger menu.
 *
 * UI-audit fix P0-3 / P1-f. Keeping it in the mobile bar cost ~91px of a 375px
 * viewport that already held seven control groups, which squeezed the page
 * title until it wrapped to two lines and overflowed the 56px bar. It also had
 * the smallest tap targets in the product (19x29). CSS shows exactly one
 * variant per breakpoint — see .orbit-lang-toggle--bar / --menu.
 */
function OrbitLangToggle({ variant }: { variant: "bar" | "menu" }) {
  const { language, setLanguage, t } = useOrbitLanguage();

  return (
    <span className={`orbit-lang-toggle orbit-lang-toggle--${variant} mono`}>
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

function OrbitNavThemeMenuItem() {
  const { t } = useOrbitLanguage();
  const [theme, setTheme] = useState<OrbitTheme | null>(null);

  useEffect(() => {
    setTheme(getOrbitTheme());
  }, []);

  const isLight = theme === "light";
  const label =
    theme === null
      ? t({ en: "Toggle theme", zh: "切换主题" })
      : isLight
        ? t({ en: "Dark mode", zh: "深色模式" })
        : t({ en: "Light mode", zh: "浅色模式" });

  return (
    <a
      aria-pressed={theme === null ? undefined : isLight}
      className="orbit-nav-menu-item"
      href="#"
      onClick={(event) => {
        event.preventDefault();
        setTheme(toggleOrbitTheme());
      }}
      role="button"
    >
      <Icon name={isLight ? "moon" : "sun"} size={20} />
      <span>{label}</span>
    </a>
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
    // Unreachable via the nav (see the OrbitNavActive comment above) but kept
    // for the two orphaned components that still pass active="schedule".
    schedule: { en: "Calendar", zh: "日程" },
    today: { en: "Schedule", zh: "日程" },
  };
  const links = [
    ["/today", t({ en: "Schedule", zh: "日程" }), "today"],
    ["/events", t({ en: "Events", zh: "活动" }), "events"],
    ["/contacts", t({ en: "Contacts", zh: "人脉" }), "cards"],
  ] as const;
  const menuItems = [
    { active: active === "today", href: productHref("/today"), icon: "calendar", key: "today", label: t({ en: "Schedule", zh: "日程" }) },
    { active: active === "events", href: productHref("/events"), icon: "calendar", key: "events", label: t({ en: "Events", zh: "活动" }) },
    { active: active === "cards", href: productHref("/contacts"), icon: "users", key: "cards", label: t({ en: "Contacts", zh: "人脉" }) },
    { active: active === "me" || active === "home", href: meHref, icon: "user", key: "me", label: t({ en: "Me", zh: "我的" }) },
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
          <OrbitLangToggle variant="bar" />
          {rightExtra}
          <OrbitNavAccountControl />
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
            <OrbitNavThemeMenuItem />
            <OrbitLangToggle variant="menu" />
          </nav>
        </div>
      ) : null}
    </>
  );
}

export function PublicTopNav({ active = "events" }: { active?: OrbitNavActive }) {
  return <OrbitTopNav active={active} meHref="/app/account/login" />;
}
