"use client";

// Light theme for the product UI.
//
// The new-UI product surface is dark by default: its entire palette is a token
// remap under `[data-orbit-real-page]` (see orbit-reference-styles.tsx). Because
// every component colors via those CSS variables, a light theme is a single
// token override — no per-component work. The light palette below is the current
// Orbit teal design-token family (globals.css `:root`), so "light mode" reads as
// our existing brand rather than a naive inversion.
//
// Theme selection lives on `document.documentElement[data-theme]`; the inline
// init script (mounted in the root layout <head>) sets it before first paint to
// avoid a flash. Absence of the attribute == dark (the default identity).

import { useEffect, useState } from "react";

// Runs before paint in the document <head>. Kept dependency-free and defensive.
export const ORBIT_THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('orbit-theme');if(t!=='light'&&t!=='dark'){t=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches)?'light':'dark';}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;

const LIGHT_THEME_CSS = `
html[data-theme="light"] [data-orbit-real-page] {
  color-scheme: light;
  --accent: #155e75;
  --accent-hover: #0e7490;
  --accent-press: #0f4758;
  --accent-soft: rgba(21, 94, 117, 0.12);
  --accent-softer: rgba(21, 94, 117, 0.06);
  --accent-ring: rgba(14, 116, 144, 0.40);
  --on-accent: #ffffff;
  --accent-grad: linear-gradient(180deg, #1a7d9b, #155e75);
  --accent-grad-bar: linear-gradient(90deg, #155e75, #0e7490);
  --ink: #17211f;
  --text: #17211f;
  --text-2: #52615d;
  --text-3: #6d7a75;
  --text-4: #8a938f;
  --bg: #f4f7f5;
  --bg-soft: #eef2f0;
  --bg-sunken: #e8efec;
  --surface: #ffffff;
  --surface-2: #f9fbfa;
  --surface-3: #f1f5f3;
  --border: rgba(23, 33, 31, 0.10);
  --border-2: rgba(23, 33, 31, 0.16);
  --border-strong: rgba(23, 33, 31, 0.24);
  --hairline: rgba(23, 33, 31, 0.07);
  --live: #16a34a;
  --live-soft: rgba(22, 163, 74, 0.12);
  --amber: #b45309;
  --amber-soft: rgba(180, 83, 9, 0.12);
  --rose: #be123c;
  --rose-soft: rgba(190, 18, 60, 0.12);
  --sky: #1d4ed8;
  --sky-soft: rgba(29, 78, 216, 0.12);
  --sh-xs: 0 1px 2px rgba(23, 33, 31, 0.06);
  --sh-sm: 0 1px 2px rgba(23, 33, 31, 0.06), 0 2px 6px rgba(23, 33, 31, 0.08);
  --sh-md: 0 2px 4px rgba(23, 33, 31, 0.08), 0 8px 24px rgba(23, 33, 31, 0.10);
  --sh-lg: 0 8px 16px rgba(23, 33, 31, 0.08), 0 24px 56px -12px rgba(21, 94, 117, 0.16);
  --sh-pop: 0 12px 32px rgba(23, 33, 31, 0.14), 0 40px 80px -20px rgba(21, 94, 117, 0.20);
  --scrim: rgba(23, 33, 31, 0.40);
  --glass-bar: rgba(255, 255, 255, 0.82);
  --glass-chip: rgba(249, 251, 250, 0.88);
}

html[data-theme="light"] body:has([data-orbit-real-page]) {
  background: radial-gradient(130% 100% at 50% 14%, #ffffff 0%, #f4f7f5 42%, #eef2f0 100%) fixed #f4f7f5;
}

/* Chrome surfaces that hardcode dark glass (not token-driven) — restated in
   light glass so bars/badges/sidebars don't read as grey blocks in light mode. */
html[data-theme="light"] [data-orbit-real-page] .orbit-top-nav {
  background: rgba(255, 255, 255, 0.72);
  border-bottom: 1px solid var(--hairline);
}
html[data-theme="light"] [data-orbit-real-page] .orbit-organizer-topnav {
  background: rgba(255, 255, 255, 0.78);
}
html[data-theme="light"] [data-orbit-real-page] .orbit-mobile-bar,
html[data-theme="light"] [data-orbit-real-page] .orbit-sticky-cta,
html[data-theme="light"] [data-orbit-real-page] .orbit-subpage-header,
html[data-theme="light"] [data-orbit-real-page] .orbit-host-mobile-next-bar,
html[data-theme="light"] [data-orbit-real-page] .orbit-host-mobile-create-bar {
  background: rgba(255, 255, 255, 0.88);
}
html[data-theme="light"] [data-orbit-real-page] .orbit-graph-legend,
html[data-theme="light"] [data-orbit-real-page] .orbit-party-icon-button,
html[data-theme="light"] [data-orbit-real-page] .orbit-organizer-back {
  background: var(--surface-2);
}
html[data-theme="light"] [data-orbit-real-page] .orbit-card-date,
html[data-theme="light"] [data-orbit-real-page] .orbit-landing-event-date,
html[data-theme="light"] [data-orbit-real-page] .orbit-organizer-date {
  background: var(--surface-3);
  color: var(--ink);
}
html[data-theme="light"] [data-orbit-real-page] .orbit-landing-secondary,
html[data-theme="light"] [data-orbit-real-page] .orbit-landing-phase-card,
html[data-theme="light"] [data-orbit-real-page] .orbit-landing-info-card,
html[data-theme="light"] [data-orbit-real-page] .orbit-landing-small-link.is-button,
html[data-theme="light"] [data-orbit-real-page] .orbit-landing-registered-card,
html[data-theme="light"] [data-orbit-real-page] .orbit-landing-empty,
html[data-theme="light"] [data-orbit-real-page] .orbit-landing-loading,
html[data-theme="light"] [data-orbit-real-page] .orbit-landing-mobile-event-card {
  background: var(--surface);
  border-color: var(--border);
}
html[data-theme="light"] [data-orbit-real-page] .orbit-platform-sidebar {
  background: var(--surface-2);
}

/* Top-nav links hardcode a near-white color (dark-theme ink) that is invisible
   on a light canvas — restate them in dark ink for the light theme. */
html[data-theme="light"] [data-orbit-real-page] .orbit-top-nav .orbit-nav-link {
  color: rgba(23, 33, 31, 0.64);
}
html[data-theme="light"] [data-orbit-real-page] .orbit-top-nav .orbit-nav-link:hover,
html[data-theme="light"] [data-orbit-real-page] .orbit-top-nav .orbit-nav-link.is-active {
  color: var(--ink);
}
html[data-theme="light"] [data-orbit-real-page] .orbit-top-nav .orbit-nav-link.is-active {
  background: rgba(23, 33, 31, 0.06);
}

/* Inverted-contrast controls pair a var(--ink) background with near-black text
   (#0B0A15) — correct only when ink is bright (dark theme). In the light theme
   ink is dark, so that near-black text vanishes into the dark pill (the chips
   read as solid black blobs). Restore white text on these dark pills. */
html[data-theme="light"] [data-orbit-real-page] .chip.is-active,
html[data-theme="light"] [data-orbit-real-page] .btn-dark,
html[data-theme="light"] [data-orbit-real-page] .btn-primary,
html[data-theme="light"] [data-orbit-real-page] .orbit-organizer-seg button.is-active,
html[data-theme="light"] [data-orbit-real-page] .orbit-view-toggle button.is-active {
  color: #fff;
}

.orbit-theme-toggle {
  position: fixed;
  right: 18px;
  bottom: 18px;
  z-index: 9999;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 999px;
  border: 1px solid var(--border-strong, rgba(150,145,200,0.34));
  background: var(--glass-chip, rgba(16,13,32,0.86));
  color: var(--ink, #F2F0FB);
  cursor: pointer;
  box-shadow: var(--sh-md, 0 2px 4px rgba(0,0,0,0.4));
  backdrop-filter: blur(8px);
  transition: transform .08s ease, background .15s ease;
}
.orbit-theme-toggle:hover { transform: translateY(-1px); }
.orbit-theme-toggle:focus-visible { outline: 3px solid var(--accent-ring, rgba(139,123,240,0.42)); outline-offset: 2px; }
`;

// Animated avatars (item 4): a subtle orbiting sheen on every Avatar primitive,
// so the whole network reads as "alive" without changing the letter-avatar look.
// Motion-reduced users get a static avatar.
const AVATAR_MOTION_CSS = `
.avatar { position: relative; overflow: hidden; isolation: isolate; }
.avatar .avatar-letter { position: relative; z-index: 1; }
.avatar .avatar-orbit {
  position: absolute;
  inset: -28%;
  z-index: 0;
  pointer-events: none;
  background: conic-gradient(from 0deg, transparent 0deg, rgba(255,255,255,0.42) 34deg, transparent 96deg);
  animation: orbit-avatar-spin 5.5s linear infinite;
  opacity: 0.5;
}
@keyframes orbit-avatar-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  .avatar .avatar-orbit { animation: none; opacity: 0; }
}
`;

// Server-safe: emits the light-theme stylesheet + avatar motion + toggle chrome once per app tree.
export function OrbitThemeStyles() {
  return <style data-orbit-theme-styles>{`${LIGHT_THEME_CSS}\n${AVATAR_MOTION_CSS}`}</style>;
}

type OrbitTheme = "light" | "dark";

export function OrbitThemeToggle() {
  const [theme, setTheme] = useState<OrbitTheme>("dark");

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    setTheme(current === "light" ? "light" : "dark");
  }, []);

  function toggle() {
    const next: OrbitTheme = theme === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("orbit-theme", next);
    } catch {
      // ignore storage failures (private mode etc.)
    }
    setTheme(next);
  }

  const isLight = theme === "light";

  return (
    <button
      type="button"
      className="orbit-theme-toggle"
      onClick={toggle}
      aria-label={isLight ? "切换到深色模式" : "切换到明亮模式"}
      title={isLight ? "深色模式" : "明亮模式"}
    >
      <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>
        {isLight ? "☾" : "☀"}
      </span>
    </button>
  );
}
