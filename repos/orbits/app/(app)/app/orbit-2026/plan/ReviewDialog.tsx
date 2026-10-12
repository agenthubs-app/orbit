"use client";

import { useEffect, useRef, type ReactNode } from "react";

import k from "./ReviewKit.module.css";

/**
 * kit .overlay + .wmodal（b4 / b12 Web 弹窗：480 / 600 宽、无标题栏 ✕ 的说明框）与 kit .dialog。
 * ui/Modal 固定带标题行和 ✕，画板里这几块没有，所以这里自己画框：Esc 关闭、点遮罩关闭、
 * 打开时把焦点放进框内、关闭后还给原来的元素。
 */
export function ReviewDialog({ open, onClose, labelledBy, width, role = "dialog", className, children, data }: {
  open: boolean;
  onClose: () => void;
  labelledBy?: string;
  width: 420 | 480 | 600;
  role?: "dialog" | "alertdialog";
  className?: string;
  children: ReactNode;
  data?: Record<string, string>;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); close.current(); } };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); before?.focus?.(); };
  }, [open]);
  if (!open) return null;
  const size = width === 480 ? k.w480 : width === 600 ? k.w600 : "";
  return (
    <>
      <div className={k.overlay} onClick={onClose} aria-hidden />
      <div ref={panel} role={role} aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1} className={`${k.wmodal} ${size} ${className ?? ""}`} {...data}>
        {children}
      </div>
    </>
  );
}
