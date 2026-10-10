"use client";

import { useId, useState, type ReactNode } from "react";

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

export type ConfirmCardAction = { label: string; onSelect: () => void; primary?: boolean };

// 01-system ④ / kit .confirm-card → .ok-card → .ng-card: an AI write waits in place
// (dashed plum), then turns into success (ok green, RD-17) or failure (coral-soft).
export function ConfirmCard({ state, title, detail, actions = [], children }: {
  state: "pending" | "success" | "failure";
  title: string;
  detail?: string;
  actions?: ConfirmCardAction[];
  children?: ReactNode;
}) {
  return (
    <div className={`${styles.confirm} ${styles[state]}`} aria-live="polite">
      <div className={styles.confirmHead}>
        {state === "success" ? <span className={styles.okMark}><Icon name="check" size={16} /></span> : null}
        {state === "failure" ? <span className={styles.ngMark}><Icon name="alert" size={16} /></span> : null}
        <b className={styles.confirmTitle}>{title}</b>
      </div>
      {detail ? <p className={styles.confirmDetail}>{detail}</p> : null}
      {children}
      {actions.length ? (
        <div className={styles.confirmActions}>
          {actions.map((action) => (
            <button key={action.label} type="button" className={`btn ${styles.cardButton} ${action.primary ? styles.cardPrimary : state === "failure" ? styles.cardSecondary : styles.cardGhost}`} onClick={action.onSelect}>{action.label}</button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
