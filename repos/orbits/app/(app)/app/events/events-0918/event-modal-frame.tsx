"use client";

/**
 * Events（Orbit_0918）弹窗公共壳：遮罩 / 面板 / 标题行 / × / Esc / 点遮罩关闭 / Tab 焦点循环 + toast 状态。
 * 遮罩与面板声明来自设计 676–677（参会者）、705–706（交换）、722–723（成功）、745–746（约谈）、764–765（记录交流）：
 * 同一套 fixed inset 0 / rgba(14,18,37,.35) / blur(6px) / padding 48px 24px；面板 r22 / 阴影 / padding 30px 34px；
 * 只有 max-width（800/660/680/700）、gap（22/20/18）、z-index（100/110/120）与成功态的居中不同 → 修饰类。
 * 同一时刻只挂一个弹窗（调用方持 `modal` 单状态）。
 */
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent, type ReactNode } from "react";

import { shouldCloseOnKeydown } from "./event-register-modal";

const FOCUSABLE_SELECTOR = "a[href], button:not([disabled]), input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

/** 面板内可聚焦元素（与 DOM 解耦的最小查询面，便于测试用假对象）。 */
export interface FocusLoopRoot {
  querySelectorAll: (selector: string) => ArrayLike<{ focus: () => void }>;
}

/**
 * Tab 焦点循环（终审 M5）：在最后一个可聚焦元素上 Tab → 回到第一个；在第一个上 Shift+Tab → 到最后一个。
 * 返回 true 表示已处理（调用方 preventDefault）。
 */
export function loopFocus(root: FocusLoopRoot | null | undefined, active: unknown, shiftKey: boolean): boolean {
  if (!root) return false;
  const list = root.querySelectorAll(FOCUSABLE_SELECTOR);
  if (!list.length) return false;
  const first = list[0];
  const last = list[list.length - 1];
  if (!shiftKey && active === last) { first.focus(); return true; }
  if (shiftKey && active === first) { last.focus(); return true; }
  // 焦点已在面板外（或尚未进入）：把它拉回面板
  let inside = false;
  for (let index = 0; index < list.length; index += 1) if (list[index] === active) { inside = true; break; }
  if (!inside) { (shiftKey ? last : first).focus(); return true; }
  return false;
}

export type EventModalKind = "attendee" | "exchange" | "schedule" | "note";
export type EventModalSize = "800" | "660" | "680" | "700";

export function EventModalFrame({
  children,
  kind,
  labelledBy,
  onClose,
  panelClass = "",
  size,
  z = "100",
  center = false,
}: {
  children: ReactNode;
  kind: EventModalKind;
  labelledBy: string;
  onClose: () => void;
  panelClass?: string;
  size: EventModalSize;
  z?: "100" | "110" | "120";
  center?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  // 打开时把焦点放到第一个输入框（没有则 × 关闭钮），关闭时把焦点还给打开前的元素。
  useEffect(() => {
    if (typeof document === "undefined") return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>("input:not([type=hidden]), textarea, select") ?? panel?.querySelector<HTMLElement>("button, a[href]");
    first?.focus();
    return () => { previous?.focus?.(); };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onKeydown = (event: KeyboardEvent) => {
      if (!shouldCloseOnKeydown(event)) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [onClose]);

  const onOverlayClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  const onPanelKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const active = typeof document === "undefined" ? null : document.activeElement;
    if (loopFocus(panelRef.current, active, event.shiftKey)) event.preventDefault();
  };

  return (
    <div className={`ev-mo-overlay ev-mo-z${z}${center ? " ev-mo-overlay-center" : ""}`} data-events-modal={kind} onClick={onOverlayClick}>
      <div aria-labelledby={labelledBy} aria-modal="true" className={`ev-mo-panel ev-mo-panel-${size} ${panelClass}`.trim()} onKeyDown={onPanelKeyDown} ref={panelRef} role="dialog">
        {children}
      </div>
    </div>
  );
}

/** 标题行（设计 678 参会者 align-items:center；706/746/765 其余 flex-start + 副标题）。 */
export function EventModalHead({
  closeLabel,
  id,
  onClose,
  sub,
  title,
  titleSize = "26",
}: {
  closeLabel: string;
  id: string;
  onClose: () => void;
  sub?: string;
  title: string;
  titleSize?: "22" | "26";
}) {
  return (
    <div className={`ev-mo-head${sub ? " ev-mo-head-top" : ""}`}>
      <span className="ev-mo-head-copy">
        <strong className={`ev-mo-title ev-mo-title-${titleSize}`} id={id}>{title}</strong>
        {sub ? <span className="ev-mo-sub">{sub}</span> : null}
      </span>
      <button aria-label={closeLabel} className="btn ev-modal-close" onClick={onClose} type="button">×</button>
    </div>
  );
}

/** 设计 781–783 toast：2.4s 后自动消失（renderVals 823）。 */
export function useEventToast(): { toast: string; showToast: (text: string) => void } {
  const [toast, setToast] = useState("");
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current); }, []);
  const showToast = (text: string) => {
    setToast(text);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(""), 2400) as unknown as number;
  };
  return { toast, showToast };
}
