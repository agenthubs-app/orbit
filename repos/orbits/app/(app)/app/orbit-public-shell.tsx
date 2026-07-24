"use client";

import { useEffect, useState, type ReactNode } from "react";
import { signOut } from "next-auth/react";

import { useOrbitLanguage } from "./orbit-language-context";
import { Avatar, Icon, Logo, gradientFromString } from "./orbit-reference-primitives";
import { productHref } from "./orbit-product-href";

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
            color: "var(--on-dark)",
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
            zIndex: 60,
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
  const links = [
    ["/today", t({ en: "Today", zh: "Today" }), "today"],
    ["/events", t({ en: "Events", zh: "活动" }), "events"],
    ["/schedule", t({ en: "Calendar", zh: "日程" }), "schedule"],
    ["/contacts", t({ en: "Contacts", zh: "人脉" }), "cards"],
  ] as const;

  return (
    <header className="orbit-top-nav">
      <a aria-label={t({ en: "Back to Orbit home", zh: "返回 Orbit 首页" })} className={`orbit-brand-link${active === "home" ? " is-active" : ""}`} href={preserveHref("/")} style={{ textDecoration: "none" }}>
        <Logo size={25} withText={false} />
        <span style={{ clipPath: "inset(50%)", height: 1, overflow: "hidden", position: "absolute", whiteSpace: "nowrap", width: 1 }}>
          {t({ en: "Back to Orbit home", zh: "返回 Orbit 首页" })}
        </span>
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
          onClick={() =>
            setLanguage(
              language === "zh" ? "en" : language === "en" ? "ja" : "zh",
            )
          }
          style={{ background: "transparent", border: 0, color: "var(--text-3)", cursor: "pointer", fontSize: 12.5, padding: 0 }}
          type="button"
        >
          <span style={{ color: language === "zh" ? "var(--accent)" : "var(--text-3)", fontWeight: language === "zh" ? 700 : 500 }}>中</span>
          <span style={{ color: "var(--text-4)", padding: "0 1px" }}>/</span>
          <span style={{ color: language === "en" ? "var(--accent)" : "var(--text-3)", fontWeight: language === "en" ? 700 : 500 }}>EN</span>
          <span style={{ color: "var(--text-4)", padding: "0 1px" }}>/</span>
          <span style={{ color: language === "ja" ? "var(--accent)" : "var(--text-3)", fontWeight: language === "ja" ? 700 : 500 }}>日</span>
        </button>
        {rightExtra}
        <OrbitNavAccountControl meHref={meHref} />
      </div>
    </header>
  );
}

export function PublicTopNav({ active = "events" }: { active?: OrbitNavActive }) {
  return <OrbitTopNav active={active} meHref="/app/account/login" />;
}
