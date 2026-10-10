"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { ORBIT_Z } from "../../orbit-z";
import { standardCopyFor, type StandardCopy } from "../copy/standard";
import styles from "./Scope.module.css";

// R06 (RD-18): the redesigned Web lives under one root, `[data-orbit-2026]`, that is
// never inside the legacy `[data-orbit-real-page]` scope (its button / input reset
// would leak in). The root:
//   - sets the base type and colour from the R01 tokens (loaded globally by app/layout);
//   - publishes ORBIT_Z as `--z-*` so module CSS never writes a stacking number;
//   - holds the overlay host, so dialogs, drawers and toasts stay inside the scope;
//   - gives components the standard wording (R03) in the page language.
type ScopeValue = { language: OrbitLanguage; copy: StandardCopy; host: HTMLElement | null; reducedMotion: boolean };

const ScopeContext = createContext<ScopeValue | null>(null);

const Z_VARIABLES = {
  "--z-raised": ORBIT_Z.raised,
  "--z-sticky": ORBIT_Z.sticky,
  "--z-dropdown": ORBIT_Z.dropdown,
  "--z-overlay": ORBIT_Z.overlay,
  "--z-modal": ORBIT_Z.modal,
  "--z-toast": ORBIT_Z.toast,
} as CSSProperties;

export function Orbit2026Scope({
  language,
  children,
  className,
  reducedMotion,
  as: Tag = "div",
}: {
  language: OrbitLanguage;
  children: ReactNode;
  className?: string;
  /** Force Reduce Motion (showcase / tests); otherwise the system setting applies. */
  reducedMotion?: boolean;
  as?: "div" | "main";
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    // RD-18: never inside the legacy scope — its element reset would leak in. Loud in
    // development and tests; the orbit-2026-scope gate checks the same.
    if (process.env.NODE_ENV !== "production" && rootRef.current?.parentElement?.closest("[data-orbit-real-page]")) {
      console.error("[orbit-2026] Orbit2026Scope is inside [data-orbit-real-page]; render it outside the legacy scope (RD-18).");
    }
  }, []);
  const systemReduced = useSystemReducedMotion();
  const reduced = reducedMotion ?? systemReduced;
  const value = useMemo(() => ({ language, copy: standardCopyFor(language), host, reducedMotion: reduced }), [language, host, reduced]);
  return (
    <Tag
      ref={(node: HTMLElement | null) => { rootRef.current = node; }}
      data-orbit-2026=""
      data-motion={reduced ? "reduce" : undefined}
      lang={language}
      className={className ? `${styles.scope} ${className}` : styles.scope}
      style={Z_VARIABLES}
    >
      <ScopeContext.Provider value={value}>
        {children}
        <div ref={setHost} className={styles.host} data-orbit-2026-host="" />
      </ScopeContext.Provider>
    </Tag>
  );
}

function useScope(): ScopeValue {
  const value = useContext(ScopeContext);
  // Outside a scope (tests rendering one component) fall back to Japanese (RD-11).
  return value ?? { language: "ja", copy: standardCopyFor("ja"), host: null, reducedMotion: false };
}

export function useStandardCopy(): StandardCopy {
  return useScope().copy;
}

export function useScopeLanguage(): OrbitLanguage {
  return useScope().language;
}

/** Where overlays render: the scope's host (inside `[data-orbit-2026]`). */
export function useOverlayHost(): HTMLElement | null {
  return useScope().host;
}

/** Reduce Motion: the system setting, or the scope's forced value. CSS follows `data-motion`. */
export function useReducedMotion(): boolean {
  return useScope().reducedMotion;
}

function useSystemReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const listener = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener?.("change", listener);
    return () => query.removeEventListener?.("change", listener);
  }, []);
  return reduced;
}

/** `{name}` placeholders, same rule as the App (`fillCopy`). */
export function fillCopy(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (match, key: string) => (Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match));
}
