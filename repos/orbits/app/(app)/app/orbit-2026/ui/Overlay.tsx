"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

import { useOrbitModalA11y } from "../../orbit-modal-a11y";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import { useLayer } from "./layer-stack";
import { useOverlayHost, useStandardCopy } from "./Scope";
import styles from "./Overlay.module.css";

function Portal({ children }: { children: ReactNode }) {
  // The scope's host exists once the scope has mounted on the client; outside a
  // scope (isolated tests, server render) the overlay renders in place.
  const host = useOverlayHost();
  return host ? createPortal(children, host) : <>{children}</>;
}

type DialogFrameProps = {
  onClose: () => void;
  /** Scrim click closes (default). Destructive confirmations turn it off. */
  closeOnScrim?: boolean;
  labelledBy: string;
  describedBy?: string;
  className: string;
  scrimClassName: string;
  children: ReactNode;
  role?: "dialog" | "alertdialog";
};

// Shared frame: scrim + panel in the scope host, focus trapped by useOrbitModalA11y
// (first control focused, Tab cycles, focus returns to the opener on close), Escape
// and scrim acting on the top layer only.
function DialogFrame({ onClose, closeOnScrim = true, labelledBy, describedBy, className, scrimClassName, children, role = "dialog" }: DialogFrameProps) {
  const isTop = useLayer(true);
  const cardRef = useOrbitModalA11y(() => { if (isTop()) onClose(); });
  return (
    <Portal>
      <div className={scrimClassName} aria-hidden onMouseDown={() => { if (closeOnScrim && isTop()) onClose(); }} />
      <div ref={cardRef} role={role} aria-modal="true" aria-labelledby={labelledBy} aria-describedby={describedBy} tabIndex={-1} className={className}>
        {children}
      </div>
    </Portal>
  );
}

// kit .wmodal: centred dialog 420 / 480 / 560, radius 28, padding 24; `top` sits 96
// from the top (⌘K); `form` uses --bg so cards inside keep their layer.
export function Modal({ open, onClose, title, description, size = 420, top = false, form = false, actions, hint, children }: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  size?: 420 | 480 | 560;
  top?: boolean;
  form?: boolean;
  actions?: ReactNode;
  hint?: ReactNode;
  children?: ReactNode;
}) {
  const id = useId();
  const copy = useStandardCopy();
  if (!open) return null;
  return (
    <DialogFrame onClose={onClose} labelledBy={`${id}-title`} describedBy={description ? `${id}-desc` : undefined} scrimClassName={styles.scrim}
      className={[styles.modal, styles[`w${size}`], top ? styles.top : "", form ? styles.form : ""].filter(Boolean).join(" ")}>
      <div className={styles.modalHead}>
        <h2 id={`${id}-title`} className={styles.modalTitle}>{title}</h2>
        <button type="button" className={`btn ${styles.close}`} aria-label={copy.action.close} onClick={onClose}><Icon name="x" size={20} /></button>
      </div>
      {description ? <p id={`${id}-desc`} className={styles.modalText}>{description}</p> : null}
      {children}
      {actions || hint ? <div className={styles.actions}>{hint ? <span className={styles.hint}>{hint}</span> : null}{actions}</div> : null}
    </DialogFrame>
  );
}

// 01-system ②: confirm before something that cannot be undone. Cancel on the left and
// focused first; a destructive confirm is solid coral and the scrim does not close it.
export function ConfirmDialog({ open, title, message, confirmLabel, cancelLabel, destructive = false, icon, onConfirm, onCancel }: {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  icon?: IconName;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const id = useId();
  const copy = useStandardCopy();
  if (!open) return null;
  return (
    <DialogFrame onClose={onCancel} closeOnScrim={!destructive} role="alertdialog" labelledBy={`${id}-title`} describedBy={message ? `${id}-desc` : undefined}
      scrimClassName={styles.scrim} className={`${styles.modal} ${styles.w420}`}>
      {destructive || icon ? <span className={`${styles.dialogIcon} ${destructive ? styles.dialogIconDanger : ""}`}><Icon name={icon ?? "trash"} size={24} /></span> : null}
      <h2 id={`${id}-title`} className={styles.modalTitle}>{title}</h2>
      {message ? <p id={`${id}-desc`} className={styles.modalText}>{message}</p> : null}
      <div className={styles.actions}>
        <Button label={cancelLabel ?? copy.action.cancel} variant="secondary" onClick={onCancel} />
        <Button label={confirmLabel} variant={destructive ? "danger" : "primary"} onClick={onConfirm} />
      </div>
    </DialogFrame>
  );
}

// kit .drawer: from the right, 14 from each edge, radius 28, --bg. lg 600 (520 under
// 1280 wide), md 520, sm 380 (RD-17: rich content 520 / light 380 at 1024); never
// wider than the window minus the margins.
export function Drawer({ open, onClose, title, size = "lg", children, footer }: {
  open: boolean;
  onClose: () => void;
  title: string;
  size?: "lg" | "md" | "sm";
  children: ReactNode;
  footer?: ReactNode;
}) {
  const id = useId();
  const copy = useStandardCopy();
  if (!open) return null;
  return (
    <DialogFrame onClose={onClose} labelledBy={`${id}-title`} scrimClassName={`${styles.scrim} ${styles.drawerScrim}`} className={`${styles.drawer} ${styles[`drawer_${size}`]}`}>
      <div className={styles.drawerHead}>
        <h2 id={`${id}-title`} className={styles.drawerTitle}>{title}</h2>
        <button type="button" className={`btn ${styles.close}`} aria-label={copy.action.close} onClick={onClose}><Icon name="x" size={20} /></button>
      </div>
      <div className={styles.drawerBody}>{children}</div>
      {footer ? <div className={styles.drawerFooter}>{footer}</div> : null}
    </DialogFrame>
  );
}

function useAnchorPosition(anchor: RefObject<HTMLElement | null>, open: boolean, width: number) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const box = anchor.current?.getBoundingClientRect();
      if (!box) return;
      const left = Math.max(8, Math.min(box.left, window.innerWidth - width - 8));
      setPosition({ top: box.bottom + 8, left });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [anchor, open, width]);
  return position;
}

function useDismiss(open: boolean, isTop: () => boolean, panel: RefObject<HTMLElement | null>, anchor: RefObject<HTMLElement | null>, onClose: () => void) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isTop()) { event.preventDefault(); event.stopPropagation(); close.current(); anchor.current?.focus(); }
    };
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!isTop() || panel.current?.contains(target) || anchor.current?.contains(target)) return;
      close.current();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onPointer); };
  }, [open, isTop, panel, anchor]);
}

// kit .pop: anchored panel 340–440, radius 22, no scrim; Esc or a click outside closes.
export function Popover({ open, onClose, anchor, label, width = 360, children }: {
  open: boolean;
  onClose: () => void;
  anchor: RefObject<HTMLElement | null>;
  label: string;
  width?: number;
  children: ReactNode;
}) {
  const isTop = useLayer(open);
  const panel = useRef<HTMLDivElement>(null);
  const clamped = Math.max(340, Math.min(440, width));
  const position = useAnchorPosition(anchor, open, clamped);
  useDismiss(open, isTop, panel, anchor, onClose);
  if (!open) return null;
  return (
    <Portal>
      <div ref={panel} role="dialog" aria-label={label} className={styles.popover} style={{ width: clamped, top: position?.top ?? -9999, left: position?.left ?? -9999 }}>
        {children}
      </div>
    </Portal>
  );
}

export type MenuItem = { key: string; label: string; icon?: IconName; destructive?: boolean; onSelect: () => void };

// Context menu: 200 wide, radius 18; arrow keys move, Enter picks, Esc closes and
// returns focus to the trigger. Destructive items use the coral-soft row.
export function ContextMenu({ open, onClose, anchor, label, items }: {
  open: boolean;
  onClose: () => void;
  anchor: RefObject<HTMLElement | null>;
  label: string;
  items: MenuItem[];
}) {
  const isTop = useLayer(open);
  const panel = useRef<HTMLDivElement>(null);
  const position = useAnchorPosition(anchor, open, 200);
  useDismiss(open, isTop, panel, anchor, onClose);
  useEffect(() => {
    if (open) panel.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);
  if (!open) return null;
  const move = (event: ReactKeyboardEvent) => {
    const nodes = Array.from(panel.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const index = nodes.indexOf(document.activeElement as HTMLElement);
    const next = event.key === "ArrowDown" ? (index + 1) % nodes.length : event.key === "ArrowUp" ? (index - 1 + nodes.length) % nodes.length : event.key === "Home" ? 0 : event.key === "End" ? nodes.length - 1 : -1;
    if (next >= 0) { event.preventDefault(); nodes[next]?.focus(); }
  };
  return (
    <Portal>
      <div ref={panel} role="menu" aria-label={label} className={styles.menu} style={{ top: position?.top ?? -9999, left: position?.left ?? -9999 }} onKeyDown={move}>
        {items.map((item) => (
          <button key={item.key} type="button" role="menuitem" tabIndex={-1} className={`btn ${styles.menuItem} ${item.destructive ? styles.menuDanger : ""}`}
            onClick={() => { onClose(); item.onSelect(); anchor.current?.focus(); }}>
            {item.icon ? <Icon name={item.icon} size={16} /> : null}
            {item.label}
          </button>
        ))}
      </div>
    </Portal>
  );
}
