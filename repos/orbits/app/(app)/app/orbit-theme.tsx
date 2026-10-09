"use client";

import { useEffect } from "react";

import { ORBIT_THEME_STORAGE_KEY } from "./orbit-theme-init";

// Product theme runtime.
//
// R01: colours come from the generated design tokens
// (orbit-2026/tokens.css): light on :root, dark under [data-theme="dark"] and
// under "no choice + system dark". The person's choice is automatic (follow
// the system), light or dark; it lives in localStorage and is applied to
// `document.documentElement[data-theme]` by the head script in
// orbit-theme-init.ts before first paint, then kept in sync here.

const LIGHT_THEME_CSS = `
/* Chrome surfaces that hardcode dark glass (not token-driven) — restated in
   light glass so bars/badges/sidebars don't read as grey blocks in light mode.
   A nav with an explicit dark tone owns its contrast and opts out here.
   2026-09-18: Orbit_0918 浮岛药丸导航为固定浅色设计（外层透明、视觉在 pill），
   不再需要对 .orbit-top-nav 本身做浅色重映射。 */
html[data-theme="light"] [data-orbit-real-page] .orbit-organizer-topnav {
  background: var(--surface);
}
html[data-theme="light"] [data-orbit-real-page] .orbit-mobile-bar,
html[data-theme="light"] [data-orbit-real-page] .orbit-sticky-cta,
html[data-theme="light"] [data-orbit-real-page] .orbit-subpage-header,
html[data-theme="light"] [data-orbit-real-page] .orbit-host-mobile-next-bar,
html[data-theme="light"] [data-orbit-real-page] .orbit-host-mobile-create-bar {
  background: var(--surface);
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
  border-color: var(--line);
}
html[data-theme="light"] [data-orbit-real-page] .orbit-platform-sidebar {
  background: var(--surface-2);
}

/* Top-nav links use the fixed Orbit_0918 pill palette in both themes; the
   :not(.is-starfield) guard stays so the dark starfield tone keeps owning its
   own nav contrast. */
html[data-theme="light"] [data-orbit-real-page] .orbit-top-nav:not(.is-starfield) .orbit-nav-link {
  color: var(--ink-2);
}
html[data-theme="light"] [data-orbit-real-page] .orbit-top-nav:not(.is-starfield) .orbit-nav-link:hover,
html[data-theme="light"] [data-orbit-real-page] .orbit-top-nav:not(.is-starfield) .orbit-nav-link.is-active {
  color: var(--ink);
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
  color: var(--on-accent);
}

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

// Server-safe: emits the light-theme stylesheet + avatar motion once per app tree.
export function OrbitThemeStyles() {
  return <style data-orbit-theme-styles>{`${LIGHT_THEME_CSS}\n${AVATAR_MOTION_CSS}`}</style>;
}

export type OrbitTheme = "light" | "dark";
export type OrbitThemePreference = "system" | OrbitTheme;

function systemTheme(): OrbitTheme {
  try {
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function getOrbitThemePreference(): OrbitThemePreference {
  try {
    const saved = localStorage.getItem(ORBIT_THEME_STORAGE_KEY);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}

function applyOrbitTheme(preference: OrbitThemePreference): OrbitTheme {
  const theme = preference === "system" ? systemTheme() : preference;
  document.documentElement.setAttribute("data-theme", theme);
  return theme;
}

/**
 * Re-applies the saved theme after React hydrates the app shell, and keeps
 * following the system while the choice is "automatic".
 *
 * The inline head script prevents the first-paint flash. Some streamed
 * subroutes can hydrate the server-rendered <html> attributes after that
 * script ran, so this runtime re-applies it.
 */
export function OrbitThemeRuntime() {
  useEffect(() => {
    applyOrbitTheme(getOrbitThemePreference());
    let media: MediaQueryList | undefined;
    try {
      media = window.matchMedia?.("(prefers-color-scheme: dark)");
    } catch {
      media = undefined;
    }
    const follow = () => {
      if (getOrbitThemePreference() === "system") applyOrbitTheme("system");
    };
    media?.addEventListener?.("change", follow);
    return () => media?.removeEventListener?.("change", follow);
  }, []);

  return null;
}

/** The theme in effect right now (what data-theme says). */
export function getOrbitTheme(): OrbitTheme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

/** Saves the person's choice and applies it; "system" clears the stored choice. */
export function setOrbitThemePreference(preference: OrbitThemePreference): OrbitTheme {
  try {
    if (preference === "system") localStorage.removeItem(ORBIT_THEME_STORAGE_KEY);
    else localStorage.setItem(ORBIT_THEME_STORAGE_KEY, preference);
  } catch {
    // ignore storage failures (private mode etc.); the page still switches
  }
  return applyOrbitTheme(preference);
}
