"use client";

import type { ReactNode } from "react";

import { useOrbitLanguage } from "./orbit-language-context";
import { useOrbitModalA11y } from "./orbit-modal-a11y";
import { OrbitTopNav, productHref } from "./orbit-public-shell";
import { Icon, Logo } from "./orbit-reference-primitives";
import { RelationshipInboxTrigger } from "./inbox/relationship-inbox-panel";
import { ORBIT_Z } from "./orbit-z";

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
  active?: "agent" | "today" | "events" | "schedule" | "cards" | "me";
  agentTone?: "default" | "selected";
  rightExtra?: ReactNode;
}) {
  return (
    <OrbitTopNav
      active={active}
      agentActive={agentTone ? agentTone === "selected" : active === "agent"}
      meHref="/app/home"
      rightExtra={
        // 关系收件箱入口在所有 /app/** 顶栏默认出现；页面传入的 rightExtra 仍保留。
        <>
          {rightExtra}
          <RelationshipInboxTrigger />
        </>
      }
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
        background: transparent ? "transparent" : "var(--glass-bar, rgba(255,255,255,0.86))",
        borderBottom: transparent ? "none" : "1px solid var(--border)",
        display: "flex",
        flexShrink: 0,
        gap: 10,
        height: 52,
        padding: "0 16px",
        position: "relative",
        width: "100%",
        zIndex: ORBIT_Z.raised,
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

/**
 * Shared dialog chrome for every modal surface: scrim, centered/bottom-sheet
 * card, and the shared focus-trap/Esc/aria-modal behavior from
 * useOrbitModalA11y (audit P0-7 — previously reimplemented inline here and
 * independently by several dialogs). Pass `bare` to take over the card's
 * inner content entirely (own header, own scroll region) while still
 * getting the overlay, scrim, positioning, and a11y hook for free — used by
 * dialogs whose header doesn't match the default Logo/step/close row (the
 * admin create-event wizard, the party person-detail bottom sheet).
 */
export function ModalShell({
  bare = false,
  children,
  className,
  label,
  maxW = 440,
  onClose,
  step,
  variant = "dialog",
}: {
  bare?: boolean;
  children: ReactNode;
  className?: string;
  label?: string;
  maxW?: number;
  onClose: () => void;
  step?: string;
  variant?: "dialog" | "bottom-sheet";
}) {
  const { t } = useOrbitLanguage();
  const cardRef = useOrbitModalA11y(onClose);
  const isSheet = variant === "bottom-sheet";

  return (
    <div className="orbit-modal-overlay" style={{ alignItems: isSheet ? "flex-end" : "center", display: "flex", inset: 0, justifyContent: "center", position: "fixed", zIndex: ORBIT_Z.modal }}>
      <div className="orbit-modal-scrim" onClick={onClose} style={{ backdropFilter: "blur(4px)", background: "var(--scrim)", inset: 0, position: "absolute" }} />
      <div
        aria-label={label ?? t({ en: "Dialog", zh: "对话框" })}
        aria-modal="true"
        className={`orbit-modal-card card${className ? ` ${className}` : ""}`}
        ref={cardRef}
        role="dialog"
        style={{
          animation: "pop .2s cubic-bezier(.22,1,.36,1)",
          borderRadius: isSheet ? "var(--r-xl) var(--r-xl) 0 0" : 20,
          boxShadow: "var(--sh-pop)",
          display: "flex",
          flexDirection: "column",
          margin: isSheet ? 0 : 16,
          maxHeight: isSheet ? "88vh" : "92%",
          outline: "none",
          overflowX: "hidden",
          overflowY: isSheet ? "auto" : "hidden",
          position: "relative",
          width: isSheet ? "min(100%, 460px)" : `min(100%, ${maxW}px)`,
          zIndex: ORBIT_Z.raised,
        }}
        tabIndex={-1}
      >
        {bare ? (
          children
        ) : (
          <>
            <div style={{ alignItems: "center", display: "flex", gap: 12, padding: "20px 22px 6px" }}>
              <Logo size={22} />
              <div style={{ flex: 1 }} />
              {step ? <span className="mono" style={{ color: "var(--text-3)", fontSize: 12, whiteSpace: "nowrap" }}>{step}</span> : null}
              <button type="button" onClick={onClose} aria-label={t({ en: "Close", zh: "关闭" })} className="hit-44" style={{ alignItems: "center", background: "var(--surface-2)", border: "none", borderRadius: 999, color: "var(--text-2)", cursor: "pointer", display: "flex", height: 32, justifyContent: "center", width: 32 }}>
                <Icon name="x" size={17} />
              </button>
            </div>
            <div className="scroll" style={{ overflowY: "auto", padding: "10px 28px 28px" }}>{children}</div>
          </>
        )}
      </div>
    </div>
  );
}
