"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { Icon } from "./Icon";
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
  return (
    <div role={toast.kind === "error" ? "alert" : "status"} className={`${styles.toast} ${styles[toast.kind]} ${toast.keep ? styles.keep : ""}`} data-kind={toast.kind} data-paused={paused || undefined}
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <span className={styles.mark} aria-hidden><Icon name={toast.kind === "error" ? "alert" : toast.kind === "success" ? "check" : "info"} size={16} /></span>
      <span className={styles.message}>
        {toast.message}
        {toast.sub ? <small className={styles.sub}>{toast.sub}</small> : null}
      </span>
      {toast.undo ? <button type="button" className={`btn ${styles.button}`} onClick={() => { toast.undo?.(); onClose(); }}><Icon name="undo" size={16} />{copy.action.undo}</button> : null}
      {toast.action ? <button type="button" className={`btn ${styles.button}`} onClick={() => { toast.action?.onSelect(); onClose(); }}>{toast.action.label}</button> : null}
      {toast.autoDismissMs === null ? <button type="button" className={`btn ${styles.closeButton}`} aria-label={copy.action.close} onClick={onClose}><Icon name="x" size={16} /></button> : null}
      {toast.autoDismissMs !== null ? <i className={styles.countdown} aria-hidden /> : null}
    </div>
  );
}
