"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { planFlowCopy } from "../copy/plan";
import type { OrbitCopyEntry } from "../copy/types";
import { ShellPage, useInShell } from "../shell/slots";
import { Icon, Kbd, type IconName } from "../ui";
import type { Translate } from "./PlanParts";
import k from "./FlowKit.module.css";

// R23 pixel rework: the small kit pieces the plan-generation screens share
// (b10-plan-example.html / b12-missing-states.html helpers of the same names).

/** b10 FM: 背景 / 質問 / 初版 / AI 修正 / 手動編集 — `at` = the current one (5 = all done). */
export const FM_STEPS: readonly OrbitCopyEntry[] = [
  planFlowCopy.progressShortBackground,
  planFlowCopy.stageQuestions,
  planFlowCopy.stageDraft,
  planFlowCopy.stageFix,
  planFlowCopy.stageManual,
];

export function FmBar({ at, t, className }: { at: number; t: Translate; className?: string }) {
  return (
    <ol className={`${k.fm} ${className ?? ""}`} aria-label={t(planFlowCopy.progressLabel)}>
      {FM_STEPS.map((entry, index) => (
        <li key={entry.en} className={index < at ? k.fmDone : index === at ? k.fmOn : undefined} aria-current={index === at ? "step" : undefined}>{t(entry)}</li>
      ))}
    </ol>
  );
}

/** kit .bubble.me — the person's words, right aligned, ink. */
export function MeBubble({ children, label }: { children: ReactNode; label?: string }) {
  return <p className={`${k.bubble} ${k.bubbleMe}`} aria-label={label}>{children}</p>;
}

/** kit .bubble.ai — iOrbit's words, white. */
export function AiBubble({ children }: { children: ReactNode }) {
  return <p className={`${k.bubble} ${k.bubbleAi}`}>{children}</p>;
}

/** b12 okLine: green-edged card with ✓, a bold line and an optional action at the right. */
export function OkLine({ text, action, data }: { text: string; action?: ReactNode; data?: Record<string, string> }) {
  return (
    <div className={`${k.okCard} ${k.okLine}`} {...data}>
      <div className={k.row} style={{ gap: 8 }}>
        <span className={k.okmark}><Icon name="check" size={16} /></span>
        <b className={k.okText}>{text}</b>
        {action}
      </div>
    </div>
  );
}

/** b12 limitCard: ⏳ apricot tile on a flat card — a limit, never a failure. */
export function LimitCard({ title, sub, data }: { title: string; sub?: string; data?: Record<string, string> }) {
  return (
    <div className={`${k.card} ${k.flat} ${k.limitCard}`} role="status" {...data}>
      <div className={k.row}>
        <span className={`${k.emo} ${k.emoApricot}`} aria-hidden>⏳</span>
        <div className={k.grow}><b className={k.limitTitle}>{title}</b>{sub ? <div className={`${k.lbl} ${k.limitSub}`}>{sub}</div> : null}</div>
      </div>
    </div>
  );
}

/** b12 degradeRow: the grey 01-system ⑧ strip (STALE, busy, draft fallback). */
export function DegradeRow({ title, icon = "alert", action, busy, data }: { title: string; icon?: IconName; action?: ReactNode; busy?: boolean; data?: Record<string, string> }) {
  return (
    <div className={`${k.degrade} ${k.degradeRow}`} role="status" {...data}>
      {busy ? <span className={k.thinking} aria-hidden><i /><i /><i /></span> : <Icon name={icon} size={16} />}
      <b className={k.degradeTitle}>{title}</b>
      {action}
    </div>
  );
}

/** b12 degrade (block): title, sentence, a small button under them. */
export function DegradeCard({ title, sub, action, data }: { title: string; sub?: string; action?: ReactNode; data?: Record<string, string> }) {
  return (
    <div className={k.degrade} role="status" {...data}>
      <Icon name="alert" size={16} />
      <div className={k.grow}>
        <b className={k.degradeTitleBlock}>{title}</b>
        {sub ? <div className={k.degradeSub}>{sub}</div> : null}
        {action ? <div className={k.degradeAct}>{action}</div> : null}
      </div>
    </div>
  );
}

/** b12 ngCard: coral-soft failure card — what did not happen, the guarantee, もう一度. */
export function NgCard({ title, body, retryLabel, onRetry, data }: { title: string; body: string; retryLabel: string; onRetry?: () => void; data?: Record<string, string> }) {
  return (
    <div className={k.ngCard} role="alert" {...data}>
      <div className={k.row}>
        <span className={k.ngmark}><Icon name="alert" size={16} /></span>
        <div className={k.grow}><b className={k.ngTitle}>{title}</b><div className={k.lbl}>{body}</div></div>
        {onRetry ? <button type="button" className={`btn ${k.btn} ${k.sm} ${k.onSurface}`} onClick={onRetry}><Icon name="refresh" size={16} />{retryLabel}</button> : null}
      </div>
    </div>
  );
}

/** b12 errCard: the centred block retry card (01-system ⑧). */
export function ErrCard({ title, sub, retryLabel, onRetry, data }: { title: string; sub: ReactNode; retryLabel: string; onRetry: () => void; data?: Record<string, string> }) {
  return (
    <div className={`${k.card} ${k.errCard}`} role="alert" {...data}>
      <div className={k.errIc}><Icon name="alert" size={24} /></div>
      <b className={k.errTitle}>{title}</b>
      <div className={`${k.sub} ${k.errSub}`}>{sub}</div>
      <div className={k.errActs}><button type="button" className={`btn ${k.btn} ${k.primary} ${k.sm}`} onClick={onRetry}><Icon name="refresh" size={16} />{retryLabel}</button></div>
    </div>
  );
}

/** Rail heading (kit .rail h4) with its small icon. */
export function RailHead({ icon, children }: { icon?: IconName; children: ReactNode }) {
  return <h4 className={k.railH}>{icon ? <Icon name={icon} size={16} /> : null}{children}</h4>;
}

/**
 * The page header: in the shell it fills the shell slots (title / subtitle / left / right / rail);
 * rendered on its own (tests, no shell) it draws the same three parts at the top of the page,
 * like TaskContainer keeps its tabs on the page outside the shell.
 */
export function FlowHead({ title, subtitle, left, right, rail }: { title: string; subtitle: string; left: ReactNode; right: ReactNode; rail: ReactNode | false }) {
  const inShell = useInShell();
  if (inShell) return <ShellPage title={title} subtitle={subtitle} left={left} right={right} rightRail={rail} />;
  return (
    <>
      <div className={k.ownHead} data-plan-own-head="">
        <div>{left}</div>
        <div className={k.ownTitle}><b>{title}</b><small>{subtitle}</small></div>
        <div className={k.ownRight}>{right}</div>
      </div>
      {rail ? <aside className={k.ownRail}>{rail}</aside> : null}
    </>
  );
}

/**
 * kit `.wmodal` (01-system ② Web centred dialog, 420 / 480 / 520 wide) over the web scrim:
 * Esc closes, focus starts on the element marked `data-autofocus` (the safe choice) and returns.
 */
export function FlowDialog({ open, onClose, width = 480, label, children, data, role = "dialog" }: { open: boolean; onClose: () => void; width?: 420 | 480 | 520; label: string; children: ReactNode; data?: Record<string, string>; role?: "dialog" | "alertdialog" }) {
  const box = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const back = document.activeElement as HTMLElement | null;
    const first = box.current?.querySelector<HTMLElement>("[data-autofocus]") ?? box.current?.querySelector<HTMLElement>("button, input");
    first?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); onClose(); } };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); back?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className={k.overlay} onClick={onClose} aria-hidden />
      <div ref={box} role={role} aria-modal="true" aria-label={label} className={`${k.wmodal} ${width === 520 ? k.w520 : width === 420 ? k.w420 : k.w480}`} {...data}>{children}</div>
    </>
  );
}

/** The dialog's action row (kit `.macts`): 「Esc キャンセル」 hint at the left, buttons at the right. */
export function DialogActs({ hint, children }: { hint: string; children: ReactNode }) {
  return <div className={k.macts}><span className={`${k.lbl} ${k.hint}`}><Kbd>Esc</Kbd> {hint}</span>{children}</div>;
}
