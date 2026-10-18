"use client";

import { useId, useState, type ReactNode } from "react";

import { MacTile } from "./Basics";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { fillCopy, useStandardCopy } from "./Scope";
import styles from "./Disclosure.module.css";

// kit .acc: a header button that opens a body (0fr → 1fr, 350 ms; Reduce Motion: no
// height animation). aria-expanded / aria-controls for screen readers.
export function Accordion({ title, children, initiallyOpen = false }: { title: string; children: ReactNode; initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const id = useId();
  return (
    <div className={`${styles.acc} ${open ? styles.open : ""}`}>
      <button type="button" className={`btn ${styles.head}`} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        <span className={styles.headTitle}>{title}</span>
        <span className={styles.chev}><Icon name="down" size={16} /></span>
      </button>
      <div id={id} className={styles.body} hidden={!open}>
        <div className={styles.inner}>{children}</div>
      </div>
    </div>
  );
}

// kit .why + .why-body: the ? that opens why iOrbit suggested something (根拠を見る).
export function WhyDisclosure({ reason }: { reason: string }) {
  const copy = useStandardCopy();
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className={styles.why}>
      <button type="button" className={`btn ${styles.whyButton}`} aria-expanded={open} aria-controls={id} aria-label={copy.aiCard.showWhy} title={copy.aiCard.showWhy} onClick={() => setOpen(!open)}>?</button>
      {open ? <span id={id} className={styles.whyBody}>{fillCopy(copy.aiCard.why, { reason })}</span> : null}
    </span>
  );
}

/** R31b: the ? on its own (kit .why) for a card that puts it at the end of its head row and the body at its foot. */
export function WhyButton({ open, onToggle, controls }: { open: boolean; onToggle: () => void; controls: string }) {
  const copy = useStandardCopy();
  return <button type="button" className={`btn ${styles.whyButton}`} aria-expanded={open} aria-controls={controls} aria-label={copy.aiCard.showWhy} title={copy.aiCard.showWhy} onClick={onToggle}>?</button>;
}

/** R31b: the body (kit .why-body; on a flat / macaron card pass `onSurface`). */
export function WhyBody({ id, open, onSurface = false, children }: { id: string; open: boolean; onSurface?: boolean; children: ReactNode }) {
  return open ? <div id={id} className={`${styles.whyBody} ${onSurface ? styles.whyBodySurface : ""}`}>{children}</div> : null;
}

export type ConfirmCardAction = { label: string; onSelect: () => void; primary?: boolean; /** R31b: transparent (kit .btn.ghost, 「あとで」). */ ghost?: boolean };

// 01-system ④ / kit .confirm-card → .ok-card → .ng-card: an AI write waits in place
// (dashed plum), then turns into success (ok green, RD-17) or failure (coral-soft).
// R31b (c-ai #0–#2): pending = emoji tile + question + what / where + 追加する / やめる; success = ✓ mark + title +
// 元に戻す in the head row, the detail and a link indented under the title; failure = alert mark + what failed +
// why (grey), then 何も書き込まれていません… and the repair actions (primary · on-surface · ghost).
export function ConfirmCard({ state, title, detail, reason, emoji, emojiTone = "lav", actions = [], undo, link, children }: {
  state: "pending" | "success" | "failure";
  title: string;
  detail?: string;
  /** failure: the cause under the title (kit .lbl). */
  reason?: string;
  /** pending: a small macaron tile before the question (kit .emo.sm). */
  emoji?: string;
  emojiTone?: "lav" | "pink" | "blue" | "teal" | "apricot";
  actions?: ConfirmCardAction[];
  /** success: 元に戻す at the end of the head row. */
  undo?: { label: string; onSelect: () => void };
  /** success: 「プランで見る →」. */
  link?: { label: string; href: string };
  children?: ReactNode;
}) {
  const head = state === "failure" ? (
    <div className={`${styles.confirmHead} ${styles.confirmHeadTop}`}>
      <span className={styles.ngMark}><Icon name="alert" size={20} /></span>
      <div className={styles.confirmHeadText}>
        <b className={styles.confirmTitle}>{title}</b>
        {reason ? <span className={styles.confirmReason}>{reason}</span> : null}
      </div>
    </div>
  ) : (
    <div className={styles.confirmHead}>
      {state === "success" ? <span className={styles.okMark}><Icon name="check" size={16} /></span> : null}
      {state === "pending" && emoji ? <MacTile emoji={emoji} tone={emojiTone} size="sm" /> : null}
      <b className={styles.confirmTitle}>{title}</b>
      {state === "success" && undo ? <Button label={undo.label} size="sm" variant="ghost" onClick={undo.onSelect} /> : null}
    </div>
  );
  return (
    <div className={`${styles.confirm} ${styles[state]}`} aria-live="polite">
      {head}
      {detail ? <p className={styles.confirmDetail}>{detail}</p> : null}
      {state === "success" && link ? <div className={styles.confirmLinkRow}><a className={styles.confirmLink} href={link.href}>{link.label}<Icon name="right" size={16} /></a></div> : null}
      {children}
      {actions.length ? (
        <div className={styles.confirmActions}>
          {actions.map((action) => (
            <Button key={action.label} label={action.label} size="sm" variant={action.primary ? "primary" : action.ghost ? "ghost" : "secondary"}
              className={!action.primary && !action.ghost && state === "failure" ? styles.onSurface : undefined} onClick={action.onSelect} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
