"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

import { useOrbitModalA11y } from "../../orbit-modal-a11y";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import { Kbd } from "./Basics";
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
  /** Focus this control instead of the first one (for example ⌘K's search field). */
  initialFocus?: RefObject<HTMLElement | null>;
};

// Shared frame: scrim + panel in the scope host, focus trapped by useOrbitModalA11y
// (first control focused, Tab cycles, focus returns to the opener on close), Escape
// and scrim acting on the top layer only.
function DialogFrame({ onClose, closeOnScrim = true, labelledBy, describedBy, className, scrimClassName, children, role = "dialog", initialFocus }: DialogFrameProps) {
  const isTop = useLayer(true);
  const cardRef = useOrbitModalA11y(() => { if (isTop()) onClose(); });
  // Runs after the trap's own effect (declared after it), so the requested control
  // wins over "first focusable" without fighting it or retrying.
  useEffect(() => { initialFocus?.current?.focus(); }, [initialFocus]);
  return (
    <Portal>
      <div className={scrimClassName} aria-hidden onMouseDown={() => { if (closeOnScrim && isTop()) onClose(); }} />
      <div ref={cardRef} role={role} aria-modal="true" aria-labelledby={labelledBy} aria-describedby={describedBy} tabIndex={-1} className={className}>
        {children}
      </div>
    </Portal>
  );
}

// kit .wmodal: centred dialog 380 / 420 / 480 / 560 (680 for the ⌘K panel; form modals 760 / 860 / 1000, b3 日程を提案 1000 · 送る前の確認 760 · フォロー完了 860), radius 28, padding 24;
// `top` sits 96 from the top (⌘K); `form` uses --bg so cards inside keep their layer.
// New head (R31b, boards b12 W-R24-03 / 09b / 11, #320, 01-system ②): opt in via icon, subtitle, or titleSize;
// it uses a 17px title (`titleSize` 18) and kit .lbtn ✕ (34, surface-2). The default keeps its pre-R31b look.
// `icon` puts a tile left of the title (kit .emo / .dic; decoration, never focusable); with
// `description` as well the head is the confirm layout (gap 14, top-aligned, the description under the title).
// `subtitle` is the grey line right under the title. `closable={false}` drops the ✕: the dialog then needs a
// cancel action — Esc still closes it and focus still returns to the opener.
export function Modal({ open, onClose, title, header, description, subtitle, subtitleBelowHead = false, icon, titleSize, closable = true, size = 420, top = false, form = false, bare = false, actions, hint, initialFocus, closeOnScrim, role, children }: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Replaces the default title row when a board composes its own head (e.g. b12 W-R12-01: 18px title + subtitle + 40 round ✕); `title` still names the dialog. */
  header?: ReactNode;
  description?: string;
  /** R31b: grey line under the title (kit .lbl), inside the head. */
  subtitle?: string;
  /** The code-entry board places its subtitle after the complete title row. */
  subtitleBelowHead?: boolean;
  /** R31b: tile left of the title (MacTile / ModalIcon). */
  icon?: ReactNode;
  titleSize?: 17 | 18;
  /** R31b: false = no ✕ (keep a cancel action; Esc still closes). */
  closable?: boolean;
  size?: 380 | 420 | 480 | 560 | 680 | 760 | 860 | 1000;
  top?: boolean;
  form?: boolean;
  /** R30 (only added): the ⌘K panel body draws its own rows edge to edge — kit `.cmdk` padding 10 instead of 24. */
  bare?: boolean;
  actions?: ReactNode;
  hint?: ReactNode;
  initialFocus?: RefObject<HTMLElement | null>;
  /** Default true; destructive confirmations turn it off. */
  closeOnScrim?: boolean;
  role?: "dialog" | "alertdialog";
  children?: ReactNode;
}) {
  const id = useId();
  const copy = useStandardCopy();
  if (!open) return null;
  const confirmLayout = Boolean(icon && description);
  const newHead = Boolean(icon || subtitle || titleSize !== undefined);
  const titleEl = <h2 id={`${id}-title`} className={[styles.modalTitle, newHead ? styles.modalTitleNew : "", titleSize === 18 ? styles.modalTitleLg : ""].filter(Boolean).join(" ")}>{title}</h2>;
  const descEl = description ? <p id={`${id}-desc`} className={confirmLayout ? styles.modalSub : styles.modalText}>{description}</p> : null;
  return (
    <DialogFrame onClose={onClose} closeOnScrim={closeOnScrim} role={role} initialFocus={initialFocus} labelledBy={`${id}-title`} describedBy={description ? `${id}-desc` : undefined} scrimClassName={styles.scrim}
      className={[styles.modal, styles[`w${size}`], top ? styles.top : "", form ? styles.form : "", bare ? styles.bare : ""].filter(Boolean).join(" ")}>
      {header ? (
        <><span id={`${id}-title`} hidden>{title}</span>{header}</>
      ) : (
        <div className={[styles.modalHead, newHead ? styles.modalHeadNew : "", confirmLayout ? styles.modalHeadConfirm : ""].filter(Boolean).join(" ")}>
          <div className={`${styles.modalHeadMain} ${confirmLayout ? styles.modalHeadMainConfirm : ""}`}>
            {icon ? <span className={styles.modalIcon} aria-hidden>{icon}</span> : null}
            <div className={styles.modalTitleBlock}>
              {titleEl}
              {subtitle && !subtitleBelowHead ? <p className={styles.modalSubtitle}>{subtitle}</p> : null}
              {confirmLayout ? descEl : null}
            </div>
          </div>
          {closable ? <button type="button" className={`btn ${styles.close} ${newHead ? styles.closeNew : ""}`} aria-label={copy.action.close} onClick={onClose}><Icon name="x" size={newHead ? 16 : 20} /></button> : null}
        </div>
      )}
      {subtitle && subtitleBelowHead && !header ? <p className={`${styles.modalSubtitle} ${styles.modalSubtitleBelowHead}`}>{subtitle}</p> : null}
      {confirmLayout && !header ? null : descEl}
      {children}
      {actions || hint ? <div className={styles.actions}>{hint ? <span className={styles.hint}>{hint}</span> : null}{actions}</div> : null}
    </DialogFrame>
  );
}

/** kit .dic (48, radius 16): the Web confirm's icon block — coral-soft with a line icon, or an apricot emoji tile (.dic.emo). */
export function ModalIcon({ icon, emoji, tone = "danger" }: { icon?: IconName; emoji?: string; tone?: "danger" | "apricot" }) {
  return <span className={`${styles.dialogIcon} ${tone === "danger" && !emoji ? styles.dialogIconDanger : styles.dialogIconEmo}`}>{emoji ?? <Icon name={icon ?? "trash"} size={24} />}</span>;
}

// 01-system ② Web (.wmodal 420): icon block left of a question title, the consequence under it, Esc hint at the
// left, [キャンセル][主動作] on the right; no ✕. Destructive: solid coral, focus starts on キャンセル and the scrim
// does not close it; otherwise focus starts on the main action.
export function ConfirmDialog({ open, title, message, confirmLabel, cancelLabel, destructive = false, icon, emoji, onConfirm, onCancel }: {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  icon?: IconName;
  /** R31b: an emoji tile instead of a line icon (kit .dic.emo). */
  emoji?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const copy = useStandardCopy();
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancel = cancelLabel ?? copy.action.cancel;
  const tile = destructive || icon || emoji ? <ModalIcon icon={icon} emoji={emoji} tone={destructive ? "danger" : "apricot"} /> : undefined;
  return (
    <Modal open={open} onClose={onCancel} title={title} description={message} icon={tile} closable={false} closeOnScrim={!destructive} role="alertdialog"
      initialFocus={destructive ? undefined : confirmRef} hint={<><Kbd>Esc</Kbd> {cancel}</>}
      actions={<><Button label={cancel} variant="secondary" onClick={onCancel} /><Button ref={confirmRef} label={confirmLabel} variant={destructive ? "danger" : "primary"} onClick={onConfirm} /></>} />
  );
}

// kit .drawer: from the right, 14 from each edge, radius 28, --bg, padding 22. lg 600 (520 under
// 1280 wide), md 520, sm 380 (RD-17: rich content 520 / light 380 at 1024); never
// wider than the window minus the margins. `fullOnPhone`: under 768 the drawer fills the
// screen (no margins, no radius) — for a form that is the whole task on a phone (R12 手入力, b8).
// Head (R31b, b4 #12 / b6 #20): title (20 / 800, `titleSize` 18 = b4's 18 bold) with an optional grey `subtitle`
// under it (long titles wrap, the ✕ keeps its size), the ✕ is kit .rbtn (40, white round on --bg).
export function Drawer({ open, onClose, title, subtitle, titleSize = 20, size = "lg", children, footer, fullOnPhone = false, bare = false }: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** R31b: grey line under the title (kit .lbl). */
  subtitle?: string;
  titleSize?: 18 | 20;
  size?: "lg" | "md" | "sm";
  children: ReactNode;
  footer?: ReactNode;
  fullOnPhone?: boolean;
  /** No title row and no ✕ (b6 1024 rail drawer): the content brings its own heading; Esc and the scrim close it, the title stays its accessible name. */
  bare?: boolean;
}) {
  const id = useId();
  const copy = useStandardCopy();
  if (!open) return null;
  return (
    <DialogFrame onClose={onClose} labelledBy={`${id}-title`} scrimClassName={`${styles.scrim} ${styles.drawerScrim}`} className={`${styles.drawer} ${styles[`drawer_${size}`]}${fullOnPhone ? ` ${styles.drawerFullPhone}` : ""}${bare ? ` ${styles.drawerBareFrame}` : ""}`}>
      {bare ? <h2 id={`${id}-title`} className={styles.srOnly}>{title}</h2> : (
        <div className={styles.drawerHead}>
          <div className={styles.drawerTitleBlock}>
            <h2 id={`${id}-title`} className={`${styles.drawerTitle} ${titleSize === 18 ? styles.drawerTitleSm : ""}`}>{title}</h2>
            {subtitle ? <p className={styles.modalSubtitle}>{subtitle}</p> : null}
          </div>
          <button type="button" className={`btn ${styles.drawerClose}`} aria-label={copy.action.close} onClick={onClose}><Icon name="x" size={20} /></button>
        </div>
      )}
      <div className={bare ? styles.drawerBare : styles.drawerBody}>{children}</div>
      {footer ? <div className={styles.drawerFooter}>{footer}</div> : null}
    </DialogFrame>
  );
}

// kit .sheet (390): a bottom sheet — 8 from the edges, radius 34, grab handle, the
// darker sheet scrim; Esc and the scrim close it, focus is trapped like a dialog.
export function BottomSheet({ open, onClose, label, tight = false, children }: { open: boolean; onClose: () => void; label: string; /** 10 / 14 / 18 padding for a menu of full-width rows (b12 .sheet.amenu). */ tight?: boolean; children: ReactNode }) {
  const id = useId();
  if (!open) return null;
  return (
    <DialogFrame onClose={onClose} labelledBy={`${id}-title`} scrimClassName={`${styles.scrim} ${styles.sheetScrim}`} className={`${styles.sheet}${tight ? ` ${styles.sheetTight}` : ""}`}>
      <h2 id={`${id}-title`} className={styles.srOnly}>{label}</h2>
      <span className={styles.grab} aria-hidden />
      {children}
    </DialogFrame>
  );
}

// Below the anchor when it fits, otherwise above it (an anchor near the bottom —
// the avatar at the foot of the left rail — opens upwards).
type AnchorPosition = { top?: number; bottom?: number; left: number };

function useAnchorPosition(anchor: RefObject<HTMLElement | null>, open: boolean, width: number, custom?: (anchor: DOMRect) => AnchorPosition) {
  const [position, setPosition] = useState<AnchorPosition | null>(null);
  const customRef = useRef(custom);
  customRef.current = custom;
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const box = anchor.current?.getBoundingClientRect();
      if (!box) return;
      if (customRef.current) { setPosition(customRef.current(box)); return; }
      const left = Math.max(8, Math.min(box.left, window.innerWidth - width - 8));
      const below = window.innerHeight - box.bottom;
      setPosition(below >= 320 || below >= box.top ? { top: box.bottom + 8, left } : { bottom: window.innerHeight - box.top + 8, left });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [anchor, open, width]);
  return position;
}

const placed = (position: { top?: number; bottom?: number; left: number } | null) =>
  position ? { left: position.left, ...(position.bottom !== undefined ? { bottom: position.bottom } : { top: position.top }) } : { top: -9999, left: -9999 };

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
export function Popover({ open, onClose, anchor, label, width = 360, place, tight = false, children }: {
  open: boolean;
  onClose: () => void;
  anchor: RefObject<HTMLElement | null>;
  label: string;
  width?: number;
  /** Own placement from the anchor's box (default: below it, or above near the bottom). */
  place?: (anchor: DOMRect) => AnchorPosition;
  /** 8 padding instead of 16, for a menu of full-width rows (b12 .amenu). */
  tight?: boolean;
  children: ReactNode;
}) {
  const isTop = useLayer(open);
  const panel = useRef<HTMLDivElement>(null);
  const clamped = Math.max(340, Math.min(440, width));
  const position = useAnchorPosition(anchor, open, clamped, place);
  useDismiss(open, isTop, panel, anchor, onClose);
  // Keyboard users land inside (first control, else the panel); closing returns to the anchor (review M2).
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const first = panel.current?.querySelector<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])');
      (first ?? panel.current)?.focus();
    });
    const opener = anchor.current;
    return () => { cancelAnimationFrame(frame); if (panel.current?.contains(document.activeElement) || document.activeElement === document.body) opener?.focus(); };
  }, [open, anchor]);
  if (!open) return null;
  return (
    <Portal>
      <div ref={panel} role="dialog" aria-label={label} tabIndex={-1} className={`${styles.popover}${tight ? ` ${styles.popoverTight}` : ""}`} style={{ width: clamped, ...placed(position) }}>
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
    else if (event.key === "Tab") onClose();
  };
  return (
    <Portal>
      <div ref={panel} role="menu" aria-label={label} className={styles.menu} style={placed(position)} onKeyDown={move}>
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
