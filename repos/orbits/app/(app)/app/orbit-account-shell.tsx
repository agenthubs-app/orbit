"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";

import { useOrbitLanguage } from "./orbit-language-context";
import { OrbitTopNav, productHref } from "./orbit-public-shell";
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
  return (
    <OrbitTopNav
      active={active}
      agentActive={agentTone ? agentTone === "selected" : active === "agent"}
      meHref="/app/home"
      rightExtra={rightExtra}
    />
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
  backLabel,
  dark = false,
  onBack,
  right,
  title,
  transparent = false,
}: {
  backLabel?: string;
  dark?: boolean;
  onBack?: () => void;
  right?: ReactNode;
  title?: string;
  transparent?: boolean;
}) {
  const { t } = useOrbitLanguage();

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
          aria-label={backLabel ?? t({ en: "Back", zh: "返回" })}
          className="hit-44"
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
  label,
  maxW = 440,
  onClose,
  step,
}: {
  children: ReactNode;
  label?: string;
  maxW?: number;
  onClose: () => void;
  step?: string;
}) {
  const { t } = useOrbitLanguage();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const focusable = useCallback(() => {
    const root = cardRef.current;
    if (!root) return [] as HTMLElement[];
    return Array.from(
      root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((node) => node.offsetParent !== null || node === document.activeElement);
  }, []);

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const items = focusable();
    (items[0] ?? cardRef.current)?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const nodes = focusable();
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const activeEl = document.activeElement;

      if (event.shiftKey && activeEl === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeEl === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused.current?.focus?.();
    };
  }, [focusable, onClose]);

  return (
    <div className="orbit-modal-overlay" style={{ alignItems: "center", display: "flex", inset: 0, justifyContent: "center", position: "absolute", zIndex: 200 }}>
      <div className="orbit-modal-scrim" onClick={onClose} style={{ backdropFilter: "blur(4px)", background: "var(--scrim)", inset: 0, position: "absolute" }} />
      <div
        aria-label={label ?? t({ en: "Dialog", zh: "对话框" })}
        aria-modal="true"
        className="orbit-modal-card card"
        ref={cardRef}
        role="dialog"
        style={{ animation: "pop .2s cubic-bezier(.22,1,.36,1)", borderRadius: 20, boxShadow: "var(--sh-pop)", display: "flex", flexDirection: "column", margin: 16, maxHeight: "92%", outline: "none", overflow: "hidden", position: "relative", width: `min(100%, ${maxW}px)`, zIndex: 1 }}
        tabIndex={-1}
      >
        <div style={{ alignItems: "center", display: "flex", gap: 12, padding: "20px 22px 6px" }}>
          <Logo size={22} />
          <div style={{ flex: 1 }} />
          {step ? <span className="mono" style={{ color: "var(--text-3)", fontSize: 12, whiteSpace: "nowrap" }}>{step}</span> : null}
          <button type="button" onClick={onClose} aria-label={t({ en: "Close", zh: "关闭" })} className="hit-44" style={{ alignItems: "center", background: "var(--surface-2)", border: "none", borderRadius: 999, color: "var(--text-2)", cursor: "pointer", display: "flex", height: 32, justifyContent: "center", width: 32 }}>
            <Icon name="x" size={17} />
          </button>
        </div>
        <div className="scroll" style={{ overflowY: "auto", padding: "10px 28px 28px" }}>{children}</div>
      </div>
    </div>
  );
}
