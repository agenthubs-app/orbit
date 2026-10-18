"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { Icon, type IconName } from "./Icon";
import { useOverlayHost, useStandardCopy } from "./Scope";
import { createToast, disarmOwner, pushToast, removeToast, type ToastInput, type ToastState } from "./toast-model";
import styles from "./Toast.module.css";

type ToastApi = { show: (input: ToastInput, owner: number) => void; dismiss: (id?: number) => void; release: (owner: number) => void };

const ToastContext = createContext<ToastApi | null>(null);
let nextOwner = 1;

// Put one provider inside the Orbit2026Scope of a page (or the shell). The stack
// renders in the scope's overlay host: bottom-right 24, 420 wide, at most 3.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<ToastState[]>([]);
  const api = useMemo<ToastApi>(() => ({
    show: (input, owner) => setStack((current) => pushToast(current, createToast(input, owner))),
    dismiss: (id) => setStack((current) => (id === undefined ? current.slice(0, -1) : removeToast(current, id))),
    release: (owner) => setStack((current) => disarmOwner(current, owner)),
  }), []);
  const host = useOverlayHost();
  const view = (
    <div className={styles.stack} aria-live="polite" aria-relevant="additions">
      {stack.map((toast) => <ToastView key={toast.id} toast={toast} onClose={() => api.dismiss(toast.id)} />)}
    </div>
  );
  return (
    <ToastContext.Provider value={api}>
      {children}
      {stack.length ? (host ? createPortal(view, host) : view) : null}
    </ToastContext.Provider>
  );
}

/**
 * `toast.success("完了にしました", { undo })`, `toast.error(msg, { action: { label: copy.action.retry, onSelect } })`.
 * Undo and action callbacks die with the calling component.
 */
export function useToast() {
  const api = useContext(ToastContext);
  const owner = useRef(nextOwner++).current;
  useEffect(() => () => api?.release(owner), [api, owner]);
  const show = useCallback((kind: NonNullable<ToastInput["kind"]>, message: string, options: Omit<ToastInput, "kind" | "message"> = {}) => api?.show({ kind, message, ...options }, owner), [api, owner]);
  return useMemo(() => ({
    success: (message: string, options?: Omit<ToastInput, "kind" | "message">) => show("success", message, options),
    error: (message: string, options?: Omit<ToastInput, "kind" | "message">) => show("error", message, options),
    info: (message: string, options?: Omit<ToastInput, "kind" | "message">) => show("info", message, options),
    dismiss: () => api?.dismiss(),
  }), [api, show]);
}

function ToastView({ toast, onClose }: { toast: ToastState; onClose: () => void }) {
  const copy = useStandardCopy();
  const close = useRef(onClose);
  close.current = onClose;
  // The countdown starts once per toast; other toasts coming and going do not reset
  // it. Hovering or focusing the toast pauses it (WCAG 2.2.1), so 元に戻す stays
  // reachable from the keyboard (review m2).
  const [paused, setPaused] = useState(false);
  const left = useRef(toast.autoDismissMs ?? 0);
  useEffect(() => {
    if (toast.autoDismissMs === null || paused) return;
    const started = Date.now();
    const timer = setTimeout(() => close.current(), left.current);
    return () => { clearTimeout(timer); left.current = Math.max(0, left.current - (Date.now() - started)); };
  }, [toast.id, toast.autoDismissMs, paused]);
  // R31b (kit .toast, 01-system ①): an error toast with an action has no ✕ — its action (再試行) closes it; a toast
  // without a timer and without an action (the undo bar, an error with nothing to do) keeps its ✕.
  const actionCloses = toast.autoDismissMs === null && Boolean(toast.action) && !toast.keep;
  return (
    <div role={toast.kind === "error" ? "alert" : "status"} className={`${styles.toast} ${styles[toast.kind]} ${toast.keep ? styles.keep : ""}`} data-kind={toast.kind} data-paused={paused || undefined}
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <ToastBody kind={toast.kind} message={toast.message} sub={toast.sub}
        undo={toast.undo ? { label: copy.action.undo, onSelect: () => { toast.undo?.(); onClose(); } } : undefined}
        action={toast.action ? { label: toast.action.label, onSelect: () => { toast.action?.onSelect(); onClose(); } } : undefined}
        actionIcon={toast.kind === "error" ? "refresh" : undefined}
        close={toast.autoDismissMs === null && !actionCloses ? { label: copy.action.close, onSelect: onClose } : undefined}
        countdown={toast.autoDismissMs !== null} />
    </div>
  );
}

type ToastBodyProps = {
  kind: ToastState["kind"];
  icon?: IconName;
  message: string;
  sub?: string;
  undo?: { label: string; onSelect: () => void };
  action?: { label: string; onSelect: () => void };
  actionIcon?: IconName;
  close?: { label: string; onSelect: () => void };
  countdown: boolean;
};

function ToastBody({ kind, icon, message, sub, undo, action, actionIcon, close, countdown }: ToastBodyProps) {
  return (
    <>
      <span className={styles.mark} aria-hidden><Icon name={icon ?? (kind === "error" ? "alert" : kind === "success" ? "check" : "info")} size={16} /></span>
      <span className={styles.message}>
        {message}
        {sub ? <small className={styles.sub}>{sub}</small> : null}
      </span>
      {undo ? <button type="button" className={`btn ${styles.button}`} onClick={undo.onSelect}><Icon name="undo" size={16} />{undo.label}</button> : null}
      {action ? <button type="button" className={`btn ${styles.button}`} onClick={action.onSelect}>{actionIcon ? <Icon name={actionIcon} size={16} /> : null}{action.label}</button> : null}
      {close ? <button type="button" className={`btn ${styles.closeButton}`} aria-label={close.label} onClick={close.onSelect}><Icon name="x" size={16} /></button> : null}
      {countdown ? <i className={styles.countdown} aria-hidden /> : null}
    </>
  );
}

/** R31b: a still toast for the showcase spec cell (01-system ① c-toast #0) — same markup, no timer, the countdown line drawn full. */
export function ToastPreview({ kind, icon, message, sub, undoLabel, actionLabel, actionIcon, countdown = true }: { kind: ToastState["kind"]; icon?: IconName; message: string; sub?: string; undoLabel?: string; actionLabel?: string; actionIcon?: IconName; countdown?: boolean }) {
  return (
    <div className={`${styles.toast} ${styles[kind]} ${styles.still}`} data-kind={kind}>
      <ToastBody kind={kind} icon={icon} message={message} sub={sub} countdown={countdown}
        undo={undoLabel ? { label: undoLabel, onSelect: () => undefined } : undefined}
        action={actionLabel ? { label: actionLabel, onSelect: () => undefined } : undefined} actionIcon={actionIcon} />
    </div>
  );
}
